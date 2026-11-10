"""Reconciliation of a pending submission against DGII."""

from __future__ import annotations

from dataclasses import dataclass

from .types import (
    InquiryInvoiceSummary,
    InquiryStatusResponse,
    TrackingStatusResponse,
)

#: Message returned when a submission with the same key is already in flight.
PENDING_SUBMISSION_MESSAGE = (
    "A submission with this key is already pending; "
    "call reconcile_submission() before retrying"
)


@dataclass(frozen=True, slots=True)
class ReconciliationResult:
    """Outcome of reconciling a pending submission against DGII."""

    #: DGII's answer for the e-NCF (``consultaestado``).
    inquiry: InquiryStatusResponse
    #: ``True`` when DGII already has a record of the document.
    delivered: bool
    #: ``True`` only when DGII positively said the sequence may be reused — see
    #: :func:`can_reuse_sequence`.
    #:
    #: ``False`` means *the SDK did not obtain a positive reusable answer*, not
    #: that DGII consumed the sequence: C1 the root element is not a general
    #: e-CF, C2 DGII holds no record, C3 the verdict is not ``Rechazado``,
    #: C4 the listing yielded other than exactly one followable track, or C5 the
    #: per-track verdict or flag did not say reusable. C6 — a flag read that
    #: could not be completed — is an ``Err``, never a ``False``.
    can_reuse_sequence: bool
    #: ``True`` when the pending marker was cleared and a retry is safe.
    cleared: bool


def can_reuse_sequence(
    response: TrackingStatusResponse | InquiryInvoiceSummary,
) -> bool:
    """Whether DGII left a rejected e-NCF sequence reusable.

    Only :meth:`ECF.status_track_id` (``consultaresultado``) and
    :meth:`ECF.get_summary_invoice_inquiry` (``consultarfce``) publish
    ``secuenciaUtilizada``; ``consultaestado`` does not, which is why the
    inquiry response is not accepted here.

    ``True`` requires both a literal ``False`` flag and a ``Rechazado`` state.
    DGII scopes reuse to a rejection — the reasons that leave a sequence
    reusable being invalid certificate or signature, invalid XML, non-delegated
    signer, unauthorized or expired e-NCF, non-electronic issuer, and unknown or
    inactive RNC. Reuse target: a :class:`TrackingStatusResponse` licenses
    another general e-CF, while an :class:`InquiryInvoiceSummary` licenses
    another *Resumen de Factura de Consumo*, never another general e-CF.

    An absent flag is "not reusable", not "reusable": DGII only needs to send it
    on a rejection. ``False`` therefore means "DGII did not positively say the
    sequence is reusable", never "DGII said it is consumed". A non-boolean flag
    is not evidence either — the models read it without coercion — so it
    answers ``False`` as well. The same holds for a state that is not a string
    at all: a hand-built model cannot raise out of this predicate.
    """
    return (
        response.secuencia_utilizada is False
        and (response.estado if isinstance(response.estado, str) else "").strip()
        == "Rechazado"
    )
