"""DGII e-CF client. Every method returns a ``Result`` — no thrown domain errors."""

from __future__ import annotations

import hashlib
import threading
import time
from collections.abc import Callable, Mapping
from datetime import datetime
from urllib.parse import urlparse

import httpx2

from ._json import JsonObject, JsonValue
from ._xml import extract_element_text, extract_root_element_name
from .certificate import P12ReaderData
from .environment import (
    BaseUrl,
    Endpoint,
    Environment,
    SenderReceiverEndpoint,
    StatusEndpoint,
    StatusEnvironment,
    build_sender_receiver_url,
    build_status_url,
    build_url,
)
from .errors import DgiiError, DgiiErrorCode
from .http import (
    HttpClient,
    HttpClientOptions,
    IdempotencyStore,
    InMemoryIdempotencyStore,
    TelemetryContext,
)
from .reception import check_b2b_applicability, resolve_reception_route
from .reconciliation import (
    AMBIGUOUS_SUBMISSION_MESSAGE,
    PENDING_SUBMISSION_MESSAGE,
    ReconciliationResult,
    can_reuse_sequence,
)
from .resilience import ResilienceOptions
from .result import DgiiResult, Err, Ok
from .signing import Signature
from .telemetry import (
    SDK_VERSION,
    DocumentIdentity,
    EcfEvent,
    document_identity,
    emit_event,
    new_correlation_id,
    utc_timestamp,
)
from .types import (
    AuthToken,
    B2BCommercialApprovalResponse,
    CommercialApprovalResponse,
    InquiryInvoiceSummary,
    InquiryStatusResponse,
    InvoiceResponse,
    InvoiceSummaryResponse,
    MaintenanceWindow,
    ResponseShapeError,
    ServiceAvailabilityResponse,
    ServiceDirectoryResponse,
    ServiceStatusEntry,
    SummaryTrackingStatusResponse,
    TrackingStatusResponse,
    VoidNCFResponse,
    _ModelT,
)
from .validation import format_violations, validate_document

_PENDING_MARKER: JsonObject = {"__pending__": True}


def _is_pending(value: JsonObject) -> bool:
    """Whether a stored value is the in-flight marker.

    Accepts the legacy ``{"pending": True}`` shape the TypeScript package wrote
    before the two packages were aligned, so a marker written by an older
    deployment is still honoured instead of being parsed as a delivered
    response.
    """
    return value.get("__pending__") is True or value.get("pending") is True


def _destination_scope(buyer_host: str | None) -> str | None:
    """Destination scope for an idempotency key, or ``None`` for DGII itself."""
    return None if buyer_host is None else f"@{buyer_host.rstrip('/').lower()}"


