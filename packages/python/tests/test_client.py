"""Client tests using httpx2.MockTransport (no network)."""

from __future__ import annotations

import hashlib

import httpx2

from py_dgii_ecf.certificate import P12ReaderData
from py_dgii_ecf.client import ECF
from py_dgii_ecf.environment import Environment
from py_dgii_ecf.http import InMemoryIdempotencyStore
from py_dgii_ecf.resilience import ResilienceOptions
from py_dgii_ecf.types import (
    InquiryInvoiceSummary,
    InvoiceResponse,
    ServiceDirectoryResponse,
    TrackingStatusResponse,
)

TRACKING_PAYLOAD = {
    "trackId": "TRACK-1",
    "codigo": 1,
    "estado": "Aceptado",
    "rnc": "130862346",
    "encf": "E310000000001",
    "secuenciaUtilizada": True,
    "fechaRecepcion": "01-01-2026 10:00:00",
    "mensajes": [{"valor": "Recibido", "codigo": 0}],
}

CREDENTIALS = P12ReaderData(key="unused", cert="unused")


def signed_ecf(rnc: str, encf: str) -> str:
    return (
        f"<ECF><Encabezado><RNCEmisor>{rnc}</RNCEmisor>"
        f"<IdDoc><eNCF>{encf}</eNCF></IdDoc></Encabezado></ECF>"
    )


def make_client(handler: object) -> httpx2.Client:
    transport = httpx2.MockTransport(handler)  # type: ignore[arg-type]
    return httpx2.Client(transport=transport)


