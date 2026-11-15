"""Tolerant element-text extraction for signed DGII XML.

The SDK never owns the XML it inspects: DGII responses, .NET-produced
signatures, and third-party generators all wrap the same element in a namespace
prefix and add attributes to it. A literal ``<tag>`` match misses those
variants and silently degrades the caller to a fallback — which on the
idempotency path means a duplicate fiscal submission.

The scan is hand-rolled and single-pass on purpose. The obvious regex
(``<prefix?tag ATTRS>(.*?)</prefix?tag>``) nests a repetition inside a
repetition, so a document with a matching open tag and no close tag made the
engine backtrack quadratically: 35 KiB took ~9 s and 120 KiB took ~120 s on
``send_electronic_document``, which is a denial of service on the caller's own
input. Every loop below advances an index, so the cost is O(len(xml)).
"""

from __future__ import annotations

import re

_NAME_RE = re.compile(r"[A-Za-z0-9_.:-]+")
_ROOT_PATTERN = re.compile(r"<\s*(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)[\s/>]")
_SPACE = " \t\r\n"
_QUOTES = "\"'"


def _read_qualified_name(xml: str, start: int) -> tuple[str, int]:
    """Read an optionally prefixed XML name starting at ``start``."""
    match = _NAME_RE.match(xml, start)
    if match is None:
        return "", start
    return match.group(0), match.end()


def _local_name(qualified: str) -> str:
    """Local part of a qualified name: ``ns:eNCF`` -> ``eNCF``."""
    return qualified.rsplit(":", 1)[-1]


def _skip_attributes(xml: str, start: int) -> int | None:
    """Index just past the ``>`` closing an open tag.

    Honours quoted attribute values (``nota="a > b"``). Returns ``None`` when
    the tag is unterminated and ``-1`` for a self-closing tag, so the caller can
    report the element as absent instead of pairing it with a later element's
    closing tag.
    """
    index = start
    length = len(xml)
    while index < length:
        char = xml[index]
        if char in _QUOTES:
            close = xml.find(char, index + 1)
            if close == -1:
                return None
            index = close + 1
            continue
        if char == ">":
            return -1 if xml[index - 1] == "/" else index + 1
        if char == "<":
            return None
        index += 1
    return None


def _find_closing_tag(xml: str, start: int, tag: str) -> int | None:
    """Index of the ``</tag …>`` that closes the element opening before ``start``."""
    index = start
    while True:
        open_index = xml.find("</", index)
        if open_index == -1:
            return None
        name, end = _read_qualified_name(xml, open_index + 2)
        if _local_name(name) == tag:
            after = end
            while after < len(xml) and xml[after] in _SPACE:
                after += 1
            if xml[after : after + 1] == ">":
                return open_index
        index = open_index + 2


def extract_element_text(xml: str, tag: str) -> str | None:
    """Text content of the first ``<tag>`` element.

    Tolerates a namespace prefix (``ns:eNCF``) and attributes
    (``<eNCF version="1.0">``). Returns ``None`` when the element is absent,
    self-closing, or blank, so callers fall back deliberately instead of
    building a key out of an empty segment. Matching is case-sensitive, as XML
    element names are.
    """
    start = 0
    while True:
        open_index = xml.find("<", start)
        if open_index == -1:
            return None
        marker = xml[open_index + 1 : open_index + 2]
        if not marker:
            return None
        # Declarations, comments, CDATA and closing tags are never an open tag.
        if marker in "?!/":
            start = open_index + 1
            continue
        name, end = _read_qualified_name(xml, open_index + 1)
        if not name:
            start = open_index + 1
            continue
        if _local_name(name) != tag:
            start = end
            continue
        content_start = _skip_attributes(xml, end)
        if content_start is None:
            start = end
            continue
        if content_start == -1:
            return None  # ``<tag/>``: the element carries no text.
        content_end = _find_closing_tag(xml, content_start, tag)
        if content_end is None:
            return None
        return xml[content_start:content_end].strip() or None


def extract_root_element_name(xml: str) -> str | None:
    """Local name of the document's root element.

    Ignores the XML declaration and any leading comments. Returns ``None``
    when no element is present.

    DGII routing depends on the root: ``<ECF>`` goes to the general reception
    and ``<RFCE>`` to the consumption-summary reception.
    """
    stripped = re.sub(r"<\?[\s\S]*?\?>", "", xml)
    stripped = re.sub(r"<!--[\s\S]*?-->", "", stripped).lstrip()
    match = _ROOT_PATTERN.match(stripped)
    return match.group(1) if match else None
