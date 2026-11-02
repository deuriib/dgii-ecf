"""Signing tests — verify the digest and the signature cryptographically."""

from __future__ import annotations

import base64
import hashlib

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from lxml import etree

from py_dgii_ecf.errors import DgiiErrorCode
from py_dgii_ecf.signing import Signature, validate_xml_certificate

DSIG = "http://www.w3.org/2000/09/xmldsig#"
NS = {"ds": DSIG}

ECF_XML = (
    '<?xml version="1.0" encoding="utf-8"?>'
    "<ECF><Encabezado><Version>1.0</Version></Encabezado></ECF>"
)


def test_sign_produces_valid_signature(
    self_signed: tuple[str, str, x509.Certificate],
) -> None:
    key_pem, cert_pem, certificate = self_signed
    result = Signature(key_pem, cert_pem).sign_xml(ECF_XML)
    assert result.is_ok()
    signed = result.unwrap()

    assert "<Signature" in signed
    assert "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" in signed
    assert "http://www.w3.org/TR/2001/REC-xml-c14n-20010315" in signed

    root = etree.fromstring(signed.encode("utf-8"))
    signed_info = root.find(".//ds:SignedInfo", NS)
    signature_value_node = root.find(".//ds:SignatureValue", NS)
    assert signed_info is not None
    assert signature_value_node is not None and signature_value_node.text
    signature_value = base64.b64decode(signature_value_node.text)
    canonical_si = etree.tostring(
        signed_info, method="c14n", exclusive=False, with_comments=False
    )
    # Raises InvalidSignature if the signature does not verify.
    certificate.public_key().verify(
        signature_value,
        canonical_si,
        padding.PKCS1v15(),
        hashes.SHA256(),
    )


def test_digest_matches_enveloped_transform(
    self_signed: tuple[str, str, x509.Certificate],
) -> None:
    key_pem, cert_pem, _ = self_signed
    signed = Signature(key_pem, cert_pem).sign_xml(ECF_XML).unwrap()

    root = etree.fromstring(signed.encode("utf-8"))
    digest_node = root.find(".//ds:DigestValue", NS)
    signature_node = root.find(".//ds:Signature", NS)
    assert digest_node is not None and digest_node.text
    assert signature_node is not None
    parent = signature_node.getparent()
    assert parent is not None
    parent.remove(signature_node)

    canonical = etree.tostring(
        root, method="c14n", exclusive=False, with_comments=False
    )
    expected = base64.b64encode(hashlib.sha256(canonical).digest()).decode("ascii")
    assert digest_node.text == expected


def test_validate_xml_certificate(
    self_signed: tuple[str, str, x509.Certificate],
) -> None:
    key_pem, cert_pem, _ = self_signed
    signed = Signature(key_pem, cert_pem).sign_xml(ECF_XML).unwrap()
    validation = validate_xml_certificate(signed)
    assert validation.is_valid
    assert "dgii-ecf-test" in (validation.subject or "")


def test_invalid_xml_is_rejected(
    self_signed: tuple[str, str, x509.Certificate],
) -> None:
    key_pem, cert_pem, _ = self_signed
    result = Signature(key_pem, cert_pem).sign_xml("<ECF><broken>")
    assert result.is_err()
    assert result.unwrap_err().code == DgiiErrorCode.INVALID_XML
