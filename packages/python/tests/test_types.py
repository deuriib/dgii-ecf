"""Typed response model tests (parsing DGII payloads into dataclasses)."""

from __future__ import annotations

import pytest

from py_dgii_ecf.types import (
    COMMERCIAL_APPROVAL_ACCEPTED_CODE,
    COMMERCIAL_APPROVAL_ACCEPTED_STATE,
    CommercialApprovalResponse,
    InquiryInvoiceSummary,
    InquiryStatusResponse,
    InvoiceResponse,
    InvoiceSummaryResponse,
    Mensaje,
    ResponseShapeError,
    ServiceDirectoryResponse,
    SummaryTrackingStatusResponse,
    TrackingStatusResponse,
    VoidNCFResponse,
)


def test_parses_tracking_status() -> None:
    response = TrackingStatusResponse.from_dict(
        {
            "trackId": "TRACK-1",
            "codigo": 1,
            "estado": "Aceptado",
            "rnc": "130862346",
            "encf": "E310000000001",
            "secuenciaUtilizada": True,
            "fechaRecepcion": "01-01-2026 10:00:00",
            "mensajes": [{"valor": "ok", "codigo": 0}],
        }
    )

    assert response.track_id == "TRACK-1"
    assert response.estado == "Aceptado"
    assert response.secuencia_utilizada is True
    assert response.mensajes == (Mensaje(valor="ok", codigo=0),)


def test_tolerates_numbers_and_booleans_encoded_as_strings() -> None:
    response = TrackingStatusResponse.from_dict(
        {
            "trackId": "TRACK-1",
            "codigo": "1",
            "estado": "Aceptado",
            "rnc": 130862346,
            "encf": "E310000000001",
            "secuenciaUtilizada": "true",
            "fechaRecepcion": "01-01-2026 10:00:00",
        }
    )

    assert response.codigo == 1
    assert response.rnc == "130862346"
    assert response.secuencia_utilizada is True
    assert response.mensajes == ()


def test_invoice_response_defaults_empty_fields() -> None:
    response = InvoiceResponse.from_dict({})
    assert response.track_id is None
    assert response.error is None
    assert response.mensaje is None
    assert response.mensajes == ()


def test_invoice_response_reads_singular_mensaje() -> None:
    response = InvoiceResponse.from_dict(
        {"trackId": "t1", "error": "", "mensaje": "Recibido"}
    )
    assert response.mensaje == "Recibido"
    assert response.mensajes == ()


def test_invoice_summary_response() -> None:
    response = InvoiceSummaryResponse.from_dict(
        {
            "codigo": 1,
            "estado": "Aceptado",
            "encf": "E320000000001",
            "secuenciaUtilizada": True,
            "mensajes": [{"valor": "Recibido", "codigo": 0}],
        }
    )
    assert response.encf == "E320000000001"
    assert response.secuencia_utilizada is True
    assert len(response.mensajes) == 1


def test_inquiry_status_optional_fields() -> None:
    response = InquiryStatusResponse.from_dict(
        {
            "codigo": 1,
            "estado": "Aceptado",
            "rncEmisor": "130862346",
            "montoTotal": "1180.00",
        }
    )
    assert response.monto_total == 1180.0
    assert response.total_itbis is None
    assert response.id_extranjero is None


def test_service_directory_allows_missing_optional_urls() -> None:
    response = ServiceDirectoryResponse.from_dict(
        {
            "nombre": "Buyer",
            "rnc": "130862346",
            "urlRecepcion": "https://buyer/recepcion",
        }
    )
    assert response.url_aceptacion == ""
    assert response.url_opcional == ""


def test_inquiry_invoice_summary() -> None:
    response = InquiryInvoiceSummary.from_dict(
        {
            "rnc": "130862346",
            "encf": "E320000000001",
            "secuenciaUtilizada": True,
            "codigo": 1,
            "estado": "Aceptado",
        }
    )
    assert response.rnc == "130862346"
    assert response.codigo == 1


