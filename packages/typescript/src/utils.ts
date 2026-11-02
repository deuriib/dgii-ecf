import { BaseUrl, Environment } from './environment.js';
import { err, ok, type Result } from './result.js';
import { DgiiError } from './errors.js';
import { Transformer } from './transformer.js';
import { extractElementText } from './xml.js';

/** First 6 chars of the `<SignatureValue>` (DGII security code). */
export const getCodeSixDigitfromSignature = (
  signedXml: string,
): Result<string, DgiiError> => {
  const value = extractElementText(signedXml, 'SignatureValue');
  if (value === undefined) {
    return err(new DgiiError('SignatureValue not found', { code: 'SIGNING' }));
  }
  if (value.length < 6) {
    return err(
      new DgiiError('SignatureValue is too short', { code: 'SIGNING' }),
    );
  }
  return ok(value.slice(0, 6));
};

/** QR URL for a factura de consumo (FC). */
export const generateFcQRCodeURL = (
  rncemisor: string,
  encf: string,
  montototal: number,
  codigoseguridad: string,
  env: Environment,
): string =>
  `${BaseUrl.CF}/${env.toLowerCase()}/consultatimbrefc?rncemisor=${encodeURIComponent(
    rncemisor,
  )}&encf=${encodeURIComponent(encf)}&montototal=${encodeURIComponent(
    String(montototal),
  )}&codigoseguridad=${encodeURIComponent(codigoseguridad)}`;

/** QR URL for a crédito fiscal (e-CF). */
export const generateEcfQRCodeURL = (
  rncemisor: string,
  rncComprador: string,
  encf: string,
  montototal: string,
  fechaEmision: string,
  fechaFirma: string,
  codigoseguridad: string,
  env: Environment,
): string => {
  let rncCompradorParam = '';
  if (rncComprador && !/E43/i.test(encf) && !/E47/i.test(encf)) {
    rncCompradorParam = `RncComprador=${encodeURIComponent(rncComprador)}&`;
  }
  return `${BaseUrl.ECF}/${env.toLowerCase()}/consultatimbre?rncemisor=${encodeURIComponent(
    rncemisor,
  )}&${rncCompradorParam}encf=${encodeURIComponent(
    encf,
  )}&fechaemision=${encodeURIComponent(
    fechaEmision,
  )}&montototal=${encodeURIComponent(
    montototal,
  )}&fechafirma=${encodeURIComponent(
    fechaFirma,
  )}&codigoseguridad=${encodeURIComponent(codigoseguridad)}`;
};

const formatInSantoDomingo = (date: Date, withTime: boolean): string => {
  const parts = new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
      : {}),
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const datePart = `${parts.day}-${parts.month}-${parts.year}`;
  return withTime
    ? `${datePart} ${parts.hour}:${parts.minute}:${parts.second}`
    : datePart;
};

/** `DD-MM-YYYY HH:mm:ss` in America/Santo_Domingo. */
export const getCurrentFormattedDateTime = (date: Date = new Date()): string =>
  formatInSantoDomingo(date, true);

/** `DD-MM-YYYY` in America/Santo_Domingo. */
export const getCurrentFormattedDate = (date: Date = new Date()): string =>
  formatInSantoDomingo(date, false);

/** Extract the XML payload embedded in a DGII commercial-approval body. */
export const getXmlFromBodyResponse = (
  body: string,
  lastTagName = 'ACECF',
): string | undefined =>
  body.match(new RegExp(`<\\?xml[\\s\\S]*?<\\/${lastTagName}>`))?.[0];

interface CompactElement {
  _text?: string;
  [key: string]: unknown;
}

interface ImpuestoAdicional {
  TipoImpuesto?: CompactElement;
  MontoImpuestoSelectivoConsumoEspecifico?: CompactElement;
  MontoImpuestoSelectivoConsumoAdvalorem?: CompactElement;
  OtrosImpuestosAdicionales?: CompactElement;
}

interface EcfTotales {
  MontoGravadoTotal?: CompactElement;
  MontoGravadoI1?: CompactElement;
  MontoGravadoI2?: CompactElement;
  MontoGravadoI3?: CompactElement;
  MontoExento?: CompactElement;
  TotalITBIS?: CompactElement;
  TotalITBIS1?: CompactElement;
  TotalITBIS2?: CompactElement;
  TotalITBIS3?: CompactElement;
  MontoImpuestoAdicional?: CompactElement;
  ImpuestosAdicionales?: {
    ImpuestoAdicional?: ImpuestoAdicional | ImpuestoAdicional[];
  };
  MontoTotal?: CompactElement;
  MontoNoFacturable?: CompactElement;
  MontoPeriodo?: CompactElement;
}

