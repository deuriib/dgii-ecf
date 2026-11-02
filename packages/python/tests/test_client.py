"""Client tests using httpx2.MockTransport (no network)."""

from __future__ import annotations

import httpx2

from py_dgii_ecf.certificate import P12ReaderData
from py_dgii_ecf.client import ECF
from py_dgii_ecf.environment import Environment
from py_dgii_ecf.resilience import ResilienceOptions

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
