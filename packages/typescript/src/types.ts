export interface Mensaje {
  valor: string;
  codigo: number;
}

export interface AuthToken {
  token: string;
  expira: string;
  expedido: string;
}

export enum TrackStatusEnum {
  NotFound = 'No encontrado',
  Accepted = 'Aceptado',
  Rejected = 'Rechazado',
  InProcess = 'En Proceso',
  ConditionalAccepted = 'Aceptado Condicional',
}

export type TrackStatusCode = 0 | 1 | 2 | 3 | 4;

export interface TrackingStatusResponse {
  trackId: string;
  codigo: TrackStatusCode;
  estado: TrackStatusEnum;
  rnc: string;
  encf: string;
  secuenciaUtilizada: boolean;
  fechaRecepcion: string;
  mensajes?: Mensaje[];
}

export type InquiryStatusCode = 0 | 1 | 2;

export type InquiryStatus = 'No encontrado' | 'Aceptado' | 'Rechazado';

export interface InquiryStatusResponse {
  codigo: InquiryStatusCode;
  estado: InquiryStatus;
  rncEmisor?: string;
  ncfElectronico?: string;
  montoTotal?: number;
  totalITBIS?: number;
  fechaEmision?: string;
  fechaFirma?: string;
  rncComprador?: string;
  codigoSeguridad?: string;
  idExtranjero?: string;
}

export interface SummaryTrackingStatusResponse {
  trackId: string;
  estado: string;
  fechaRecepcion: string;
}

export interface InvoiceResponse {
  trackId?: string;
  error?: string;
  mensajes?: Mensaje[];
}

export interface InvoiceSummaryResponse {
  codigo: number;
  estado: 'Aceptado' | 'Rechazado' | 'Aceptado Condicional';
  mensajes?: Mensaje[];
  encf: string;
  secuenciaUtilizada: boolean;
}

export interface ServiceDirectoryResponse {
  nombre: string;
  rnc: string;
  urlRecepcion: string;
  urlAceptacion: string;
  urlOpcional: string;
}

export interface InquiryInvoiceSummary {
  rnc: string;
  encf: string;
  secuenciaUtilizada: boolean;
  codigo: InquiryStatusCode;
  estado: InquiryStatus;
  mensajes?: Mensaje[];
}

export interface CommercialApprovalResponse {
  codigo: '01' | '02';
  estado: 'Aprobación Comercial Aprobada.' | 'Aprobacion Comercial Rechazada.';
  mensaje: string[];
}

export interface VoidNCFResponse {
  rnc: string;
  codigo: string;
  nombre: string;
  mensajes: string[];
}