def _validate_buyer_host(buyer_host: str) -> DgiiResult[None]:
    """Validate that ``buyer_host`` is an ``https:`` URL without embedded credentials."""
    trimmed = buyer_host.strip()
    if not trimmed or any(ch.isspace() for ch in trimmed):
        return Err(
            DgiiError(
                f'Invalid buyer_host URL: "{buyer_host}"',
                code=DgiiErrorCode.VALIDATION,
            )
        )
    try:
        parsed = urlparse(trimmed)
        _ = parsed.port
    except ValueError:
        return Err(
            DgiiError(
                f'Invalid buyer_host URL: "{buyer_host}"',
                code=DgiiErrorCode.VALIDATION,
            )
        )
    if parsed.scheme.lower() != "https":
        return Err(
            DgiiError("buyer_host must use https:", code=DgiiErrorCode.VALIDATION)
        )
    if not parsed.hostname:
        return Err(
            DgiiError(
                "buyer_host must include a hostname", code=DgiiErrorCode.VALIDATION
            )
        )
    if parsed.username is not None or parsed.password is not None:
        return Err(
            DgiiError(
                "buyer_host must not include embedded credentials",
                code=DgiiErrorCode.VALIDATION,
            )
        )
    return Ok(None)


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _parse_expiry(value: str) -> float | None:
    """Parse DGII's ISO-8601 ``expira`` into a POSIX timestamp."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _parse_one(model: type[_ModelT], data: JsonValue) -> DgiiResult[_ModelT]:
    """Parse a decoded DGII payload into ``model``."""
    if not isinstance(data, dict):
        return Err(
            DgiiError(
                "Unexpected DGII response payload",
                code=DgiiErrorCode.VALIDATION,
                data=data,
            )
        )
    try:
        return Ok(model.from_dict(data))
    except ResponseShapeError as exc:
        return Err(
            DgiiError(str(exc), code=DgiiErrorCode.VALIDATION, data=data, cause=exc)
        )


def _parse_list(model: type[_ModelT], data: JsonValue) -> DgiiResult[list[_ModelT]]:
    """Parse a payload that is either a list of objects or a single object."""
    if data is None:
        return Ok([])
    if isinstance(data, dict):
        items: list[JsonValue] = [data]
    elif isinstance(data, list):
        items = data
    else:
        return Err(
            DgiiError(
                "Unexpected DGII response payload",
                code=DgiiErrorCode.VALIDATION,
                data=data,
            )
        )
    parsed: list[_ModelT] = []
    for item in items:
        result = _parse_one(model, item)
        if result.is_err():
            return Err(result.unwrap_err())
        parsed.append(result.unwrap())
    return Ok(parsed)


def _parse_response(
    model: type[_ModelT], result: DgiiResult[JsonValue]
) -> DgiiResult[_ModelT]:
    """Propagate a transport error, or parse a successful payload."""
    if result.is_err():
        return Err(result.unwrap_err())
    return _parse_one(model, result.unwrap())


def _production_guard(environment: Environment, method: str) -> DgiiError | None:
    """Reject endpoints DGII only exposes in production."""
    if environment is Environment.PROD:
        return None
    return DgiiError(
        f"{method} is only available in the production environment (eCF); "
        f"current environment is {environment.value}",
        code=DgiiErrorCode.VALIDATION,
    )


class ECF:
    """DGII e-CF client."""

    def __init__(
        self,
        credentials: P12ReaderData,
        environment: Environment = Environment.DEV,
        *,
        token: str | None = None,
        idempotency_store: IdempotencyStore | None = None,
        resilience: ResilienceOptions | None = None,
        timeout_s: float = 15.0,
        http_client: httpx2.Client | None = None,
        token_refresh_skew_s: float = 5 * 60,
        now: Callable[[], float] = time.time,
        status_api_key: str | None = None,
        enforce_b2b_rules: bool = True,
        validate_before_send: bool = False,
        on_event: Callable[[EcfEvent], None] | None = None,
    ) -> None:
        self._credentials = credentials
        self._environment = environment
        self._idempotency: IdempotencyStore = (
            idempotency_store or InMemoryIdempotencyStore()
        )
        self._status_api_key = status_api_key
        self._enforce_b2b_rules = enforce_b2b_rules
        self._validate_before_send = validate_before_send
        self._on_event = on_event
        self._token_refresh_skew_s = token_refresh_skew_s
        self._now = now
        self._token_expires_at: float | None = None
        self._last_token: AuthToken | None = None
        self._refresh_lock = threading.Lock()
        # One lock per idempotency key, so two callers submitting the same
        # document coalesce into one transmission instead of racing past a
        # check-then-act read of the store.
        self._send_locks: dict[str, threading.Lock] = {}
        self._send_locks_guard = threading.Lock()
        self._http = HttpClient(
            HttpClientOptions(
                base_url=BaseUrl.ECF.value,
                token=token,
                resilience=resilience,
                timeout_s=timeout_s,
                on_event=on_event,
                environment=environment.value,
                before_request=self._ensure_token,
                on_unauthorized=self._reauthenticate,
            ),
            client=http_client,
        )

    def _ensure_token(self) -> None:
        """Refresh the token when it is about to expire.

        A pre-supplied ``token`` has no known expiry, so it is never refreshed
        proactively — only a 401 triggers a re-authentication for it.
        """
        expires_at = self._token_expires_at
        if expires_at is None:
            return
        if self._now() < expires_at - self._token_refresh_skew_s:
            return
        self._refresh_token()

    def _refresh_token(self, *, force: bool = False) -> DgiiResult[AuthToken]:
        """Authenticate, coalescing concurrent refreshes into one round-trip."""
        with self._refresh_lock:
            if not force and self._last_token is not None:
                expires_at = self._token_expires_at
                if (
                    expires_at is not None
                    and self._now() < expires_at - self._token_refresh_skew_s
                ):
                    return Ok(self._last_token)
            return self.authenticate()

    def _reauthenticate(self) -> bool:
        """Drop the rejected token and authenticate once."""
        self._http.clear_token()
        self._token_expires_at = None
        self._last_token = None
        return self._refresh_token(force=True).is_ok()

    def _build_idempotency_key(
        self, signed_xml: str, destination: str | None = None
    ) -> str:
        """Idempotency key for a submission.

        ``RNC + eNCF + SHA-256(signed XML)`` for DGII, suffixed with the buyer
        host for a direct delivery. The destination scope is load-bearing:
        without it, delivering the same document to a buyer after DGII accepted
        it was answered from the DGII cache entry and never transmitted.

        DGII keys keep the documented three-part shape, which leaves markers
        written by an earlier version readable.
        """
        # ECF/ACECF use ``RNCEmisor``; the ANECF schema spells it ``RncEmisor``.
        rnc = (
            extract_element_text(signed_xml, "RNCEmisor")
            or extract_element_text(signed_xml, "RncEmisor")
            or "unknown-rnc"
        )
        # ECF/ACECF carry ``eNCF``; ANECF carries the first
        # ``SecuenciaeNCFDesde``. ``RangoNCF`` stays as a fallback for
        # hand-built documents.
        ncf = (
            extract_element_text(signed_xml, "eNCF")
            or extract_element_text(signed_xml, "SecuenciaeNCFDesde")
            or extract_element_text(signed_xml, "RangoNCF")
            or "unknown-ncf"
        )
        return f"{rnc}:{ncf}:{_sha256_hex(signed_xml)}{destination or ''}"

    def _cache_submission(
        self, key: str, model: type[_ModelT], data: JsonValue
    ) -> DgiiResult[_ModelT]:
        """Cache a submission response and return it as ``model``.

        DGII already accepted the document when we get here, so the key is
        never dropped on a shape problem: re-submitting would risk a duplicate
        fiscal document. A non-object payload keeps the pending marker, and a
        dict that fails to parse is cached raw so the caller can reconcile.
        """
        if not isinstance(data, dict):
            return Err(
                DgiiError(
                    "Unexpected DGII response payload; reconcile via a status "
                    "lookup before retrying",
                    code=DgiiErrorCode.VALIDATION,
                    data=data,
                )
            )
        parsed = _parse_one(model, data)
        self._idempotency.set(key, data)
        return parsed

    def _lock_for(self, key: str) -> threading.Lock:
        """The per-key submission lock, created on first use."""
        with self._send_locks_guard:
            lock = self._send_locks.get(key)
            if lock is None:
                lock = threading.Lock()
                self._send_locks[key] = lock
            return lock

    def _emit_idempotency(
        self,
        state: str,
        *,
        correlation_id: str,
        operation: str,
        resource: str,
        identity: DocumentIdentity,
    ) -> None:
        emit_event(
            self._on_event,
            EcfEvent(
                type="idempotency",
                correlation_id=correlation_id,
                timestamp=utc_timestamp(),
                sdk_version=SDK_VERSION,
                document_hash=identity.document_hash,
                operation=operation,
                resource=resource,
                environment=self._environment.value,
                rnc=identity.rnc,
                encf=identity.encf,
                idempotency=state,
            ),
        )

    def _submit_idempotent(
        self,
        key: str,
        model: type[_ModelT],
        send: Callable[[TelemetryContext], DgiiResult[JsonValue]],
        *,
        operation: str,
        resource: str,
        signed_xml: str,
    ) -> DgiiResult[_ModelT]:
        """Run a submission through the persist-before-transmit flow.

        The pending marker is written first so an interrupted send can be
        reconciled instead of re-issued; a successful response replaces it and
        a failure clears it so the caller can retry.

        Two callers submitting the same document are serialised on a per-key
        lock, because the store read above is check-then-act: without it both
        callers found no marker and both transmitted.

        A failure with no HTTP status is ambiguous — the document may have been
        received with the answer lost — so the marker is kept and the caller is
        told to reconcile, rather than being handed a clear "retry" that issues
        a second fiscal document.
        """
        correlation_id = new_correlation_id()
        identity = document_identity(signed_xml)
        telemetry = TelemetryContext(
            correlation_id=correlation_id,
            operation=operation,
            environment=self._environment.value,
            rnc=identity.rnc,
            encf=identity.encf,
            document_hash=identity.document_hash,
        )
        with self._lock_for(key):
            cached = self._idempotency.get(key)
            if cached is not None:
                if _is_pending(cached):
                    self._emit_idempotency(
                        "pending",
                        correlation_id=correlation_id,
                        operation=operation,
                        resource=resource,
                        identity=identity,
                    )
                    return Err(
                        DgiiError(
                            PENDING_SUBMISSION_MESSAGE,
                            code=DgiiErrorCode.IDEMPOTENCY,
                        )
                    )
                self._emit_idempotency(
                    "hit",
                    correlation_id=correlation_id,
                    operation=operation,
                    resource=resource,
                    identity=identity,
                )
                return _parse_one(model, cached)

            self._emit_idempotency(
                "miss",
                correlation_id=correlation_id,
                operation=operation,
                resource=resource,
                identity=identity,
            )
            self._idempotency.set(key, dict(_PENDING_MARKER))
            result = send(telemetry)
            if result.is_err():
                error = result.unwrap_err()
                if error.status is None:
                    return Err(
                        DgiiError(
                            AMBIGUOUS_SUBMISSION_MESSAGE,
                            code=DgiiErrorCode.IDEMPOTENCY,
                            data=error.data,
                            cause=error,
                        )
                    )
                self._idempotency.delete(key)
                return Err(error)
            return self._cache_submission(key, model, result.unwrap())

    def authenticate(self, buyer_host: str | None = None) -> DgiiResult[AuthToken]:
        """Authenticate against DGII (or a buyer host) and store the token."""
        if buyer_host is not None:
            valid = _validate_buyer_host(buyer_host)
            if valid.is_err():
                return Err(valid.unwrap_err())
        seed = self._get_seed(buyer_host)
        if seed.is_err():
            return Err(seed.unwrap_err())

        credentials = self._credentials
        if not credentials.key or not credentials.cert:
            return Err(
                DgiiError(
                    "A private key and certificate PEM are required to authenticate",
                    code=DgiiErrorCode.CERTIFICATE,
                )
            )

        signed = Signature(credentials.key, credentials.cert).sign_xml(
            seed.unwrap(), "SemillaModel"
        )
        if signed.is_err():
            return Err(signed.unwrap_err())

        token = self._get_auth_token(signed.unwrap(), buyer_host)
        if token.is_err():
            return Err(token.unwrap_err())

        issued = token.unwrap()
        if buyer_host is not None:
            self._http.set_token_for_origin(buyer_host, issued.token)
        else:
            self._http.set_token(issued.token)
            self._last_token = issued
            self._token_expires_at = _parse_expiry(issued.expira)
        return token

    def _get_seed(self, buyer_host: str | None) -> DgiiResult[str]:
        url = (
            build_sender_receiver_url(buyer_host, SenderReceiverEndpoint.SEED)
            if buyer_host
            else build_url(self._environment, Endpoint.SEED)
        )
        resource = (
            SenderReceiverEndpoint.SEED.value if buyer_host else Endpoint.SEED.value
        )
        result = self._http.get(url, resource=resource, skip_auth_hooks=True)
        if result.is_err():
            return Err(result.unwrap_err())
        data = result.unwrap()
        if isinstance(data, str):
            return Ok(data)
        return Err(
            DgiiError(
                "Unexpected seed payload",
                code=DgiiErrorCode.VALIDATION,
                data=data,
            )
        )

    def _get_auth_token(
        self, signed_seed: str, buyer_host: str | None
    ) -> DgiiResult[AuthToken]:
        url = (
            build_sender_receiver_url(buyer_host, SenderReceiverEndpoint.VALIDATE_SEED)
            if buyer_host
            else build_url(self._environment, Endpoint.VALIDATE_SEED)
        )
        result = self._http.post_multipart(
            url,
            "signed.xml",
            signed_seed,
            resource=Endpoint.VALIDATE_SEED.value,
            skip_auth_hooks=True,
        )
        if result.is_err():
            return Err(result.unwrap_err())
        data = result.unwrap()
        if not isinstance(data, dict):
            return Err(
                DgiiError(
                    "Unexpected auth token payload",
                    code=DgiiErrorCode.VALIDATION,
                    data=data,
                )
            )
        return Ok(
            AuthToken(
                token=str(data.get("token", "")),
                expira=str(data.get("expira", "")),
                expedido=str(data.get("expedido", "")),
            )
        )

    def send_electronic_document(
        self,
        signed_xml: str,
        file_name: str,
        buyer_host: str | None = None,
    ) -> DgiiResult[InvoiceResponse]:
        """Submit a signed e-CF (idempotent on RNC + eNCF + document hash)."""
        if buyer_host is not None:
            valid = _validate_buyer_host(buyer_host)
            if valid.is_err():
                return Err(valid.unwrap_err())
            if self._enforce_b2b_rules:
                applicable = check_b2b_applicability(signed_xml)
                if applicable.is_err():
                    return Err(applicable.unwrap_err())
        if self._validate_before_send:
            validation = validate_document(signed_xml)
            if validation.is_err():
                val_err = validation.unwrap_err()
                is_schema_unavailable = (
                    val_err.code == DgiiErrorCode.VALIDATION
                    and val_err.message.startswith("Schema unavailable")
                )
                if not is_schema_unavailable:
                    return Err(val_err)
            else:
                violations = validation.unwrap()
                if violations:
                    return Err(
                        DgiiError(
                            "Document does not match the DGII XML Schema: "
                            + format_violations(violations),
                            code=DgiiErrorCode.VALIDATION,
                            data=[
                                {"path": violation.path, "message": violation.message}
                                for violation in violations
                            ],
                        )
                    )
        url = (
            build_sender_receiver_url(buyer_host, SenderReceiverEndpoint.SEND_INVOICE)
            if buyer_host
            else build_url(self._environment, Endpoint.SEND_INVOICE)
        )
        return self._submit_idempotent(
            self._build_idempotency_key(signed_xml, _destination_scope(buyer_host)),
            InvoiceResponse,
            lambda telemetry: self._http.post_multipart(
                url,
                file_name,
                signed_xml,
                resource=Endpoint.SEND_INVOICE.value,
                retry=False,
                telemetry=telemetry,
            ),
            operation="send_electronic_document",
            resource=Endpoint.SEND_INVOICE.value,
            signed_xml=signed_xml,
        )

    def send_summary(
        self,
        signed_xml: str,
        file_name: str,
    ) -> DgiiResult[InvoiceSummaryResponse]:
        """Submit a signed summary invoice (RFCE), idempotently."""
        url = build_url(self._environment, Endpoint.SEND_SUMMARY, BaseUrl.CF.value)
        return self._submit_idempotent(
            self._build_idempotency_key(signed_xml),
            InvoiceSummaryResponse,
            lambda telemetry: self._http.post_multipart(
                url,
                file_name,
                signed_xml,
                resource=Endpoint.SEND_SUMMARY.value,
                retry=False,
                telemetry=telemetry,
            ),
            operation="send_summary",
            resource=Endpoint.SEND_SUMMARY.value,
            signed_xml=signed_xml,
        )

    def send_document(
        self,
        signed_xml: str,
        file_name: str,
        buyer_host: str | None = None,
    ) -> DgiiResult[InvoiceResponse | InvoiceSummaryResponse]:
        """Submit a signed document to the endpoint its own content belongs to.

        Reads the root element, ``TipoeCF`` and ``MontoTotal`` from the signed
        XML and dispatches to :meth:`send_summary` for an RFCE or to
        :meth:`send_electronic_document` for an ECF. An E32 below RD$250,000 is
        rejected because DGII only accepts the summary form for those.
        """
        if buyer_host is not None:
            valid = _validate_buyer_host(buyer_host)
            if valid.is_err():
                return Err(valid.unwrap_err())
        route = resolve_reception_route(signed_xml)
        if route.is_err():
            return Err(route.unwrap_err())
        resolved = route.unwrap()
        if resolved.kind == "summary":
            if buyer_host is not None:
                return Err(
                    DgiiError(
                        "An RFCE summary cannot be delivered directly to a buyer host",
                        code=DgiiErrorCode.VALIDATION,
                    )
                )
            return self.send_summary(signed_xml, file_name)
        return self.send_electronic_document(signed_xml, file_name, buyer_host)

    def status_track_id(self, track_id: str) -> DgiiResult[TrackingStatusResponse]:
        """Query the status of a submission by track id.

        A partial answer is accepted: DGII need not publish ``codigo`` or
        ``estado`` on every body, and neither field decides what the caller can
        do with ``secuenciaUtilizada`` — the verdict only corroborates it — so
        both fall back to defaults instead of failing a readable read.
        """
        url = build_url(self._environment, Endpoint.TRACK_RESULT_STATUS)
        return _parse_response(
            TrackingStatusResponse,
            self._http.get(
                url,
                {"trackId": track_id},
                resource=Endpoint.TRACK_RESULT_STATUS.value,
            ),
        )

    def inquiry_status(
        self,
        rnc_emisor: str,
        ncf_electronico: str,
        rnc_comprador: str | None = None,
        codigo_seguridad: str | None = None,
    ) -> DgiiResult[InquiryStatusResponse]:
        """Query the validity/status of an e-CF."""
        url = build_url(self._environment, Endpoint.INQUIRY_STATUS)
        return _parse_response(
            InquiryStatusResponse,
            self._http.get(
                url,
                {
                    "rncEmisor": rnc_emisor,
                    "ncfElectronico": ncf_electronico,
                    "rncComprador": rnc_comprador,
                    "codigoSeguridad": codigo_seguridad,
                },
                resource=Endpoint.INQUIRY_STATUS.value,
            ),
        )

    def reconcile_submission(
        self, signed_xml: str, buyer_host: str | None = None
    ) -> DgiiResult[ReconciliationResult]:
        """Resolve what happened to a submission whose marker is pending.

        Existence comes from ``inquiry_status`` (``consultaestado``) and nowhere
        else: when DGII has no record of the document the marker is cleared,
        because re-submitting cannot double-issue. When DGII does have a record
        the marker stays in place — it is the lock that prevents a second
        submission of a document that already exists — and ``delivered`` tells
        the caller to stop retrying.

        Only a rejected general e-CF is worth a second question, and only DGII's
        track services answer it: ``track_statuses`` (``consultatrackids``)
        finds the track, and ``status_track_id`` (``consultaresultado``) carries
        the reuse flag. A read that fails — or a payload that cannot be read at
        all — fails the call with the marker untouched, so a non-answer is never
        reported as "not reusable". On the result read the verdict only
        corroborates the flag, so an absent or unreadable one withholds reuse
        instead of failing a read that did happen.
        """
        if buyer_host is not None:
            valid = _validate_buyer_host(buyer_host)
            if valid.is_err():
                return Err(valid.unwrap_err())
        rnc = extract_element_text(signed_xml, "RNCEmisor") or extract_element_text(
            signed_xml, "RncEmisor"
        )
        encf = extract_element_text(signed_xml, "eNCF") or extract_element_text(
            signed_xml, "SecuenciaeNCFDesde"
        )
        if rnc is None or encf is None:
            return Err(
                DgiiError(
                    "The document has no emitter RNC or e-NCF to reconcile",
                    code=DgiiErrorCode.VALIDATION,
                )
            )

        root = extract_root_element_name(signed_xml)

        inquiry = self.inquiry_status(rnc, encf)
        if inquiry.is_err():
            return Err(inquiry.unwrap_err())

        # Raw equality decides the lock, exactly as it always has: trimming here
        # would let a padded " No encontrado" clear a marker.
        value = inquiry.unwrap()
        cleared = value.estado == "No encontrado"
        delivered = not cleared

        reusable = False
        # DGII publishes the flag for e-CF tracks and scopes it to a rejection;
        # every other path keeps the single existence read.
        if root == "ECF" and delivered and value.estado.strip() == "Rechazado":
            listing = self.track_statuses(rnc, encf)
            if listing.is_err():
                return Err(listing.unwrap_err())
            usable = [
                entry for entry in listing.unwrap() if entry.estado != "No encontrado"
            ]
            followable = [entry for entry in usable if entry.track_id]
            # Several tracks mean the same e-NCF reached DGII more than once, and
            # DGII says nothing about how their flags aggregate: claim nothing.
            if len(usable) == 1 and len(followable) == 1:
                track_id = followable[0].track_id
                # `followable` already guarantees a non-empty id; this narrows it.
                if track_id:
                    track = self.status_track_id(track_id)
                    if track.is_err():
                        return Err(track.unwrap_err())
                    reusable = can_reuse_sequence(track.unwrap())

        # The marker is the last fallible statement: no read happens after it,
        # and the gated branch above can never be reached once `cleared` is set.
        if cleared:
            self._idempotency.delete(
                self._build_idempotency_key(signed_xml, _destination_scope(buyer_host))
            )
        return Ok(
            ReconciliationResult(
                inquiry=value,
                delivered=delivered,
                can_reuse_sequence=reusable,
                cleared=cleared,
            )
        )

    def track_statuses(
        self, rnc_emisor: str, encf: str
    ) -> DgiiResult[list[SummaryTrackingStatusResponse]]:
        """Return every tracking entry associated with an e-NCF.

        DGII publishes a single object in its sample while describing the answer
        as a listing, so both shapes are accepted. An absent body is not "no
        records": it is a non-answer and fails loudly, because an empty list is
        indistinguishable from a document DGII holds.
        """
        url = build_url(self._environment, Endpoint.ALL_TRACKING_ECF)
        result = self._http.get(
            url,
            {"rncEmisor": rnc_emisor, "encf": encf},
            resource=Endpoint.ALL_TRACKING_ECF.value,
        )
        if result.is_err():
            return Err(result.unwrap_err())
        data = result.unwrap()
        if data is None:
            return Err(
                DgiiError(
                    "Unexpected DGII response payload",
                    code=DgiiErrorCode.VALIDATION,
                    data=data,
                )
            )
        return _parse_list(SummaryTrackingStatusResponse, data)

    def get_customer_directory(
        self, rnc: str
    ) -> DgiiResult[list[ServiceDirectoryResponse] | None]:
        """Return the customer directory, normalizing single-object responses."""
        url = build_url(self._environment, Endpoint.DIRECTORY)
        result = self._http.get(url, {"rnc": rnc}, resource=Endpoint.DIRECTORY.value)
        if result.is_err():
            return Err(result.unwrap_err())
        data = result.unwrap()
        if data is None:
            return Ok(None)
        return _parse_list(ServiceDirectoryResponse, data)

    def get_directory_listing(self) -> DgiiResult[list[ServiceDirectoryResponse]]:
        """General directory listing — every receiver that publishes URLs."""
        url = build_url(self._environment, Endpoint.DIRECTORY_LIST)
        result = self._http.get(url, resource=Endpoint.DIRECTORY_LIST.value)
        if result.is_err():
            return Err(result.unwrap_err())
        return _parse_list(ServiceDirectoryResponse, result.unwrap())

    def get_summary_invoice_inquiry(
        self, rnc: str, encf: str, cod_seguridad: str
    ) -> DgiiResult[InquiryInvoiceSummary]:
        """RFCE inquiry — DGII production only."""
        guard = _production_guard(self._environment, "get_summary_invoice_inquiry")
        if guard is not None:
            return Err(guard)
        url = build_url(
            self._environment,
            Endpoint.INQUIRY_INVOICE_SUMMARY,
            BaseUrl.CF.value,
        )
        return _parse_response(
            InquiryInvoiceSummary,
            self._http.get(
                url,
                {
                    "rnc_emisor": rnc,
                    "encf": encf,
                    "cod_seguridad_eCF": cod_seguridad,
                },
                resource=Endpoint.INQUIRY_INVOICE_SUMMARY.value,
            ),
        )

    def get_service_status(self) -> DgiiResult[list[ServiceStatusEntry]]:
        """Operational status of every DGII service.

        The status host takes an API key instead of a bearer token, so this
        call neither needs :meth:`authenticate` nor triggers a refresh.
        """
        result = self._status_request(StatusEndpoint.SERVICES)
        if result.is_err():
            return Err(result.unwrap_err())
        return _parse_list(ServiceStatusEntry, result.unwrap())

    def get_maintenance_windows(self) -> DgiiResult[list[MaintenanceWindow]]:
        """Scheduled maintenance windows, one entry per environment."""
        result = self._status_request(StatusEndpoint.MAINTENANCE_WINDOWS)
        if result.is_err():
            return Err(result.unwrap_err())
        data = result.unwrap()
        if isinstance(data, list):
            return _parse_list(MaintenanceWindow, data)
        if isinstance(data, dict):
            return _parse_list(MaintenanceWindow, data.get("ventanaMantenimientos"))
        return Ok([])

    def check_service_availability(
        self, ambiente: StatusEnvironment
    ) -> DgiiResult[ServiceAvailabilityResponse]:
        """Whether an environment is currently inside a maintenance window."""
        return _parse_response(
            ServiceAvailabilityResponse,
            self._status_request(StatusEndpoint.CHECK, {"ambiente": int(ambiente)}),
        )

    def _status_request(
        self,
        endpoint: StatusEndpoint,
        params: Mapping[str, str | int | None] | None = None,
    ) -> DgiiResult[JsonValue]:
        headers = (
            {"Authorization": f"Apikey {self._status_api_key}"}
            if self._status_api_key
            else None
        )
        return self._http.get(
            build_status_url(endpoint),
            params,
            headers=headers,
            resource=f"status:{endpoint.value}",
            skip_auth_hooks=True,
            omit_auth=True,
        )

    def send_commercial_approval(
        self,
        signed_xml: str,
        file_name: str,
        buyer_host: str | None = None,
    ) -> DgiiResult[CommercialApprovalResponse | B2BCommercialApprovalResponse]:
        """Submit a signed commercial approval (ACECF), idempotently.

        Without ``buyer_host`` the ACECF goes to DGII and returns the
        ``{codigo, estado}`` payload. With ``buyer_host`` it goes straight to
        the receiver's ``fe/aprobacioncomercial/api/ecf`` endpoint, where DGII
        documents HTTP 200 as satisfactory and HTTP 400 as unsatisfactory — a
        business outcome, not a transport failure.
        """
        if buyer_host is not None:
            valid = _validate_buyer_host(buyer_host)
            if valid.is_err():
                return Err(valid.unwrap_err())
        key = self._build_idempotency_key(signed_xml, _destination_scope(buyer_host))
        if buyer_host is not None:

            def _send_to_buyer(telemetry: TelemetryContext) -> DgiiResult[JsonValue]:
                url = build_sender_receiver_url(
                    buyer_host, SenderReceiverEndpoint.COMMERCIAL_APPROVAL
                )
                result = self._http.post_multipart(
                    url,
                    file_name,
                    signed_xml,
                    resource=SenderReceiverEndpoint.COMMERCIAL_APPROVAL.value,
                    retry=False,
                    telemetry=telemetry,
                )
                if result.is_err():
                    error = result.unwrap_err()
                    if error.status == 400:
                        return Ok({"status": 400, "accepted": False})
                    return Err(error)
                return Ok({"status": 200, "accepted": True})

            return self._submit_idempotent(
                key,
                B2BCommercialApprovalResponse,
                _send_to_buyer,
                operation="send_commercial_approval",
                resource=SenderReceiverEndpoint.COMMERCIAL_APPROVAL.value,
                signed_xml=signed_xml,
            )

        url = build_url(self._environment, Endpoint.COMMERCIAL_APPROVAL)
        return self._submit_idempotent(
            key,
            CommercialApprovalResponse,
            lambda telemetry: self._http.post_multipart(
                url,
                file_name,
                signed_xml,
                resource=Endpoint.COMMERCIAL_APPROVAL.value,
                retry=False,
                telemetry=telemetry,
            ),
            operation="send_commercial_approval",
            resource=Endpoint.COMMERCIAL_APPROVAL.value,
            signed_xml=signed_xml,
        )

    def void_encf(self, signed_xml: str, file_name: str) -> DgiiResult[VoidNCFResponse]:
        """Submit a signed range-voiding request (ANECF), idempotently."""
        url = build_url(self._environment, Endpoint.VOID)
        return self._submit_idempotent(
            self._build_idempotency_key(signed_xml),
            VoidNCFResponse,
            lambda telemetry: self._http.post_multipart(
                url,
                file_name,
                signed_xml,
                resource=Endpoint.VOID.value,
                retry=False,
                telemetry=telemetry,
            ),
            operation="void_encf",
            resource=Endpoint.VOID.value,
            signed_xml=signed_xml,
        )
