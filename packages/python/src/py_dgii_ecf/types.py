"""Typed response models and enums for the DGII e-CF API."""

from __future__ import annotations

import enum
from dataclasses import dataclass


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
    """Values of ``TrackingStatusResponse.estado``."""

    NOT_FOUND = "No encontrado"
    ACCEPTED = "Aceptado"
    REJECTED = "Rechazado"
    IN_PROCESS = "En Proceso"
    CONDITIONAL_ACCEPTED = "Aceptado Condicional"


class Operation(enum.StrEnum):
    """Operations that accept a signed document."""

    VOID_DOCUMENT = "void"
    COMMERCIAL_APPROVAL = "commercial_approval"


class StatusOperation(enum.StrEnum):
    """Operations of the DGII status service (API key required)."""

    SERVICES_STATUS = "services_status"
    SERVICE_MAINTENANCE_WINDOW = "service_maintenance_window"
    SERVICE_VERIFICATION = "service_verification"
