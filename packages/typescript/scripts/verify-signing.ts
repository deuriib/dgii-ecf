/**
 * Independent XMLDSig verification gate using libxmlsec1.
 *
 * Signs DGII documents with an ephemeral certificate through the SDK, then
 * verifies the emitted signatures with the `xmlsec1` binary. A unit test that
 * recomputes the digest with the same code that produced it would happily
 * agree with a broken canonicalization; libxmlsec1 will not.
 *
 * Two cases are signed on purpose:
 *
 * - `invoice-31.xml`, the real fixture used by the examples.
 * - A synthetic document whose attributes are deliberately out of C14N order.
 *   `invoice-31.xml` carries no attributes at all, so a regression to raw
 *   serialization would still verify there — and go unnoticed. The synthetic
 *   case hashes differently under raw serialization than under inclusive
 *   C14N, so it is the one that actually pins the behaviour.
 *
 * Run in CI after installing libxmlsec1: `bun run scripts/verify-signing.ts`.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { Signature } from '../src/index.js';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const FIXTURE = join(REPO_ROOT, 'examples', 'fixtures', 'invoice-31.xml');
const XMLSEC_BIN = process.env['DGII_XMLSEC_BIN'] ?? 'xmlsec1';

/**
 * Attribute order is not C14N order (`zeta` > `alpha` > `mid`), so raw
 * serialization and inclusive C14N produce different digests here.
 */
const C14N_SENSITIVE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ECF xmlns="urn:dgii:ecf" version="1.0" ID="ECF31">
  <Encabezado>
    <IdDoc zeta="1" alpha="2" mid="3">
      <TipoeCF>31</TipoeCF>
    </IdDoc>
  </Encabezado>
</ECF>
`;

interface SigningCase {
  readonly name: string;
  readonly xml: string;
}

interface EphemeralCertificate {
  readonly keyPem: string;
  readonly certPem: string;
}

/** Throwaway self-signed certificate — no DGII material is ever involved. */
const ephemeralCertificate = (): EphemeralCertificate => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date(Date.now() - 60 * 60 * 1000);
  certificate.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const attributes = [{ name: 'commonName', value: 'dgii-ecf-xmlsec' }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  return {
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(certificate),
  };
};

const signingCases = (): readonly SigningCase[] => [
  { name: 'invoice-31', xml: readFileSync(FIXTURE, 'utf8') },
  { name: 'c14n-sensitive', xml: C14N_SENSITIVE_XML },
];

const verifyWithXmlsec = (
  caseName: string,
  signedPath: string,
  certPath: string,
): boolean => {
  const result = spawnSync(
    XMLSEC_BIN,
    ['--verify', '--pubkey-cert-pem', certPath, signedPath],
    { encoding: 'utf8' },
  );

  if (result.error) {
    console.error(
      `error: could not run ${XMLSEC_BIN}: ${result.error.message}`,
    );
    console.error(
      'Install libxmlsec1 (for example `sudo apt-get install -y xmlsec1`) and retry.',
    );
    return false;
  }

  if (result.status !== 0) {
    console.error(
      `xmlsec1 verification FAILED for ${caseName} (exit ${result.status ?? 'null'})`,
    );
    if (result.stdout.trim()) {
      console.error(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
    return false;
  }

  console.log(`xmlsec1 verification PASSED (${caseName})`);
  return true;
};

const main = (): number => {
  const { keyPem, certPem } = ephemeralCertificate();
  const workDir = mkdtempSync(join(tmpdir(), 'dgii-ecf-xmlsec-'));
  const certPath = join(workDir, 'cert.pem');
  writeFileSync(certPath, certPem);

  for (const signingCase of signingCases()) {
    const signed = new Signature(keyPem, certPem).signXml(signingCase.xml);
    if (signed.isErr()) {
      console.error(`error: ${signingCase.name}: ${signed.error.message}`);
      return 1;
    }

    const signedPath = join(workDir, `${signingCase.name}.signed.xml`);
    writeFileSync(signedPath, signed.value);

    if (!verifyWithXmlsec(signingCase.name, signedPath, certPath)) {
      return 1;
    }
  }

  return 0;
};

process.exit(main());
