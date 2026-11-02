"""Resilience predicate tests."""

from __future__ import annotations

from py_dgii_ecf.errors import DgiiError
from py_dgii_ecf.resilience import is_retryable_error


class ConnectError(Exception):
    pass


def test_retries_transient_dgii_errors() -> None:
    assert is_retryable_error(DgiiError("x", status=503))
    assert is_retryable_error(DgiiError("x", status=429))
    assert is_retryable_error(DgiiError("x", status=408))


def test_does_not_retry_client_errors() -> None:
    assert not is_retryable_error(DgiiError("x", status=400))
    assert not is_retryable_error(DgiiError("x", status=401))
    assert not is_retryable_error(DgiiError("x", status=404))


def test_retries_network_errors() -> None:
    assert is_retryable_error(ConnectError("connection refused"))
    assert is_retryable_error(TimeoutError("timed out"))


def test_does_not_retry_business_errors() -> None:
    assert not is_retryable_error(ValueError("business rule"))
