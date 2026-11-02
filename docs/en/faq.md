# FAQ

## Why the result pattern instead of exceptions?

Tax documents and network calls have predictable failure modes (rejected e-CF,
timeout, expired certificate). Making them explicit in the type system
(`Result<T, E>`) forces callers to handle them and prevents silent failures.

## Why server-side only?

The SDKs load `.p12` private keys and transmit credentials. Shipping them to a
browser would expose those secrets.

## Does the TypeScript SDK work on Node and Bun?

Yes. It targets Node.js 20+ and Bun 1+, uses native `fetch`, and ships ESM, CJS
and type declarations.

## Which Python version is required?

Python 3.11+. The HTTP client is [`httpx2`](https://pypi.org/project/httpx2/),
which dropped 3.9/3.10.

## How do I verify a signature?

Use an independent tool:

```bash
xmlsec1 --verify --insecure signed.xml
```

Then submit to the DGII certification environment.

## Why is the first npm publish manual?

npm trusted publishing requires the package to already exist, so the very first
version is published locally. After that, configure the trusted publisher and
subsequent releases publish from GitHub Actions via OIDC.

## How do I rotate the certificate?

The certificate is production infrastructure. Track its expiry (the SDK exposes
`getCertificateInfo` / `getCertificateInfoFromBase64`) and rotate before it
lapses — alert at 60/30/7 days. Never commit the `.p12` or its password.

## How do I report a security issue?

See [SECURITY.md](https://github.com/deuriib/dgii-ecf/blob/main/SECURITY.md).
Do not open a public issue.
