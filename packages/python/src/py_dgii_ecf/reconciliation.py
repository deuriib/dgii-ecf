"""Reconciliation of a pending submission against DGII."""

from __future__ import annotations

from dataclasses import dataclass

from .types import InquiryStatusResponse

#: Message returned when a submission with the same key is already in flight.
PENDING_SUBMISSION_MESSAGE = (
    "A submission with this key is already pending; "
    "call reconcile_submission() before retrying"
)


@dataclass(frozen=True, slots=True)
class ReconciliationResult:
    """Outcome of reconciling a pending submission against DGII."""

    #: DGII's answer for the e-NCF.
    inquiry: InquiryStatusResponse
    #: ``True`` when DGII already has a record of the document.
    delivered: bool
    #: ``True`` when the e-NCF sequence may be reused.
    can_reuse_sequence: bool
    #: ``True`` when the pending marker was cleared and a retry is safe.
    cleared: bool


def can_reuse_sequence(response: InquiryStatusResponse) -> bool:
    """Whether a rejected e-NCF sequence may be reused.

    DGII sets ``secuenciaUtilizada`` to ``True`` when the sequence is consumed
    and ``False`` when the rejection leaves it reusable: invalid certificate or
    signature, invalid XML, non-delegated signer, unauthorized or expired
    e-NCF, non-electronic issuer, unknown or inactive RNC.

    An absent flag is treated as "not reusable" — the conservative answer.
    """
    return response.secuencia_utilizada is False
