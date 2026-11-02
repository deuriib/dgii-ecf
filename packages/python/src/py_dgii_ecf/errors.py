"""Structured DGII errors and normalization helpers."""

from __future__ import annotations

import enum
import json
import re
from dataclasses import dataclass

from .types import Mensaje

RETRYABLE_STATUSES = frozenset({408, 429, 500, 502, 503, 504})

_MAX_RAW = 1000

_MESSAGE_KEYS = (
    "mensaje",
    "Mensaje",
    "message",
    "Message",
    "error",
    "Error",
    "errorMessage",
    "error_description",
    "detail",
    "Detail",
    "title",
    "Title",
    "descripcion",
    "Descripcion",
)


class DgiiErrorCode(enum.StrEnum):
    """Stable error classification."""

    INVALID_XML = "INVALID_XML"
    CERTIFICATE = "CERTIFICATE"
    SIGNING = "SIGNING"
    HTTP = "HTTP"
    AUTH = "AUTH"
    TIMEOUT = "TIMEOUT"
    CIRCUIT_OPEN = "CIRCUIT_OPEN"
    IDEMPOTENCY = "IDEMPOTENCY"
    VALIDATION = "VALIDATION"
    UNKNOWN = "UNKNOWN"


def is_retryable_status(status: int | None) -> bool:
    """Whether an HTTP status is transient and safe to retry."""
    return status in RETRYABLE_STATUSES


def _truncate(value: str) -> str:
    return f"{value[:_MAX_RAW]}…" if len(value) > _MAX_RAW else value


def _collapse(value: str) -> str:
    return " ".join(value.split())


def _strip_html(value: str) -> str:
    value = re.sub(r"<script\b[^>]*>.*?</script>", " ", value, flags=re.S | re.I)
    value = re.sub(r"<style\b[^>]*>.*?</style>", " ", value, flags=re.S | re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return _collapse(value)


def extract_dgii_error_message(data: object) -> str | None:
    """Reduce DGII's inconsistent error payloads to a single message."""
    if data is None:
        return None

    if isinstance(data, str):
        trimmed = data.strip()
        if not trimmed:
            return None
        if trimmed[:1] in '[{"':
            try:
                return extract_dgii_error_message(json.loads(trimmed))
            except (ValueError, TypeError):
                pass
        if re.match(r"^\s*<(?:!doctype|html|body|head)\b", trimmed, re.I):
            text = _strip_html(trimmed)
            return _truncate(text) if text else None
        return _truncate(_collapse(trimmed))

    if isinstance(data, bool | int | float):
        return str(data)

    if isinstance(data, BaseException):
        return str(data) or None

    if isinstance(data, (list, tuple)):
        parts = [
            message for item in data if (message := extract_dgii_error_message(item))
        ]
        return _truncate(" | ".join(parts)) if parts else None

    if isinstance(data, dict):
        mensajes = data.get("mensajes") or data.get("Mensajes")
        if isinstance(mensajes, list):
            values = [
                str(item.get("valor", "")) if isinstance(item, dict) else str(item)
                for item in mensajes
            ]
            values = [value for value in values if value.strip()]
            if values:
                return _truncate(" | ".join(values))

        for key in _MESSAGE_KEYS:
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return _truncate(_collapse(value))
            if key == "error" and isinstance(value, (dict, list)):
                nested = extract_dgii_error_message(value)
                if nested:
                    return nested

        errors = data.get("errors") or data.get("Errors")
        if isinstance(errors, dict):
            parts = []
            for field, value in errors.items():
                nested = extract_dgii_error_message(value)
                if nested:
                    parts.append(f"{field}: {nested}")
            if parts:
                return _truncate(" | ".join(parts))
        elif errors:
            nested = extract_dgii_error_message(errors)
            if nested:
                return nested

        try:
            serialized = json.dumps(data)
        except (TypeError, ValueError):
            return None
        if serialized and serialized != "{}":
            return _truncate(serialized)

    return None


@dataclass(frozen=True, slots=True)
class DgiiErrorContext:
    """Context used when normalizing a failure into a :class:`DgiiError`."""

    code: DgiiErrorCode | None = None
    status: int | None = None
    status_text: str | None = None
    resource: str | None = None
    method: str | None = None
    base_url: str | None = None
    fallback_message: str | None = None


class DgiiError(Exception):
    """Structured error raised and returned by the SDK.

    Although the SDK uses the result pattern, this class subclasses
    :class:`Exception` for interoperability with libraries that expect one.
    """

    def __init__(
        self,
        message: str,
        *,
        code: DgiiErrorCode = DgiiErrorCode.UNKNOWN,
        status: int | None = None,
        status_text: str | None = None,
        resource: str | None = None,
        method: str | None = None,
        base_url: str | None = None,
        data: object = None,
        mensajes: list[Mensaje] | None = None,
        retryable: bool | None = None,
        cause: object = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.status_text = status_text
        self.resource = resource
        self.method = method
        self.base_url = base_url
        self.data = data
        self.mensajes = mensajes
        self.retryable = (
            retryable if retryable is not None else is_retryable_status(status)
        )
        self.cause = cause

    def __str__(self) -> str:
        return self.message


def to_dgii_error(err: object, context: DgiiErrorContext | None = None) -> DgiiError:
    """Normalize any thrown/returned value into a :class:`DgiiError`."""
    ctx = context or DgiiErrorContext()
    if isinstance(err, DgiiError):
        return err

    if isinstance(err, BaseException):
        return DgiiError(
            str(err) or ctx.fallback_message or "DGII request failed",
            code=ctx.code or DgiiErrorCode.UNKNOWN,
            status=ctx.status,
            status_text=ctx.status_text,
            resource=ctx.resource,
            method=ctx.method,
            base_url=ctx.base_url,
            cause=err,
        )

    message = (
        extract_dgii_error_message(err) or ctx.fallback_message or "DGII request failed"
    )
    status = ctx.status
    if isinstance(err, dict) and isinstance(err.get("status"), int):
        status = err["status"]
    return DgiiError(
        message,
        code=ctx.code or DgiiErrorCode.UNKNOWN,
        status=status,
        status_text=ctx.status_text,
        resource=ctx.resource,
        method=ctx.method,
        base_url=ctx.base_url,
        data=err,
        cause=err,
    )
