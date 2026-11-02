"""Tolerant element-text extraction tests."""

from __future__ import annotations

from py_dgii_ecf._xml import extract_element_text


def test_extracts_plain_element() -> None:
    xml = "<ECF><eNCF>E310000000001</eNCF></ECF>"
    assert extract_element_text(xml, "eNCF") == "E310000000001"


def test_extracts_namespace_prefixed_element() -> None:
    xml = (
        '<ECF xmlns:dgii="https://dgii.gov.do/eCF">'
        "<dgii:eNCF>E310000000001</dgii:eNCF></ECF>"
    )
    assert extract_element_text(xml, "eNCF") == "E310000000001"


def test_extracts_attributed_element() -> None:
    xml = '<ECF><eNCF version="1.0" tipo="31">E310000000001</eNCF></ECF>'
    assert extract_element_text(xml, "eNCF") == "E310000000001"


def test_extracts_prefixed_and_attributed_element() -> None:
    xml = (
        '<ECF xmlns:dgii="https://dgii.gov.do/eCF">'
        '<dgii:eNCF tipo="31" version="1.0">E310000000001</dgii:eNCF>'
        "</ECF>"
    )
    assert extract_element_text(xml, "eNCF") == "E310000000001"


def test_extracts_element_under_default_namespace() -> None:
    xml = '<eNCF xmlns="https://dgii.gov.do/eCF">E310000000001</eNCF>'
    assert extract_element_text(xml, "eNCF") == "E310000000001"


def test_tolerates_attribute_value_containing_gt() -> None:
    xml = '<ECF><eNCF nota="a > b">E310000000001</eNCF></ECF>'
    assert extract_element_text(xml, "eNCF") == "E310000000001"


def test_trims_surrounding_whitespace() -> None:
    xml = "<ECF><eNCF>\n  E310000000001 \n</eNCF></ECF>"
    assert extract_element_text(xml, "eNCF") == "E310000000001"


def test_does_not_match_longer_element_name() -> None:
    xml = "<ECF><eNCFExtra>E310000000001</eNCFExtra></ECF>"
    assert extract_element_text(xml, "eNCF") is None


def test_returns_none_for_missing_element() -> None:
    assert extract_element_text("<ECF></ECF>", "eNCF") is None


def test_returns_none_for_blank_or_self_closing_element() -> None:
    assert extract_element_text("<ECF><eNCF></eNCF></ECF>", "eNCF") is None
    assert extract_element_text("<ECF><eNCF/></ECF>", "eNCF") is None


def test_reuses_cached_pattern() -> None:
    xml = "<ECF><eNCF>E1</eNCF><RNCEmisor>130862346</RNCEmisor></ECF>"
    assert extract_element_text(xml, "eNCF") == "E1"
    assert extract_element_text(xml, "RNCEmisor") == "130862346"
