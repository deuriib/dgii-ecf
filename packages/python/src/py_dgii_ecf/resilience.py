"""Retry + circuit-breaker policy for outbound DGII calls."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar

import pybreaker
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
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


@dataclass(frozen=True, slots=True)
class ResilienceOptions:
    """Tunables for retry + circuit breaker."""

    max_retries: int = 3
    breaker_threshold: int = 5
    reset_timeout_s: float = 30.0
    timeout_s: float = 15.0


def is_retryable_error(error: BaseException) -> bool:
    """Only transient failures are retried (network, timeout, 408/429/5xx)."""
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
    """Compose tenacity (retry) with pybreaker (circuit breaker)."""

    def __init__(self, options: ResilienceOptions | None = None) -> None:
        self._options = options or ResilienceOptions()
        self._breaker = pybreaker.CircuitBreaker(
            fail_max=self._options.breaker_threshold,
            reset_timeout=self._options.reset_timeout_s,
        )
        self._retrying = retry(
            retry=retry_if_exception(is_retryable_error),
            stop=stop_after_attempt(self._options.max_retries),
            wait=wait_exponential(multiplier=0.01, min=0.01, max=1.0),
            reraise=True,
        )

    @property
    def options(self) -> ResilienceOptions:
        """The normalized options in use."""
        return self._options

    def execute(self, fn: Callable[[], T]) -> T:
        """Run ``fn`` with retry + circuit-breaker protection."""
        guarded = self._breaker_guarded(fn)
        wrapped = self._retrying(guarded)
        result: T = wrapped()
        return result

    def _breaker_guarded(self, fn: Callable[[], T]) -> Callable[[], T]:
        def _inner() -> T:
            result: T = self._breaker.call(fn)
            return result

        return _inner
