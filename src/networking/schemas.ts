import { Schema } from 'effect';
import {
  AuthToken,
  InquiryInvoiceSummary,
  InquiryStatusResponse,
  InvoiceResponse,
  InvoiceSummaryResponse,
  MaintenanceResponse,
  ServiceDirectoryResponse,
  ServiceStatusResponse,
  SummaryTrackingStatusResponse,
  TrackingStatusResponse,
  VerificationResponse,
} from './types';

export const AuthTokenSchema = Schema.Struct({
  token: Schema.String,
  expira: Schema.String,
  expedido: Schema.String,
});

export const InquiryInvoiceSummarySchema = Schema.Struct({
  rnc: Schema.String,
  encf: Schema.String,
  secuenciaUtilizada: Schema.Boolean,
  codigo: Schema.Number,
  estado: Schema.String,
  mensajes: Schema.optional(Schema.Array(Schema.Struct({
    valor: Schema.String,
    codigo: Schema.Number,
  }))),
});

export const InquiryStatusResponseSchema = Schema.Struct({
  codigo: Schema.Number,
  estado: Schema.String,
  rncEmisor: Schema.optional(Schema.String),
  ncfElectronico: Schema.optional(Schema.String),
  montoTotal: Schema.optional(Schema.Number),
  totalITBIS: Schema.optional(Schema.Number),
  fechaEmision: Schema.optional(Schema.String),
  fechaFirma: Schema.optional(Schema.String),
  rncComprador: Schema.optional(Schema.String),
  codigoSeguridad: Schema.optional(Schema.String),
  idExtranjero: Schema.optional(Schema.String),
});

export const InvoiceResponseSchema = Schema.Struct({
  trackId: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  mensajes: Schema.optional(Schema.Array(Schema.Struct({
    valor: Schema.String,
    codigo: Schema.Number,
  }))),
});

export const InvoiceSummaryResponseSchema = Schema.Struct({
  codigo: Schema.Number,
  estado: Schema.Union([
    Schema.Literal('Aceptado'),
    Schema.Literal('Rechazado'),
    Schema.Literal('Aceptado Condicional'),
  ]),
  mensajes: Schema.optional(Schema.Array(Schema.Struct({
    valor: Schema.String,
    codigo: Schema.Number,
  }))),
  encf: Schema.String,
  secuenciaUtilizada: Schema.Boolean,
});

export const MaintenanceResponseSchema = Schema.Struct({
  ventanaMantenimientos: Schema.Array(Schema.Struct({
    ambiente: Schema.String,
    horaInicio: Schema.String,
    horaFin: Schema.String,
    dias: Schema.Array(Schema.String),
  })),
});

export const ServiceDirectoryResponseSchema = Schema.Union([
  Schema.Array(Schema.Struct({
    nombre: Schema.String,
    rnc: Schema.String,
    urlAceptacion: Schema.String,
    urlOpcional: Schema.String,
    urlRecepcion: Schema.String,
  })),
  Schema.Struct({
    nombre: Schema.String,
    rnc: Schema.String,
    urlAceptacion: Schema.String,
    urlOpcional: Schema.String,
    urlRecepcion: Schema.String,
  }),
  Schema.Undefined,
]);

export const ServiceStatusResponseSchema = Schema.Array(Schema.Struct({
  servicio: Schema.String,
  estado: Schema.String,
  fecha: Schema.String,
  hora: Schema.String,
  descripcion: Schema.String,
}));

export const SummaryTrackingStatusResponseSchema = Schema.Struct({
  trackId: Schema.String,
  estado: Schema.String,
  fechaRecepcion: Schema.String,
});

export const TrackingStatusResponseSchema = Schema.Struct({
  trackId: Schema.String,
  codigo: Schema.Number,
  estado: Schema.String,
  rnc: Schema.String,
  encf: Schema.String,
  secuenciaUtilizada: Schema.Boolean,
  fechaRecepcion: Schema.String,
  mensajes: Schema.optional(Schema.Array(Schema.Struct({
    valor: Schema.String,
    codigo: Schema.Number,
  }))),
});

export const VerificationResponseSchema = Schema.Struct({
  estado: Schema.Union([
    Schema.Literal('Disponible'),
    Schema.Literal('No Disponible'),
  ]),
});
