import { describe, expect, it } from 'vitest';
import { toDgiiError } from '../src/errors.js';

describe('toDgiiError', () => {
  it('preserves an alphanumeric message code', () => {
    const error = toDgiiError({
      mensajes: [{ codigo: 'A01', valor: 'Firma digital invalida' }],
    });

    expect(error.mensajes?.[0]?.codigo).toBe('A01');
  });

  it('preserves a numeric message code', () => {
    const error = toDgiiError({
      mensajes: [{ codigo: 7, valor: 'Observacion' }],
    });

    expect(error.mensajes?.[0]?.codigo).toBe(7);
  });
});
