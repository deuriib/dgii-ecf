import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DgiiError } from './errors.js';
import { err, ok, type Result } from './result.js';
import { extractElementText, extractRootElementName } from './xml.js';

/**
 * `publicDir` copies the schemas into the bundle root (`dist/`), while the test
 * runner loads `src/`, where they live one level up in `schemas/`. Probe for a
 * known file instead of guessing which layout we are in.
 */
const moduleDir = (() => {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
})();

export const SCHEMA_DIR =
  [moduleDir, resolve(moduleDir, '..', 'schemas')].find((candidate) =>
    existsSync(resolve(candidate, 'e-cf-32.xsd')),
  ) ?? resolve(moduleDir, '..', 'schemas');

/** Bundled schemas keyed by `root|TipoeCF` (empty type for non-ECF roots). */
const SCHEMA_FILES: Record<string, string> = {
  'ECF|32': 'e-cf-32.xsd',
  'ECF|33': 'e-cf-33.xsd',
  'ECF|34': 'e-cf-34.xsd',
  'ECF|41': 'e-cf-41.xsd',
  'ECF|43': 'e-cf-43.xsd',
  'ECF|44': 'e-cf-44.xsd',
  'ECF|45': 'e-cf-45.xsd',
  'ECF|46': 'e-cf-46.xsd',
  'ECF|47': 'e-cf-47.xsd',
  'ANECF|': 'anecf.xsd',
  'ARECF|': 'arecf.xsd',
  'SemillaModel|': 'semilla.xsd',
};

/** Schemas DGII publishes but that do not compile, with the reason. */
export const UNAVAILABLE_SCHEMAS: Record<string, string> = {
  'ECF|31':
    'the published schema references IndicadorServicioTodoIncluidoType, which does not resolve',
  'RFCE|':
    'the published schema has an invalid pattern facet: [$0-9] and the \\- escape are not valid XML Schema regex',
  'ACECF|':
    'the published schema has an invalid pattern facet: the \\- escape is not valid XML Schema regex',
};

/** One schema violation, with the element DGII would complain about. */
export interface SchemaViolation {
  path: string;
  message: string;
}

export interface ValidationOptions {
  /**
   * `xmllint` binary to use. Defaults to `DGII_XMLLINT_BIN` or `xmllint` on
   * `PATH`. There is no bundled engine: validation shells out.
   */
  bin?: string;
}

const schemaKey = (xml: string): string | undefined => {
  const root = extractRootElementName(xml);
  if (root === undefined) {
    return undefined;
  }
  if (root !== 'ECF') {
    return `${root}|`;
  }
  const tipo = extractElementText(xml, 'TipoeCF');
  return tipo === undefined ? undefined : `ECF|${tipo}`;
};

const validationError = (message: string, cause?: unknown): DgiiError =>
  new DgiiError(message, {
    code: 'VALIDATION',
    ...(cause !== undefined ? { cause } : {}),
  });

const VIOLATION_LINE = /^.*?:(\d+):\s*element\s+([^:]+):\s*(.*)$/;

/** Parse `xmllint --schema` stderr into violations. */
const parseViolations = (stderr: string): SchemaViolation[] => {
  const violations: SchemaViolation[] = [];
  for (const raw of stderr.split('\n')) {
    const line = raw.trim();
    if (
      line === '' ||
      line.endsWith('fails to validate') ||
      line.endsWith('validates')
    ) {
      continue;
    }
    const match = VIOLATION_LINE.exec(line);
    if (match !== null) {
      violations.push({
        path: (match[2] ?? '').trim(),
        message: (match[3] ?? '').trim(),
      });
    } else {
      violations.push({ path: '', message: line });
    }
  }
  return violations;
};

/**
 * Validate a DGII document against its bundled XML Schema.
 *
 * Requires `xmllint` (libxml2-utils) on `PATH`, or `DGII_XMLLINT_BIN` pointing
 * at it. A missing binary is an error — never a silent pass.
 */
export const validateDocument = (
  xml: string,
  options: ValidationOptions = {},
): Result<SchemaViolation[], DgiiError> => {
  const key = schemaKey(xml);
  if (key === undefined) {
    return err(
      validationError('Cannot determine the document type to validate'),
    );
  }

  const file = SCHEMA_FILES[key];
  if (file === undefined) {
    const reason =
      UNAVAILABLE_SCHEMAS[key] ??
      'no bundled XML Schema for this document type';
    const [root, tipo] = key.split('|');
    const label = tipo ? `${root} ${tipo}` : (root ?? key);
    return err(validationError(`Schema unavailable for ${label}: ${reason}`));
  }

  const bin = options.bin ?? process.env['DGII_XMLLINT_BIN'] ?? 'xmllint';
  const result = spawnSync(
    bin,
    ['--noout', '--schema', resolve(SCHEMA_DIR, file), '-'],
    { input: xml, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );

  if (result.error !== undefined && result.error !== null) {
    const code = (result.error as NodeJS.ErrnoException).code;
    return err(
      validationError(
        code === 'ENOENT'
          ? `xmllint was not found ("${bin}"). Install libxml2-utils or set DGII_XMLLINT_BIN; schema validation cannot run without it`
          : `Failed to run xmllint: ${result.error.message}`,
        result.error,
      ),
    );
  }

  if (result.status === 0) {
    return ok([]);
  }

  const violations = parseViolations(result.stderr ?? '');
  return ok(
    violations.length > 0
      ? violations
      : [
          {
            path: '',
            message: (result.stderr ?? '').trim() || 'Validation failed',
          },
        ],
  );
};

/** One-line summary of the first violations, for an error message. */
export const formatViolations = (
  violations: readonly SchemaViolation[],
): string => {
  const shown = violations
    .slice(0, 5)
    .map((violation) =>
      violation.path
        ? `${violation.path}: ${violation.message}`
        : violation.message,
    )
    .join('; ');
  const remaining = violations.length - 5;
  return remaining > 0 ? `${shown} (+${remaining} more)` : shown;
};
