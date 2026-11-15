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

import json
import re
from collections.abc import Mapping
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from lxml import etree

from .ecf import EcfInvoice
from .errors import DgiiError, DgiiErrorCode
from .result import DgiiResult, Err, Ok

_MONETARY_RE = re.compile(r"^-?\d+\.\d+$")
_CENTS = Decimal("0.01")


def _round_monetary(value: str) -> str:
    """Round a decimal string to 2 places with ``ROUND_HALF_UP``.

    This is the DGII contract (and the TypeScript SDK's behaviour): ``2.675``
    becomes ``2.68``. ``Decimal``'s default ``ROUND_HALF_EVEN`` would give
    ``2.68`` here too but ``2.665`` would become ``2.66`` instead of ``2.67``.
    """
    if _MONETARY_RE.match(value):
        try:
            return str(Decimal(value).quantize(_CENTS, rounding=ROUND_HALF_UP))
        except InvalidOperation:
            return value
    return value


def _prune_empty(value: object) -> object | None:
    """Drop empty leaves and the containers they leave behind.

    DGII forbids empty tags: any element without a value must be omitted
    entirely instead of being serialized as ``<Tag/>``. A dict that only
    carries ``_attributes`` is *not* empty — it still renders an element.
    """
    if value is None or value == "":
        return None
    if isinstance(value, (list, tuple)):
        items = [
            pruned
            for pruned in (_prune_empty(item) for item in value)
            if pruned is not None
        ]
        return items or None
    if isinstance(value, dict):
        output: dict[str, object] = {}
        for key, item in value.items():
            pruned = _prune_empty(item)
            if pruned is not None:
                output[key] = pruned
        return output or None
    return value


def _parse_json_dict(
    data: Mapping[str, object] | EcfInvoice | str,
) -> DgiiResult[dict[str, object]]:
    """Parse JSON string if needed and assert root is an object."""
    if isinstance(data, str):
        try:
            parsed: object = json.loads(data)
        except (json.JSONDecodeError, ValueError) as exc:
            return Err(
                DgiiError(
                    f"Error converting JSON to XML: {exc}",
                    code=DgiiErrorCode.INVALID_XML,
                    cause=exc,
                )
            )
        if not isinstance(parsed, dict):
            return Err(
                DgiiError(
                    "Error converting JSON to XML: Expected an object as root",
                    code=DgiiErrorCode.INVALID_XML,
                )
            )
        return Ok({str(k): v for k, v in parsed.items()})

    if not isinstance(data, (dict, Mapping)):
        return Err(
            DgiiError(
                "Error converting JSON to XML: Expected an object as root",
                code=DgiiErrorCode.INVALID_XML,
            )
        )
    return Ok(dict(data))


class Transformer:
    """Convert between DGII XML documents and the compact JSON shape."""

    @staticmethod
    def json_to_xml(
        data: Mapping[str, object] | EcfInvoice | str,
        *,
        round_monetary: bool = False,
    ) -> DgiiResult[str]:
        """Serialize a single-root compact JSON object to an XML string."""
        parse_result = _parse_json_dict(data)
        if parse_result.is_err():
            return Err(parse_result.unwrap_err())

        try:
            pruned = _prune_empty(parse_result.unwrap())
            if not isinstance(pruned, dict) or len(pruned) != 1:
                raise ValueError("Expected exactly one root element")
            root_tag, root_value = next(iter(pruned.items()))
            root = Transformer._build(root_tag, root_value, round_monetary)
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

    @staticmethod
    def xml_to_json(xml: str) -> DgiiResult[dict[str, object]]:
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
        return Ok({root_tag: Transformer._convert(root)})

    json2xml = json_to_xml
    xml2json = xml_to_json

    @staticmethod
    def _format_text(tag: str, value: str, round_monetary: bool) -> str:
        # ``Version`` (e.g. "1.0") must never be rounded to "1.00".
        if round_monetary and tag.lower() != "version":
            return _round_monetary(value)
        return value

    @staticmethod
    def _build(
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
                element.text = Transformer._format_text(tag, str(text), round_monetary)
            for key, child in value.items():
                if key in ("_attributes", "_text"):
                    continue
                Transformer._append(element, str(key), child, round_monetary)
        elif value is not None:
            element.text = Transformer._format_text(tag, str(value), round_monetary)
        return element

    @staticmethod
    def _append(
        parent: etree._Element,
        tag: str,
        value: object,
        round_monetary: bool,
    ) -> None:
        if isinstance(value, (list, tuple)):
            for item in value:
                Transformer._append(parent, tag, item, round_monetary)
        else:
            parent.append(Transformer._build(tag, value, round_monetary))

    @staticmethod
    def _convert(element: etree._Element) -> object:
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
            grouped.setdefault(child_tag, []).append(Transformer._convert(child))
        for child_tag, items in grouped.items():
            node[child_tag] = items[0] if len(items) == 1 else items
        return node
