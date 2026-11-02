"""Status service: availability, maintenance windows and environment checks."""

from __future__ import annotations

import httpx2

from py_dgii_ecf.certificate import P12ReaderData
from py_dgii_ecf.client import ECF
from py_dgii_ecf.environment import Environment, StatusEnvironment

CREDENTIALS = P12ReaderData(key="unused", cert="unused")

SERVICE_STATUS = [
    {"servicio": "Autenticación", "estatus": "Disponible", "ambiente": "Produccion"},
    {"servicio": "Recepción FC", "estatus": "No Disponible", "ambiente": "Produccion"},
]

MAINTENANCE = {
    "ventanaMantenimientos": [
        {
            "ambiente": "Produccion",
            "horaInicio": "1:00 PM",
            "horaFin": "4:00 PM",
            "dias": ["06-08-2020", "20-08-2020"],
        }
    ]
}


def make_client(handler: object) -> httpx2.Client:
    transport = httpx2.MockTransport(handler)  # type: ignore[arg-type]
    return httpx2.Client(transport=transport)


def test_lists_every_service_with_the_api_key_header() -> None:
    calls: list[tuple[str, str | None]] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls.append((str(request.url), request.headers.get("Authorization")))
        return httpx2.Response(200, json=SERVICE_STATUS)

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        http_client=make_client(handler),
        status_api_key="test-key",
    )

    result = ecf.get_service_status()

    assert result.is_ok()
    entries = result.unwrap()
    assert len(entries) == 2
    assert entries[0].servicio == "Autenticación"
    assert entries[1].estatus == "No Disponible"
    assert calls[0][0] == (
        "https://statusecf.dgii.gov.do/api/estatusservicios/obtenerestatus"
    )
    assert calls[0][1] == "Apikey test-key"


def test_normalizes_a_single_object_payload() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json=SERVICE_STATUS[0])

    ecf = ECF(CREDENTIALS, Environment.DEV, http_client=make_client(handler))

    result = ecf.get_service_status()

    assert result.is_ok()
    assert len(result.unwrap()) == 1


def test_does_not_send_a_bearer_token_to_the_status_host() -> None:
    captured: list[str | None] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        captured.append(request.headers.get("Authorization"))
        return httpx2.Response(200, json=SERVICE_STATUS)

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="dgii-token",
        http_client=make_client(handler),
    )

    ecf.get_service_status()

    assert captured[0] is None


def test_unwraps_the_maintenance_window_container() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json=MAINTENANCE)

    ecf = ECF(CREDENTIALS, Environment.DEV, http_client=make_client(handler))

    result = ecf.get_maintenance_windows()

    assert result.is_ok()
    windows = result.unwrap()
    assert len(windows) == 1
    assert windows[0].hora_inicio == "1:00 PM"
    assert windows[0].dias == ("06-08-2020", "20-08-2020")


def test_accepts_a_bare_array_of_maintenance_windows() -> None:
    def handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json=MAINTENANCE["ventanaMantenimientos"])

    ecf = ECF(CREDENTIALS, Environment.DEV, http_client=make_client(handler))

    result = ecf.get_maintenance_windows()

    assert result.is_ok()
    assert len(result.unwrap()) == 1


def test_checks_availability_with_the_numeric_environment_code() -> None:
    captured: list[str] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        captured.append(str(request.url))
        return httpx2.Response(200, json={"estado": "Disponible"})

    ecf = ECF(CREDENTIALS, Environment.DEV, http_client=make_client(handler))

    result = ecf.check_service_availability(StatusEnvironment.PRODUCTION)

    assert result.is_ok()
    assert result.unwrap().estado == "Disponible"
    assert "ambiente=2" in captured[0]
