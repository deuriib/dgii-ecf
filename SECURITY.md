# Security Policy

## Supported versions

We release security fixes for the **latest** version of each package only.

| Package             | Registry | Status             |
| ------------------- | -------- | ------------------ |
| `@deuriib/dgii-ecf` | npm      | Actively supported |
| `py-dgii-ecf`       | PyPI     | Actively supported |

## Reporting a vulnerability

**Do not open a public issue.** Report security vulnerabilities privately to:

- GitHub: [Private vulnerability reporting](https://github.com/deuriib/dgii-ecf/security/advisories/new)
- Email: `security@deuriib.dev` (prefer the GitHub flow)

We aim to acknowledge reports within **48 hours** and publish a fix + advisory as
soon as possible. Please include:

1. The affected package and version.
2. A description of the vulnerability.
3. Steps to reproduce (or a proof-of-concept).
4. Any suggested fix.

## Security guidance for DGII e-CF users

This library handles cryptographically-sensitive material. Follow these rules:

- **Never commit** `.p12`, `.pem`, `.pfx`, private keys, access tokens, or RNC
  credentials to any repository. Rotate immediately if exposed.
- Store DGII certificates and private keys in a secret manager (AWS Secrets
  Manager, Vault, Azure Key Vault, etc.) and inject them at runtime.
- The certificate private key is production infrastructure: track its expiry and
  rotate it **before** it lapses (alert at 60/30/7 days).
- Only ever target the DGII **certification** environment (`CerteCF`) during
  development; promote to `eCF` (production) only after DGII acceptance.
- This library is server-side only. Do not load it in a browser/bundle — it would
  expose credentials.
- The signing implementation follows XMLDSig enveloped signature with inclusive
  C14N and RSA-SHA256. Always verify signatures with an independent tool
  (`xmlsec1 --verify`) before declaring a document valid.

## Disclosure process

1. Triage and confirm the report.
2. Develop and test a fix in a private branch.
3. Publish a patched release and a [GitHub Security Advisory](https://github.com/deuriib/dgii-ecf/security/advisories).
4. Credit the reporter (unless they request anonymity).
