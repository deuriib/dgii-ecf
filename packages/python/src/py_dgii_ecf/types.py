"""Typed response models, enums and parsers for the DGII e-CF API.

Every client method returns one of these models instead of a plain ``dict``, so
callers get autocomplete and type checking. The shapes mirror the TypeScript
SDK 1:1; parsing is tolerant of the types DGII actually emits (for example,
numbers encoded as strings) and raises :class:`ResponseShapeError` when a
required field is missing or malformed.
"""

from __future__ import annotations

import enum
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol, Self, TypeVar


@dataclass(frozen=True, slots=True)
class Mensaje:
    """A DGII message entry (``valor`` + ``codigo``)."""

    valor: str
    codigo: int = 0


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


def _as_optional_int(value: object, key: str) -> int | None:
    return None if value is None else _as_int(value, key)


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


def _as_optional_float(value: object, key: str) -> float | None:
    return None if value is None else _as_float(value, key)


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
                codigo=_as_int(item.get("codigo", 0), f"mensajes[{index}].codigo"),
            )
        )
    return tuple(mensajes)


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
    """Result of ``statusTrackId`` (``consultaresultado/api/Consultas/Estado``)."""

    track_id: str
    codigo: int
    estado: str
    rnc: str
    encf: str
    secuencia_utilizada: bool
    fecha_recepcion: str
    mensajes: tuple[Mensaje, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> TrackingStatusResponse:
        return cls(
            track_id=_as_str(data.get("trackId"), "trackId"),
            codigo=_as_int(data.get("codigo"), "codigo"),
            estado=_as_str(data.get("estado"), "estado"),
            rnc=_as_str(data.get("rnc"), "rnc"),
            encf=_as_str(data.get("encf"), "encf"),
            secuencia_utilizada=_as_bool(
                data.get("secuenciaUtilizada"), "secuenciaUtilizada"
            ),
            fecha_recepcion=_as_str(data.get("fechaRecepcion"), "fechaRecepcion"),
            mensajes=_parse_mensajes(data.get("mensajes")),
        )


@dataclass(frozen=True, slots=True)
class SummaryTrackingStatusResponse:
    """One entry of ``trackStatuses`` (``ConsultaTrackIds``)."""

    track_id: str
    estado: str
    fecha_recepcion: str

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> SummaryTrackingStatusResponse:
        return cls(
            track_id=_as_str(data.get("trackId"), "trackId"),
            estado=_as_str(data.get("estado"), "estado"),
            fecha_recepcion=_as_str(data.get("fechaRecepcion"), "fechaRecepcion"),
        )


@dataclass(frozen=True, slots=True)
class InquiryStatusResponse:
    """Result of ``inquiryStatus`` (``consultaestado``)."""

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
            codigo=_as_int(data.get("codigo"), "codigo"),
            estado=_as_str(data.get("estado"), "estado"),
            rnc_emisor=_as_optional_str(data.get("rncEmisor"), "rncEmisor"),
            ncf_electronico=_as_optional_str(
                data.get("ncfElectronico"), "ncfElectronico"
            ),
            monto_total=_as_optional_float(data.get("montoTotal"), "montoTotal"),
            total_itbis=_as_optional_float(data.get("totalITBIS"), "totalITBIS"),
            fecha_emision=_as_optional_str(data.get("fechaEmision"), "fechaEmision"),
            fecha_firma=_as_optional_str(data.get("fechaFirma"), "fechaFirma"),
            rnc_comprador=_as_optional_str(data.get("rncComprador"), "rncComprador"),
            codigo_seguridad=_as_optional_str(
                data.get("codigoSeguridad"), "codigoSeguridad"
            ),
            id_extranjero=_as_optional_str(data.get("idExtranjero"), "idExtranjero"),
        )


@dataclass(frozen=True, slots=True)
class InvoiceResponse:
    """Result of ``sendElectronicDocument`` (``recepcion``)."""

    track_id: str | None = None
    error: str | None = None
    mensajes: tuple[Mensaje, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> InvoiceResponse:
        return cls(
            track_id=_as_optional_str(data.get("trackId"), "trackId"),
            error=_as_optional_str(data.get("error"), "error"),
            mensajes=_parse_mensajes(data.get("mensajes")),
        )


@dataclass(frozen=True, slots=True)
class InvoiceSummaryResponse:
    """Result of ``sendSummary`` (``recepcionfc``)."""

    codigo: int
    estado: str
    encf: str
    secuencia_utilizada: bool
    mensajes: tuple[Mensaje, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> InvoiceSummaryResponse:
        return cls(
            codigo=_as_int(data.get("codigo"), "codigo"),
            estado=_as_str(data.get("estado"), "estado"),
            encf=_as_str(data.get("encf"), "encf"),
            secuencia_utilizada=_as_bool(
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

    rnc: str
    encf: str
    secuencia_utilizada: bool
    codigo: int
    estado: str
    mensajes: tuple[Mensaje, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> InquiryInvoiceSummary:
        return cls(
            rnc=_as_str(data.get("rnc"), "rnc"),
            encf=_as_str(data.get("encf"), "encf"),
            secuencia_utilizada=_as_bool(
                data.get("secuenciaUtilizada"), "secuenciaUtilizada"
            ),
            codigo=_as_int(data.get("codigo"), "codigo"),
            estado=_as_str(data.get("estado"), "estado"),
            mensajes=_parse_mensajes(data.get("mensajes")),
        )


@dataclass(frozen=True, slots=True)
class CommercialApprovalResponse:
    """Result of ``sendCommercialApproval`` (ACECF)."""

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
    mensajes: tuple[str, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> VoidNCFResponse:
        return cls(
            rnc=_as_str(data.get("rnc"), "rnc"),
            codigo=_as_str(data.get("codigo"), "codigo"),
            nombre=_as_str(data.get("nombre"), "nombre"),
            mensajes=_parse_strings(data.get("mensajes"), "mensajes"),
        )
