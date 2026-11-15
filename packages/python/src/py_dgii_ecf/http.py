"""HTTP client over ``httpx2`` with retry, circuit breaker and idempotency."""

from __future__ import annotations

import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from typing import Protocol, runtime_checkable
from urllib.parse import urlparse

import httpx2

from ._json import JsonObject, JsonValue
from .environment import BaseUrl
from .errors import (
    DgiiError,
    DgiiErrorCode,
    extract_dgii_error_message,
    extract_mensajes,
)
from .resilience import (
    BulkheadRejectedError,
    CircuitOpenError,
    ResilienceOptions,
    ResiliencePolicy,
)
from .result import DgiiResult, Err, Ok
from .telemetry import (
    SDK_VERSION,
    EcfEvent,
    emit_event,
    new_correlation_id,
    utc_timestamp,
)

DEFAULT_IDEMPOTENCY_TTL_S = 24 * 60 * 60
_IDEMPOTENCY_SWEEP_THRESHOLD = 1_000


@runtime_checkable
class IdempotencyStore(Protocol):
    """Pluggable idempotency store (Redis/Postgres in production)."""

    def get(self, key: str) -> JsonObject | None: ...

    def set(self, key: str, value: JsonObject) -> None: ...

    def delete(self, key: str) -> None: ...


class InMemoryIdempotencyStore:
    """Process-local default store. Fine for single-instance usage and tests.

    Entries expire after ``ttl_s`` so a long-running process cannot grow
    without bound. For multi-instance deployments, back the store with Redis
    or Postgres.
    """

    def __init__(
        self,
        ttl_s: float = DEFAULT_IDEMPOTENCY_TTL_S,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if ttl_s <= 0:
            raise ValueError("ttl_s must be positive")
        self._ttl_s = ttl_s
        self._clock = clock
        self._store: dict[str, tuple[float, JsonObject]] = {}

    @property
    def size(self) -> int:
        """Number of live entries; expired ones are swept first."""
        self._sweep_expired()
        return len(self._store)

    def get(self, key: str) -> JsonObject | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at <= self._clock():
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: JsonObject) -> None:
        self._store[key] = (self._clock() + self._ttl_s, value)
        if len(self._store) > _IDEMPOTENCY_SWEEP_THRESHOLD:
            self._sweep_expired()

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def _sweep_expired(self) -> None:
        now = self._clock()
        expired = [
            key for key, (expires_at, _) in self._store.items() if expires_at <= now
        ]
        for key in expired:
            del self._store[key]


@dataclass(frozen=True, slots=True)
class TelemetryContext:
    """Optional telemetry metadata attached to outbound transmission events."""

    correlation_id: str | None = None
    operation: str | None = None
    environment: str | None = None
    rnc: str | None = None
    encf: str | None = None
    document_hash: str | None = None


@dataclass(frozen=True, slots=True)
class HttpClientOptions:
    """Construction options for :class:`HttpClient`."""

    base_url: str
    token: str | None = None
    resilience: ResilienceOptions | None = None
    timeout_s: float = 15.0
    #: Optional telemetry callback; never awaited and exceptions are suppressed.
    on_event: Callable[[EcfEvent], None] | None = None
    #: Optional environment label included on emitted telemetry events.
    environment: str | None = None
    #: Runs before every authenticated request; may refresh credentials.
    before_request: Callable[[], None] | None = None
    #: Runs on a 401; return ``True`` to replay the request once.
    on_unauthorized: Callable[[], bool] | None = None


def _clean_params(
    params: Mapping[str, str | int | None] | None,
) -> dict[str, str | int] | None:
    if params is None:
        return None
    return {
        key: value for key, value in params.items() if value is not None and value != ""
    }


def _parse_retry_after_ms(header: str | None) -> float | None:
    if not header:
        return None
    trimmed = header.strip()
    if trimmed.isdigit():
        return float(int(trimmed) * 1000)
    try:
        dt = parsedate_to_datetime(trimmed)
        return max(0.0, (dt.timestamp() - time.time()) * 1000.0)
    except (TypeError, ValueError):
        return None


@dataclass(frozen=True, slots=True)
class _RequestContext:
    method: str
    resource: str
    base_url: str


