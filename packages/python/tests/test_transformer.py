"""Transformer tests (compact JSON <-> XML)."""

from __future__ import annotations

import pytest

from py_dgii_ecf.transformer import Transformer


def test_json_to_xml_with_declaration() -> None:
    xml = Transformer().json_to_xml({"ECF": {"Encabezado": {"Version": "1.0"}}})
    assert xml.is_ok()
    assert '<?xml version="1.0" encoding="utf-8"?>' in xml.unwrap()
    assert "<Version>1.0</Version>" in xml.unwrap()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2.675", "2.68"),
        # ROUND_HALF_EVEN would give 2.66 here; DGII expects half-up.
        ("2.665", "2.67"),
        ("1.005", "1.01"),
        ("0.005", "0.01"),
        ("1.004", "1.00"),
        ("100.5", "100.50"),
        ("9.999", "10.00"),
        ("-2.675", "-2.68"),
        ("1234.567", "1234.57"),
    ],
)
def test_rounds_monetary_values_half_up(raw: str, expected: str) -> None:
    xml = Transformer().json_to_xml(
        {"ECF": {"Encabezado": {"MontoTotal": {"_text": raw}}}},
        round_monetary=True,
    )
    assert xml.is_ok()
    assert f"<MontoTotal>{expected}</MontoTotal>" in xml.unwrap()


def test_never_rounds_version_or_non_monetary_text() -> None:
    xml = Transformer().json_to_xml(
        {
            "ECF": {
                "Encabezado": {
                    "Version": {"_text": "1.0"},
                    "RNCEmisor": {"_text": "130862346"},
                }
            }
        },
        round_monetary=True,
    )
    assert xml.is_ok()
    assert "<Version>1.0</Version>" in xml.unwrap()
    assert "<RNCEmisor>130862346</RNCEmisor>" in xml.unwrap()


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


def test_json_to_xml_omits_empty_values() -> None:
    xml = Transformer().json_to_xml(
        {
            "ECF": {
                "Encabezado": {
                    "Version": "1.0",
                    "MontoExento": "",
                    "MontoNoFacturable": None,
                    "Vacio": {},
                    "Lista": [],
                }
            }
        }
    )

    assert xml.is_ok()
    body = xml.unwrap()
    for tag in ("MontoExento", "MontoNoFacturable", "Vacio", "Lista"):
        assert tag not in body
    assert "<MontoExento/>" not in body


def test_json_to_xml_omits_an_empty_text_node() -> None:
    xml = Transformer().json_to_xml(
        {
            "ECF": {
                "Encabezado": {
                    "Version": "1.0",
                    "MontoExento": {"_text": ""},
                }
            }
        }
    )

    assert xml.is_ok()
    body = xml.unwrap()
    assert "MontoExento" not in body
    assert "<Version>1.0</Version>" in body


def test_json_to_xml_keeps_an_attributes_only_element() -> None:
    xml = Transformer().json_to_xml(
        {
            "ECF": {
                "Signature": {
                    "_attributes": {"xmlns": "http://www.w3.org/2000/09/xmldsig#"}
                }
            }
        }
    )

    assert xml.is_ok()
    assert "<Signature xmlns=" in xml.unwrap()


def test_json_to_xml_keeps_a_zero_value() -> None:
    xml = Transformer().json_to_xml({"ECF": {"Totales": {"MontoExento": 0}}})

    assert xml.is_ok()
    assert "<MontoExento>0</MontoExento>" in xml.unwrap()
