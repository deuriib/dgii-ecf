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
    build_sender_receiver_url,
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
from .resilience import ResilienceOptions, ResiliencePolicy, is_retryable_error
from .result import DgiiResult, Err, Ok, Result
from .signing import Signature, XmlCertificateValidation, validate_xml_certificate
from .transformer import Transformer
from .types import (
    AuthToken,
    Mensaje,
    Operation,
    StatusOperation,
    TrackStatus,
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

__version__ = "0.2.3"

__all__ = [
    "ECF",
    "AuthToken",
    "BaseUrl",
    "CertificateInfo",
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
    "JsonObject",
    "JsonValue",
    "Mensaje",
    "Ok",
    "Operation",
    "P12Reader",
    "P12ReaderData",
    "ResilienceOptions",
    "ResiliencePolicy",
    "Result",
    "SenderReceiverEndpoint",
    "Signature",
    "StatusOperation",
    "TrackStatus",
    "Transformer",
    "XmlCertificateValidation",
    "__version__",
    "build_sender_receiver_url",
    "build_url",
    "convert_ecf32_to_rfce",
    "extract_dgii_error_message",
    "generate_ecf_qr_code_url",
    "generate_fc_qr_code_url",
    "get_code_six_digit_from_signature",
    "get_current_formatted_date",
    "get_current_formatted_datetime",
    "get_xml_from_body_response",
    "is_retryable_error",
    "is_retryable_status",
    "to_dgii_error",
    "validate_xml_certificate",
]
