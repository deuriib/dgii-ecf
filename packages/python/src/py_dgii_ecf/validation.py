"""Validation of DGII documents against the bundled XML Schemas.

The schemas are the ones the DGII publishes, bundled so validation works
offline. Three of them are invalid as published and are reported as
unavailable rather than passing silently — see ``schemas/MANIFEST.json``.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache
from pathlib import Path

from lxml import etree

from ._xml import extract_element_text, extract_root_element_name
from .errors import DgiiError, DgiiErrorCode
from .result import DgiiResult, Err, Ok

SCHEMA_DIR = Path(__file__).resolve().parent / "schemas"

#: Bundled schemas keyed by ``(root element, TipoeCF or None)``.
_SCHEMA_FILES: dict[tuple[str, str | None], str] = {
    ("ECF", "32"): "e-cf-32.xsd",
    ("ECF", "33"): "e-cf-33.xsd",
    ("ECF", "34"): "e-cf-34.xsd",
    ("ECF", "41"): "e-cf-41.xsd",
    ("ECF", "43"): "e-cf-43.xsd",
    ("ECF", "44"): "e-cf-44.xsd",
    ("ECF", "45"): "e-cf-45.xsd",
    ("ECF", "46"): "e-cf-46.xsd",
    ("ECF", "47"): "e-cf-47.xsd",
    ("ANECF", None): "anecf.xsd",
    ("ARECF", None): "arecf.xsd",
    ("SemillaModel", None): "semilla.xsd",
}

#: Schemas DGII publishes but that do not compile, with the reason.
UNAVAILABLE_SCHEMAS: dict[tuple[str, str | None], str] = {
    ("ECF", "31"): (
        "the published schema references IndicadorServicioTodoIncluidoType, "
        "which does not resolve"
    ),
    ("RFCE", None): (
        "the published schema has an invalid pattern facet: [$0-9] and the "
        "\\- escape are not valid XML Schema regex"
    ),
    ("ACECF", None): (
        "the published schema has an invalid pattern facet: the \\- escape is "
        "not valid XML Schema regex"
    ),
}


@dataclass(frozen=True, slots=True)
class SchemaViolation:
    """One schema violation, with the element path DGII would complain about."""

    path: str
    message: str


@cache
def _load(file_name: str) -> etree.XMLSchema:
    return etree.XMLSchema(etree.parse(str(SCHEMA_DIR / file_name)))


def _schema_key(xml: str) -> tuple[str, str | None] | None:
    root = extract_root_element_name(xml)
    if root is None:
        return None
    if root == "ECF":
        tipo = extract_element_text(xml, "TipoeCF")
        return ("ECF", tipo) if tipo is not None else None
    return (root, None)


def validate_document(xml: str) -> DgiiResult[tuple[SchemaViolation, ...]]:
    """Validate a DGII document against its bundled XML Schema.

    Returns an empty tuple when the document is valid. A document type whose
    schema is not bundled — or whose published schema does not compile — is an
    error, never a silent pass.
    """
    key = _schema_key(xml)
    if key is None:
        return Err(
            DgiiError(
                "Cannot determine the document type to validate",
                code=DgiiErrorCode.VALIDATION,
            )
        )

    file_name = _SCHEMA_FILES.get(key)
    if file_name is None:
        reason = UNAVAILABLE_SCHEMAS.get(
            key, "no bundled XML Schema for this document type"
        )
        label = f"{key[0]} {key[1]}" if key[1] else key[0]
        return Err(
            DgiiError(
                f"Schema unavailable for {label}: {reason}",
                code=DgiiErrorCode.VALIDATION,
            )
        )

    try:
        document = etree.fromstring(xml.encode("utf-8"))
    except etree.XMLSyntaxError as exc:
        return Err(
            DgiiError(
                f"Error validating XML: {exc}",
                code=DgiiErrorCode.INVALID_XML,
                cause=exc,
            )
        )

    schema = _load(file_name)
    if schema.validate(document):
        return Ok(())

    return Ok(
        tuple(
            SchemaViolation(path=entry.path or "", message=entry.message)
            for entry in schema.error_log
        )
    )


def format_violations(violations: tuple[SchemaViolation, ...]) -> str:
    """One-line summary of the first violations, for an error message."""
    shown = "; ".join(f"{v.path}: {v.message}" for v in violations[:5])
    remaining = len(violations) - 5
    return f"{shown} (+{remaining} more)" if remaining > 0 else shown
