"""Optional structured telemetry seam for DGII e-CF operations."""

from __future__ import annotations

import contextlib
import hashlib
import os
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from ._xml import extract_element_text

SDK_VERSION = "0.7.2"


@dataclass(frozen=True, slots=True)
class EcfEvent:
    """Structured lifecycle event emitted to an optional ``on_event`` callback."""

    type: str
    correlation_id: str
    timestamp: str
    sdk_version: str
    document_hash: str | None = None
    operation: str = ""
    resource: str | None = None
    environment: str | None = None
    rnc: str | None = None
    encf: str | None = None
    attempt: int | None = None
    max_attempts: int | None = None
    duration_ms: float | None = None
    http_status: int | None = None
    error_code: str | None = None
    retryable: bool | None = None
    idempotency: str | None = None
    breaker_state: str | None = None
    breaker_since: float | None = None
    expires_at: str | None = None


@dataclass(frozen=True, slots=True)
class DocumentIdentity:
    """Safe, non-secret document identity derived from signed XML."""

    document_hash: str
    rnc: str | None = None
    encf: str | None = None


def document_identity(signed_xml: str) -> DocumentIdentity:
    """Extract the emitter RNC, e-NCF and SHA-256 hash from signed XML."""
    rnc = extract_element_text(signed_xml, "RNCEmisor") or extract_element_text(
        signed_xml, "RncEmisor"
    )
    encf = (
        extract_element_text(signed_xml, "eNCF")
        or extract_element_text(signed_xml, "SecuenciaeNCFDesde")
        or extract_element_text(signed_xml, "RangoNCF")
    )
    document_hash = hashlib.sha256(signed_xml.encode("utf-8")).hexdigest()
    return DocumentIdentity(document_hash=document_hash, rnc=rnc, encf=encf)


def new_correlation_id() -> str:
    """Return a 128-bit lowercase hex correlation identifier."""
    return os.urandom(16).hex()


def utc_timestamp() -> str:
    """Return the current UTC timestamp in ISO-8601 format."""
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def emit_event(on_event: Callable[[EcfEvent], None] | None, event: EcfEvent) -> None:
    """Invoke ``on_event`` synchronously, suppressing any exception."""
    if on_event is None:
        return
    with contextlib.suppress(Exception):
        on_event(event)
