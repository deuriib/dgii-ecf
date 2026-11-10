"""Typed response models, enums and parsers for the DGII e-CF API.

Every client method returns one of these models instead of a plain ``dict``, so
callers get autocomplete and type checking. The shapes mirror the TypeScript
SDK 1:1, and so does the classification of a wire body: the fields that decide
what a payload *means* (``estado`` on the status reads, ``trackId`` on a
listing entry, ``secuenciaUtilizada``) are read exactly as DGII typed them,
while a field that only corroborates is tolerated or dropped. Parsing is
tolerant of the types DGII actually emits (for example, numbers encoded as
strings) and raises :class:`ResponseShapeError` when a classifying field is
missing or malformed.
"""

from __future__ import annotations

import enum
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol, Self, TypeVar

# Commercial approval vocabulary, as documented by DGII. `codigo` is a string
# with no leading zeros and `estado` uses sentence case without a trailing dot.
COMMERCIAL_APPROVAL_ACCEPTED_CODE = "1"
COMMERCIAL_APPROVAL_REJECTED_CODE = "2"
COMMERCIAL_APPROVAL_ACCEPTED_STATE = "Aprobación comercial aprobada"
COMMERCIAL_APPROVAL_REJECTED_STATE = "Aprobación comercial rechazada"

# Documented states of an RFCE reception. DGII is not consistent about casing
# between services, so `estado` stays a plain string.
SUMMARY_ACCEPTED = "Aceptado"
SUMMARY_CONDITIONAL_ACCEPTED = "Aceptado condicional"
SUMMARY_REJECTED = "Rechazado"


@dataclass(frozen=True, slots=True)
class Mensaje:
    """A DGII message entry (``valor`` + ``codigo``).

    DGII sends a numeric code on the status endpoints and a string code on the
    RFCE response, so the raw value is preserved instead of coerced.
    """

    valor: str
    codigo: int | str = 0


@dataclass(frozen=True, slots=True)
class AuthToken:
    """Authentication token returned by the DGII SEED flow."""

    token: str
    expira: str
    expedido: str


class TrackStatus(enum.StrEnum):
    """Known values of ``TrackingStatusResponse.estado``."""

    NOT_FOUND = "No encontrado"
    ACCEPTED = "Aceptado"
    REJECTED = "Rechazado"
    IN_PROCESS = "En Proceso"
    CONDITIONAL_ACCEPTED = "Aceptado Condicional"


class ResponseShapeError(ValueError):
    """A DGII response payload did not match the documented shape."""


def _type_error(key: str, expected: str, value: object) -> ResponseShapeError:
    return ResponseShapeError(
        f"field {key!r} must be {expected}, got {type(value).__name__}"
    )


def _as_str(value: object, key: str) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        raise _type_error(key, "a string", value)
    if isinstance(value, (int, float)):
        return str(value)
    raise _type_error(key, "a string", value)


def _as_optional_str(value: object, key: str) -> str | None:
    return None if value is None else _as_str(value, key)


def _as_str_strict(value: object, key: str) -> str:
    """Read a string exactly as DGII typed it, without coercion.

    For the fields that decide *classification* — a state that selects a branch
    or a track id that is followed — a coerced number would put the payload in
    a branch the TypeScript SDK never takes, so those reads stay strict.
    """
    if isinstance(value, str):
        return value
    raise _type_error(key, "a string", value)


def _as_bool_strict(value: object, key: str) -> bool:
    """Read a boolean exactly as DGII typed it.

    ``secuenciaUtilizada`` is the one field the reuse answer is built on, and
    only a literal ``false`` licenses reuse, so ``"false"`` and ``0`` are not
    evidence and are never coerced into it.
    """
    if isinstance(value, bool):
        return value
    raise _type_error(key, "a boolean", value)


_FieldT = TypeVar("_FieldT")


def _as_optional_or_none(
    read: Callable[[object, str], _FieldT], value: object, key: str
) -> _FieldT | None:
    """Read an optional field, answering ``None`` when it cannot be read.

    Only for fields whose absence already has a meaning and whose value never
    classifies a payload: DGII's document fixes their type, so a malformed one
    is dropped rather than failing a read whose answer rests on ``estado``
    alone (``None`` and "DGII omitted it" are the same observation here).
    """
    if value is None:
        return None
    try:
        return read(value, key)
    except ResponseShapeError:
        return None


