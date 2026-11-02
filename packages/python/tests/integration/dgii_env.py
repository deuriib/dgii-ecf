"""Environment contract and helpers for the opt-in DGII integration suite.

Kept out of ``conftest.py`` so both the fixtures and the test modules can
import it without reaching into pytest internals.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

import pytest

from py_dgii_ecf.environment import Environment

REQUIRED_VARIABLES = ("DGII_P12_PATH", "DGII_P12_PASSWORD", "DGII_RNC")
REPO_ROOT = Path(__file__).resolve().parents[4]

_ENCF_RE = re.compile(r"<eNCF>[^<]*</eNCF>")


@dataclass(frozen=True, slots=True)
class DgiiSettings:
    """Resolved integration-test configuration."""

    p12_path: Path
    p12_password: str
    rnc: str
    environment: Environment
    encf: str | None
    rfce_encf: str | None


def missing_variables() -> tuple[str, ...]:
    """Required variables that are absent or empty."""
    return tuple(name for name in REQUIRED_VARIABLES if not os.environ.get(name))


def resolve_environment() -> Environment:
    """Read ``DGII_ENVIRONMENT``, refusing to point the suite at production."""
    raw = os.environ.get("DGII_ENVIRONMENT", Environment.CERT.value)
    try:
        environment = Environment(raw)
    except ValueError:
        allowed = ", ".join(
            item.value for item in Environment if item is not Environment.PROD
        )
        raise pytest.UsageError(
            f"DGII_ENVIRONMENT={raw!r} is not one of: {allowed}"
        ) from None
    if environment is Environment.PROD:
        raise pytest.UsageError(
            "DGII_ENVIRONMENT=eCF points at production. The integration suite "
            "is sandboxed to TesteCF/CerteCF."
        )
    return environment


def load_fixture(file_name: str, encf: str | None) -> str:
    """Read a fixture, replacing its ``eNCF`` when a sequence is supplied.

    DGII rejects a repeated sequence number, so a submission test has to use a
    freshly authorised one instead of the value baked into the fixture.
    """
    xml = (REPO_ROOT / "examples" / "fixtures" / file_name).read_text(encoding="utf-8")
    if encf is None:
        return xml
    replaced, count = _ENCF_RE.subn(f"<eNCF>{encf}</eNCF>", xml)
    if count != 1:
        raise ValueError(f"expected exactly one <eNCF> in {file_name}, found {count}")
    return replaced
