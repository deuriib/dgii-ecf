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


def test_tolerates_numbers_encoded_as_strings() -> None:
    response = TrackingStatusResponse.from_dict(
        {
            "trackId": "TRACK-1",
            "codigo": "1",
            "estado": "Aceptado",
            "rnc": 130862346,
            "encf": "E310000000001",
            "secuenciaUtilizada": True,
            "fechaRecepcion": "01-01-2026 10:00:00",
        }
    )

    assert response.codigo == 1
    assert response.rnc == "130862346"
    assert response.secuencia_utilizada is True
    assert response.mensajes == ()


@pytest.mark.parametrize("flag", ["false", "true", 0, 1, {}, "maybe"])
def test_a_non_boolean_reuse_flag_is_never_evidence(flag: object) -> None:
    """§6 rules 1-2: only a literal `false` licenses reuse, so none is coerced.

    Coercing `"false"` or `0` into `False` would let one SDK answer "reusable"
    where the other answers "not reusable" — the very answer this path exists
    to get right.
    """
    tracking = TrackingStatusResponse.from_dict(
        {"codigo": 2, "estado": "Rechazado", "secuenciaUtilizada": flag}
    )
    summary = InquiryInvoiceSummary.from_dict(
        {"codigo": 2, "estado": "Rechazado", "secuenciaUtilizada": flag}
    )

    assert tracking.secuencia_utilizada is None
    assert summary.secuencia_utilizada is None


def test_reception_summary_still_tolerates_a_string_flag() -> None:
    """The reception answer (E4) keeps its coercion: it is not a reuse read."""
    response = InvoiceSummaryResponse.from_dict(
        {"codigo": 1, "estado": "Aceptado", "secuenciaUtilizada": "true"}
    )

    assert response.secuencia_utilizada is True


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
    assert response.mensajes[0].valor == "Anulado"


def test_void_response_accepts_object_messages() -> None:
    response = VoidNCFResponse.from_dict(
        {
            "rnc": "130862346",
            "codigo": "1",
            "nombre": "Deuri",
            "mensajes": [{"codigo": 0, "valor": "Las secuencias fueron anuladas"}],
        }
    )

    assert response.mensajes[0].valor == "Las secuencias fueron anuladas"
    assert response.mensajes[0].codigo == 0


def test_missing_classifying_field_raises() -> None:
    # `estado` decides whether a listing entry is usable, so it stays required
    # there, and so does `codigo` on the models that do not tolerate a partial
    # body.
    with pytest.raises(ResponseShapeError, match="estado"):
        SummaryTrackingStatusResponse.from_dict({"trackId": "TRACK-1"})
    with pytest.raises(ResponseShapeError, match="codigo"):
        InquiryInvoiceSummary.from_dict({"estado": "Aceptado"})


def test_tracking_status_tolerates_a_partial_answer() -> None:
    """T-K: the result read may only withhold reuse, never fail the call."""
    response = TrackingStatusResponse.from_dict({})

    assert response.codigo == 0
    assert response.estado == ""
    assert response.secuencia_utilizada is None


@pytest.mark.parametrize("estado", [1, 2.5, True, {}, ["Aceptado"]])
def test_a_non_string_state_raises_where_it_classifies(estado: object) -> None:
    """The state that picks a branch is read exactly as DGII typed it."""
    with pytest.raises(ResponseShapeError, match="estado"):
        InquiryStatusResponse.from_dict({"codigo": 1, "estado": estado})
    with pytest.raises(ResponseShapeError, match="estado"):
        SummaryTrackingStatusResponse.from_dict({"estado": estado})


def test_a_numeric_track_id_is_not_followable() -> None:
    """Only a string id names a track; a number must not invent one."""
    response = SummaryTrackingStatusResponse.from_dict(
        {"estado": "Rechazado", "trackId": 5}
    )

    assert response.track_id is None


def test_inquiry_status_defaults_a_partial_answer() -> None:
    """§5.6 row 1: an object with a string `estado` is accepted."""
    response = InquiryStatusResponse.from_dict({"estado": "Aceptado"})

    assert response.codigo == 0
    assert response.estado == "Aceptado"
    assert response.monto_total is None


def test_inquiry_status_drops_unreadable_optional_fields() -> None:
    """Existence rests on `estado`, so a malformed amount cannot fail the read."""
    response = InquiryStatusResponse.from_dict(
        {
            "codigo": 1,
            "estado": "Aceptado",
            "montoTotal": "abc",
            "totalITBIS": {},
            "rncEmisor": {},
        }
    )

    assert response.monto_total is None
    assert response.total_itbis is None
    assert response.rnc_emisor is None


@pytest.mark.parametrize("codigo", ["not-a-number", {}, [], True, None])
def test_a_wrong_typed_codigo_cannot_fail_a_read(codigo: object) -> None:
    """R17h/R13l: `codigo` labels the answer, so a malformed one defaults to `0`.

    Nothing on either read branches on it, so its shape may not fail a payload
    whose `estado` is readable (§5.6 row 1). `estado` is the one that
    classifies, and it keeps raising where it does.
    """
    result = TrackingStatusResponse.from_dict(
        {
            "trackId": "TRACK-1",
            "codigo": codigo,
            "estado": "Aceptado",
            "rnc": "130862346",
            "encf": "E310000000001",
            "secuenciaUtilizada": True,
            "fechaRecepcion": "01-01-2026 10:00:00",
        }
    )

    assert result.codigo == 0
    assert result.estado == "Aceptado"
    assert result.track_id == "TRACK-1"

    inquiry = InquiryStatusResponse.from_dict({"codigo": codigo, "estado": "Aceptado"})

    assert inquiry.codigo == 0
    assert inquiry.estado == "Aceptado"

    with pytest.raises(ResponseShapeError, match="estado"):
        InquiryStatusResponse.from_dict({"codigo": 1, "estado": 42})


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


def test_mensaje_preserves_an_alphanumeric_code() -> None:
    response = InvoiceSummaryResponse.from_dict(
        {
            "codigo": 2,
            "estado": "Rechazado",
            "encf": "E320000000001",
            "secuenciaUtilizada": True,
            "mensajes": [{"codigo": "A01", "valor": "Firma digital invalida"}],
        }
    )

    assert response.mensajes[0].codigo == "A01"


def test_mensaje_coerces_a_numeric_string_code() -> None:
    response = InvoiceSummaryResponse.from_dict(
        {
            "codigo": 1,
            "estado": "Aceptado",
            "encf": "E320000000001",
            "secuenciaUtilizada": True,
            "mensajes": [{"codigo": "7", "valor": "Observacion"}],
        }
    )

    assert response.mensajes[0].codigo == 7
