"""JSON <-> XML transformer.

The JSON contract mirrors ``xml-js`` "compact" semantics:

- a dict key is an element;
- a list value is a repeated sibling element;
- ``_attributes`` carries XML attributes;
- ``_text`` carries text content;
- a scalar value becomes the element's text.

Example::

    {"ECF": {"Encabezado": {"Version": {"_text": "1.0"}}}}

becomes ``<ECF><Encabezado><Version>1.0</Version></Encabezado></ECF>``.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from lxml import etree

from .errors import DgiiError, DgiiErrorCode
from .result import DgiiResult, Err, Ok

_MONETARY_RE = re.compile(r"^\d+\.\d+$")


def _round_monetary(value: str) -> str:
    if _MONETARY_RE.match(value):
        try:
            return str(Decimal(value).quantize(Decimal("0.01")))
        except InvalidOperation:
            return value
    return value


class Transformer:
    """Convert between DGII XML documents and the compact JSON shape."""

    def json_to_xml(
        self,
        data: dict[str, object],
        *,
        round_monetary: bool = False,
    ) -> DgiiResult[str]:
        """Serialize a single-root compact JSON object to an XML string."""
        try:
            if len(data) != 1:
                raise ValueError("Expected exactly one root element")
            root_tag, root_value = next(iter(data.items()))
            root = self._build(root_tag, root_value, round_monetary)
            body: str = etree.tostring(root, encoding="unicode")
            return Ok(f'<?xml version="1.0" encoding="utf-8"?>{body}')
        except (ValueError, TypeError) as exc:
            return Err(
                DgiiError(
                    f"Error converting JSON to XML: {exc}",
                    code=DgiiErrorCode.INVALID_XML,
                    cause=exc,
                )
            )

    def xml_to_json(self, xml: str) -> DgiiResult[dict[str, object]]:
        """Parse an XML string into a compact JSON object."""
        try:
            root = etree.fromstring(xml.encode("utf-8"))
        except etree.XMLSyntaxError as exc:
            return Err(
                DgiiError(
                    f"Error converting XML to JSON: {exc}",
                    code=DgiiErrorCode.INVALID_XML,
                    cause=exc,
                )
            )
        root_tag = etree.QName(root).localname
        return Ok({root_tag: self._convert(root)})

    @staticmethod
    def _format_text(tag: str, value: str, round_monetary: bool) -> str:
        # ``Version`` (e.g. "1.0") must never be rounded to "1.00".
        if round_monetary and tag.lower() != "version":
            return _round_monetary(value)
        return value

    def _build(
        self,
        tag: str,
        value: object,
        round_monetary: bool,
    ) -> etree._Element:
        element = etree.Element(tag)
        if isinstance(value, dict):
            attributes = value.get("_attributes")
            if isinstance(attributes, dict):
                for key, attr_value in attributes.items():
                    element.set(str(key), str(attr_value))
            text = value.get("_text")
            if text is not None:
                element.text = self._format_text(tag, str(text), round_monetary)
            for key, child in value.items():
                if key in ("_attributes", "_text"):
                    continue
                self._append(element, str(key), child, round_monetary)
        elif value is not None:
            element.text = self._format_text(tag, str(value), round_monetary)
        return element

    def _append(
        self,
        parent: etree._Element,
        tag: str,
        value: object,
        round_monetary: bool,
    ) -> None:
        if isinstance(value, (list, tuple)):
            for item in value:
                self._append(parent, tag, item, round_monetary)
        else:
            parent.append(self._build(tag, value, round_monetary))

    def _convert(self, element: etree._Element) -> object:
        node: dict[str, object] = {}
        if element.attrib:
            node["_attributes"] = dict(element.attrib)

        children = list(element)
        if not children:
            text = (element.text or "").strip()
            if text:
                node["_text"] = text
            return node

        grouped: dict[str, list[object]] = {}
        for child in children:
            child_tag = etree.QName(child).localname
            grouped.setdefault(child_tag, []).append(self._convert(child))
        for child_tag, items in grouped.items():
            node[child_tag] = items[0] if len(items) == 1 else items
        return node
