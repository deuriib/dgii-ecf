"""Tolerant element-text extraction tests."""

from __future__ import annotations

import time

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


def test_reads_several_tags_from_the_same_document() -> None:
    xml = "<ECF><eNCF>E1</eNCF><RNCEmisor>130862346</RNCEmisor></ECF>"
    assert extract_element_text(xml, "eNCF") == "E1"
    assert extract_element_text(xml, "RNCEmisor") == "130862346"


def test_stays_linear_when_a_matching_open_tag_is_never_closed() -> None:
    """The old regex backtracked quadratically: ~9 s at 35 KiB, ~120 s at 120 KiB.

    That shape is caller-supplied, and every send plus every idempotency key
    goes through this function, so it was a denial of service on the caller's
    own input.
    """
    xml = "<ECF>" + '<eNCF attr="v">' * 8192 + "</ECF>"

    started = time.perf_counter()
    value = extract_element_text(xml, "eNCF")
    elapsed = time.perf_counter() - started

    assert value is None
    assert elapsed < 1.5


def test_tolerates_prefixes_quoted_gt_and_whitespace_before_the_close() -> None:
    assert (
        extract_element_text(
            '<ns:ECF><ns:eNCF nota="a > b">E310000000001</ns:eNCF></ns:ECF>',
            "eNCF",
        )
        == "E310000000001"
    )
    assert extract_element_text("<ECF><eNCF>E1</eNCF   ></ECF>", "eNCF") == "E1"
