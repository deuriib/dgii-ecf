"""Standalone utilities: security code, QR URLs, dates, XML extraction, certs."""

from __future__ import annotations

from pathlib import Path

from py_dgii_ecf import (
    Environment,
    generate_ecf_qr_code_url,
    generate_fc_qr_code_url,
    get_code_six_digit_from_signature,
    get_current_formatted_date,
    get_current_formatted_datetime,
    get_xml_from_body_response,
    validate_xml_certificate,
)

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def main() -> int:
    sample = (FIXTURES / "test.xml").read_text(encoding="utf-8")

    security = get_code_six_digit_from_signature(sample)
    if security.is_ok():
        print("security code:", security.unwrap())
    else:
        print("security code: <none>")

    validation = validate_xml_certificate(sample)
    print("certificate valid:", validation.is_valid)
    print("certificate subject:", validation.subject)

    print(
        "FC QR:",
        generate_fc_qr_code_url(
            "130862346", "E310000000001", 1180, "abc123", Environment.DEV
        ),
    )
    print(
        "e-CF QR:",
        generate_ecf_qr_code_url(
            "130862346",
            "40102368",
            "E310000000001",
            "1180.00",
            "01-01-2026",
            "01-01-2026 10:00:00",
            "abc123",
            Environment.PROD,
        ),
    )

    print("now:", get_current_formatted_datetime())
    print("today:", get_current_formatted_date())

    body = 'prefix <?xml version="1.0"?><ACECF><x>1</x></ACECF> suffix'
    print("extracted XML:", get_xml_from_body_response(body))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