class HttpClient:
    """Thin HTTP client wrapped in per-origin resilience policies."""

    def __init__(
        self,
        options: HttpClientOptions,
        *,
        client: httpx2.Client | None = None,
    ) -> None:
        self._base_url = options.base_url.rstrip("/")
        self._token = options.token
        self._tokens_by_origin: dict[str, str] = {}
        self._resilience_options = options.resilience or ResilienceOptions(
            timeout_s=options.timeout_s
        )
        self._policies_by_origin: dict[str, ResiliencePolicy] = {}
        self._policies_lock = threading.Lock()
        self._client = client or httpx2.Client(
            timeout=self._resilience_options.timeout_s
        )
        self._on_event = options.on_event
        self._environment = options.environment
        self._before_request = options.before_request
        self._on_unauthorized = options.on_unauthorized

    def _origin_key(self, url: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"
        return self._base_url

    def _is_dgii_origin(self, origin: str) -> bool:
        return origin in (
            self._origin_key(self._base_url),
            BaseUrl.ECF.value,
            BaseUrl.CF.value,
        )

    def _emit_breaker_change(self, origin: str, state: str, since_ms: float) -> None:
        emit_event(
            self._on_event,
            EcfEvent(
                type="breaker.changed",
                correlation_id=new_correlation_id(),
                timestamp=utc_timestamp(),
                sdk_version=SDK_VERSION,
                operation="circuit_breaker",
                resource=origin,
                environment=self._environment,
                breaker_state=state,
                breaker_since=since_ms,
            ),
        )

    def _policy_for_url(self, url: str) -> ResiliencePolicy:
        origin = self._origin_key(url)
        with self._policies_lock:
            policy = self._policies_by_origin.get(origin)
            if policy is None:
                policy = ResiliencePolicy(
                    self._resilience_options,
                    on_breaker_change=lambda state, since_ms: self._emit_breaker_change(
                        origin, state, since_ms
                    ),
                )
                self._policies_by_origin[origin] = policy
            return policy

    @property
    def timeout_s(self) -> float:
        """The configured per-request timeout in seconds."""
        return self._resilience_options.timeout_s

    @property
    def token(self) -> str | None:
        """The bearer token currently attached to requests."""
        return self._token

    def set_token(self, token: str) -> None:
        """Set the bearer token used on subsequent requests."""
        self._token = token

    def set_token_for_origin(self, origin: str, token: str) -> None:
        """Set the bearer token used on subsequent requests to ``origin``."""
        self._tokens_by_origin[self._origin_key(origin)] = token

    def clear_token(self) -> None:
        """Drop the bearer token used on subsequent requests."""
        self._token = None

    def _headers(
        self,
        origin: str,
        extra: Mapping[str, str] | None = None,
        *,
        omit_auth: bool = False,
    ) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if not omit_auth:
            token = (
                self._token
                if self._is_dgii_origin(origin)
                else self._tokens_by_origin.get(origin)
            )
            if token:
                headers["Authorization"] = f"Bearer {token}"
        if extra:
            headers.update(extra)
        return headers

    def _parse(
        self, response: httpx2.Response, ctx: _RequestContext
    ) -> DgiiResult[JsonValue]:
        data: JsonValue
        try:
            data = response.json()
        except ValueError:
            text = response.text
            data = text if text else None

        if 200 <= response.status_code < 300:
            return Ok(data)

        message = (
            extract_dgii_error_message(data)
            or f"DGII request failed with status {response.status_code}"
        )
        code = DgiiErrorCode.AUTH if response.status_code == 401 else DgiiErrorCode.HTTP
        error = DgiiError(
            message,
            code=code,
            status=response.status_code,
            status_text=response.reason_phrase,
            resource=ctx.resource,
            method=ctx.method,
            base_url=ctx.base_url,
            data=data,
            mensajes=extract_mensajes(data),
            retry_after=_parse_retry_after_ms(response.headers.get("retry-after")),
        )
        if error.retryable:
            raise error
        return Err(error)

    def request(
        self,
        method: str,
        url: str,
        *,
        params: Mapping[str, str | int | None] | None = None,
        files: Mapping[str, tuple[str, bytes, str]] | None = None,
        headers: Mapping[str, str] | None = None,
        resource: str | None = None,
        skip_auth_hooks: bool = False,
        omit_auth: bool = False,
        retry: bool = True,
        telemetry: TelemetryContext | None = None,
    ) -> DgiiResult[JsonValue]:
        """Perform a request and normalize the outcome into a ``Result``."""
        correlation_id = (
            telemetry.correlation_id
            if telemetry and telemetry.correlation_id
            else new_correlation_id()
        )
        effective_resource = resource or url
        operation = (
            telemetry.operation
            if telemetry and telemetry.operation
            else effective_resource
        )
        environment = (
            telemetry.environment
            if telemetry and telemetry.environment is not None
            else self._environment
        )
        rnc = telemetry.rnc if telemetry else None
        encf = telemetry.encf if telemetry else None
        document_hash = telemetry.document_hash if telemetry else None
        started = time.monotonic()

        emit_event(
            self._on_event,
            EcfEvent(
                type="transmission.started",
                correlation_id=correlation_id,
                timestamp=utc_timestamp(),
                sdk_version=SDK_VERSION,
                document_hash=document_hash,
                operation=operation,
                resource=effective_resource,
                environment=environment,
                rnc=rnc,
                encf=encf,
            ),
        )

        is_base_origin = self._is_dgii_origin(self._origin_key(url))

        if not skip_auth_hooks and is_base_origin and self._before_request is not None:
            self._before_request()

        final_result = self._execute(
            method,
            url,
            params=params,
            files=files,
            extra_headers=headers,
            resource=resource,
            omit_auth=omit_auth,
            retry=retry,
        )
        if (
            not skip_auth_hooks
            and is_base_origin
            and final_result.is_err()
            and final_result.unwrap_err().status == 401
            and self._on_unauthorized is not None
            and self._on_unauthorized()
        ):
            final_result = self._execute(
                method,
                url,
                params=params,
                files=files,
                extra_headers=headers,
                resource=resource,
                omit_auth=omit_auth,
                retry=retry,
            )

        duration_ms = round((time.monotonic() - started) * 1000.0, 2)
        if final_result.is_ok():
            emit_event(
                self._on_event,
                EcfEvent(
                    type="transmission.succeeded",
                    correlation_id=correlation_id,
                    timestamp=utc_timestamp(),
                    sdk_version=SDK_VERSION,
                    document_hash=document_hash,
                    operation=operation,
                    resource=effective_resource,
                    environment=environment,
                    rnc=rnc,
                    encf=encf,
                    duration_ms=duration_ms,
                    http_status=200,
                ),
            )
        else:
            err_val = final_result.unwrap_err()
            emit_event(
                self._on_event,
                EcfEvent(
                    type="transmission.failed",
                    correlation_id=correlation_id,
                    timestamp=utc_timestamp(),
                    sdk_version=SDK_VERSION,
                    document_hash=document_hash,
                    operation=operation,
                    resource=effective_resource,
                    environment=environment,
                    rnc=rnc,
                    encf=encf,
                    duration_ms=duration_ms,
                    http_status=err_val.status,
                    error_code=err_val.code.value,
                    retryable=err_val.retryable,
                ),
            )
        return final_result

    def _execute(
        self,
        method: str,
        url: str,
        *,
        params: Mapping[str, str | int | None] | None = None,
        files: Mapping[str, tuple[str, bytes, str]] | None = None,
        extra_headers: Mapping[str, str] | None = None,
        resource: str | None = None,
        omit_auth: bool = False,
        retry: bool = True,
    ) -> DgiiResult[JsonValue]:
        clean_params = _clean_params(params)
        origin = self._origin_key(url)
        ctx = _RequestContext(
            method=method,
            resource=resource or url,
            base_url=origin,
        )
        policy = self._policy_for_url(url)

        def _do() -> DgiiResult[JsonValue]:
            response = self._client.request(
                method,
                url,
                params=clean_params,
                files=files,
                headers=self._headers(origin, extra_headers, omit_auth=omit_auth),
            )
            return self._parse(response, ctx)

        try:
            return policy.execute(_do, retry=retry)
        except DgiiError as exc:
            return Err(exc)
        except CircuitOpenError as exc:
            return Err(
                DgiiError(
                    str(exc),
                    code=DgiiErrorCode.CIRCUIT_OPEN,
                    resource=ctx.resource,
                    method=ctx.method,
                    base_url=ctx.base_url,
                    retryable=True,
                    retry_after=exc.retry_after_ms,
                    cause=exc,
                )
            )
        except BulkheadRejectedError as exc:
            return Err(
                DgiiError(
                    str(exc),
                    code=DgiiErrorCode.CIRCUIT_OPEN,
                    resource=ctx.resource,
                    method=ctx.method,
                    base_url=ctx.base_url,
                    retryable=True,
                    cause=exc,
                )
            )
        except httpx2.TimeoutException as exc:
            return Err(
                DgiiError(
                    str(exc) or "DGII request timed out",
                    code=DgiiErrorCode.TIMEOUT,
                    resource=ctx.resource,
                    method=ctx.method,
                    base_url=ctx.base_url,
                    retryable=True,
                    cause=exc,
                )
            )
        except httpx2.HTTPError as exc:
            return Err(
                DgiiError(
                    str(exc) or "DGII transport error",
                    code=DgiiErrorCode.HTTP,
                    resource=ctx.resource,
                    method=ctx.method,
                    base_url=ctx.base_url,
                    retryable=True,
                    cause=exc,
                )
            )
        except Exception as exc:
            return Err(
                DgiiError(
                    f"DGII request failed: {exc}",
                    code=DgiiErrorCode.UNKNOWN,
                    resource=ctx.resource,
                    method=ctx.method,
                    base_url=ctx.base_url,
                    cause=exc,
                )
            )

    def get(
        self,
        url: str,
        params: Mapping[str, str | int | None] | None = None,
        *,
        headers: Mapping[str, str] | None = None,
        resource: str | None = None,
        skip_auth_hooks: bool = False,
        omit_auth: bool = False,
        telemetry: TelemetryContext | None = None,
    ) -> DgiiResult[JsonValue]:
        """HTTP GET."""
        return self.request(
            "GET",
            url,
            params=params,
            headers=headers,
            resource=resource,
            skip_auth_hooks=skip_auth_hooks,
            omit_auth=omit_auth,
            telemetry=telemetry,
        )

    def post_multipart(
        self,
        url: str,
        file_name: str,
        xml: str,
        *,
        resource: str | None = None,
        skip_auth_hooks: bool = False,
        retry: bool = True,
        telemetry: TelemetryContext | None = None,
    ) -> DgiiResult[JsonValue]:
        """POST a signed XML as a multipart ``xml`` file part."""
        files = {"xml": (file_name, xml.encode("utf-8"), "application/xml")}
        return self.request(
            "POST",
            url,
            files=files,
            resource=resource,
            skip_auth_hooks=skip_auth_hooks,
            retry=retry,
            telemetry=telemetry,
        )
