"""Typing helpers shared across the SDK."""

from __future__ import annotations

from typing import TypeAlias

#: A JSON value as returned by the DGII web services.
JsonValue: TypeAlias = (
    str | int | float | bool | list["JsonValue"] | dict[str, "JsonValue"] | None
)

#: A JSON object as returned by the DGII web services.
JsonObject: TypeAlias = dict[str, JsonValue]
