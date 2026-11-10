"""Reconciliation against DGII's actual wire contract.

Every test mocks a payload DGII publishes and routes it on the request URL, so
no fixture can pass by encoding the code path: ``consultaestado`` never carries
``secuenciaUtilizada`` (that field is published on ``consultaresultado``), and
the only route to the reuse flag is ``consultatrackids`` → ``consultaresultado``.

Classification follows the read, not a shared tolerance (C-1 §2):

- ``consultaestado`` and a ``consultatrackids`` entry decide *which* answer or
track applies, so ``estado`` is read strictly there — a numeric one is an
``Err(VALIDATION)``, exactly as in the TypeScript SDK.
- ``consultaresultado`` only corroborates a flag that was already published, so
  an absent or unreadable verdict answers ``Ok(canReuseSequence=False)``
  instead of failing the call (T-K).

Test ids (T-A … T-P) map to the mandatory table in the #126 contract design —
T-A and T-B are regression guards here, because Python already answers an empty
or ``null`` body with ``Err(VALIDATION)``. ``R…`` ids are the parity-matrix rows
of the T6 review.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass

import httpx2
import pytest

from py_dgii_ecf.certificate import P12ReaderData
from py_dgii_ecf.client import _PENDING_MARKER, ECF
from py_dgii_ecf.environment import Environment
from py_dgii_ecf.http import InMemoryIdempotencyStore
from py_dgii_ecf.reconciliation import (
    PENDING_SUBMISSION_MESSAGE,
    ReconciliationResult,
    can_reuse_sequence,
)
from py_dgii_ecf.result import DgiiResult
from py_dgii_ecf.types import InquiryInvoiceSummary, TrackingStatusResponse

#: URL fragments that identify each consult. Matching is case-insensitive
#: because DGII's own paths are inconsistently cased.
INQUIRY = "consultaestado/api/consultas/estado"
TRACKS = "consultatrackids/api/trackids/consulta"
RESULT = "consultaresultado/api/consultas/estado"

CREDENTIALS = P12ReaderData(key="unused", cert="unused")

RNC = "130862346"
ENCF = "E310000000001"

ECF_XML = (
    f"<ECF><Encabezado><RNCEmisor>{RNC}</RNCEmisor>"
    f"<IdDoc><eNCF>{ENCF}</eNCF></IdDoc></Encabezado></ECF>"
)
RFCE_XML = (
    f"<RFCE><Encabezado><RNCEmisor>{RNC}</RNCEmisor>"
    f"<IdDoc><eNCF>{ENCF}</eNCF></IdDoc></Encabezado></RFCE>"
)


def key_for(xml: str) -> str:
    return f"{RNC}:{ENCF}:{hashlib.sha256(xml.encode()).hexdigest()}"


KEY = key_for(ECF_XML)
RFCE_KEY = key_for(RFCE_XML)


@dataclass(frozen=True)
class Reconcile:
    """One reconcile run: its result, the requests it made, and the store."""

    result: DgiiResult[ReconciliationResult]
    #: ``(service, url)`` per transport attempt, in request order.
    calls: list[tuple[str, str]]
    store: InMemoryIdempotencyStore

    @property
    def markers(self) -> list[str]:
        return [service for service, _unused in self.calls]


def make_client(
    replies: Mapping[str, httpx2.Response],
) -> tuple[httpx2.Client, list[tuple[str, str]]]:
    """A mock transport that routes on the service and records every request."""
    calls: list[tuple[str, str]] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        url = str(request.url)
        lowered = url.lower()
        for service in (INQUIRY, TRACKS, RESULT):
            if service in lowered:
                calls.append((service, url))
                if service in replies:
                    return replies[service]
                return httpx2.Response(404, json={"mensaje": "unrouted"})
        calls.append((f"unrouted:{url}", url))
        return httpx2.Response(404, json={"mensaje": "unrouted"})

    return httpx2.Client(transport=httpx2.MockTransport(handler)), calls


def reconcile(
    replies: Mapping[str, httpx2.Response],
    *,
    xml: str = ECF_XML,
    store: InMemoryIdempotencyStore | None = None,
) -> Reconcile:
    """Reconcile ``xml`` with a pending marker already in the store."""
    store = store if store is not None else InMemoryIdempotencyStore()
    store.set(key_for(xml), dict(_PENDING_MARKER))
    client, calls = make_client(replies)
    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=client,
        idempotency_store=store,
    )
    return Reconcile(ecf.reconcile_submission(xml), calls, store)


def ok(payload: object, status: int = 200) -> httpx2.Response:
    return httpx2.Response(status, json=payload)


def no_body(status: int = 200) -> httpx2.Response:
    return httpx2.Response(status)


def inquiry(estado: str) -> httpx2.Response:
    """A ``consultaestado`` answer — never carrying a reuse flag."""
    return ok({"codigo": 2, "estado": estado, "rncEmisor": RNC, "ncfElectronico": ENCF})


def tracks(*entries: object) -> httpx2.Response:
    return ok(list(entries))


def track_entry(estado: str, track_id: str | None = None) -> dict[str, object]:
    entry: dict[str, object] = {"estado": estado}
    if track_id is not None:
        entry["trackId"] = track_id
    return entry


def one_track() -> httpx2.Response:
    return tracks(track_entry("Rechazado", "TRACK-1"))


def test_can_reuse_sequence() -> None:
    """P2: the predicate reads a response that actually carries the flag."""
    assert can_reuse_sequence(
        TrackingStatusResponse(codigo=2, estado="Rechazado", secuencia_utilizada=False)
    )
    assert not can_reuse_sequence(
        TrackingStatusResponse(codigo=2, estado="Rechazado", secuencia_utilizada=True)
    )
    # An absent flag is "not reusable", not "reusable".
    assert not can_reuse_sequence(TrackingStatusResponse(codigo=2, estado="Rechazado"))
    # The predicate keeps DGII's own scoping: reuse is a rejection-only concept.
    assert not can_reuse_sequence(
        TrackingStatusResponse(codigo=1, estado="Aceptado", secuencia_utilizada=False)
    )
    # Trimming is the only tolerance.
    assert can_reuse_sequence(
        TrackingStatusResponse(
            codigo=2, estado=" Rechazado ", secuencia_utilizada=False
        )
    )
    # B2: an empty state answers False instead of raising.
    assert not can_reuse_sequence(
        TrackingStatusResponse(codigo=2, estado="", secuencia_utilizada=False)
    )
    # The RFCE inquiry is the other documented carrier of the flag; its `true`
    # licenses another *Resumen de Factura de Consumo*, never another e-CF.
    assert can_reuse_sequence(
        InquiryInvoiceSummary(codigo=2, estado="Rechazado", secuencia_utilizada=False)
    )
    assert not can_reuse_sequence(
        InquiryInvoiceSummary(codigo=2, estado="Rechazado", secuencia_utilizada=True)
    )
    assert not can_reuse_sequence(InquiryInvoiceSummary(codigo=2, estado="Rechazado"))


def test_empty_inquiry_body_is_an_error_and_keeps_the_marker() -> None:
    """T-A: a `200` with an empty body is not "no record"; it is an error."""
    run = reconcile({INQUIRY: no_body()})

    assert run.result.is_err()
    assert run.result.unwrap_err().code.value == "VALIDATION"
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY]


def test_null_inquiry_body_is_an_error_and_keeps_the_marker() -> None:
    """T-B: an explicit `null` body is a non-answer, never "no record"."""
    run = reconcile({INQUIRY: httpx2.Response(200, content=b"null")})

    assert run.result.is_err()
    assert run.result.unwrap_err().code.value == "VALIDATION"
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY]


def test_inquiry_without_estado_is_an_error_and_keeps_the_marker() -> None:
    """T-C: an unclassifiable object fails the call instead of raising."""
    run = reconcile({INQUIRY: ok({"codigo": 2, "rncEmisor": RNC})})

    assert run.result.is_err()
    assert run.result.unwrap_err().code.value == "VALIDATION"
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY]


def test_clears_the_marker_when_dgii_has_no_record() -> None:
    """T-D: existence still comes from `consultaestado`, unchanged."""
    run = reconcile({INQUIRY: ok({"codigo": 0, "estado": "No encontrado"})})

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.delivered is False
    assert outcome.cleared is True
    assert outcome.can_reuse_sequence is False
    assert run.store.get(KEY) is None
    assert run.markers == [INQUIRY]


def test_empty_track_listing_is_an_error_and_keeps_the_marker() -> None:
    """T-E: the listing is a non-answer too, and it fails the call."""
    run = reconcile({INQUIRY: inquiry("Rechazado"), TRACKS: no_body()})

    assert run.result.is_err()
    error = run.result.unwrap_err()
    assert error.code.value == "VALIDATION"
    assert error.message == "Unexpected DGII response payload"
    # F-126-12: Python never populates `resource`, so `Ok` vs `Err` is the
    # parity-safe discriminator here.
    assert error.resource is None
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS]


def test_empty_track_array_does_not_clear_or_claim_reuse() -> None:
    """T-F: `[]` is "no track to ask", never "DGII holds nothing"."""
    run = reconcile({INQUIRY: inquiry("Rechazado"), TRACKS: tracks()})

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.delivered is True
    assert outcome.cleared is False
    assert outcome.can_reuse_sequence is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS]


def test_not_found_track_does_not_un_deliver_the_document() -> None:
    """T-G: a contradicting listing never overrides the existence answer."""
    run = reconcile(
        {INQUIRY: inquiry("Rechazado"), TRACKS: tracks(track_entry("No encontrado"))}
    )

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.delivered is True
    assert outcome.cleared is False
    assert outcome.can_reuse_sequence is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS]


def test_unclassifiable_track_entry_is_an_error_and_keeps_the_marker() -> None:
    """§5.6: an entry with no string state cannot be classified, so it fails."""
    run = reconcile(
        {INQUIRY: inquiry("Rechazado"), TRACKS: tracks({"trackId": "TRACK-1"})}
    )

    assert run.result.is_err()
    assert run.result.unwrap_err().code.value == "VALIDATION"
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS]


def test_failing_result_read_fails_the_call_and_keeps_the_marker() -> None:
    """T-H: a rejected document whose flag cannot be read is an `Err`."""
    store = InMemoryIdempotencyStore()
    run = reconcile(
        {
            INQUIRY: inquiry("Rechazado"),
            TRACKS: one_track(),
            RESULT: ok({"mensaje": "servicio no disponible"}, status=503),
        },
        store=store,
    )

    assert run.result.is_err()
    error = run.result.unwrap_err()
    assert error.code.value == "HTTP"
    assert error.status == 503
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    # The listing was followed once; the result read consumed its own retries.
    assert run.markers[:2] == [INQUIRY, TRACKS]
    assert RESULT in run.markers


def test_reports_a_reusable_sequence_on_a_rejection() -> None:
    """T-I: the defect — the flag now comes from `consultaresultado`."""
    run = reconcile(
        {
            INQUIRY: inquiry("Rechazado"),
            TRACKS: one_track(),
            RESULT: ok(
                {"codigo": 2, "estado": "Rechazado", "secuenciaUtilizada": False}
            ),
        }
    )

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.delivered is True
    assert outcome.cleared is False
    assert outcome.can_reuse_sequence is True
    # A rejected document keeps its lock; the caller must re-sign, not re-send.
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS, RESULT]
    assert "trackId=TRACK-1" in run.calls[2][1]
    assert f"rncEmisor={RNC}" in run.calls[1][1]
    assert f"encf={ENCF}" in run.calls[1][1]


def test_absent_flag_answers_not_reusable() -> None:
    """T-J: DGII did not state the flag, so nothing is claimed."""
    run = reconcile(
        {
            INQUIRY: inquiry("Rechazado"),
            TRACKS: one_track(),
            RESULT: ok({"codigo": 2, "estado": "Rechazado"}),
        }
    )

    assert run.result.is_ok()
    assert run.result.unwrap().can_reuse_sequence is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS, RESULT]


@pytest.mark.parametrize(
    "body",
    [
        # T-K literal: the flag is published, the verdict is absent.
        {"codigo": 2, "secuenciaUtilizada": False},
        # R10a: no `estado`, `codigo` present.
        {"codigo": 2, "trackId": "TRACK-1"},
        # R10c: a readable but silent object.
        {},
        # R17a / R17b: the verdict arrived, but unreadable.
        {"codigo": 2, "estado": 42, "secuenciaUtilizada": False},
        {"codigo": 2, "estado": {}, "secuenciaUtilizada": False},
    ],
    ids=["T-K", "R10a", "R10c", "R17a", "R17b"],
)
def test_a_result_without_a_readable_verdict_answers_not_reusable(
    body: dict[str, object],
) -> None:
    """T-K: DGII answered the flag question, so the call is `Ok`, never `Err`.

    The verdict only corroborates a flag that was already published, so an
    absent or unreadable one becomes the predicate's ``""`` default: it withholds
    reuse, it never fails a successful read (§6 rule 3). ``Err`` is reserved for
    a read that did not happen — and it would send the caller into a retry loop
    for an answer that will never change.
    """
    run = reconcile(
        {INQUIRY: inquiry("Rechazado"), TRACKS: one_track(), RESULT: ok(body)}
    )

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.delivered is True
    assert outcome.cleared is False
    assert outcome.can_reuse_sequence is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS, RESULT]


@pytest.mark.parametrize("estado", [42, 2.5, True, {}, ["Rechazado"], None])
def test_the_predicate_is_total_for_every_state_the_models_admit(
    estado: object,
) -> None:
    """B2/R-3: no exception escapes the predicate, whatever the state is.

    The wire never produces a non-string state (the result read normalises it to
    ``""``), but a hand-built model can, and the predicate must answer ``False``
    there instead of raising an ``AttributeError``.
    """
    assert (
        can_reuse_sequence(
            TrackingStatusResponse(
                codigo=2,
                estado=estado,  # type: ignore[arg-type]
                secuencia_utilizada=False,
            )
        )
        is False
    )
    assert (
        can_reuse_sequence(
            TrackingStatusResponse(codigo=2, estado="", secuencia_utilizada=False)
        )
        is False
    )
    assert (
        can_reuse_sequence(
            TrackingStatusResponse(codigo=2, estado=" ", secuencia_utilizada=False)
        )
        is False
    )
    assert (
        can_reuse_sequence(
            TrackingStatusResponse(
                codigo=2, estado=" Rechazado ", secuencia_utilizada=False
            )
        )
        is True
    )


@pytest.mark.parametrize("flag", ["false", 0], ids=["R10j", "R17c"])
def test_a_non_boolean_flag_does_not_license_reuse(flag: object) -> None:
    """§6 rules 1-2: the wire is untrusted, so only a literal `false` counts.

    Coercing ``"false"``/``0`` would make this SDK answer "reusable" where the
    other answers "not reusable" — the fiscal answer, not error text.
    """
    run = reconcile(
        {
            INQUIRY: inquiry("Rechazado"),
            TRACKS: one_track(),
            RESULT: ok(
                {"codigo": 2, "estado": "Rechazado", "secuenciaUtilizada": flag}
            ),
        }
    )

    assert run.result.is_ok()
    assert run.result.unwrap().can_reuse_sequence is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS, RESULT]


def test_an_unreadable_result_body_is_still_a_non_answer() -> None:
    """R10d/R10e: the tolerance is for a readable object, not for a non-answer."""
    for reply in (ok("nope"), no_body()):
        run = reconcile(
            {INQUIRY: inquiry("Rechazado"), TRACKS: one_track(), RESULT: reply}
        )

        assert run.result.is_err()
        error = run.result.unwrap_err()
        assert error.code.value == "VALIDATION"
        assert error.message == "Unexpected DGII response payload"
        assert run.store.get(KEY) == dict(_PENDING_MARKER)
        assert run.markers == [INQUIRY, TRACKS, RESULT]


@pytest.mark.parametrize(
    "field",
    # R17h: a `codigo` DGII typed as text labels the answer and nothing else.
    # R20b: the receipt date is not read on this path either.
    [{"codigo": "x"}, {"fechaRecepcion": {}}],
    ids=["R17h", "R20b"],
)
def test_a_malformed_result_field_does_not_fail_the_flag_read(
    field: dict[str, object],
) -> None:
    """R17h/R20b: the answer rests on `estado` and the flag, not on the labels.

    A field the reconcile path never reads cannot fail the read that carries the
    reuse answer — the same rule that already tolerates a missing `trackId`,
    `rnc`, `encf`, `fechaRecepcion` or `mensajes`.
    """
    run = reconcile(
        {
            INQUIRY: inquiry("Rechazado"),
            TRACKS: one_track(),
            RESULT: ok(
                {
                    "codigo": 2,
                    "estado": "Rechazado",
                    "secuenciaUtilizada": False,
                    **field,
                }
            ),
        }
    )

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.delivered is True
    assert outcome.cleared is False
    assert outcome.can_reuse_sequence is True
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS, RESULT]


def test_a_numeric_track_id_is_not_followed() -> None:
    """R16a: only a string id names a track, so nothing is asked about it."""
    run = reconcile(
        {
            INQUIRY: inquiry("Rechazado"),
            TRACKS: tracks({"trackId": 5, "estado": "Rechazado"}),
        }
    )

    assert run.result.is_ok()
    assert run.result.unwrap().can_reuse_sequence is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS]


def test_a_numeric_track_state_is_unclassifiable() -> None:
    """R14a: a coerced state would spend a call the other SDK never makes."""
    run = reconcile(
        {
            INQUIRY: inquiry("Rechazado"),
            TRACKS: tracks({"trackId": "TRACK-1", "estado": 1}),
        }
    )

    assert run.result.is_err()
    assert run.result.unwrap_err().code.value == "VALIDATION"
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS]


def test_a_numeric_inquiry_state_is_a_non_answer() -> None:
    """R13e: `estado` decides the lock, so it is read without coercion."""
    run = reconcile({INQUIRY: ok({"codigo": 1, "estado": 1})})

    assert run.result.is_err()
    assert run.result.unwrap_err().code.value == "VALIDATION"
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY]


def test_an_inquiry_without_codigo_still_classifies_the_document() -> None:
    """R13d: §5.6 row 1 — an object with a string `estado` is accepted."""
    run = reconcile({INQUIRY: ok({"estado": "Aceptado"})})

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.inquiry.codigo == 0
    assert outcome.delivered is True
    assert outcome.cleared is False
    assert outcome.can_reuse_sequence is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY]


def test_an_unreadable_fiscal_amount_does_not_fail_the_existence_read() -> None:
    """R13j: existence rests on `estado`, so a malformed amount is dropped."""
    run = reconcile(
        {INQUIRY: ok({"codigo": 1, "estado": "Aceptado", "montoTotal": "abc"})}
    )

    assert run.result.is_ok()
    assert run.result.unwrap().inquiry.monto_total is None
    assert run.markers == [INQUIRY]


def test_an_unreadable_inquiry_codigo_still_classifies_the_document() -> None:
    """R13l: `codigo` labels the answer; existence rests on `estado` alone."""
    run = reconcile({INQUIRY: ok({"codigo": "abc", "estado": "Aceptado"})})

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.inquiry.codigo == 0
    assert outcome.delivered is True
    assert outcome.cleared is False
    assert outcome.can_reuse_sequence is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY]


def test_padded_no_encontrado_does_not_clear_the_marker() -> None:
    """§5.1: the existence test is raw equality — trimming is not tolerated."""
    run = reconcile({INQUIRY: inquiry(" No encontrado "), TRACKS: one_track()})

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.delivered is True
    assert outcome.cleared is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY]


def test_padded_rechazado_still_enters_the_gate() -> None:
    """§6 rule 4: trimming survives, but only inside the `Rechazado` gate."""
    run = reconcile(
        {
            INQUIRY: inquiry("Rechazado "),
            TRACKS: one_track(),
            RESULT: ok(
                {"codigo": 2, "estado": "Rechazado", "secuenciaUtilizada": False}
            ),
        }
    )

    assert run.result.is_ok()
    assert run.result.unwrap().can_reuse_sequence is True
    assert run.markers == [INQUIRY, TRACKS, RESULT]


def test_accepted_document_costs_a_single_request() -> None:
    """T-L: the gate keeps the extra reads off every non-rejected path."""
    run = reconcile({INQUIRY: inquiry("Aceptado"), TRACKS: one_track()})

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.delivered is True
    assert outcome.cleared is False
    assert outcome.can_reuse_sequence is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY]


def test_unknown_document_costs_a_single_request() -> None:
    """T-M: no record means no track to ask about."""
    run = reconcile({INQUIRY: inquiry("No encontrado"), TRACKS: one_track()})

    assert run.result.is_ok()
    assert run.result.unwrap().can_reuse_sequence is False
    assert run.store.get(KEY) is None
    assert run.markers == [INQUIRY]


def test_rfce_rejection_costs_a_single_request() -> None:
    """T-N: no reuse concept is wired for a consumption summary."""
    run = reconcile({INQUIRY: inquiry("Rechazado"), TRACKS: one_track()}, xml=RFCE_XML)

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.delivered is True
    assert outcome.can_reuse_sequence is False
    assert run.store.get(RFCE_KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY]


def test_several_tracks_decline_to_claim_reuse() -> None:
    """T-O: two usable tracks are never aggregated."""
    run = reconcile(
        {
            INQUIRY: inquiry("Rechazado"),
            TRACKS: tracks(
                track_entry("Rechazado", "TRACK-1"),
                track_entry("Rechazado", "TRACK-2"),
            ),
        }
    )

    assert run.result.is_ok()
    assert run.result.unwrap().can_reuse_sequence is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS]


def test_track_without_an_id_declines_to_claim_reuse() -> None:
    """T-P: no track id means no `consultaresultado` call."""
    run = reconcile(
        {INQUIRY: inquiry("Rechazado"), TRACKS: tracks(track_entry("Rechazado"))}
    )

    assert run.result.is_ok()
    assert run.result.unwrap().can_reuse_sequence is False
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS]


def test_a_single_object_listing_is_accepted() -> None:
    """R8c: DGII's sample publishes one object while the prose says "listing"."""
    run = reconcile(
        {
            INQUIRY: inquiry("Rechazado"),
            TRACKS: ok({"estado": "Rechazado", "trackId": "TRACK-1"}),
            RESULT: ok(
                {"codigo": 2, "estado": "Rechazado", "secuenciaUtilizada": False}
            ),
        }
    )

    assert run.result.is_ok()
    assert run.result.unwrap().can_reuse_sequence is True
    assert run.markers == [INQUIRY, TRACKS, RESULT]


