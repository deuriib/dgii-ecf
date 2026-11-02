"""Fixtures for the opt-in DGII integration suite.

Every test in this directory talks to a **real** DGII environment, so the
suite skips unless ``DGII_P12_PATH``, ``DGII_P12_PASSWORD`` and ``DGII_RNC``
are set. Submitting a document also needs an authorised, unused sequence
number: ``DGII_ENCF`` for an e-CF, ``DGII_RFCE_ENCF`` for a summary.

See ``dgii_env.py`` for the full contract.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from dgii_env import DgiiSettings, missing_variables, resolve_environment

from py_dgii_ecf.certificate import P12Reader, P12ReaderData
from py_dgii_ecf.client import ECF
from py_dgii_ecf.signing import Signature


@pytest.fixture(scope="session", autouse=True)
def _require_credentials() -> None:
    """Skip the whole directory when credentials are not configured."""
    missing = missing_variables()
    if missing:
        pytest.skip(
            "DGII integration credentials not configured: " + ", ".join(missing)
        )


@pytest.fixture(scope="session")
def dgii_settings() -> DgiiSettings:
    return DgiiSettings(
        p12_path=Path(os.environ["DGII_P12_PATH"]),
        p12_password=os.environ["DGII_P12_PASSWORD"],
        rnc=os.environ["DGII_RNC"],
        environment=resolve_environment(),
        encf=os.environ.get("DGII_ENCF"),
        rfce_encf=os.environ.get("DGII_RFCE_ENCF"),
    )


@pytest.fixture(scope="session")
def dgii_credentials(dgii_settings: DgiiSettings) -> P12ReaderData:
    result = P12Reader(dgii_settings.p12_password).get_key_from_file(
        dgii_settings.p12_path
    )
    if result.is_err():
        pytest.fail(f"cannot load DGII_P12_PATH: {result.unwrap_err()}", pytrace=False)
    return result.unwrap()


@pytest.fixture(scope="session")
def dgii_signer(dgii_settings: DgiiSettings) -> Signature:
    result = Signature.try_from_p12(dgii_settings.p12_path, dgii_settings.p12_password)
    if result.is_err():
        pytest.fail(f"cannot build signer: {result.unwrap_err()}", pytrace=False)
    return result.unwrap()


@pytest.fixture(scope="session")
def dgii_client(dgii_settings: DgiiSettings, dgii_credentials: P12ReaderData) -> ECF:
    return ECF(dgii_credentials, dgii_settings.environment, timeout_s=60.0)


@pytest.fixture(scope="session")
def authenticated_client(dgii_client: ECF) -> ECF:
    """Authenticate once per session; the token is reused by every test."""
    result = dgii_client.authenticate()
    if result.is_err():
        pytest.fail(f"DGII authentication failed: {result.unwrap_err()}", pytrace=False)
    return dgii_client
