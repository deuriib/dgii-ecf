export enum Environment {
  /** DGII test environment */
  Dev = 'TesteCF',
  /** DGII certification environment */
  Cert = 'CerteCF',
  /** DGII production environment */
  Prod = 'eCF',
}

export const BaseUrl = {
  /** Crédito fiscal / general e-CF services */
  ECF: 'https://ecf.dgii.gov.do',
  /** Factura de consumo (< DOP 250,000) */
  CF: 'https://fc.dgii.gov.do',
  /** DGII service status */
  STATUS: 'https://statusecf.dgii.gov.do',
} as const;

export type BaseUrlKey = keyof typeof BaseUrl;

export enum Endpoint {
  Seed = 'Autenticacion/api/Autenticacion/Semilla',
  ValidateSeed = 'autenticacion/api/Autenticacion/ValidarSemilla',
  SendInvoice = 'recepcion/api/FacturasElectronicas',
  SendSummary = 'recepcionfc/api/recepcion/ecf',
  InquiryInvoiceSummary = 'consultarfce/api/Consultas/Consulta',
  CommercialApproval = 'aprobacionComercial/api/AprobacionComercial',
  TrackResultStatus = 'consultaresultado/api/Consultas/Estado',
  InquiryStatus = 'consultaestado/api/Consultas/Estado',
  AllTrackingEcf = 'ConsultaTrackIds/api/TrackIds/Consulta',
  Directory = 'consultadirectorio/api/consultas/obtenerdirectorioporrnc',
  DirectoryList = 'consultadirectorio/api/consultas/listado',
  Void = 'anulacionrangos/api/operaciones/anularrango',
}

/** Endpoints used when talking to a buyer's Sender↔Receiver host. */
export enum SenderReceiverEndpoint {
  Seed = 'fe/autenticacion/api/semilla',
  ValidateSeed = 'fe/autenticacion/api/validacioncertificado',
  SendInvoice = 'fe/recepcion/api/ecf',
  CommercialApproval = 'fe/aprobacioncomercial/api/ecf',
}

/** Service-status endpoints. They carry no environment segment. */
export enum StatusEndpoint {
  Services = 'api/estatusservicios/obtenerestatus',
  MaintenanceWindows = 'api/estatusservicios/obtenerventanasmantenimiento',
  Check = 'api/estatusservicios/verificarestado',
}

/** Numeric `ambiente` codes accepted by the status service. */
export enum StatusEnvironment {
  PreCertification = 1,
  Production = 2,
  Certification = 3,
}

/** Build an absolute status-service URL (no environment segment). */
export const buildStatusUrl = (
  endpoint: StatusEndpoint,
  baseUrl: string = BaseUrl.STATUS,
): string => `${baseUrl.replace(/\/+$/, '')}/${endpoint}`;

/** Build an absolute DGII URL: `${baseUrl}/${environment}/${endpoint}`. */
export const buildUrl = (
  environment: Environment,
  endpoint: Endpoint,
  baseUrl: string = BaseUrl.ECF,
): string => `${baseUrl.replace(/\/+$/, '')}/${environment}/${endpoint}`;

/** Build an absolute Sender↔Receiver URL against a buyer host. */
export const buildSenderReceiverUrl = (
  host: string,
  endpoint: SenderReceiverEndpoint,
): string => `${host.replace(/\/+$/, '')}/${endpoint}`;