def test_a_non_array_listing_body_is_a_non_answer() -> None:
    """R8d: a string is neither the listing nor its single-object shape."""
    run = reconcile({INQUIRY: inquiry("Rechazado"), TRACKS: ok("nope")})

    assert run.result.is_err()
    error = run.result.unwrap_err()
    assert error.code.value == "VALIDATION"
    assert error.message == "Unexpected DGII response payload"
    assert run.store.get(KEY) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY, TRACKS]


@pytest.mark.parametrize(
    ("root", "id_element"),
    [("ACECF", "eNCF"), ("ANECF", "SecuenciaeNCFDesde"), ("FOO", "eNCF")],
    ids=["R12b", "R12c", "R12d"],
)
def test_a_non_ecf_root_never_asks_for_the_flag(root: str, id_element: str) -> None:
    """R12b-R12d: reuse has no meaning outside a general e-CF (C1)."""
    xml = (
        f"<{root}><Encabezado><RNCEmisor>{RNC}</RNCEmisor>"
        f"<IdDoc><{id_element}>{ENCF}</{id_element}></IdDoc></Encabezado></{root}>"
    )
    run = reconcile({INQUIRY: inquiry("Rechazado"), TRACKS: one_track()}, xml=xml)

    assert run.result.is_ok()
    outcome = run.result.unwrap()
    assert outcome.delivered is True
    assert outcome.can_reuse_sequence is False
    assert run.store.get(key_for(xml)) == dict(_PENDING_MARKER)
    assert run.markers == [INQUIRY]


def test_rejects_a_document_without_rnc_or_encf() -> None:
    run = reconcile({}, xml="<ECF><Encabezado/></ECF>")

    assert run.result.is_err()
    assert run.result.unwrap_err().code.value == "VALIDATION"
    assert run.markers == []


def test_pending_error_points_at_the_helper() -> None:
    store = InMemoryIdempotencyStore()
    store.set(KEY, dict(_PENDING_MARKER))

    client, _calls = make_client({})
    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=client,
        idempotency_store=store,
    )

    result = ecf.send_electronic_document(ECF_XML, "f.xml")

    assert result.is_err()
    error = result.unwrap_err()
    assert error.code.value == "IDEMPOTENCY"
    assert error.message == PENDING_SUBMISSION_MESSAGE
    assert "reconcile_submission" in error.message
