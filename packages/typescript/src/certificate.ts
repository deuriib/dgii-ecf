import { readFileSync } from 'node:fs';
import forge from 'node-forge';
import { err, ok, type Result } from './result.js';
import { DgiiError } from './errors.js';

export interface P12ReaderData {
  key?: string;
  cert?: string;
  publicKey?: string;
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
}

const asErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Reads a PKCS#12 (.p12) bundle and extracts the private key + certificate. */
export class P12Reader {
  constructor(private readonly passphrase: string) {}

  private load(base64: string): forge.pkcs12.Pkcs12Pfx {
    const der = forge.util.decode64(base64);
    const asn1 = forge.asn1.fromDer(der);
    return forge.pkcs12.pkcs12FromAsn1(asn1, false, this.passphrase);
  }

  private extractKey(p12: forge.pkcs12.Pkcs12Pfx): string | undefined {
    // DGII bundles normally carry a shrouded (encrypted) PKCS#8 key bag, but
    // unencrypted bundles use a plain keyBag. A certBag never holds a private
    // key, so it must not be used as a fallback.
    const keyBagTypes = [
      forge.pki.oids.pkcs8ShroudedKeyBag,
      forge.pki.oids.keyBag,
    ];
    for (const bagType of keyBagTypes) {
      const bag = p12.getBags({ bagType })[bagType]?.[0];
      if (bag?.key) {
        return forge.pki.privateKeyToPem(bag.key);
      }
    }
    return undefined;
  }

  private extractCertificate(p12: forge.pkcs12.Pkcs12Pfx): string | undefined {
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag?.cert) {
      return undefined;
    }
    return forge.pki.certificateToPem(certBag.cert);
  }

  getKeyFromFile(fileName: string): Result<P12ReaderData, DgiiError> {
    try {
      const base64 = readFileSync(fileName, 'base64');
      return this.getKeyFromStringBase64(base64);
    } catch (error) {
      return err(
        new DgiiError(`Unable to read .p12 file: ${fileName}`, {
          code: 'CERTIFICATE',
          cause: error,
        }),
      );
    }
  }

  getKeyFromStringBase64(base64: string): Result<P12ReaderData, DgiiError> {
    try {
      const p12 = this.load(base64);
      const key = this.extractKey(p12);
      const cert = this.extractCertificate(p12);
      if (!key || !cert) {
        return err(
          new DgiiError('PKCS#12 must contain a private key and certificate', {
            code: 'CERTIFICATE',
          }),
        );
      }
      const publicKey = forge.pki.publicKeyToPem(
        forge.pki.certificateFromPem(cert).publicKey,
      );
      return ok({ key, cert, publicKey });
    } catch (error) {
      return err(
        new DgiiError(`Unable to parse .p12: ${asErrorMessage(error)}`, {
          code: 'CERTIFICATE',
          cause: error,
        }),
      );
    }
  }

  private toCertificateInfo(certPem: string): CertificateInfo {
    const certificate = forge.pki.certificateFromPem(certPem);
    return {
      subject: certificate.subject.attributes
        .map((attribute) => `${attribute.shortName}=${attribute.value}`)
        .join(', '),
      issuer: certificate.issuer.attributes
        .map((attribute) => `${attribute.shortName}=${attribute.value}`)
        .join(', '),
      validFrom: certificate.validity.notBefore,
      validTo: certificate.validity.notAfter,
      serialNumber: certificate.serialNumber,
    };
  }

  getCertificateInfo(fileName: string): Result<CertificateInfo, DgiiError> {
    try {
      const base64 = readFileSync(fileName, 'base64');
      return this.getCertificateInfoFromBase64(base64);
    } catch (error) {
      return err(
        new DgiiError(`Unable to read .p12 file: ${fileName}`, {
          code: 'CERTIFICATE',
          cause: error,
        }),
      );
    }
  }

  getCertificateInfoFromBase64(
    base64: string,
  ): Result<CertificateInfo, DgiiError> {
    try {
      const certPem = this.extractCertificate(this.load(base64));
      if (!certPem) {
        return err(
          new DgiiError('Certificate not found in PKCS#12', {
            code: 'CERTIFICATE',
          }),
        );
      }
      return ok(this.toCertificateInfo(certPem));
    } catch (error) {
      return err(
        new DgiiError(
          `Unable to extract certificate info: ${asErrorMessage(error)}`,
          { code: 'CERTIFICATE', cause: error },
        ),
      );
    }
  }
}
