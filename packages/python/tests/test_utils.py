"""Utility tests: security code, QR URLs, dates, RFCE conversion."""

from __future__ import annotations

from py_dgii_ecf.environment import Environment
from py_dgii_ecf.utils import (
    convert_ecf32_to_rfce,
    generate_ecf_qr_code_url,
    generate_fc_qr_code_url,
    get_code_six_digit_from_signature,
    get_current_formatted_date,
    get_current_formatted_datetime,
    get_xml_from_body_response,
)


def test_security_code() -> None:
    xml = "<ECF><SignatureValue>abcdef123456</SignatureValue></ECF>"
    result = get_code_six_digit_from_signature(xml)
    assert result.is_ok()
    assert result.unwrap() == "abcdef"


def test_security_code_missing() -> None:
    assert get_code_six_digit_from_signature("<ECF></ECF>").is_err()


def test_fc_qr_url() -> None:
    url = generate_fc_qr_code_url(
        "130862346", "E310000000001", 1180, "abc123", Environment.DEV
    )
    assert url.startswith("https://fc.dgii.gov.do/testecf/consultatimbrefc")
    assert "rncemisor=130862346" in url
    assert "codigoseguridad=abc123" in url


def test_ecf_qr_url_omits_buyer_for_e43() -> None:
    url = generate_ecf_qr_code_url(
        "130862346",
        "999999999",
        "E430000000001",
        "100.00",
        "01-01-2026",
        "01-01-2026 10:00:00",
        "abcdef",
        Environment.PROD,
    )
    assert "RncComprador=" not in url


def test_ecf_qr_url_includes_buyer_for_e31() -> None:
    url = generate_ecf_qr_code_url(
        "130862346",
        "123456789",
        "E310000000001",
        "100.00",
        "01-01-2026",
        "01-01-2026 10:00:00",
        "abcdef",
        Environment.PROD,
    )
    assert "RncComprador=123456789" in url


def test_date_formatting() -> None:
    assert len(get_current_formatted_date().split("-")) == 3
    assert ":" in get_current_formatted_datetime()


def test_get_xml_from_body_response() -> None:
    body = 'prefix <?xml version="1.0"?><ACECF><x>1</x></ACECF> suffix'
    extracted = get_xml_from_body_response(body)
    assert extracted is not None
    assert "<ACECF>" in extracted


def test_convert_ecf32_to_rfce() -> None:
    ecf32 = (
        '<?xml version="1.0" encoding="utf-8"?>'
        "<ECF><Encabezado><Version>1.0</Version>"
        "<IdDoc><TipoeCF>32</TipoeCF><eNCF>E320000000001</eNCF></IdDoc>"
        "<Emisor><RNCEmisor>130862346</RNCEmisor>"
        "<RazonSocialEmisor>Test</RazonSocialEmisor>"
        "<FechaEmision>01-01-2026</FechaEmision></Emisor>"
        "<Totales><MontoTotal>100.00</MontoTotal></Totales>"
        "</Encabezado><SignatureValue>abcdef123456</SignatureValue></ECF>"
    )
    result = convert_ecf32_to_rfce(ecf32)
    assert result.is_ok()
    payload = result.unwrap()
    assert payload["securityCode"] == "abcdef"
    assert "<RFCE>" in payload["xml"]
    assert "<CodigoSeguridadeCF>abcdef</CodigoSeguridadeCF>" in payload["xml"]
