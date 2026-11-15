"""CLI tests (no network): authentication failures must not be swallowed."""

from __future__ import annotations

from pathlib import Path

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


def test_json_to_xml_stdout(tmp_path: Path) -> None:
    json_file = tmp_path / "document.json"
    json_file.write_text(
        '{"ECF": {"Encabezado": {"Version": "1.0"}}}', encoding="utf-8"
    )
    runner = CliRunner()
    result = runner.invoke(cli.app, ["json-to-xml", str(json_file)])

    assert result.exit_code == 0
    assert '<?xml version="1.0" encoding="utf-8"?>' in result.output
    assert "<Version>1.0</Version>" in result.output


def test_json_to_xml_output_file(tmp_path: Path) -> None:
    json_file = tmp_path / "document.json"
    json_file.write_text(
        '{"ECF": {"Encabezado": {"Version": "1.0"}}}', encoding="utf-8"
    )
    output_xml = tmp_path / "output.xml"
    runner = CliRunner()
    result = runner.invoke(
        cli.app,
        ["json-to-xml", str(json_file), "--output", str(output_xml)],
    )

    assert result.exit_code == 0
    assert f"xml document written to {output_xml}" in result.output
    assert output_xml.is_file()
    content = output_xml.read_text(encoding="utf-8")
    assert "<Version>1.0</Version>" in content


def test_json_to_xml_round_monetary(tmp_path: Path) -> None:
    json_file = tmp_path / "document.json"
    json_file.write_text(
        '{"ECF": {"Encabezado": {"Version": "1.0", "MontoTotal": "2.675"}}}',
        encoding="utf-8",
    )
    runner = CliRunner()
    result = runner.invoke(
        cli.app,
        ["json-to-xml", str(json_file), "--round-monetary"],
    )

    assert result.exit_code == 0
    assert "<Version>1.0</Version>" in result.output
    assert "<MontoTotal>2.68</MontoTotal>" in result.output


def test_json_to_xml_file_not_found(tmp_path: Path) -> None:
    nonexistent = tmp_path / "nonexistent.json"
    runner = CliRunner()
    result = runner.invoke(cli.app, ["json-to-xml", str(nonexistent)])

    assert result.exit_code == 1
    assert "error: file not found:" in result.output


def test_json_to_xml_invalid_json_content(tmp_path: Path) -> None:
    invalid_file = tmp_path / "bad.json"
    invalid_file.write_text("{bad json", encoding="utf-8")
    runner = CliRunner()
    result = runner.invoke(cli.app, ["json-to-xml", str(invalid_file)])

    assert result.exit_code == 1
    assert "error:" in result.output
