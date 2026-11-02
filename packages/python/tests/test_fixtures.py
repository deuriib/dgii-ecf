"""The example fixtures must match the official DGII schemas."""

from __future__ import annotations

from pathlib import Path

FIXTURES = Path(__file__).resolve().parents[3] / "examples" / "fixtures"


def read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_acecf_carries_every_field_dgii_returns() -> None:
    xml = read("acecf.xml")

    for tag in (
        "DetalleAprobacionComercial",
        "Version",
        "RNCEmisor",
        "eNCF",
        "FechaEmision",
        "MontoTotal",
        "RNCComprador",
        "Estado",
        "FechaHoraAprobacionComercial",
    ):
        assert f"<{tag}>" in xml, tag


def test_anecf_follows_the_v1_0_schema() -> None:
    xml = read("anecf.xml")

    for tag in (
        "Encabezado",
        "RncEmisor",
        "CantidadeNCFAnulados",
        "FechaHoraAnulacioneNCF",
        "DetalleAnulacion",
        "Anulacion",
        "NoLinea",
        "TipoeCF",
        "TablaRangoSecuenciasAnuladaseNCF",
        "Secuencias",
        "SecuenciaeNCFDesde",
        "SecuenciaeNCFHasta",
    ):
        assert f"<{tag}>" in xml, tag


def test_anecf_avoids_elements_the_schema_does_not_define() -> None:
    xml = read("anecf.xml")

    assert "<RangoNCF>" not in xml
    assert "<CantidadNCF>" not in xml
