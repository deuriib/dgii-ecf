"""Tolerant element-text extraction for signed DGII XML.

The SDK never owns the XML it inspects: DGII responses, .NET-produced
signatures, and third-party generators all wrap the same element in a namespace
prefix and add attributes to it. A literal ``<tag>`` match misses those
variants and silently degrades the caller to a fallback — which on the
idempotency path means a duplicate fiscal submission.
"""

from __future__ import annotations

import re

_PATTERN_CACHE: dict[str, re.Pattern[str]] = {}

# Attribute spans may contain ``>`` inside quotes (``nota="a > b"``), so both
# quoted forms get their own alternative instead of a blanket ``[^>]*``.
_ATTRIBUTE_SPAN = r"""(?:[^>"']|"[^"]*"|'[^']*')*"""


def _element_pattern(tag: str) -> re.Pattern[str]:
    pattern = _PATTERN_CACHE.get(tag)
    if pattern is None:
        name = re.escape(tag)
        prefix = r"(?:[\w.-]+:)?"
        pattern = re.compile(
            rf"<{prefix}{name}{_ATTRIBUTE_SPAN}>([\s\S]*?)</{prefix}{name}\s*>"
        )
        _PATTERN_CACHE[tag] = pattern
    return pattern


def extract_element_text(xml: str, tag: str) -> str | None:
    """Text content of the first ``<tag>`` element.

    Tolerates a namespace prefix (``ns:eNCF``) and attributes
    (``<eNCF version="1.0">``). Returns ``None`` when the element is absent,
    self-closing, or blank, so callers fall back deliberately instead of
    building a key out of an empty segment. Matching is case-sensitive, as XML
    element names are.
    """
    match = _element_pattern(tag).search(xml)
    if match is None:
        return None
    return match.group(1).strip() or None
