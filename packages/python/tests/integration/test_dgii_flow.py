"""Live DGII integration tests, skipped unless the DGII_* variables are set.

The flow mirrors what a real issuer does: authenticate (seed → ValidarSemilla),
submit an e-CF, read its status by track id, and submit a summary (RFCE).

Nothing here touches production — see ``dgii_env.py``.
"""

from __future__ import annotations

import pytest
from dgii_env import DgiiSettings, load_fixture

from py_dgii_ecf.client import ECF
from py_dgii_ecf.signing import Signature


def test_authenticates_against_the_configured_environment(
    dgii_client: ECF, dgii_settings: DgiiSettings
) -> None:
    result = dgii_client.authenticate()

    assert result.is_ok(), result.unwrap_err()
    token = result.unwrap()
    assert token.token
    assert dgii_settings.environment.value != "eCF"


def test_submits_an_ecf_and_reads_its_status(
    authenticated_client: ECF,
    dgii_settings: DgiiSettings,
    dgii_signer: Signature,
) -> None:
    if not dgii_settings.encf:
        pytest.skip("DGII_ENCF is required to submit an e-CF")

    signed = dgii_signer.sign_xml(load_fixture("invoice-31.xml", dgii_settings.encf))
    assert signed.is_ok(), signed.unwrap_err()

    submission = authenticated_client.send_electronic_document(
        signed.unwrap(), f"{dgii_settings.encf}.xml"
    )
    assert submission.is_ok(), submission.unwrap_err()

    track_id = submission.unwrap().track_id
    assert track_id, "DGII accepted the document without a track id"

    status = authenticated_client.status_track_id(track_id)
    assert status.is_ok(), status.unwrap_err()
    assert status.unwrap().encf == dgii_settings.encf


def test_submits_a_summary(
    authenticated_client: ECF,
    dgii_settings: DgiiSettings,
    dgii_signer: Signature,
) -> None:
    if not dgii_settings.rfce_encf:
        pytest.skip("DGII_RFCE_ENCF is required to submit a summary")

    signed = dgii_signer.sign_xml(
        load_fixture("invoice-32.xml", dgii_settings.rfce_encf)
    )
    assert signed.is_ok(), signed.unwrap_err()

    submission = authenticated_client.send_summary(
        signed.unwrap(), f"{dgii_settings.rfce_encf}.xml"
    )

    assert submission.is_ok(), submission.unwrap_err()
    assert submission.unwrap().encf == dgii_settings.rfce_encf
