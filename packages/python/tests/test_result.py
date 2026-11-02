"""Result-pattern and error-normalization tests."""

from __future__ import annotations

from py_dgii_ecf.errors import (
    DgiiError,
    DgiiErrorCode,
    extract_dgii_error_message,
    is_retryable_status,
)
from py_dgii_ecf.result import Err, Ok


def test_ok_and_err() -> None:
    success = Ok(42)
    assert success.is_ok()
    assert success.unwrap() == 42
    assert not success.is_err()

    failure = Err(DgiiError("boom", code=DgiiErrorCode.HTTP, status=500))
    assert failure.is_err()
    assert not failure.is_ok()
    assert failure.unwrap_err().retryable is True


def test_retryable_statuses() -> None:
    assert is_retryable_status(503)
    assert is_retryable_status(429)
    assert not is_retryable_status(400)
    assert not is_retryable_status(None)


def test_extract_message_from_dict() -> None:
    payload = {"mensajes": [{"valor": "invalid", "codigo": 1}]}
    assert extract_dgii_error_message(payload) == "invalid"


def test_extract_message_from_string() -> None:
    assert extract_dgii_error_message("  something  broke ") == "something broke"


def test_extract_message_from_html() -> None:
    html = "<html><body><h1>Error 500</h1></body></html>"
    message = extract_dgii_error_message(html)
    assert message is not None
    assert "Error 500" in message
