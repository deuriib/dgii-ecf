"""Client tests using httpx2.MockTransport (no network)."""

from __future__ import annotations

import hashlib

import httpx2

from py_dgii_ecf.certificate import P12ReaderData
from py_dgii_ecf.client import ECF
from py_dgii_ecf.environment import Environment
from py_dgii_ecf.errors import DgiiErrorCode
from py_dgii_ecf.http import InMemoryIdempotencyStore
from py_dgii_ecf.resilience import ResilienceOptions
from py_dgii_ecf.types import (
    B2BCommercialApprovalResponse,
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


def test_idempotency_key_tolerates_prefix_and_attributes() -> None:
    store = InMemoryIdempotencyStore()
    xml = (
        '<ECF xmlns:dgii="https://dgii.gov.do/eCF"><Encabezado>'
        '<RNCEmisor version="1.0">130862346</RNCEmisor>'
        '<IdDoc><dgii:eNCF tipo="31">E310000000001</dgii:eNCF></IdDoc>'
        "</Encabezado></ECF>"
    )
    digest = hashlib.sha256(xml.encode()).hexdigest()

    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json={"trackId": "t4"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        idempotency_store=store,
        http_client=make_client(handler),
    )
    result = ecf.send_electronic_document(xml, "f.xml")

    assert result.is_ok()
    assert store.get(f"130862346:E310000000001:{digest}") == {"trackId": "t4"}
    assert store.get(f"unknown-rnc:unknown-encf:{digest}") is None


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
        # A body that is not a JSON object is a non-answer, not a field DGII
        # typed differently: `codigo` no longer fails a readable payload.
        return httpx2.Response(200, json="not-a-number")

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
    assert error.message == "Unexpected DGII response payload"


def test_a_wrong_typed_codigo_is_a_label_not_a_shape_error() -> None:
    """R17h: `codigo` labels the answer, so its shape cannot fail the read."""

    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            200, json={"codigo": "not-a-number", "estado": "Aceptado"}
        )

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    result = ecf.status_track_id("TRACK-1")

    assert result.is_ok()
    assert result.unwrap().codigo == 0
    assert result.unwrap().estado == "Aceptado"


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


APPROVAL_PAYLOAD = {
    "codigo": "1",
    "estado": "Aprobación comercial aprobada",
    "mensaje": [],
}

VOID_PAYLOAD = {
    "rnc": "130862346",
    "codigo": "0",
    "nombre": "Accepted",
    "mensajes": [],
}


def approval_xml(rnc: str, encf: str) -> str:
    return (
        f"<ACECF><DetalleAprobacionComercial><RNCEmisor>{rnc}</RNCEmisor>"
        f"<eNCF>{encf}</eNCF></DetalleAprobacionComercial></ACECF>"
    )


def void_xml(rnc: str, rango: str) -> str:
    return (
        f"<ANECF><Encabezado><RNCEmisor>{rnc}</RNCEmisor></Encabezado>"
        f"<DetalleAnulacion><RangoNCF>{rango}</RangoNCF>"
        f"</DetalleAnulacion></ANECF>"
    )


def test_commercial_approval_is_idempotent() -> None:
    calls = {"n": 0}

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json=APPROVAL_PAYLOAD)

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    xml = approval_xml("130862346", "E310000000001")

    first = ecf.send_commercial_approval(xml, "acecf.xml")
    second = ecf.send_commercial_approval(xml, "acecf.xml")

    assert first.is_ok()
    assert second.is_ok()
    assert calls["n"] == 1


def test_void_is_idempotent() -> None:
    calls = {"n": 0}

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json=VOID_PAYLOAD)

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    xml = void_xml("130862346", "E310000000010")

    first = ecf.void_encf(xml, "anecf.xml")
    second = ecf.void_encf(xml, "anecf.xml")

    assert first.is_ok()
    assert second.is_ok()
    assert calls["n"] == 1


def test_void_key_uses_rango_ncf_when_encf_is_absent() -> None:
    store = InMemoryIdempotencyStore()
    xml = void_xml("130862346", "E310000000010")
    digest = hashlib.sha256(xml.encode("utf-8")).hexdigest()

    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json=VOID_PAYLOAD)

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
        idempotency_store=store,
    )
    result = ecf.void_encf(xml, "anecf.xml")

    assert result.is_ok()
    assert store.get(f"130862346:E310000000010:{digest}") == VOID_PAYLOAD


def test_refuses_pending_commercial_approval() -> None:
    store = InMemoryIdempotencyStore()
    xml = approval_xml("130862346", "E310000000002")
    digest = hashlib.sha256(xml.encode("utf-8")).hexdigest()
    store.set(f"130862346:E310000000002:{digest}", {"__pending__": True})
    calls = {"n": 0}

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json=APPROVAL_PAYLOAD)

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
        idempotency_store=store,
    )
    result = ecf.send_commercial_approval(xml, "acecf.xml")

    assert result.is_err()
    assert result.unwrap_err().code is DgiiErrorCode.IDEMPOTENCY
    assert calls["n"] == 0


