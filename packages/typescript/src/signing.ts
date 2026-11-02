import crypto from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import { C14nCanonicalization, SignedXml } from 'xml-crypto';
import { err, ok, type Result } from './result.js';
import { DgiiError } from './errors.js';

export type DgiiDocumentType =
  'SemillaModel' | 'ECF' | 'RFCE' | 'ARECF' | 'ACECF' | 'ANECF' | (string & {});

const C14N_INCLUSIVE = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
/**
 * Custom digest URI: DGII hashes the inclusive C14N 1.0 form of the referenced
 * document. xml-crypto's built-in SHA-256 hashes its raw serialization, so we
 * register a digest backed by xml-crypto's inclusive C14N implementation.
 */
const CUSTOM_DIGEST_URI = 'http://dgii.gov.do/digest/sha256-c14n';

interface XmldomDocument extends Document {
  childNodes: NodeListOf<ChildNode>;
}

/**
 * DGII-compatible digest: hash the inclusive C14N 1.0 form of the referenced
 * document — the exact bytes a .NET/DGII verifier computes.
 */
class DgiiDigest {
  getHash(xml: string): string {
    const doc = new DOMParser().parseFromString(
      xml,
    ) as unknown as XmldomDocument;
    const canonical = new C14nCanonicalization().process(
      doc as unknown as Node,
      {},
    );
    return crypto
      .createHash('sha256')
      .update(canonical, 'utf8')
      .digest('base64');
  }

  getAlgorithmName(): string {
    return SHA256;
  }
}

interface StrictParseResult {
  doc: XmldomDocument;
  rootName: string;
}

const parseStrict = (xml: string): StrictParseResult => {
  const errors: string[] = [];
  const doc = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message: string) => errors.push(message),
      fatalError: (message: string) => errors.push(message),
    },
  }).parseFromString(xml, 'text/xml') as unknown as XmldomDocument;

  if (errors.length) {
    throw new Error(`Invalid XML: ${errors.join('; ')}`);
  }
  const root = doc.documentElement;
  if (!root) {
    throw new Error('Unable to parse XML or find root element');
  }
  if (root.nodeName === 'parsererror' || root.localName === 'parsererror') {
    throw new Error(`Invalid XML: ${root.textContent ?? 'parse error'}`);
  }
  return {
    doc,
    rootName: root.localName ?? root.nodeName,
  };
};

/** Remove whitespace-only text nodes and comments before canonicalization. */
const cleanNodes = (node: Node): void => {
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes[index];
    if (!child) {
      continue;
    }
    const isComment = child.nodeType === 8;
    const isWhitespace =
      child.nodeType === 3 && !/\S/.test(child.nodeValue ?? '');
    if (isComment || isWhitespace) {
      node.removeChild(child);
      index -= 1;
    } else if (child.nodeType === 1) {
      cleanNodes(child);
    }
  }
};

/** Signs DGII XML documents with XMLDSig (enveloped, inclusive C14N, RSA-SHA256). */
export class Signature {
  constructor(
    private readonly privateKey: string,
    private readonly certificatePem: string,
  ) {}

  signXml(
    xml: string,
    rootElName?: DgiiDocumentType,
  ): Result<string, DgiiError> {
    try {
      const { doc, rootName } = parseStrict(xml);
      const elementName = rootElName ?? rootName;

      const sig = new SignedXml({
        privateKey: this.privateKey,
        publicCert: this.certificatePem,
        signatureAlgorithm: RSA_SHA256,
        canonicalizationAlgorithm: C14N_INCLUSIVE,
      });

      const hashAlgorithms = (
        sig as unknown as {
          HashAlgorithms: Record<string, unknown>;
        }
      ).HashAlgorithms;
      hashAlgorithms[CUSTOM_DIGEST_URI] = DgiiDigest;

      sig.addReference({
        xpath: `//*[local-name(.)='${elementName}']`,
        transforms: [ENVELOPED],
        digestAlgorithm: CUSTOM_DIGEST_URI,
        isEmptyUri: true,
      } as unknown as Parameters<SignedXml['addReference']>[0]);

      cleanNodes(doc as unknown as Node);
      sig.computeSignature(doc.toString());
      return ok(sig.getSignedXml());
    } catch (error) {
      return err(
        new DgiiError(
          `Failed to sign XML: ${error instanceof Error ? error.message : String(error)}`,
          { code: 'SIGNING', cause: error },
        ),
      );
    }
  }
}

export interface XmlCertificateValidation {
  isValid: boolean;
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  error?: string;
}

/** Validate the embedded X509 certificate of a signed XML document. */
export const validateXMLCertificate = (
  xml: string,
): XmlCertificateValidation => {
  try {
    const match = xml.match(/<X509Certificate>([\s\S]*?)<\/X509Certificate>/);
    if (!match?.[1]) {
      return { isValid: false, error: 'X509Certificate not found' };
    }
    const der = Buffer.from(match[1].replace(/\s+/g, ''), 'base64');
    const certificate = new crypto.X509Certificate(der);
    const notBefore = new Date(certificate.validFrom).getTime();
    const notAfter = new Date(certificate.validTo).getTime();
    const now = Date.now();
    const isValid = now >= notBefore && now <= notAfter;
    return {
      isValid,
      subject: certificate.subject,
      issuer: certificate.issuer,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      error: isValid ? undefined : 'Certificate expired or not yet valid',
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
