"""Tests for the HTTP layer's in-memory idempotency store."""

from __future__ import annotations

import pytest

from py_dgii_ecf.http import InMemoryIdempotencyStore

TTL_S = 60.0
SWEEP_THRESHOLD = 1_000


class FakeClock:
    """Deterministic clock so expiry never depends on wall time."""

    def __init__(self, start: float = 0.0) -> None:
        self._now = start

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


def make_store(clock: FakeClock) -> InMemoryIdempotencyStore:
    return InMemoryIdempotencyStore(ttl_s=TTL_S, clock=clock)


def test_returns_value_while_fresh() -> None:
    clock = FakeClock()
    store = make_store(clock)
    store.set("key", {"accepted": True})

    clock.advance(TTL_S - 1)

    assert store.get("key") == {"accepted": True}


def test_expires_value_once_ttl_elapses() -> None:
    clock = FakeClock()
    store = make_store(clock)
    store.set("key", {"accepted": True})

    clock.advance(TTL_S)

    assert store.get("key") is None
    assert store.size == 0


def test_restarts_ttl_when_key_is_written_again() -> None:
    clock = FakeClock()
    store = make_store(clock)
    store.set("key", {"attempt": 1})

    clock.advance(TTL_S - 1)
    store.set("key", {"attempt": 2})
    clock.advance(TTL_S - 1)

    assert store.get("key") == {"attempt": 2}


def test_delete_removes_value() -> None:
    clock = FakeClock()
    store = make_store(clock)
    store.set("key", {"accepted": True})

    store.delete("key")

    assert store.get("key") is None
    assert store.size == 0


def test_size_reports_only_live_entries() -> None:
    clock = FakeClock()
    store = make_store(clock)
    store.set("fresh", {"accepted": True})
    store.set("stale", {"accepted": True})

    clock.advance(TTL_S - 1)
    store.set("fresh", {"accepted": True})
    clock.advance(1)

    assert store.size == 1


def test_sweeps_expired_entries_past_threshold() -> None:
    clock = FakeClock()
    store = make_store(clock)
    for index in range(SWEEP_THRESHOLD + 1):
        store.set(f"key-{index}", {"index": index})

    clock.advance(TTL_S)
    store.set("fresh", {"accepted": True})

    assert store.size == 1
    assert store.get("fresh") == {"accepted": True}


def test_rejects_non_positive_ttl() -> None:
    with pytest.raises(ValueError):
        InMemoryIdempotencyStore(ttl_s=0)