interface EcfJson {
  ECF: {
    Encabezado?: {
      Version?: CompactElement;
      IdDoc?: {
        TipoeCF?: CompactElement;
        eNCF?: CompactElement;
        TipoIngresos?: CompactElement;
        TipoPago?: CompactElement;
        TablaFormasPago?: CompactElement;
      };
      Emisor?: {
        RNCEmisor?: CompactElement;
        RazonSocialEmisor?: CompactElement;
        FechaEmision?: CompactElement;
      };
      Comprador?: {
        RNCComprador?: CompactElement;
        IdentificadorExtranjero?: CompactElement;
        RazonSocialComprador?: CompactElement;
      };
      Totales?: EcfTotales;
    };
  };
}

const toArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const isEmptyObject = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value as Record<string, unknown>).length === 0;

const removeEmptyValues = (input: unknown): unknown => {
  if (input === null || input === undefined || input === '') {
    return undefined;
  }
  if (Array.isArray(input)) {
    const filtered = input
      .map(removeEmptyValues)
      .filter(
        (item) =>
          item !== null &&
          item !== undefined &&
          item !== '' &&
          !isEmptyObject(item),
      );
    return filtered.length ? filtered : undefined;
  }
  if (typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
      const cleaned = removeEmptyValues(value);
      if (cleaned !== undefined && cleaned !== '' && !isEmptyObject(cleaned)) {
        output[key] = cleaned;
      }
    }
    return Object.keys(output).length ? output : undefined;
  }
  return input;
};

/**
 * Build the RFCE (summary invoice) document from a signed ECF-32 document.
 * Returns the unsigned RFCE XML plus the 6-digit security code.
 */
export const convertECF32ToRFCE = (
  ecf32Xml: string,
): Result<{ xml: string; securityCode: string }, DgiiError> => {
  const securityCode = getCodeSixDigitfromSignature(ecf32Xml);
  if (securityCode.isErr()) {
    return err(securityCode.error);
  }

  const transformer = new Transformer();
  const parsed = transformer.xml2json<EcfJson>(ecf32Xml);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const encabezado = parsed.value.ECF.Encabezado;
  const impuestos = toArray(
    encabezado?.Totales?.ImpuestosAdicionales?.ImpuestoAdicional,
  );

  const rfce = removeEmptyValues({
    RFCE: {
      Encabezado: {
        Version: encabezado?.Version,
        IdDoc: {
          TipoeCF: encabezado?.IdDoc?.TipoeCF,
          eNCF: encabezado?.IdDoc?.eNCF,
          TipoIngresos: encabezado?.IdDoc?.TipoIngresos,
          TipoPago: encabezado?.IdDoc?.TipoPago,
          TablaFormasPago: encabezado?.IdDoc?.TablaFormasPago,
        },
        Emisor: {
          RNCEmisor: encabezado?.Emisor?.RNCEmisor,
          RazonSocialEmisor: encabezado?.Emisor?.RazonSocialEmisor,
          FechaEmision: encabezado?.Emisor?.FechaEmision,
        },
        Comprador: {
          RNCComprador: encabezado?.Comprador?.RNCComprador,
          IdentificadorExtranjero:
            encabezado?.Comprador?.IdentificadorExtranjero,
          RazonSocialComprador: encabezado?.Comprador?.RazonSocialComprador,
        },
        Totales: {
          MontoGravadoTotal: encabezado?.Totales?.MontoGravadoTotal,
          MontoGravadoI1: encabezado?.Totales?.MontoGravadoI1,
          MontoGravadoI2: encabezado?.Totales?.MontoGravadoI2,
          MontoGravadoI3: encabezado?.Totales?.MontoGravadoI3,
          MontoExento: encabezado?.Totales?.MontoExento,
          TotalITBIS: encabezado?.Totales?.TotalITBIS,
          TotalITBIS1: encabezado?.Totales?.TotalITBIS1,
          TotalITBIS2: encabezado?.Totales?.TotalITBIS2,
          TotalITBIS3: encabezado?.Totales?.TotalITBIS3,
          MontoImpuestoAdicional: encabezado?.Totales?.MontoImpuestoAdicional,
          ImpuestosAdicionales: {
            ImpuestoAdicional: impuestos.map((impuesto) => ({
              TipoImpuesto: impuesto.TipoImpuesto,
              MontoImpuestoSelectivoConsumoEspecifico:
                impuesto.MontoImpuestoSelectivoConsumoEspecifico,
              MontoImpuestoSelectivoConsumoAdvalorem:
                impuesto.MontoImpuestoSelectivoConsumoAdvalorem,
              OtrosImpuestosAdicionales: impuesto.OtrosImpuestosAdicionales,
            })),
          },
          MontoTotal: encabezado?.Totales?.MontoTotal,
          MontoNoFacturable: encabezado?.Totales?.MontoNoFacturable,
          MontoPeriodo: encabezado?.Totales?.MontoPeriodo,
        },
        CodigoSeguridadeCF: securityCode.value,
      },
    },
  });

  if (typeof rfce !== 'object' || rfce === null) {
    return err(
      new DgiiError('Unable to build RFCE document', { code: 'VALIDATION' }),
    );
  }

  const xml = transformer.json2xml(rfce);
  if (xml.isErr()) {
    return err(xml.error);
  }

  return ok({ xml: xml.value, securityCode: securityCode.value });
};
