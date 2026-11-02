"""Validation against the bundled DGII XML Schemas."""

from __future__ import annotations

import json
from pathlib import Path

import httpx2
from lxml import etree

from py_dgii_ecf.certificate import P12ReaderData
from py_dgii_ecf.client import ECF
from py_dgii_ecf.environment import Environment
from py_dgii_ecf.validation import (
    SCHEMA_DIR,
    UNAVAILABLE_SCHEMAS,
    format_violations,
    validate_document,
)

CREDENTIALS = P12ReaderData(key="unused", cert="unused")

# The Semilla schema requires `valor`, `fecha` and one extra element (the
# signature the issuer adds before sending).
VALID_SEED = (
    "<SemillaModel><valor>abc</valor>"
    "<fecha>2026-01-01T00:00:00</fecha><Signature/></SemillaModel>"
)

INVALID_SEED = "<SemillaModel><valor>abc</valor></SemillaModel>"

INVALID_ECF_32 = (
    "<ECF><Encabezado><IdDoc><TipoeCF>32</TipoeCF></IdDoc></Encabezado></ECF>"
)


def make_client(handler: object) -> httpx2.Client:
    transport = httpx2.MockTransport(handler)  # type: ignore[arg-type]
    return httpx2.Client(transport=transport)


def test_every_bundled_schema_compiles() -> None:
    manifest = json.loads((SCHEMA_DIR / "MANIFEST.json").read_text(encoding="utf-8"))

    assert len(manifest["schemas"]) == 12
    for entry in manifest["schemas"]:
        assert (SCHEMA_DIR / entry["file"]).exists(), entry["file"]
        # Compiling is what `_load` does; a broken file raises here.
        etree.XMLSchema(etree.parse(str(SCHEMA_DIR / entry["file"])))


def test_valid_document_has_no_violations() -> None:
    result = validate_document(VALID_SEED)

    assert result.is_ok()
    assert result.unwrap() == ()


def test_invalid_document_reports_the_element_path() -> None:
    result = validate_document(INVALID_SEED)

    assert result.is_ok()
    violations = result.unwrap()
    assert violations
    assert any("fecha" in violation.message for violation in violations)


def test_invalid_ecf_reports_violations() -> None:
    result = validate_document(INVALID_ECF_32)

    assert result.is_ok()
    assert result.unwrap()


def test_published_but_broken_schema_is_unavailable() -> None:
    result = validate_document(
        "<ECF><Encabezado><IdDoc><TipoeCF>31</TipoeCF></IdDoc></Encabezado></ECF>"
    )

    assert result.is_err()
    error = result.unwrap_err()
    assert error.code.value == "VALIDATION"
    assert "Schema unavailable" in error.message
    assert "ECF 31" in error.message


def test_unknown_root_is_an_error() -> None:
    result = validate_document("<Invoice/>")

    assert result.is_err()
    assert result.unwrap_err().code.value == "VALIDATION"


def test_unavailable_registry_covers_the_three_broken_schemas() -> None:
    assert set(UNAVAILABLE_SCHEMAS) == {("ECF", "31"), ("RFCE", None), ("ACECF", None)}


def test_format_violations_summarises() -> None:
    result = validate_document(INVALID_SEED)
    assert result.is_ok()

    summary = format_violations(result.unwrap())

    assert summary


def test_validate_before_send_blocks_without_calling_http() -> None:
    calls = {"n": 0}

    def handler(_request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json={"trackId": "t1"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
        validate_before_send=True,
    )

    result = ecf.send_electronic_document(INVALID_ECF_32, "f.xml")

    assert result.is_err()
    error = result.unwrap_err()
    assert error.code.value == "VALIDATION"
    assert "DGII XML Schema" in error.message
    assert calls["n"] == 0


def test_validate_before_send_is_off_by_default() -> None:
    calls = {"n": 0}

    def handler(_request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json={"trackId": "t1"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    result = ecf.send_electronic_document(INVALID_ECF_32, "f.xml")

    assert result.is_ok()
    assert calls["n"] == 1


def test_fixture_mirror_is_byte_identical() -> None:
    mirror = Path(__file__).resolve().parents[3] / "examples" / "fixtures" / "schemas"

    for path in SCHEMA_DIR.glob("*.xsd"):
        assert (mirror / path.name).read_bytes() == path.read_bytes(), path.name
