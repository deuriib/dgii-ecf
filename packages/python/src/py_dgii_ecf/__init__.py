"""DGII e-CF electronic invoicing SDK for the Dominican Republic.

Result-pattern (``result``), resilient HTTP (``httpx2`` + ``tenacity`` +
``pybreaker``), and XMLDSig signing (``lxml`` + ``cryptography``).
"""

from __future__ import annotations

from ._json import JsonObject, JsonValue
from .certificate import CertificateInfo, P12Reader, P12ReaderData
from .client import ECF
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
from .errors import (
    DgiiError,
    DgiiErrorCode,
    DgiiErrorContext,
    extract_dgii_error_message,
    is_retryable_status,
    to_dgii_error,
)
from .http import (
    HttpClient,
    HttpClientOptions,
    IdempotencyStore,
    InMemoryIdempotencyStore,
)
from .reception import (
    CONSUMPTION_SUMMARY_THRESHOLD,
    ECF_TYPE_CODES,
    ReceptionRoute,
    compare_decimal,
    is_ecf_type_code,
    resolve_reception_route,
)
from .reconciliation import (
    PENDING_SUBMISSION_MESSAGE,
    ReconciliationResult,
    can_reuse_sequence,
)
from .resilience import ResilienceOptions, ResiliencePolicy, is_retryable_error
from .result import DgiiResult, Err, Ok, Result
from .signing import Signature, XmlCertificateValidation, validate_xml_certificate
from .transformer import Transformer
from .types import (
    COMMERCIAL_APPROVAL_ACCEPTED_CODE,
    COMMERCIAL_APPROVAL_ACCEPTED_STATE,
    COMMERCIAL_APPROVAL_REJECTED_CODE,
    COMMERCIAL_APPROVAL_REJECTED_STATE,
    AuthToken,
    B2BCommercialApprovalResponse,
    CommercialApprovalResponse,
    InquiryInvoiceSummary,
    InquiryStatusResponse,
    InvoiceResponse,
    InvoiceSummaryResponse,
    MaintenanceWindow,
    Mensaje,
    ResponseModel,
    ResponseShapeError,
    ServiceAvailabilityResponse,
    ServiceDirectoryResponse,
    ServiceStatusEntry,
    SummaryTrackingStatusResponse,
    TrackingStatusResponse,
    TrackStatus,
    VoidNCFResponse,
)
from .utils import (
    convert_ecf32_to_rfce,
    generate_ecf_qr_code_url,
    generate_fc_qr_code_url,
    get_code_six_digit_from_signature,
    get_current_formatted_date,
    get_current_formatted_datetime,
    get_xml_from_body_response,
)
from .validation import (
    SchemaViolation,
    format_violations,
    validate_document,
)

__version__ = "0.7.1"

__all__ = [
    "COMMERCIAL_APPROVAL_ACCEPTED_CODE",
    "COMMERCIAL_APPROVAL_ACCEPTED_STATE",
    "COMMERCIAL_APPROVAL_REJECTED_CODE",
    "COMMERCIAL_APPROVAL_REJECTED_STATE",
    "CONSUMPTION_SUMMARY_THRESHOLD",
    "ECF",
    "ECF_TYPE_CODES",
    "PENDING_SUBMISSION_MESSAGE",
    "AuthToken",
    "B2BCommercialApprovalResponse",
    "BaseUrl",
    "CertificateInfo",
    "CommercialApprovalResponse",
    "DgiiError",
    "DgiiErrorCode",
    "DgiiErrorContext",
    "DgiiResult",
    "Endpoint",
    "Environment",
    "Err",
    "HttpClient",
    "HttpClientOptions",
    "IdempotencyStore",
    "InMemoryIdempotencyStore",
    "InquiryInvoiceSummary",
    "InquiryStatusResponse",
    "InvoiceResponse",
    "InvoiceSummaryResponse",
    "JsonObject",
    "JsonValue",
    "MaintenanceWindow",
    "Mensaje",
    "Ok",
    "P12Reader",
    "P12ReaderData",
    "ReceptionRoute",
    "ReconciliationResult",
    "ResilienceOptions",
    "ResiliencePolicy",
    "ResponseModel",
    "ResponseShapeError",
    "Result",
    "SchemaViolation",
    "SenderReceiverEndpoint",
    "ServiceAvailabilityResponse",
    "ServiceDirectoryResponse",
    "ServiceStatusEntry",
    "Signature",
    "StatusEndpoint",
    "StatusEnvironment",
    "SummaryTrackingStatusResponse",
    "TrackStatus",
    "TrackingStatusResponse",
    "Transformer",
    "VoidNCFResponse",
    "XmlCertificateValidation",
    "__version__",
    "build_sender_receiver_url",
    "build_status_url",
    "build_url",
    "can_reuse_sequence",
    "compare_decimal",
    "convert_ecf32_to_rfce",
    "extract_dgii_error_message",
    "format_violations",
    "generate_ecf_qr_code_url",
    "generate_fc_qr_code_url",
    "get_code_six_digit_from_signature",
    "get_current_formatted_date",
    "get_current_formatted_datetime",
    "get_xml_from_body_response",
    "is_ecf_type_code",
    "is_retryable_error",
    "is_retryable_status",
    "resolve_reception_route",
    "to_dgii_error",
    "validate_document",
    "validate_xml_certificate",
]