def test_summary_tracking_status() -> None:
    response = SummaryTrackingStatusResponse.from_dict(
        {
            "trackId": "TRACK-1",
            "estado": "En Proceso",
            "fechaRecepcion": "01-01-2026 10:00:00",
        }
    )
    assert response.estado == "En Proceso"


def test_commercial_approval_accepts_single_message_string() -> None:
    response = CommercialApprovalResponse.from_dict(
        {
            "codigo": "1",
            "estado": "Aprobación comercial aprobada",
            "mensaje": "Aprobada",
        }
    )
    assert response.codigo == COMMERCIAL_APPROVAL_ACCEPTED_CODE
    assert response.estado == COMMERCIAL_APPROVAL_ACCEPTED_STATE
    assert response.mensaje == ("Aprobada",)


def test_void_response() -> None:
    response = VoidNCFResponse.from_dict(
        {
            "rnc": "130862346",
            "codigo": "01",
            "nombre": "Deuri",
            "mensajes": ["Anulado"],
        }
    )
    assert response.mensajes == ("Anulado",)


def test_missing_required_field_raises() -> None:
    # `codigo` and `estado` are the only required fields; DGII omits the rest
    # on a "No encontrado" answer.
    with pytest.raises(ResponseShapeError, match="codigo"):
        TrackingStatusResponse.from_dict({"estado": "Aceptado"})
    with pytest.raises(ResponseShapeError, match="estado"):
        TrackingStatusResponse.from_dict({"codigo": 1})


def test_wrong_type_raises() -> None:
    with pytest.raises(ResponseShapeError, match="codigo"):
        TrackingStatusResponse.from_dict(
            {
                "trackId": "TRACK-1",
                "codigo": "not-a-number",
                "estado": "Aceptado",
                "rnc": "130862346",
                "encf": "E310000000001",
                "secuenciaUtilizada": True,
                "fechaRecepcion": "01-01-2026 10:00:00",
            }
        )


def test_invalid_boolean_raises() -> None:
    with pytest.raises(ResponseShapeError, match="secuenciaUtilizada"):
        InquiryInvoiceSummary.from_dict(
            {
                "rnc": "130862346",
                "encf": "E320000000001",
                "secuenciaUtilizada": "maybe",
                "codigo": 1,
                "estado": "Aceptado",
            }
        )


def test_tracking_status_parses_a_not_found_answer() -> None:
    response = TrackingStatusResponse.from_dict(
        {"codigo": 0, "estado": "No encontrado"}
    )

    assert response.codigo == 0
    assert response.estado == "No encontrado"
    assert response.track_id is None
    assert response.rnc is None
    assert response.encf is None
    assert response.secuencia_utilizada is None
    assert response.fecha_recepcion is None
    assert response.mensajes == ()


def test_invoice_summary_keeps_mensajes_when_fiscal_fields_are_absent() -> None:
    response = InvoiceSummaryResponse.from_dict(
        {
            "codigo": 2,
            "estado": "Rechazado",
            "mensajes": [{"codigo": 1, "valor": "Firma digital invalida"}],
        }
    )

    assert response.estado == "Rechazado"
    assert response.encf is None
    assert response.secuencia_utilizada is None
    assert response.mensajes[0].valor == "Firma digital invalida"


def test_summary_tracking_status_tolerates_a_partial_entry() -> None:
    response = SummaryTrackingStatusResponse.from_dict({"estado": "En Proceso"})

    assert response.estado == "En Proceso"
    assert response.track_id is None
    assert response.fecha_recepcion is None


def test_inquiry_invoice_summary_tolerates_a_partial_answer() -> None:
    response = InquiryInvoiceSummary.from_dict({"codigo": 0, "estado": "No encontrado"})

    assert response.codigo == 0
    assert response.estado == "No encontrado"
    assert response.rnc is None
    assert response.encf is None
    assert response.secuencia_utilizada is None