def test_clears_pending_marker_when_void_fails() -> None:
    store = InMemoryIdempotencyStore()
    xml = void_xml("130862346", "E310000000011")
    digest = hashlib.sha256(xml.encode("utf-8")).hexdigest()
    key = f"130862346:E310000000011:{digest}"

    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(400, json={"mensajes": [{"valor": "bad", "codigo": 1}]})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
        idempotency_store=store,
    )
    result = ecf.void_encf(xml, "anecf.xml")

    assert result.is_err()
    assert store.get(key) is None


def test_separates_documents_sharing_rnc_and_encf() -> None:
    calls = {"n": 0}

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json=APPROVAL_PAYLOAD)

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    ecf.send_commercial_approval(approval_xml("130862346", "E310000000003"), "a.xml")
    ecf.send_commercial_approval(
        approval_xml("130862346", "E310000000003") + "\n<!-- revised -->",
        "b.xml",
    )

    assert calls["n"] == 2


def test_send_document_dispatches_by_document_content() -> None:
    urls: list[str] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        url = str(request.url)
        urls.append(url)
        if "recepcionfc" in url:
            return httpx2.Response(
                200,
                json={
                    "codigo": 1,
                    "estado": "Aceptado",
                    "mensajes": [],
                    "encf": "E320000000001",
                    "secuenciaUtilizada": True,
                },
            )
        return httpx2.Response(200, json={"trackId": "t1"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    general = ecf.send_document(
        "<ECF><Encabezado><IdDoc><TipoeCF>31</TipoeCF></IdDoc>"
        "<Totales><MontoTotal>1000.00</MontoTotal></Totales></Encabezado></ECF>",
        "f.xml",
    )
    assert general.is_ok()

    summary = ecf.send_document(
        "<RFCE><Encabezado><IdDoc><TipoeCF>32</TipoeCF></IdDoc></Encabezado></RFCE>",
        "f.xml",
    )
    assert summary.is_ok()

    assert "/TesteCF/recepcion/api/FacturasElectronicas" in urls[0]
    assert "/TesteCF/recepcionfc/api/recepcion/ecf" in urls[1]


def test_send_document_rejects_a_misrouted_e32_without_calling_http() -> None:
    calls = {"n": 0}

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json={})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    result = ecf.send_document(
        "<ECF><Encabezado><IdDoc><TipoeCF>32</TipoeCF></IdDoc>"
        "<Totales><MontoTotal>100.00</MontoTotal></Totales></Encabezado></ECF>",
        "f.xml",
    )

    assert result.is_err()
    assert result.unwrap_err().code.value == "VALIDATION"
    assert calls["n"] == 0


def test_send_document_rejects_a_buyer_host_for_an_rfce() -> None:
    calls = {"n": 0}

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json={})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    result = ecf.send_document(
        "<RFCE><Encabezado><IdDoc><TipoeCF>32</TipoeCF></IdDoc></Encabezado></RFCE>",
        "f.xml",
        buyer_host="https://buyer.example",
    )

    assert result.is_err()
    assert result.unwrap_err().code.value == "VALIDATION"
    assert calls["n"] == 0


RFCE_XML = (
    "<RFCE><Encabezado><RNCEmisor>130862346</RNCEmisor>"
    "<IdDoc><eNCF>E320000000001</eNCF></IdDoc></Encabezado></RFCE>"
)


def test_rfce_reception_accepts_a_string_message_code() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            200,
            json={
                "codigo": 2,
                "estado": "Rechazado",
                "encf": "E320000000001",
                "secuenciaUtilizada": True,
                "mensajes": [{"codigo": "A01", "valor": "Firma digital invalida"}],
            },
        )

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    result = ecf.send_summary(RFCE_XML, "f.xml")

    assert result.is_ok()
    assert result.unwrap().mensajes[0].codigo == "A01"


def test_parse_failure_keeps_the_idempotency_key() -> None:
    store = InMemoryIdempotencyStore()
    key = (
        "130862346:E320000000001:"
        + hashlib.sha256(RFCE_XML.encode("utf-8")).hexdigest()
    )
    calls = {"n": 0}

    def handler(_request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json={"unexpected": True})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
        idempotency_store=store,
    )

    first = ecf.send_summary(RFCE_XML, "f.xml")
    assert first.is_err()
    assert store.get(key) is not None

    # A retry must not re-submit a document DGII already accepted.
    second = ecf.send_summary(RFCE_XML, "f.xml")
    assert second.is_err()
    assert calls["n"] == 1


