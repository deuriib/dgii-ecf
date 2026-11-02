"""Reconciliation of a pending submission against DGII."""

from __future__ import annotations

import hashlib

import httpx2

from py_dgii_ecf.certificate import P12ReaderData
from py_dgii_ecf.client import _PENDING_MARKER, ECF
from py_dgii_ecf.environment import Environment
from py_dgii_ecf.http import InMemoryIdempotencyStore
from py_dgii_ecf.reconciliation import (
    PENDING_SUBMISSION_MESSAGE,
    can_reuse_sequence,
)
from py_dgii_ecf.types import InquiryStatusResponse

CREDENTIALS = P12ReaderData(key="unused", cert="unused")

XML = (
    "<ECF><Encabezado><RNCEmisor>130862346</RNCEmisor>"
    "<IdDoc><eNCF>E310000000001</eNCF></IdDoc></Encabezado></ECF>"
)
KEY = f"130862346:E310000000001:{hashlib.sha256(XML.encode()).hexdigest()}"


def make_client(handler: object) -> httpx2.Client:
    transport = httpx2.MockTransport(handler)  # type: ignore[arg-type]
    return httpx2.Client(transport=transport)


def test_can_reuse_sequence() -> None:
    assert can_reuse_sequence(
        InquiryStatusResponse(codigo=2, estado="Rechazado", secuencia_utilizada=False)
    )
    assert not can_reuse_sequence(
        InquiryStatusResponse(codigo=2, estado="Rechazado", secuencia_utilizada=True)
    )
    assert not can_reuse_sequence(InquiryStatusResponse(codigo=2, estado="Rechazado"))
    assert not can_reuse_sequence(
        InquiryStatusResponse(codigo=1, estado="Aceptado", secuencia_utilizada=None)
    )


def test_clears_the_marker_when_dgii_has_no_record() -> None:
    store = InMemoryIdempotencyStore()
    store.set(KEY, {"pending": True})

    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json={"codigo": 0, "estado": "No encontrado"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
        idempotency_store=store,
    )

    result = ecf.reconcile_submission(XML)

    assert result.is_ok()
    outcome = result.unwrap()
    assert outcome.delivered is False
    assert outcome.cleared is True
    assert store.get(KEY) is None


def test_keeps_the_marker_when_dgii_has_the_document() -> None:
    store = InMemoryIdempotencyStore()
    store.set(KEY, {"pending": True})

    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            200,
            json={"codigo": 1, "estado": "Aceptado", "secuenciaUtilizada": True},
        )

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
        idempotency_store=store,
    )

    result = ecf.reconcile_submission(XML)

    assert result.is_ok()
    outcome = result.unwrap()
    assert outcome.delivered is True
    assert outcome.cleared is False
    assert outcome.can_reuse_sequence is False
    assert store.get(KEY) == {"pending": True}


def test_reports_a_reusable_sequence_on_a_rejection() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            200,
            json={"codigo": 2, "estado": "Rechazado", "secuenciaUtilizada": False},
        )

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    result = ecf.reconcile_submission(XML)

    assert result.is_ok()
    outcome = result.unwrap()
    assert outcome.delivered is True
    assert outcome.can_reuse_sequence is True
    assert outcome.cleared is False


def test_rejects_a_document_without_rnc_or_encf() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json={})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    result = ecf.reconcile_submission("<ECF><Encabezado/></ECF>")

    assert result.is_err()
    assert result.unwrap_err().code.value == "VALIDATION"


def test_pending_error_points_at_the_helper() -> None:
    store = InMemoryIdempotencyStore()
    store.set(KEY, dict(_PENDING_MARKER))

    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json={})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
        idempotency_store=store,
    )

    result = ecf.send_electronic_document(XML, "f.xml")

    assert result.is_err()
    error = result.unwrap_err()
    assert error.code.value == "IDEMPOTENCY"
    assert error.message == PENDING_SUBMISSION_MESSAGE
    assert "reconcile_submission" in error.message
