"""Transformer tests (compact JSON <-> XML)."""

from __future__ import annotations

from py_dgii_ecf.transformer import Transformer


def test_json_to_xml_with_declaration() -> None:
    xml = Transformer().json_to_xml({"ECF": {"Encabezado": {"Version": "1.0"}}})
    assert xml.is_ok()
    assert '<?xml version="1.0" encoding="utf-8"?>' in xml.unwrap()
    assert "<Version>1.0</Version>" in xml.unwrap()


def test_rounds_monetary_values() -> None:
    xml = Transformer().json_to_xml(
        {
            "ECF": {
                "Encabezado": {
                    "Version": {"_text": "1.0"},
                    "MontoTotal": {"_text": "100.5"},
                }
            }
        },
        round_monetary=True,
    )
    assert xml.is_ok()
    assert "<Version>1.0</Version>" in xml.unwrap()
    assert "<MontoTotal>100.50</MontoTotal>" in xml.unwrap()


def test_xml_to_json_round_trip() -> None:
    parsed = Transformer().xml_to_json(
        '<?xml version="1.0" encoding="utf-8"?>'
        "<ECF><Encabezado><Version>1.0</Version></Encabezado></ECF>"
    )
    assert parsed.is_ok()
    data = parsed.unwrap()
    encabezado = data["ECF"]["Encabezado"]  # type: ignore[index]
    assert encabezado["Version"]["_text"] == "1.0"  # type: ignore[index]


def test_invalid_xml_is_rejected() -> None:
    result = Transformer().xml_to_json("<ECF><broken>")
    assert result.is_err()