def test_directory_listing_returns_every_receiver() -> None:
    entry = {
        "nombre": "RECEPTOR SRL",
        "rnc": "131880657",
        "urlRecepcion": "https://receptor.example/fe/recepcion",
        "urlAceptacion": "https://receptor.example/fe/aprobacion",
        "urlOpcional": "https://receptor.example/fe/autenticacion",
    }
    captured: list[str] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        captured.append(str(request.url))
        return httpx2.Response(200, json=[entry, {**entry, "rnc": "101000001"}])

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    result = ecf.get_directory_listing()

    assert result.is_ok()
    assert len(result.unwrap()) == 2
    assert result.unwrap()[0].url_recepcion == "https://receptor.example/fe/recepcion"
    assert "/TesteCF/consultadirectorio/api/consultas/listado" in captured[0]


def test_directory_listing_normalizes_a_single_object() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            200,
            json={
                "nombre": "RECEPTOR SRL",
                "rnc": "131880657",
                "urlRecepcion": "https://receptor.example/fe/recepcion",
            },
        )

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    result = ecf.get_directory_listing()

    assert result.is_ok()
    assert len(result.unwrap()) == 1


E41_XML = (
    "<ECF><Encabezado><IdDoc><TipoeCF>41</TipoeCF></IdDoc>"
    "<Totales><MontoTotal>100.00</MontoTotal></Totales></Encabezado></ECF>"
)


def test_b2b_rejects_an_excluded_type_without_calling_http() -> None:
    calls = {"n": 0}

    def handler(_request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json={"trackId": "t1"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    result = ecf.send_electronic_document(E41_XML, "f.xml", "https://buyer.example")

    assert result.is_err()
    assert result.unwrap_err().code.value == "VALIDATION"
    assert calls["n"] == 0


def test_b2b_sends_when_enforcement_is_disabled() -> None:
    calls = {"n": 0}

    def handler(_request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json={"trackId": "t1"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
        enforce_b2b_rules=False,
    )

    result = ecf.send_electronic_document(E41_XML, "f.xml", "https://buyer.example")

    assert result.is_ok()
    assert calls["n"] == 1


def test_b2b_commercial_approval_reports_http_200() -> None:
    captured: list[str] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        captured.append(str(request.url))
        return httpx2.Response(200, json={"received": True})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    result = ecf.send_commercial_approval(
        approval_xml("130862346", "E310000000001"),
        "a.xml",
        "https://buyer.example",
    )

    assert result.is_ok()
    ack = result.unwrap()
    assert isinstance(ack, B2BCommercialApprovalResponse)
    assert ack.status == 200
    assert ack.accepted is True
    assert captured[0] == "https://buyer.example/fe/aprobacioncomercial/api/ecf"


def test_b2b_commercial_approval_reports_http_400_as_unsatisfactory() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(400, text="unsatisfactory")

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )

    result = ecf.send_commercial_approval(
        approval_xml("130862346", "E310000000002"),
        "a.xml",
        "https://buyer.example",
    )

    assert result.is_ok()
    ack = result.unwrap()
    assert ack.status == 400
    assert ack.accepted is False


def test_b2b_commercial_approval_is_idempotent() -> None:
    calls = {"n": 0}

    def handler(_request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(200, json={"received": True})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
    )
    xml = approval_xml("130862346", "E310000000003")

    ecf.send_commercial_approval(xml, "a.xml", "https://buyer.example")
    ecf.send_commercial_approval(xml, "a.xml", "https://buyer.example")

    assert calls["n"] == 1


def test_void_key_uses_the_anecf_schema_elements() -> None:
    store = InMemoryIdempotencyStore()
    xml = (
        "<ANECF><Encabezado><Version>1.0</Version>"
        "<RncEmisor>130862346</RncEmisor>"
        "<CantidadeNCFAnulados>10</CantidadeNCFAnulados>"
        "<FechaHoraAnulacioneNCF>01-01-2026 10:00:00</FechaHoraAnulacioneNCF>"
        "</Encabezado><DetalleAnulacion><Anulacion><NoLinea>1</NoLinea>"
        "<TipoeCF>31</TipoeCF><TablaRangoSecuenciasAnuladaseNCF>"
        "<Secuencias><SecuenciaeNCFDesde>E310000000010</SecuenciaeNCFDesde>"
        "<SecuenciaeNCFHasta>E310000000019</SecuenciaeNCFHasta>"
        "</Secuencias></TablaRangoSecuenciasAnuladaseNCF>"
        "</Anulacion></DetalleAnulacion></ANECF>"
    )
    digest = hashlib.sha256(xml.encode("utf-8")).hexdigest()
    key = f"130862346:E310000000010:{digest}"

    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json=VOID_PAYLOAD)

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=make_client(handler),
        idempotency_store=store,
    )

    result = ecf.void_encf(xml, "anecf.xml")

    assert result.is_ok()
    assert store.get(key) is not None
