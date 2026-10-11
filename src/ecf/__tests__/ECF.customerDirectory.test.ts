import { ENVIRONMENT } from '../../networking';
import { ServiceDirectoryResponse } from '../../networking/types';
import ECF from '../ECF';

const rnc = '131880681';
const directoryEntry: ServiceDirectoryResponse = {
  nombre: 'DGII',
  rnc,
  urlAceptacion: 'https://ecf.dgii.gov.do/testecf/emisorreceptor',
  urlOpcional: 'https://ecf.dgii.gov.do/Testecf/autenticacion',
  urlRecepcion: 'https://ecf.dgii.gov.do/testecf/emisorreceptor',
};

describe('ECF.getCustomerDirectory', () => {
  const credentials = { key: undefined, cert: undefined };

  // Inject the stub through the facade's fetch parameter (which routes via
  // the `Fetch` context reference), never via `globalThis.fetch` spies.
  const stubFor = (body: unknown): typeof globalThis.fetch =>
    (async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof globalThis.fetch;

  it('returns the array as-is when the service responds with an array', async () => {
    // DGII retired the bulk `listado` query, so DEV uses the per-RNC lookup too
    const ecf = new ECF(credentials, ENVIRONMENT.DEV);

    await expect(
      ecf.getCustomerDirectory(rnc, stubFor([directoryEntry]))
    ).resolves.toEqual([directoryEntry]);
  });

  it('wraps a single object response in an array (production eCF shape)', async () => {
    const ecf = new ECF(credentials, ENVIRONMENT.PROD);

    // The production directory service returns a single object; getCustomerDirectory
    // normalizes it to an array so consumers always get ServiceDirectoryResponse[].
    await expect(
      ecf.getCustomerDirectory(rnc, stubFor(directoryEntry))
    ).resolves.toEqual([directoryEntry]);
  });

  it('returns undefined when the service responds with no body', async () => {
    const ecf = new ECF(credentials, ENVIRONMENT.PROD);

    await expect(
      ecf.getCustomerDirectory(rnc, stubFor(null))
    ).resolves.toBeUndefined();
  });
});
