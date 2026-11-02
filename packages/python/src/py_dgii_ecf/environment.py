"""DGII environments and endpoint constants."""

from __future__ import annotations

import enum


class Environment(enum.StrEnum):
    """DGII deployment environment."""

    DEV = "TesteCF"  # test
    CERT = "CerteCF"  # certification
    PROD = "eCF"  # production


class BaseUrl(enum.StrEnum):
    """DGII base URLs per service family."""

    ECF = "https://ecf.dgii.gov.do"
    CF = "https://fc.dgii.gov.do"
    STATUS = "https://statusecf.dgii.gov.do"


class Endpoint(enum.StrEnum):
    """DGII web-service endpoints (relative to base URL + environment)."""

    SEED = "Autenticacion/api/Autenticacion/Semilla"
    VALIDATE_SEED = "autenticacion/api/Autenticacion/ValidarSemilla"
    SEND_INVOICE = "recepcion/api/FacturasElectronicas"
    SEND_SUMMARY = "recepcionfc/api/recepcion/ecf"
    INQUIRY_INVOICE_SUMMARY = "consultarfce/api/Consultas/Consulta"
    COMMERCIAL_APPROVAL = "aprobacionComercial/api/AprobacionComercial"
    TRACK_RESULT_STATUS = "consultaresultado/api/Consultas/Estado"
    INQUIRY_STATUS = "consultaestado/api/Consultas/Estado"
    ALL_TRACKING_ECF = "ConsultaTrackIds/api/TrackIds/Consulta"
    DIRECTORY = "consultadirectorio/api/consultas/obtenerdirectorioporrnc"
    DIRECTORY_LIST = "consultadirectorio/api/consultas/listado"
    VOID = "anulacionrangos/api/operaciones/anularrango"


class SenderReceiverEndpoint(enum.StrEnum):
    """Sender↔Receiver endpoints used against a buyer host."""

    SEED = "fe/autenticacion/api/semilla"
    VALIDATE_SEED = "fe/autenticacion/api/validacioncertificado"
    SEND_INVOICE = "fe/recepcion/api/ecf"
    COMMERCIAL_APPROVAL = "fe/aprobacioncomercial/api/ecf"


class StatusEndpoint(enum.StrEnum):
    """Service-status endpoints (no environment segment)."""

    SERVICES = "api/estatusservicios/obtenerestatus"
    MAINTENANCE_WINDOWS = "api/estatusservicios/obtenerventanasmantenimiento"
    CHECK = "api/estatusservicios/verificarestado"


class StatusEnvironment(enum.IntEnum):
    """Numeric ``ambiente`` codes accepted by the status service."""

    PRE_CERTIFICATION = 1
    PRODUCTION = 2
    CERTIFICATION = 3


def build_url(
    environment: Environment,
    endpoint: Endpoint,
    base_url: str = BaseUrl.ECF.value,
) -> str:
    """Build ``{base_url}/{environment}/{endpoint}``."""
    return f"{base_url.rstrip('/')}/{environment.value}/{endpoint.value}"


def build_status_url(
    endpoint: StatusEndpoint,
    base_url: str = BaseUrl.STATUS.value,
) -> str:
    """Build ``{base_url}/{endpoint}`` for the status service (no environment)."""
    return f"{base_url.rstrip('/')}/{endpoint.value}"


def build_sender_receiver_url(host: str, endpoint: SenderReceiverEndpoint) -> str:
    """Build ``{host}/{endpoint}``."""
    return f"{host.rstrip('/')}/{endpoint.value}"
