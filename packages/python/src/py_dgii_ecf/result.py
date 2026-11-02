"""Result-pattern re-exports (the ``result`` library).

``DgiiResult[T]`` is an alias for ``Result[T, DgiiError]``. The SDK never raises
domain errors: every fallible call returns a ``Result``.
"""

from __future__ import annotations

from typing import TypeAlias, TypeVar

from result import Err, Ok, Result, is_err, is_ok

from .errors import DgiiError

T = TypeVar("T")

DgiiResult: TypeAlias = Result[T, DgiiError]

__all__ = ["DgiiResult", "Err", "Ok", "Result", "is_err", "is_ok"]
