"""CLI tests (no network): authentication failures must not be swallowed."""

from __future__ import annotations

import pytest
from typer.testing import CliRunner

from py_dgii_ecf import cli
from py_dgii_ecf.certificate import P12ReaderData
from py_dgii_ecf.errors import DgiiError, DgiiErrorCode
from py_dgii_ecf.result import Err, Ok
from py_dgii_ecf.types import AuthToken, TrackingStatusResponse

CREDENTIALS = P12ReaderData(key="unused", cert="unused")


def _patch_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        cli,
        "_load_credentials",
        lambda _p12, _password: CREDENTIALS,
    )


def test_status_surfaces_authentication_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_credentials(monkeypatch)

    class FakeEcf:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        def authenticate(self) -> Err[DgiiError]:
            return Err(DgiiError("bad certificate", code=DgiiErrorCode.CERTIFICATE))

        def status_track_id(self, _track_id: str) -> Ok[TrackingStatusResponse]:
            raise AssertionError("status_track_id must not run when auth fails")

    monkeypatch.setattr(cli, "ECF", FakeEcf)
    runner = CliRunner()
    result = runner.invoke(
        cli.app,
        ["status", "TRACK-1", "/tmp/id.p12", "--password", "secret"],
    )

    assert result.exit_code == 1
    assert "bad certificate" in result.output


def test_status_queries_after_successful_auth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_credentials(monkeypatch)
    requested: dict[str, str] = {}

    class FakeEcf:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        def authenticate(self) -> Ok[AuthToken]:
            return Ok(AuthToken(token="t", expira="", expedido=""))

        def status_track_id(self, track_id: str) -> Ok[TrackingStatusResponse]:
            requested["track_id"] = track_id
            return Ok(
                TrackingStatusResponse(
                    track_id=track_id,
                    codigo=1,
                    estado="Aceptado",
                    rnc="130862346",
                    encf="E310000000001",
                    secuencia_utilizada=True,
                    fecha_recepcion="01-01-2026 10:00:00",
                )
            )

    monkeypatch.setattr(cli, "ECF", FakeEcf)
    runner = CliRunner()
    result = runner.invoke(
        cli.app,
        ["status", "TRACK-1", "/tmp/id.p12", "--password", "secret"],
    )

    assert result.exit_code == 0
    assert requested["track_id"] == "TRACK-1"
    assert "Aceptado" in result.output
