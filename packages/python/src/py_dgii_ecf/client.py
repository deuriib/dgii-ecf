"""DGII e-CF client. Every method returns a ``Result`` — no thrown domain errors."""

from __future__ import annotations

import hashlib
import re

import httpx2

from ._json import JsonObject, JsonValue
from .certificate import P12ReaderData
from .environment import (
    BaseUrl,
    Endpoint,
    Environment,
    SenderReceiverEndpoint,
    build_sender_receiver_url,
    build_url,
)
from .errors import DgiiError, DgiiErrorCode
from .http import (
    HttpClient,
    HttpClientOptions,
    IdempotencyStore,
    InMemoryIdempotencyStore,
)
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
    ResponseShapeError,
    ServiceDirectoryResponse,
    SummaryTrackingStatusResponse,
    TrackingStatusResponse,
    VoidNCFResponse,
    _ModelT,
)

_PENDING_MARKER: JsonObject = {"__pending__": True}


def _is_pending(value: JsonObject) -> bool:
    return value.get("__pending__") is True


_TAG_RE_CACHE: dict[str, re.Pattern[str]] = {}


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _extract_tag(xml: str, tag: str) -> str | None:
    pattern = _TAG_RE_CACHE.setdefault(tag, re.compile(rf"<{tag}>([^<]*)</{tag}>"))
    match = pattern.search(xml)
    return match.group(1).strip() if match else None


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
    ) -> None:
        self._credentials = credentials
        self._environment = environment
        self._idempotency: IdempotencyStore = (
            idempotency_store or InMemoryIdempotencyStore()
        )
        self._http = HttpClient(
            HttpClientOptions(
                base_url=BaseUrl.ECF.value,
                token=token,
                resilience=resilience,
                timeout_s=timeout_s,
            ),
            client=http_client,
        )

    def _build_idempotency_key(self, signed_xml: str) -> str:
        rnc = _extract_tag(signed_xml, "RNCEmisor") or "unknown-rnc"
        encf = _extract_tag(signed_xml, "eNCF") or "unknown-encf"
        return f"{rnc}:{encf}:{_sha256_hex(signed_xml)}"

    def _cache_submission(
        self, key: str, model: type[_ModelT], data: JsonValue
    ) -> DgiiResult[_ModelT]:
        """Cache a submission response and return it as ``model``.

        Malformed or non-object payloads clear the pending marker so the caller
        can retry instead of getting a permanently stuck key.
        """
        if not isinstance(data, dict):
            self._idempotency.delete(key)
            return Err(
                DgiiError(
                    "Unexpected DGII response payload",
                    code=DgiiErrorCode.VALIDATION,
                    data=data,
                )
            )
        parsed = _parse_one(model, data)
        if parsed.is_err():
            self._idempotency.delete(key)
            return Err(parsed.unwrap_err())
        self._idempotency.set(key, data)
        return parsed

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

        self._http.set_token(token.unwrap().token)
        return token

    def _get_seed(self, buyer_host: str | None) -> DgiiResult[str]:
        url = (
            build_sender_receiver_url(buyer_host, SenderReceiverEndpoint.SEED)
            if buyer_host
            else build_url(self._environment, Endpoint.SEED)
        )
        result = self._http.get(url)
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
        result = self._http.post_multipart(url, "signed.xml", signed_seed)
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
        key = self._build_idempotency_key(signed_xml)
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
            return _parse_one(InvoiceResponse, cached)

        url = (
            build_sender_receiver_url(buyer_host, SenderReceiverEndpoint.SEND_INVOICE)
            if buyer_host
            else build_url(self._environment, Endpoint.SEND_INVOICE)
        )
        # Persist-before-transmit: mark as pending before the network call.
        self._idempotency.set(key, dict(_PENDING_MARKER))
        result = self._http.post_multipart(url, file_name, signed_xml)
        if result.is_err():
            self._idempotency.delete(key)
            return Err(result.unwrap_err())
        return self._cache_submission(key, InvoiceResponse, result.unwrap())

    def send_summary(
        self,
        signed_xml: str,
        file_name: str,
    ) -> DgiiResult[InvoiceSummaryResponse]:
        """Submit a signed summary invoice (RFCE), idempotently."""
        key = self._build_idempotency_key(signed_xml)
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
            return _parse_one(InvoiceSummaryResponse, cached)

        url = build_url(self._environment, Endpoint.SEND_SUMMARY, BaseUrl.CF.value)
        # Persist-before-transmit (see send_electronic_document).
        self._idempotency.set(key, dict(_PENDING_MARKER))
        result = self._http.post_multipart(url, file_name, signed_xml)
        if result.is_err():
            self._idempotency.delete(key)
            return Err(result.unwrap_err())
        return self._cache_submission(key, InvoiceSummaryResponse, result.unwrap())

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

    def send_commercial_approval(
        self, signed_xml: str, file_name: str
    ) -> DgiiResult[CommercialApprovalResponse]:
        """Submit a signed commercial approval (ACECF)."""
        url = build_url(self._environment, Endpoint.COMMERCIAL_APPROVAL)
        return _parse_response(
            CommercialApprovalResponse,
            self._http.post_multipart(url, file_name, signed_xml),
        )

    def void_encf(self, signed_xml: str, file_name: str) -> DgiiResult[VoidNCFResponse]:
        """Submit a signed range-voiding request (ANECF)."""
        url = build_url(self._environment, Endpoint.VOID)
        return _parse_response(
            VoidNCFResponse, self._http.post_multipart(url, file_name, signed_xml)
        )