def _as_int(value: object, key: str) -> int:
    if isinstance(value, bool):
        raise _type_error(key, "an integer", value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            raise ResponseShapeError(
                f"field {key!r} must be an integer, got {value!r}"
            ) from None
    raise _type_error(key, "an integer", value)


def _as_optional_bool(value: object, key: str) -> bool | None:
    return None if value is None else _as_bool(value, key)


def _as_code(value: object) -> int | str:
    """Normalize a DGII message code without ever failing the parse.

    The code is the only machine-readable rejection discriminator, so it must
    survive even when DGII types it differently than expected: numeric strings
    become ``int``, everything else is kept verbatim.
    """
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return 0
        try:
            return int(stripped)
        except ValueError:
            return stripped
    return 0


def _as_float(value: object, key: str) -> float:
    if isinstance(value, bool):
        raise _type_error(key, "a number", value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            raise ResponseShapeError(
                f"field {key!r} must be a number, got {value!r}"
            ) from None
    raise _type_error(key, "a number", value)


def _as_bool(value: object, key: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1"):
            return True
        if lowered in ("false", "0"):
            return False
    raise _type_error(key, "a boolean", value)


def _parse_mensajes(value: object) -> tuple[Mensaje, ...]:
    if value is None:
        return ()
    items: list[object] = list(value) if isinstance(value, (list, tuple)) else [value]
    mensajes: list[Mensaje] = []
    for index, item in enumerate(items):
        if isinstance(item, str):
            mensajes.append(Mensaje(valor=item))
            continue
        if not isinstance(item, Mapping):
            raise _type_error(f"mensajes[{index}]", "an object or a string", item)
        mensajes.append(
            Mensaje(
                valor=_as_str(item.get("valor"), f"mensajes[{index}].valor"),
                codigo=_as_code(item.get("codigo", 0)),
            )
        )
    return tuple(mensajes)


def _mensajes_or_empty(value: object) -> tuple[Mensaje, ...]:
    """A malformed message list cannot fail a read whose answer is not in it."""
    try:
        return _parse_mensajes(value)
    except ResponseShapeError:
        return ()


def _parse_strings(value: object, key: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        return (value,)
    if isinstance(value, (list, tuple)):
        return tuple(_as_str(item, f"{key}[]") for item in value)
    raise _type_error(key, "a list of strings", value)


class ResponseModel(Protocol):
    """A response model that can be built from a decoded JSON object."""

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> Self: ...


_ModelT = TypeVar("_ModelT", bound=ResponseModel)


@dataclass(frozen=True, slots=True)
class TrackingStatusResponse:
    """Result of ``statusTrackId`` (``consultaresultado/api/Consultas/Estado``).

    DGII omits the fiscal fields on a "No encontrado" answer, so everything
    except ``codigo`` and ``estado`` is optional — and even those two are
    tolerated as defaults, because on this read ``estado`` only corroborates a
    flag that was already published: an absent or unreadable verdict can
    withhold reuse, never fail the call.
    """

    codigo: int
    estado: str
    track_id: str | None = None
    rnc: str | None = None
    encf: str | None = None
    secuencia_utilizada: bool | None = None
    fecha_recepcion: str | None = None
    mensajes: tuple[Mensaje, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> TrackingStatusResponse:
        # `codigo` only labels the answer and nothing on this path reads it, so
        # neither an absent one nor one DGII typed differently is a reason to
        # reject a readable payload.
        codigo = _as_optional_or_none(_as_int, data.get("codigo"), "codigo") or 0
        # The verdict corroborates a flag that was already read, so an absent or
        # unreadable one cannot license `True`: it becomes the predicate's own
        # ``""`` default instead of an error.
        raw_estado = data.get("estado")
        estado = raw_estado if isinstance(raw_estado, str) else ""
        return cls(
            codigo=codigo,
            estado=estado,
            track_id=_as_optional_or_none(_as_str, data.get("trackId"), "trackId"),
            rnc=_as_optional_or_none(_as_str, data.get("rnc"), "rnc"),
            encf=_as_optional_or_none(_as_str, data.get("encf"), "encf"),
            secuencia_utilizada=_as_optional_or_none(
                _as_bool_strict, data.get("secuenciaUtilizada"), "secuenciaUtilizada"
            ),
            fecha_recepcion=_as_optional_or_none(
                _as_str, data.get("fechaRecepcion"), "fechaRecepcion"
            ),
            mensajes=_mensajes_or_empty(data.get("mensajes")),
        )


@dataclass(frozen=True, slots=True)
class SummaryTrackingStatusResponse:
    """One entry of ``trackStatuses`` (``ConsultaTrackIds``)."""

    estado: str
    track_id: str | None = None
    fecha_recepcion: str | None = None

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> SummaryTrackingStatusResponse:
        return cls(
            # `estado` decides whether this entry is usable, so it is read
            # strictly: a coerced number would take a branch (and spend a
            # `consultaresultado` call) that the TypeScript SDK never takes.
            estado=_as_str_strict(data.get("estado"), "estado"),
            # Only a string id can be followed; a number would invent a track.
            track_id=_as_optional_or_none(
                _as_str_strict, data.get("trackId"), "trackId"
            ),
            # The receipt date is not read on this path, so its shape cannot
            # fail an entry whose `estado` is readable.
            fecha_recepcion=_as_optional_or_none(
                _as_str, data.get("fechaRecepcion"), "fechaRecepcion"
            ),
        )


@dataclass(frozen=True, slots=True)
class InquiryStatusResponse:
    """Result of ``inquiryStatus`` (``consultaestado``).

    DGII publishes no ``secuenciaUtilizada`` here — the eleven documented output
    parameters do not include it — so the reuse flag cannot be modelled on this
    answer. Read it from :class:`TrackingStatusResponse` or
    :class:`InquiryInvoiceSummary` instead.

    Existence is decided by ``estado`` alone, so ``estado`` is the only field
    whose shape can fail the parse: ``codigo`` defaults to ``0`` and an
    unreadable optional field becomes ``None`` (its own "DGII omitted it"
    value), because no consumer of this answer branches on either.
    """

    codigo: int
    estado: str
    rnc_emisor: str | None = None
    ncf_electronico: str | None = None
    monto_total: float | None = None
    total_itbis: float | None = None
    fecha_emision: str | None = None
    fecha_firma: str | None = None
    rnc_comprador: str | None = None
    codigo_seguridad: str | None = None
    id_extranjero: str | None = None

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> InquiryStatusResponse:
        return cls(
            codigo=_as_optional_or_none(_as_int, data.get("codigo"), "codigo") or 0,
            estado=_as_str_strict(data.get("estado"), "estado"),
            rnc_emisor=_as_optional_or_none(
                _as_str, data.get("rncEmisor"), "rncEmisor"
            ),
            ncf_electronico=_as_optional_or_none(
                _as_str, data.get("ncfElectronico"), "ncfElectronico"
            ),
            monto_total=_as_optional_or_none(
                _as_float, data.get("montoTotal"), "montoTotal"
            ),
            total_itbis=_as_optional_or_none(
                _as_float, data.get("totalITBIS"), "totalITBIS"
            ),
            fecha_emision=_as_optional_or_none(
                _as_str, data.get("fechaEmision"), "fechaEmision"
            ),
            fecha_firma=_as_optional_or_none(
                _as_str, data.get("fechaFirma"), "fechaFirma"
            ),
            rnc_comprador=_as_optional_or_none(
                _as_str, data.get("rncComprador"), "rncComprador"
            ),
            codigo_seguridad=_as_optional_or_none(
                _as_str, data.get("codigoSeguridad"), "codigoSeguridad"
            ),
            id_extranjero=_as_optional_or_none(
                _as_str, data.get("idExtranjero"), "idExtranjero"
            ),
        )


@dataclass(frozen=True, slots=True)
class InvoiceResponse:
    """Result of ``sendElectronicDocument`` (``recepcion``)."""

    track_id: str | None = None
    error: str | None = None
    #: Synchronous acknowledgement text. DGII sends this as a singular string
    #: on the general reception endpoint.
    mensaje: str | None = None
    #: Tolerated array form used by the RFCE and status endpoints.
    mensajes: tuple[Mensaje, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> InvoiceResponse:
        return cls(
            track_id=_as_optional_str(data.get("trackId"), "trackId"),
            error=_as_optional_str(data.get("error"), "error"),
            mensaje=_as_optional_str(data.get("mensaje"), "mensaje"),
            mensajes=_parse_mensajes(data.get("mensajes")),
        )


@dataclass(frozen=True, slots=True)
class InvoiceSummaryResponse:
    """Result of ``sendSummary`` (``recepcionfc``)."""

    codigo: int
    estado: str
    encf: str | None = None
    secuencia_utilizada: bool | None = None
    mensajes: tuple[Mensaje, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> InvoiceSummaryResponse:
        return cls(
            codigo=_as_int(data.get("codigo"), "codigo"),
            estado=_as_str(data.get("estado"), "estado"),
            encf=_as_optional_str(data.get("encf"), "encf"),
            secuencia_utilizada=_as_optional_bool(
                data.get("secuenciaUtilizada"), "secuenciaUtilizada"
            ),
            mensajes=_parse_mensajes(data.get("mensajes")),
        )


@dataclass(frozen=True, slots=True)
class ServiceDirectoryResponse:
    """One entry of ``getCustomerDirectory`` (``consultadirectorio``)."""

    nombre: str
    rnc: str
    url_recepcion: str
    url_aceptacion: str = ""
    url_opcional: str = ""

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> ServiceDirectoryResponse:
        return cls(
            nombre=_as_str(data.get("nombre"), "nombre"),
            rnc=_as_str(data.get("rnc"), "rnc"),
            url_recepcion=_as_str(data.get("urlRecepcion"), "urlRecepcion"),
            url_aceptacion=_as_optional_str(data.get("urlAceptacion"), "urlAceptacion")
            or "",
            url_opcional=_as_optional_str(data.get("urlOpcional"), "urlOpcional") or "",
        )


@dataclass(frozen=True, slots=True)
class InquiryInvoiceSummary:
    """Result of ``getSummaryInvoiceInquiry`` (RFCE inquiry, production only)."""

    codigo: int
    estado: str
    rnc: str | None = None
    encf: str | None = None
    secuencia_utilizada: bool | None = None
    mensajes: tuple[Mensaje, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> InquiryInvoiceSummary:
        return cls(
            codigo=_as_int(data.get("codigo"), "codigo"),
            estado=_as_str(data.get("estado"), "estado"),
            rnc=_as_optional_str(data.get("rnc"), "rnc"),
            encf=_as_optional_str(data.get("encf"), "encf"),
            secuencia_utilizada=_as_optional_or_none(
                _as_bool_strict, data.get("secuenciaUtilizada"), "secuenciaUtilizada"
            ),
            mensajes=_parse_mensajes(data.get("mensajes")),
        )


@dataclass(frozen=True, slots=True)
class CommercialApprovalResponse:
    """Result of ``sendCommercialApproval`` (ACECF).

    Compare against :data:`COMMERCIAL_APPROVAL_ACCEPTED_CODE` /
    :data:`COMMERCIAL_APPROVAL_REJECTED_CODE` and the matching ``*_STATE``
    constants instead of hand-typed strings.
    """

    codigo: str
    estado: str
    mensaje: tuple[str, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> CommercialApprovalResponse:
        return cls(
            codigo=_as_str(data.get("codigo"), "codigo"),
            estado=_as_str(data.get("estado"), "estado"),
            mensaje=_parse_strings(data.get("mensaje"), "mensaje"),
        )


@dataclass(frozen=True, slots=True)
class VoidNCFResponse:
    """Result of ``voidENCF`` (ANECF)."""

    rnc: str
    codigo: str
    nombre: str
    #: DGII returns objects on some services and bare strings on others.
    mensajes: tuple[Mensaje, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> VoidNCFResponse:
        return cls(
            rnc=_as_str(data.get("rnc"), "rnc"),
            codigo=_as_str(data.get("codigo"), "codigo"),
            nombre=_as_str(data.get("nombre"), "nombre"),
            mensajes=_parse_mensajes(data.get("mensajes")),
        )


@dataclass(frozen=True, slots=True)
class ServiceStatusEntry:
    """One entry of ``get_service_status`` (``estatusservicios``)."""

    servicio: str
    estatus: str
    ambiente: str

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> ServiceStatusEntry:
        return cls(
            servicio=_as_str(data.get("servicio"), "servicio"),
            estatus=_as_str(data.get("estatus"), "estatus"),
            ambiente=_as_str(data.get("ambiente"), "ambiente"),
        )


@dataclass(frozen=True, slots=True)
class MaintenanceWindow:
    """One maintenance window of ``get_maintenance_windows``."""

    ambiente: str
    hora_inicio: str
    hora_fin: str
    dias: tuple[str, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> MaintenanceWindow:
        return cls(
            ambiente=_as_str(data.get("ambiente"), "ambiente"),
            hora_inicio=_as_str(data.get("horaInicio"), "horaInicio"),
            hora_fin=_as_str(data.get("horaFin"), "horaFin"),
            dias=_parse_strings(data.get("dias"), "dias"),
        )


@dataclass(frozen=True, slots=True)
class ServiceAvailabilityResponse:
    """Result of ``check_service_availability`` (``verificarestado``)."""

    estado: str

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> ServiceAvailabilityResponse:
        return cls(estado=_as_str(data.get("estado"), "estado"))


@dataclass(frozen=True, slots=True)
class B2BCommercialApprovalResponse:
    """Outcome of a direct ACECF delivery to a buyer host (Emisor↔Receptor)."""

    #: HTTP status returned by the buyer host: 200 satisfactory, 400 unsatisfactory.
    status: int
    #: ``True`` for HTTP 200, ``False`` for HTTP 400.
    accepted: bool

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> B2BCommercialApprovalResponse:
        return cls(
            status=_as_int(data.get("status"), "status"),
            accepted=_as_bool(data.get("accepted"), "accepted"),
        )
