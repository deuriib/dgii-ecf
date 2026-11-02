"""Routing of signed documents to the correct DGII reception endpoint."""

from __future__ import annotations

from py_dgii_ecf._xml import extract_root_element_name
from py_dgii_ecf.environment import Endpoint
from py_dgii_ecf.reception import (
    CONSUMPTION_SUMMARY_THRESHOLD,
    ECF_TYPE_CODES,
    compare_decimal,
    is_ecf_type_code,
    resolve_reception_route,
)


def ecf(tipo: str, total: str | None = None) -> str:
    totals = (
        "" if total is None else f"<Totales><MontoTotal>{total}</MontoTotal></Totales>"
    )
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<ECF xmlns="http://dgii.gov.do/ecf"><Encabezado><IdDoc>'
        f"<TipoeCF>{tipo}</TipoeCF>"
        "</IdDoc>"
        f"{totals}"
        "</Encabezado></ECF>"
    )


def rfce() -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?><RFCE><Encabezado>'
        "<IdDoc><TipoeCF>32</TipoeCF></IdDoc></Encabezado></RFCE>"
    )


def test_extract_root_element_name_skips_declaration_and_comments() -> None:
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n<!-- generated -->\n'
        "<ECF><Encabezado/></ECF>"
    )
    assert extract_root_element_name(xml) == "ECF"


def test_extract_root_element_name_returns_local_name() -> None:
    assert extract_root_element_name("<ds:Signature></ds:Signature>") == "Signature"


def test_extract_root_element_name_without_element() -> None:
    assert extract_root_element_name("not xml at all") is None


def test_compare_decimal_without_floating_point() -> None:
    assert compare_decimal("249999.99", "250000") < 0
    assert compare_decimal("250000", "250000.00") == 0
    assert compare_decimal("250000.01", "250000") > 0
    assert compare_decimal("999999999999.99", "250000") > 0
    assert compare_decimal("0250000", "250000") == 0


def test_ecf_type_codes() -> None:
    assert ECF_TYPE_CODES == (
        "31",
        "32",
        "33",
        "34",
        "41",
        "43",
        "44",
        "45",
        "46",
        "47",
    )
    assert is_ecf_type_code("32")
    assert not is_ecf_type_code("30")
    assert not is_ecf_type_code("E31")


def test_routes_rfce_to_summary_endpoint() -> None:
    route = resolve_reception_route(rfce())
    assert route.is_ok()
    resolved = route.unwrap()
    assert resolved.kind == "summary"
    assert resolved.endpoint is Endpoint.SEND_SUMMARY


def test_routes_non_consumption_to_general_endpoint() -> None:
    route = resolve_reception_route(ecf("31", "1000.00"))
    assert route.is_ok()
    resolved = route.unwrap()
    assert resolved.kind == "general"
    assert resolved.endpoint is Endpoint.SEND_INVOICE


def test_routes_consumption_at_threshold_to_general_endpoint() -> None:
    route = resolve_reception_route(ecf("32", CONSUMPTION_SUMMARY_THRESHOLD))
    assert route.is_ok()
    assert route.unwrap().kind == "general"


def test_routes_consumption_above_threshold_to_general_endpoint() -> None:
    route = resolve_reception_route(ecf("32", "250000.01"))
    assert route.is_ok()
    assert route.unwrap().kind == "general"


def test_rejects_consumption_below_threshold() -> None:
    route = resolve_reception_route(ecf("32", "249999.99"))
    assert route.is_err()
    error = route.unwrap_err()
    assert error.code.value == "VALIDATION"
    assert "RFCE summary" in error.message


def test_rejects_unknown_root() -> None:
    route = resolve_reception_route("<Invoice><x/></Invoice>")
    assert route.is_err()
    assert route.unwrap_err().code.value == "VALIDATION"


def test_rejects_unknown_type_code() -> None:
    route = resolve_reception_route(ecf("30", "100"))
    assert route.is_err()
    assert "Unknown TipoeCF" in route.unwrap_err().message


def test_rejects_consumption_without_total() -> None:
    route = resolve_reception_route(ecf("32"))
    assert route.is_err()
    assert "MontoTotal" in route.unwrap_err().message


def test_rejects_non_decimal_total() -> None:
    route = resolve_reception_route(ecf("32", "250,000"))
    assert route.is_err()
    assert "decimal" in route.unwrap_err().message
