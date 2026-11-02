"""Token lifecycle: proactive refresh, 401 recovery and refresh coalescing."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import httpx2
import pytest

from py_dgii_ecf.certificate import P12ReaderData
from py_dgii_ecf.client import ECF, _parse_expiry
from py_dgii_ecf.environment import Environment

SEED = (
    '<?xml version="1.0" encoding="utf-8"?><SemillaModel>'
    "<valor>0000000-0000-0000-0000-000000000000</valor>"
    "<fecha>2026-01-01T00:00:00Z</fecha></SemillaModel>"
)

TRACKING = {
    "trackId": "t1",
    "codigo": 1,
    "estado": "Aceptado",
    "rnc": "130862346",
    "encf": "E310000000001",
    "secuenciaUtilizada": True,
    "fechaRecepcion": "01-01-2026 10:00:00",
}

HOUR_S = 3600.0


def make_client(handler: object) -> httpx2.Client:
    transport = httpx2.MockTransport(handler)  # type: ignore[arg-type]
    return httpx2.Client(transport=transport)


def _expiry(now: float) -> str:
    return datetime.fromtimestamp(now + HOUR_S, UTC).isoformat()


def test_refreshes_the_token_before_it_expires(self_signed) -> None:
    key_pem, cert_pem, _ = self_signed
    now = [1_000_000_000.0]
    validations = [0]

    def handler(request: httpx2.Request) -> httpx2.Response:
        url = str(request.url)
        if url.endswith("/Semilla"):
            return httpx2.Response(200, text=SEED)
        if "ValidarSemilla" in url:
            validations[0] += 1
            return httpx2.Response(
                200,
                json={
                    "token": f"tok-{validations[0]}",
                    "expira": _expiry(now[0]),
                    "expedido": datetime.fromtimestamp(now[0], UTC).isoformat(),
                },
            )
        return httpx2.Response(200, json=TRACKING)

    ecf = ECF(
        P12ReaderData(key=key_pem, cert=cert_pem),
        Environment.DEV,
        http_client=make_client(handler),
        now=lambda: now[0],
    )

    assert ecf.authenticate().is_ok()
    assert validations[0] == 1

    # Inside the 5-minute refresh window.
    now[0] += HOUR_S - 60
    assert ecf.status_track_id("t1").is_ok()

    assert validations[0] == 2


def test_does_not_refresh_a_fresh_token(self_signed) -> None:
    key_pem, cert_pem, _ = self_signed
    now = [1_000_000_000.0]
    validations = [0]

    def handler(request: httpx2.Request) -> httpx2.Response:
        url = str(request.url)
        if url.endswith("/Semilla"):
            return httpx2.Response(200, text=SEED)
        if "ValidarSemilla" in url:
            validations[0] += 1
            return httpx2.Response(
                200,
                json={
                    "token": f"tok-{validations[0]}",
                    "expira": _expiry(now[0]),
                    "expedido": datetime.fromtimestamp(now[0], UTC).isoformat(),
                },
            )
        return httpx2.Response(200, json=TRACKING)

    ecf = ECF(
        P12ReaderData(key=key_pem, cert=cert_pem),
        Environment.DEV,
        http_client=make_client(handler),
        now=lambda: now[0],
    )

    assert ecf.authenticate().is_ok()
    now[0] += 30 * 60
    assert ecf.status_track_id("t1").is_ok()

    assert validations[0] == 1


def test_reauthenticates_once_on_401_and_replays(self_signed) -> None:
    key_pem, cert_pem, _ = self_signed
    validations = [0]
    status_calls = [0]

    def handler(request: httpx2.Request) -> httpx2.Response:
        url = str(request.url)
        if url.endswith("/Semilla"):
            return httpx2.Response(200, text=SEED)
        if "ValidarSemilla" in url:
            validations[0] += 1
            return httpx2.Response(
                200,
                json={
                    "token": f"tok-{validations[0]}",
                    "expira": _expiry(datetime.now(UTC).timestamp()),
                    "expedido": datetime.now(UTC).isoformat(),
                },
            )
        status_calls[0] += 1
        if status_calls[0] == 1:
            return httpx2.Response(401, json={"message": "Token expired"})
        return httpx2.Response(200, json=TRACKING)

    ecf = ECF(
        P12ReaderData(key=key_pem, cert=cert_pem),
        Environment.DEV,
        http_client=make_client(handler),
    )

    assert ecf.authenticate().is_ok()
    assert ecf.status_track_id("t1").is_ok()

    assert validations[0] == 2
    assert status_calls[0] == 2


def test_coalesces_concurrent_refreshes(self_signed) -> None:
    key_pem, cert_pem, _ = self_signed
    now = [1_000_000_000.0]
    validations = [0]

    def handler(request: httpx2.Request) -> httpx2.Response:
        url = str(request.url)
        if url.endswith("/Semilla"):
            return httpx2.Response(200, text=SEED)
        if "ValidarSemilla" in url:
            validations[0] += 1
            return httpx2.Response(
                200,
                json={
                    "token": f"tok-{validations[0]}",
                    "expira": _expiry(now[0]),
                    "expedido": datetime.fromtimestamp(now[0], UTC).isoformat(),
                },
            )
        return httpx2.Response(200, json=TRACKING)

    ecf = ECF(
        P12ReaderData(key=key_pem, cert=cert_pem),
        Environment.DEV,
        http_client=make_client(handler),
        now=lambda: now[0],
    )

    assert ecf.authenticate().is_ok()
    now[0] += HOUR_S

    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda _: ecf.status_track_id("t1"), range(3)))

    assert all(result.is_ok() for result in results)
    assert validations[0] == 2


def test_never_refreshes_proactively_for_a_pre_supplied_token(self_signed) -> None:
    key_pem, cert_pem, _ = self_signed
    validations = [0]

    def handler(request: httpx2.Request) -> httpx2.Response:
        url = str(request.url)
        if url.endswith("/Semilla"):
            return httpx2.Response(200, text=SEED)
        if "ValidarSemilla" in url:
            validations[0] += 1
            return httpx2.Response(200, json={"token": "tok", "expira": ""})
        return httpx2.Response(200, json=TRACKING)

    ecf = ECF(
        P12ReaderData(key=key_pem, cert=cert_pem),
        Environment.DEV,
        token="pre-supplied",
        http_client=make_client(handler),
        now=lambda: 2_000_000_000.0,
    )

    assert ecf.status_track_id("t1").is_ok()
    assert validations[0] == 0


@pytest.mark.parametrize("value", ["", "not-a-date"])
def test_parse_expiry_tolerates_bad_values(value: str) -> None:
    assert _parse_expiry(value) is None
