"""Resilience predicate tests."""

from __future__ import annotations

import pytest

from py_dgii_ecf.errors import DgiiError
from py_dgii_ecf.resilience import (
    ResilienceOptions,
    ResiliencePolicy,
    is_retryable_error,
)


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


def test_max_retries_counts_attempts_including_the_first() -> None:
    """`max_retries=3` must mean three sends, exactly like the TypeScript SDK."""
    calls = {"n": 0}
    policy = ResiliencePolicy(ResilienceOptions(max_retries=3))

    def fn() -> None:
        calls["n"] += 1
        raise DgiiError("upstream unavailable", status=503)

    with pytest.raises(DgiiError):
        policy.execute(fn)

    assert calls["n"] == 3
