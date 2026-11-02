import { describe, expect, it } from 'vitest';
import {
  SUMMARY_ACCEPTED,
  SUMMARY_CONDITIONAL_ACCEPTED,
  SUMMARY_REJECTED,
  type InquiryStatus,
  type InvoiceSummaryResponse,
  type VoidNCFResponse,
} from '../src/types.js';

describe('response contracts', () => {
  it('accepts conditional acceptance in the eNCF inquiry', () => {
    const estado: InquiryStatus = 'Aceptado Condicional';
    expect(estado).toBe('Aceptado Condicional');
  });

  it('exposes the documented RFCE reception states', () => {
    expect(SUMMARY_ACCEPTED).toBe('Aceptado');
    expect(SUMMARY_CONDITIONAL_ACCEPTED).toBe('Aceptado condicional');
    expect(SUMMARY_REJECTED).toBe('Rechazado');

    const response: InvoiceSummaryResponse = {
      codigo: 1,
      estado: SUMMARY_CONDITIONAL_ACCEPTED,
      encf: 'E320000000001',
      secuenciaUtilizada: true,
    };
    expect(response.estado).toBe('Aceptado condicional');
  });

  it('models void messages as objects', () => {
    const response: VoidNCFResponse = {
      rnc: '130862346',
      codigo: '1',
      nombre: 'Deuri',
      mensajes: [{ codigo: 0, valor: 'Las secuencias fueron anuladas' }],
    };

    expect(response.mensajes[0]?.valor).toBe('Las secuencias fueron anuladas');
  });
});