def test_sends_bearer_and_multipart() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx2.Request) -> httpx2.Response:
        captured["auth"] = request.headers.get("Authorization", "")
        captured["method"] = request.method
        captured["url"] = str(request.url)
        return httpx2.Response(200, json={"trackId": "t1"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    result = ecf.send_electronic_document(
        signed_ecf("130862346", "E310000000001"), "f.xml"
    )

    assert result.is_ok()
    assert captured["auth"] == "Bearer tok"
    assert captured["method"] == "POST"
    assert "/TesteCF/recepcion/api/FacturasElectronicas" in captured["url"]


def test_does_not_retry_4xx() -> None:
    calls = {"n": 0}

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(
            400, json={"mensajes": [{"valor": "invalid", "codigo": 1}]}
        )

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    result = ecf.send_electronic_document(signed_ecf("1", "E1"), "f.xml")

    assert result.is_err()
    assert "invalid" in str(result.unwrap_err())
    assert calls["n"] == 1


def test_retries_5xx_then_succeeds() -> None:
    calls = {"n": 0}

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx2.Response(503, text="boom")
        return httpx2.Response(200, json={"trackId": "t2"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        resilience=ResilienceOptions(max_retries=3),
        http_client=make_client(handler),
    )
    result = ecf.send_electronic_document(signed_ecf("2", "E2"), "f.xml")

    assert result.is_ok()
    assert calls["n"] == 2


def test_idempotent_submission() -> None:
    calls = {"n": 0}

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json={"trackId": "t3"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    xml = signed_ecf("3", "E3")
    first = ecf.send_electronic_document(xml, "f.xml")
    second = ecf.send_electronic_document(xml, "f.xml")

    assert first.is_ok()
    assert second.is_ok()
    assert calls["n"] == 1


def test_normalizes_single_object_directory() -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            200,
            json={
                "nombre": "Buyer",
                "rnc": "130862346",
                "urlRecepcion": "https://buyer/recepcion",
            },
        )

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    result = ecf.get_customer_directory("130862346")

    assert result.is_ok()
    directory = result.unwrap()
    assert directory is not None
    assert isinstance(directory, list)
    assert len(directory) == 1


def test_refuses_pending_submission() -> None:
    store = InMemoryIdempotencyStore()
    xml = signed_ecf("4", "E4")
    key = f"4:E4:{hashlib.sha256(xml.encode()).hexdigest()}"
    store.set(key, {"__pending__": True})

    calls = {"n": 0}

    def handler(_request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json={"trackId": "x"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        idempotency_store=store,
        http_client=make_client(handler),
    )
    result = ecf.send_electronic_document(xml, "f.xml")

    assert result.is_err()
    assert result.unwrap_err().code.value == "IDEMPOTENCY"
    assert calls["n"] == 0


def test_clears_pending_marker_on_failure() -> None:
    store = InMemoryIdempotencyStore()
    xml = signed_ecf("5", "E5")
    key = f"5:E5:{hashlib.sha256(xml.encode()).hexdigest()}"

    calls = {"n": 0}

    def handler(_request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(400, json={"mensajes": [{"valor": "bad", "codigo": 1}]})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        idempotency_store=store,
        http_client=make_client(handler),
    )

    first = ecf.send_electronic_document(xml, "f.xml")
    assert first.is_err()
    assert store.get(key) is None

    # A retry after failure re-sends instead of returning a pending error.
    ecf.send_electronic_document(xml, "f.xml")
    assert calls["n"] == 2


def test_returns_typed_response_models() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json=TRACKING_PAYLOAD)

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    result = ecf.status_track_id("TRACK-1")

    assert result.is_ok()
    status = result.unwrap()
    assert isinstance(status, TrackingStatusResponse)
    assert status.estado == "Aceptado"
    assert status.secuencia_utilizada is True
    assert status.mensajes[0].valor == "Recibido"


def test_send_returns_typed_invoice_response() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json={"trackId": "t1"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    result = ecf.send_electronic_document(signed_ecf("1", "E1"), "f.xml")

    assert result.is_ok()
    assert isinstance(result.unwrap(), InvoiceResponse)
    assert result.unwrap().track_id == "t1"


def test_malformed_payload_becomes_validation_error() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json={"unexpected": True})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    result = ecf.status_track_id("TRACK-1")

    assert result.is_err()
    error = result.unwrap_err()
    assert error.code.value == "VALIDATION"
    assert "trackId" in error.message


def test_directory_returns_typed_models() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            200,
            json=[
                {
                    "nombre": "Buyer",
                    "rnc": "130862346",
                    "urlRecepcion": "https://buyer/recepcion",
                }
            ],
        )

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    result = ecf.get_customer_directory("130862346")

    assert result.is_ok()
    directory = result.unwrap()
    assert directory is not None
    assert isinstance(directory[0], ServiceDirectoryResponse)
    assert directory[0].nombre == "Buyer"


def test_summary_inquiry_is_production_only() -> None:
    calls = {"n": 0}

    def handler(_request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(
            200,
            json={
                "rnc": "130862346",
                "encf": "E320000000001",
                "secuenciaUtilizada": True,
                "codigo": 1,
                "estado": "Aceptado",
            },
        )

    for environment in (Environment.DEV, Environment.CERT):
        ecf = ECF(
            CREDENTIALS,
            environment,
            token="tok",
            http_client=make_client(handler),
        )
        result = ecf.get_summary_invoice_inquiry("130862346", "E320000000001", "abc123")

        assert result.is_err()
        error = result.unwrap_err()
        assert error.code.value == "VALIDATION"
        assert "production" in error.message

    assert calls["n"] == 0


def test_summary_inquiry_works_in_production() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            200,
            json={
                "rnc": "130862346",
                "encf": "E320000000001",
                "secuenciaUtilizada": True,
                "codigo": 1,
                "estado": "Aceptado",
            },
        )

    ecf = ECF(
        CREDENTIALS,
        Environment.PROD,
        token="tok",
        http_client=make_client(handler),
    )
    result = ecf.get_summary_invoice_inquiry("130862346", "E320000000001", "abc123")

    assert result.is_ok()
    inquiry = result.unwrap()
    assert isinstance(inquiry, InquiryInvoiceSummary)
    assert inquiry.encf == "E320000000001"
