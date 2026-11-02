"""Routing of signed documents to the correct DGII reception endpoint."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final, Literal, get_args

from ._xml import extract_element_text, extract_root_element_name
from .environment import Endpoint
from .errors import DgiiError, DgiiErrorCode
from .result import DgiiResult, Err, Ok

EcfTypeCode = Literal["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"]

#: Every e-CF type code defined by DGII.
ECF_TYPE_CODES: Final[tuple[EcfTypeCode, ...]] = get_args(EcfTypeCode)

#: Consumption invoices (E32) at or above this amount go to the general
#: reception endpoint; below it they must be sent as an RFCE summary.
CONSUMPTION_SUMMARY_THRESHOLD: Final[str] = "250000"

_CONSUMPTION_TYPE: Final[EcfTypeCode] = "32"
_DECIMAL_PATTERN = re.compile(r"^\d+(?:\.\d+)?$")


@dataclass(frozen=True, slots=True)
class ReceptionRoute:
    """Which reception endpoint a signed document belongs to."""

    kind: Literal["general", "summary"]
    endpoint: Endpoint


GENERAL_ROUTE = ReceptionRoute(kind="general", endpoint=Endpoint.SEND_INVOICE)
SUMMARY_ROUTE = ReceptionRoute(kind="summary", endpoint=Endpoint.SEND_SUMMARY)


def is_ecf_type_code(value: str) -> bool:
    """Return whether ``value`` is one of the ten DGII e-CF type codes."""
    return value in ECF_TYPE_CODES


def compare_decimal(a: str, b: str) -> int:
    """Compare two non-negative decimal strings without using ``float``.

    Returns a negative number when ``a < b``, zero when equal, positive
    otherwise, so a money amount never picks up binary floating-point error.
    """
    a_int, _, a_frac = a.partition(".")
    b_int, _, b_frac = b.partition(".")
    a_whole = a_int.lstrip("0") or "0"
    b_whole = b_int.lstrip("0") or "0"

    if len(a_whole) != len(b_whole):
        return len(a_whole) - len(b_whole)
    if a_whole != b_whole:
        return -1 if a_whole < b_whole else 1

    width = max(len(a_frac), len(b_frac))
    a_padded = a_frac.ljust(width, "0")
    b_padded = b_frac.ljust(width, "0")
    if a_padded == b_padded:
        return 0
    return -1 if a_padded < b_padded else 1


def _validation_error(message: str) -> DgiiError:
    return DgiiError(message, code=DgiiErrorCode.VALIDATION)


def resolve_reception_route(signed_xml: str) -> DgiiResult[ReceptionRoute]:
    """Decide which DGII reception endpoint a signed document belongs to.

    - ``<RFCE>`` goes to the consumption-summary reception (``recepcionfc``).
    - ``<ECF>`` with any type other than E32 goes to the general reception.
    - ``<ECF>`` type E32 at or above RD$250,000 goes to the general reception.
    - ``<ECF>`` type E32 below RD$250,000 is rejected: DGII only accepts the
      summary form for those, so the caller must run
      :func:`convert_ecf32_to_rfce` first.

    The decision reads ``TipoeCF`` and ``MontoTotal`` from the signed document,
    so it cannot drift from what is actually being transmitted.
    """
    root = extract_root_element_name(signed_xml)
    if root == "RFCE":
        return Ok(SUMMARY_ROUTE)
    if root != "ECF":
        return Err(
            _validation_error(
                f'Unsupported document root "{root or "unknown"}"; '
                'expected "ECF" or "RFCE"'
            )
        )

    tipo = extract_element_text(signed_xml, "TipoeCF")
    if tipo is None:
        return Err(_validation_error("TipoeCF is missing from the document"))
    if not is_ecf_type_code(tipo):
        return Err(_validation_error(f'Unknown TipoeCF "{tipo}"'))
    if tipo != _CONSUMPTION_TYPE:
        return Ok(GENERAL_ROUTE)

    total = extract_element_text(signed_xml, "MontoTotal")
    if total is None:
        return Err(
            _validation_error(
                "MontoTotal is required to route an E32 consumption invoice"
            )
        )
    if not _DECIMAL_PATTERN.match(total):
        return Err(_validation_error(f'MontoTotal "{total}" is not a decimal amount'))

    if compare_decimal(total, CONSUMPTION_SUMMARY_THRESHOLD) < 0:
        return Err(
            _validation_error(
                "An E32 below RD$250,000 must be sent as an RFCE summary; "
                "convert it with convert_ecf32_to_rfce first"
            )
        )
    return Ok(GENERAL_ROUTE)


#: Type codes DGII excludes from the direct Emisor↔Receptor flow.
_B2B_EXCLUDED_TYPES: Final[frozenset[EcfTypeCode]] = frozenset(
    {"41", "43", "45", "46", "47"}
)


def check_b2b_applicability(signed_xml: str) -> DgiiResult[None]:
    """Whether a signed document may be delivered directly to a buyer host.

    DGII excludes E32 below RD$250,000 (only the RFCE summary applies) plus
    E41, E43, E45, E46 and E47. E31, E33, E34, E44 and an E32 at or above the
    threshold can go peer-to-peer.
    """
    root = extract_root_element_name(signed_xml)
    if root == "RFCE":
        return Err(
            _validation_error(
                "An RFCE summary cannot be delivered directly to a buyer host"
            )
        )
    if root != "ECF":
        return Err(
            _validation_error(
                f'Unsupported document root "{root or "unknown"}"; expected "ECF"'
            )
        )

    tipo = extract_element_text(signed_xml, "TipoeCF")
    if tipo is None:
        return Err(_validation_error("TipoeCF is missing from the document"))
    if not is_ecf_type_code(tipo):
        return Err(_validation_error(f'Unknown TipoeCF "{tipo}"'))
    if tipo in _B2B_EXCLUDED_TYPES:
        return Err(
            _validation_error(
                f"An e-CF of type {tipo} cannot be delivered directly to a buyer host"
            )
        )
    if tipo != _CONSUMPTION_TYPE:
        return Ok(None)

    total = extract_element_text(signed_xml, "MontoTotal")
    if total is None:
        return Err(
            _validation_error(
                "MontoTotal is required to check B2B applicability of an E32"
            )
        )
    if not _DECIMAL_PATTERN.match(total):
        return Err(_validation_error(f'MontoTotal "{total}" is not a decimal amount'))
    if compare_decimal(total, CONSUMPTION_SUMMARY_THRESHOLD) < 0:
        return Err(
            _validation_error(
                "An E32 below RD$250,000 cannot be delivered directly to a "
                "buyer host; send the RFCE summary to DGII instead"
            )
        )
    return Ok(None)
