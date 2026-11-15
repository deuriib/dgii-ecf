"""Transformer tests (compact JSON <-> XML)."""

from __future__ import annotations

import pytest

from py_dgii_ecf.errors import DgiiErrorCode
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


def test_static_json_to_xml() -> None:
    xml = Transformer.json_to_xml({"ECF": {"Encabezado": {"Version": "1.0"}}})
    assert xml.is_ok()
    assert "<Version>1.0</Version>" in xml.unwrap()


def test_static_xml_to_json() -> None:
    parsed = Transformer.xml_to_json(
        '<?xml version="1.0" encoding="utf-8"?>'
        "<ECF><Encabezado><Version>1.0</Version></Encabezado></ECF>"
    )
    assert parsed.is_ok()
    data = parsed.unwrap()
    encabezado = data["ECF"]["Encabezado"]  # type: ignore[index]
    assert encabezado["Version"]["_text"] == "1.0"  # type: ignore[index]


def test_static_parity_aliases() -> None:
    payload = {"ECF": {"Encabezado": {"Version": "1.0"}}}
    xml_doc = (
        '<?xml version="1.0" encoding="utf-8"?>'
        "<ECF><Encabezado><Version>1.0</Version></Encabezado></ECF>"
    )
    res_alias = Transformer.json2xml(payload)
    res_orig = Transformer.json_to_xml(payload)
    assert res_alias.is_ok()
    assert res_alias.unwrap() == res_orig.unwrap()

    parsed_alias = Transformer.xml2json(xml_doc)
    parsed_orig = Transformer.xml_to_json(xml_doc)
    assert parsed_alias.is_ok()
    assert parsed_alias.unwrap() == parsed_orig.unwrap()


def test_instance_parity_aliases() -> None:
    payload = {"ECF": {"Encabezado": {"Version": "1.0"}}}
    xml_doc = (
        '<?xml version="1.0" encoding="utf-8"?>'
        "<ECF><Encabezado><Version>1.0</Version></Encabezado></ECF>"
    )
    transformer = Transformer()
    res_alias = transformer.json2xml(payload)
    res_orig = transformer.json_to_xml(payload)
    assert res_alias.is_ok()
    assert res_alias.unwrap() == res_orig.unwrap()

    parsed_alias = transformer.xml2json(xml_doc)
    parsed_orig = transformer.xml_to_json(xml_doc)
    assert parsed_alias.is_ok()
    assert parsed_alias.unwrap() == parsed_orig.unwrap()


def test_json_to_xml_from_raw_json_string() -> None:
    raw = '{"ECF": {"Encabezado": {"Version": "1.0"}}}'
    xml = Transformer.json_to_xml(raw)
    assert xml.is_ok()
    assert "<Version>1.0</Version>" in xml.unwrap()


def test_json_to_xml_from_raw_json_string_with_rounding() -> None:
    raw = '{"ECF": {"Encabezado": {"Version": "1.0", "MontoTotal": "2.675"}}}'
    xml = Transformer.json_to_xml(raw, round_monetary=True)
    assert xml.is_ok()
    assert "<Version>1.0</Version>" in xml.unwrap()
    assert "<MontoTotal>2.68</MontoTotal>" in xml.unwrap()


def test_instance_json_to_xml_from_raw_json_string() -> None:
    raw = '{"ECF": {"Encabezado": {"Version": "1.0"}}}'
    xml = Transformer().json_to_xml(raw)
    assert xml.is_ok()
    assert "<Version>1.0</Version>" in xml.unwrap()


def test_json_to_xml_rejects_malformed_json_syntax() -> None:
    result = Transformer.json_to_xml("{invalid: json")
    assert result.is_err()
    err = result.unwrap_err()
    assert err.code == DgiiErrorCode.INVALID_XML
    assert "Error converting JSON to XML:" in err.message
    assert err.cause is not None


@pytest.mark.parametrize(
    "raw_input",
    [
        "123",
        "true",
        '"hello"',
        "null",
        "[1, 2, 3]",
        '[{"a": 1}]',
    ],
)
def test_json_to_xml_rejects_non_dict_root_strings(raw_input: str) -> None:
    result = Transformer.json_to_xml(raw_input)
    assert result.is_err()
    err = result.unwrap_err()
    assert err.code == DgiiErrorCode.INVALID_XML
    assert err.message == "Error converting JSON to XML: Expected an object as root"


def test_json_to_xml_rejects_non_dict_runtime_types() -> None:
    result_none = Transformer.json_to_xml(None)  # type: ignore[arg-type]
    assert result_none.is_err()
    assert result_none.unwrap_err().code == DgiiErrorCode.INVALID_XML

    result_list = Transformer.json_to_xml([])  # type: ignore[arg-type]
    assert result_list.is_err()
    assert result_list.unwrap_err().code == DgiiErrorCode.INVALID_XML


def test_json_to_xml_rejects_empty_dict() -> None:
    result = Transformer.json_to_xml({})
    assert result.is_err()
    err = result.unwrap_err()
    assert err.code == DgiiErrorCode.INVALID_XML
    assert "Expected exactly one root element" in err.message


def test_json_to_xml_rejects_multiple_roots() -> None:
    result = Transformer.json_to_xml({"Root1": {"a": "1"}, "Root2": {"b": "2"}})
    assert result.is_err()
    err = result.unwrap_err()
    assert err.code == DgiiErrorCode.INVALID_XML
    assert "Expected exactly one root element" in err.message
