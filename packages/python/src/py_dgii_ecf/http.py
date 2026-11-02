"""HTTP client over ``httpx2`` with retry, circuit breaker and idempotency."""

from __future__ import annotations

import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import httpx2

from ._json import JsonObject, JsonValue
from .errors import DgiiError, DgiiErrorCode, extract_dgii_error_message
from .resilience import ResilienceOptions, ResiliencePolicy
from .result import DgiiResult, Err, Ok

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
class HttpClientOptions:
    """Construction options for :class:`HttpClient`."""

    base_url: str
    token: str | None = None
    resilience: ResilienceOptions | None = None
    timeout_s: float = 15.0
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


class HttpClient:
    """Thin HTTP client wrapped in resilience policies."""

    def __init__(
        self,
        options: HttpClientOptions,
        *,
        client: httpx2.Client | None = None,
    ) -> None:
        self._base_url = options.base_url.rstrip("/")
        self._token = options.token
        self._policy = ResiliencePolicy(options.resilience)
        self._client = client or httpx2.Client(timeout=options.timeout_s)
        self._before_request = options.before_request
        self._on_unauthorized = options.on_unauthorized

    @property
    def timeout_s(self) -> float:
        """The configured per-request timeout in seconds."""
        return self._policy.options.timeout_s

    @property
    def token(self) -> str | None:
        """The bearer token currently attached to requests."""
        return self._token

    def set_token(self, token: str) -> None:
        """Set the bearer token used on subsequent requests."""
        self._token = token

    def clear_token(self) -> None:
        """Drop the bearer token used on subsequent requests."""
        self._token = None

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return headers

    def _parse(self, response: httpx2.Response) -> DgiiResult[JsonValue]:
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
            data=data,
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
        skip_auth_hooks: bool = False,
    ) -> DgiiResult[JsonValue]:
        """Perform a request and normalize the outcome into a ``Result``."""
        if not skip_auth_hooks and self._before_request is not None:
            self._before_request()

        first = self._execute(method, url, params=params, files=files)
        if (
            not skip_auth_hooks
            and first.is_err()
            and first.unwrap_err().status == 401
            and self._on_unauthorized is not None
            and self._on_unauthorized()
        ):
            return self._execute(method, url, params=params, files=files)
        return first

    def _execute(
        self,
        method: str,
        url: str,
        *,
        params: Mapping[str, str | int | None] | None = None,
        files: Mapping[str, tuple[str, bytes, str]] | None = None,
    ) -> DgiiResult[JsonValue]:
        clean_params = _clean_params(params)

        def _do() -> DgiiResult[JsonValue]:
            response = self._client.request(
                method,
                url,
                params=clean_params,
                files=files,
                headers=self._headers(),
            )
            return self._parse(response)

        try:
            return self._policy.execute(_do)
        except DgiiError as exc:
            return Err(exc)
        except httpx2.HTTPError as exc:
            return Err(
                DgiiError(
                    str(exc) or "DGII transport error",
                    code=DgiiErrorCode.HTTP,
                    cause=exc,
                )
            )
        except Exception as exc:
            return Err(
                DgiiError(
                    f"DGII request failed: {exc}",
                    code=DgiiErrorCode.UNKNOWN,
                    cause=exc,
                )
            )

    def get(
        self,
        url: str,
        params: Mapping[str, str | int | None] | None = None,
        *,
        skip_auth_hooks: bool = False,
    ) -> DgiiResult[JsonValue]:
        """HTTP GET."""
        return self.request("GET", url, params=params, skip_auth_hooks=skip_auth_hooks)

    def post_multipart(
        self,
        url: str,
        file_name: str,
        xml: str,
        *,
        skip_auth_hooks: bool = False,
    ) -> DgiiResult[JsonValue]:
        """POST a signed XML as a multipart ``xml`` file part."""
        files = {"xml": (file_name, xml.encode("utf-8"), "application/xml")}
        return self.request("POST", url, files=files, skip_auth_hooks=skip_auth_hooks)
