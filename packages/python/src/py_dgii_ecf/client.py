"""DGII e-CF client. Every method returns a ``Result`` — no thrown domain errors."""

from __future__ import annotations

import hashlib
import threading
import time
from collections.abc import Callable, Mapping
from datetime import datetime

import httpx2

from ._json import JsonObject, JsonValue
from ._xml import extract_element_text
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
)
from .reception import resolve_reception_route
from .resilience import ResilienceOptions
from .result import DgiiResult, Err, Ok
from .signing import Signature
from .types import (
    AuthToken,
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

_PENDING_MARKER: JsonObject = {"__pending__": True}


def _is_pending(value: JsonObject) -> bool:
    return value.get("__pending__") is True


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
    ) -> None:
        self._credentials = credentials
        self._environment = environment
        self._idempotency: IdempotencyStore = (
            idempotency_store or InMemoryIdempotencyStore()
        )
        self._status_api_key = status_api_key
        self._token_refresh_skew_s = token_refresh_skew_s
        self._now = now
        self._token_expires_at: float | None = None
        self._last_token: AuthToken | None = None
        self._refresh_lock = threading.Lock()
        self._http = HttpClient(
            HttpClientOptions(
                base_url=BaseUrl.ECF.value,
                token=token,
                resilience=resilience,
                timeout_s=timeout_s,
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

    def _build_idempotency_key(self, signed_xml: str) -> str:
        rnc = extract_element_text(signed_xml, "RNCEmisor") or "unknown-rnc"
        # ACECF carries ``eNCF``; ANECF uses ``RangoNCF``. Fall back to the hash
        # when neither is present, so the key stays unique per document.
        ncf = (
            extract_element_text(signed_xml, "eNCF")
            or extract_element_text(signed_xml, "RangoNCF")
            or "unknown-ncf"
        )
        return f"{rnc}:{ncf}:{_sha256_hex(signed_xml)}"

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

    def _submit_idempotent(
        self,
        key: str,
        model: type[_ModelT],
        send: Callable[[], DgiiResult[JsonValue]],
    ) -> DgiiResult[_ModelT]:
        """Run a submission through the persist-before-transmit flow.

        The pending marker is written first so an interrupted send can be
        reconciled instead of re-issued; a successful response replaces it and
        a failure clears it so the caller can retry.
        """
        cached = self._idempotency.get(key)
        if cached is not None:
            if _is_pending(cached):
                return Err(
                    DgiiError(
                        "A submission with this key is already pending; "
                        "reconcile via a status lookup before retrying",
                        code=DgiiErrorCode.IDEMPOTENCY,
                    )
                )
            return _parse_one(model, cached)

        self._idempotency.set(key, dict(_PENDING_MARKER))
        result = send()
        if result.is_err():
            self._idempotency.delete(key)
            return Err(result.unwrap_err())
        return self._cache_submission(key, model, result.unwrap())

    def authenticate(self, buyer_host: str | None = None) -> DgiiResult[AuthToken]:
        """Authenticate against DGII (or a buyer host) and store the token."""
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
        result = self._http.get(url, skip_auth_hooks=True)
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
            url, "signed.xml", signed_seed, skip_auth_hooks=True
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
        url = (
            build_sender_receiver_url(buyer_host, SenderReceiverEndpoint.SEND_INVOICE)
            if buyer_host
            else build_url(self._environment, Endpoint.SEND_INVOICE)
        )
        return self._submit_idempotent(
            self._build_idempotency_key(signed_xml),
            InvoiceResponse,
            lambda: self._http.post_multipart(url, file_name, signed_xml),
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
            lambda: self._http.post_multipart(url, file_name, signed_xml),
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
        """Query the status of a submission by track id."""
        url = build_url(self._environment, Endpoint.TRACK_RESULT_STATUS)
        return _parse_response(
            TrackingStatusResponse, self._http.get(url, {"trackId": track_id})
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
            ),
        )

    def track_statuses(
        self, rnc_emisor: str, encf: str
    ) -> DgiiResult[list[SummaryTrackingStatusResponse]]:
        """Return every tracking entry associated with an e-NCF."""
        url = build_url(self._environment, Endpoint.ALL_TRACKING_ECF)
        result = self._http.get(url, {"rncEmisor": rnc_emisor, "encf": encf})
        if result.is_err():
            return Err(result.unwrap_err())
        return _parse_list(SummaryTrackingStatusResponse, result.unwrap())

    def get_customer_directory(
        self, rnc: str
    ) -> DgiiResult[list[ServiceDirectoryResponse] | None]:
        """Return the customer directory, normalizing single-object responses."""
        url = build_url(self._environment, Endpoint.DIRECTORY)
        result = self._http.get(url, {"rnc": rnc})
        if result.is_err():
            return Err(result.unwrap_err())
        data = result.unwrap()
        if data is None:
            return Ok(None)
        return _parse_list(ServiceDirectoryResponse, data)

    def get_directory_listing(self) -> DgiiResult[list[ServiceDirectoryResponse]]:
        """General directory listing — every receiver that publishes URLs."""
        url = build_url(self._environment, Endpoint.DIRECTORY_LIST)
        result = self._http.get(url)
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
            skip_auth_hooks=True,
            omit_auth=True,
        )

    def send_commercial_approval(
        self, signed_xml: str, file_name: str
    ) -> DgiiResult[CommercialApprovalResponse]:
        """Submit a signed commercial approval (ACECF), idempotently."""
        url = build_url(self._environment, Endpoint.COMMERCIAL_APPROVAL)
        return self._submit_idempotent(
            self._build_idempotency_key(signed_xml),
            CommercialApprovalResponse,
            lambda: self._http.post_multipart(url, file_name, signed_xml),
        )

    def void_encf(self, signed_xml: str, file_name: str) -> DgiiResult[VoidNCFResponse]:
        """Submit a signed range-voiding request (ANECF), idempotently."""
        url = build_url(self._environment, Endpoint.VOID)
        return self._submit_idempotent(
            self._build_idempotency_key(signed_xml),
            VoidNCFResponse,
            lambda: self._http.post_multipart(url, file_name, signed_xml),
        )
