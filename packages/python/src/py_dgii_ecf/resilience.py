"""Retry + circuit-breaker + bulkhead policy for outbound DGII calls."""

from __future__ import annotations

import contextlib
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar

from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_random_exponential,
)

from .errors import DgiiError

T = TypeVar("T")

_RETRYABLE_EXCEPTION_NAMES = frozenset(
    {
        "connecterror",
        "connecttimeout",
        "readtimeout",
        "writetimeout",
        "pooltimeout",
        "timeoutexception",
        "networkerror",
        "remoteprotocolerror",
    }
)


class CircuitOpenError(Exception):
    """Raised when the circuit breaker is open for an origin."""

    def __init__(self, message: str, *, retry_after_ms: float = 0.0) -> None:
        super().__init__(message)
        self.retry_after_ms = retry_after_ms


class BulkheadRejectedError(Exception):
    """Raised when the per-origin bulkhead and its queue are saturated."""


@dataclass(frozen=True, slots=True)
class ResilienceOptions:
    """Tunables for retry + circuit breaker + bulkhead."""

    max_retries: int = 3
    breaker_threshold: int = 5
    reset_timeout_s: float = 30.0
    timeout_s: float = 15.0
    bulkhead_limit: int = 20
    bulkhead_queue: int = 40


def is_retryable_error(error: BaseException) -> bool:
    """Only transient failures are retried (network, timeout, 408/429/5xx)."""
    if isinstance(error, (CircuitOpenError, BulkheadRejectedError)):
        return False
    if isinstance(error, DgiiError):
        return error.retryable
    name = type(error).__name__.lower()
    if name in _RETRYABLE_EXCEPTION_NAMES:
        return True
    message = str(error).lower()
    return any(
        marker in message
        for marker in ("timeout", "timed out", "network", "connection")
    )


class ResiliencePolicy:
    """Compose circuit breaker (outer), retry (middle), and bulkhead (inner).

    The breaker lock is held only for state transitions — never across I/O — so
    concurrent requests to the same or different hosts run in parallel up to
    ``bulkhead_limit``.
    """

    def __init__(
        self,
        options: ResilienceOptions | None = None,
        *,
        on_breaker_change: Callable[[str, float], None] | None = None,
    ) -> None:
        self._options = options or ResilienceOptions()
        self._on_breaker_change = on_breaker_change
        self._lock = threading.Lock()
        self._state: str = "closed"
        self._failures: int = 0
        self._opened_at: float | None = None
        self._opened_epoch_ms: float | None = None

        limit = max(1, self._options.bulkhead_limit)
        self._semaphore = threading.BoundedSemaphore(limit)
        self._queue_lock = threading.Lock()
        self._waiting: int = 0

        self._retrying = retry(
            retry=retry_if_exception(is_retryable_error),
            stop=stop_after_attempt(self._options.max_retries),
            wait=wait_random_exponential(multiplier=0.1, max=30.0),
            reraise=True,
        )

    @property
    def options(self) -> ResilienceOptions:
        """The normalized options in use."""
        return self._options

    @property
    def breaker_state(self) -> str:
        """Current circuit state: ``closed``, ``open``, or ``half_open``."""
        with self._lock:
            return self._state

    @property
    def breaker_opened_at(self) -> float | None:
        """Epoch milliseconds when the breaker last opened, if any."""
        with self._lock:
            return self._opened_epoch_ms

    def _notify(self, state: str, since_ms: float) -> None:
        if self._on_breaker_change is not None:
            with contextlib.suppress(Exception):
                self._on_breaker_change(state, since_ms)

    def _before_call(self) -> None:
        transition: tuple[str, float] | None = None
        with self._lock:
            if self._state == "open" and self._opened_at is not None:
                elapsed = time.monotonic() - self._opened_at
                if elapsed >= self._options.reset_timeout_s:
                    self._state = "half_open"
                    transition = ("half_open", time.time() * 1000.0)
                else:
                    remaining_ms = max(
                        0.0, (self._options.reset_timeout_s - elapsed) * 1000.0
                    )
                    raise CircuitOpenError(
                        "Execution prevented because the circuit breaker is open",
                        retry_after_ms=remaining_ms,
                    )
        if transition is not None:
            self._notify(*transition)

    def _on_success(self) -> None:
        transition: tuple[str, float] | None = None
        with self._lock:
            self._failures = 0
            if self._state != "closed":
                self._state = "closed"
                self._opened_at = None
                transition = ("closed", time.time() * 1000.0)
        if transition is not None:
            self._notify(*transition)

    def _on_failure(self, exc: BaseException) -> None:
        if isinstance(exc, (BulkheadRejectedError, CircuitOpenError)):
            return
        transition: tuple[str, float] | None = None
        with self._lock:
            self._failures += 1
            if (
                self._state == "half_open"
                or self._failures >= self._options.breaker_threshold
            ):
                if self._state != "open":
                    self._state = "open"
                    now_ms = time.time() * 1000.0
                    self._opened_epoch_ms = now_ms
                    transition = ("open", now_ms)
                self._opened_at = time.monotonic()
        if transition is not None:
            self._notify(*transition)

    def _run_with_bulkhead(self, fn: Callable[[], T]) -> T:
        if self._semaphore.acquire(blocking=False):
            try:
                return fn()
            finally:
                self._semaphore.release()

        with self._queue_lock:
            if self._waiting >= self._options.bulkhead_queue:
                raise BulkheadRejectedError(
                    "Bulkhead capacity reached; request rejected"
                )
            self._waiting += 1

        try:
            self._semaphore.acquire()
        finally:
            with self._queue_lock:
                self._waiting -= 1

        try:
            return fn()
        finally:
            self._semaphore.release()

    def execute(self, fn: Callable[[], T], *, retry: bool = True) -> T:
        """Run ``fn`` with circuit-breaker + bulkhead protection, and retry when asked.

        ``retry=False`` is for the non-idempotent submissions: retrying a POST
        whose outcome is unknown is how one call put three copies of the same
        e-NCF into DGII's hands, because the retry cannot tell "rejected" from
        "accepted, answer lost" and DGII does not de-duplicate by e-NCF.
        """
        self._before_call()

        def _attempt() -> T:
            return self._run_with_bulkhead(fn)

        try:
            if not retry:
                result = _attempt()
            else:
                wrapped = self._retrying(_attempt)
                result = wrapped()
        except BaseException as exc:
            self._on_failure(exc)
            raise
        self._on_success()
        return result
