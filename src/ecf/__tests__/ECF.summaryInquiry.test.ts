import { ENVIRONMENT } from '../../networking';
import ECF from '../ECF';

describe('ECF.getSummaryInvoiceInquiry', () => {
  const credentials = { key: undefined, cert: undefined };

  it('requests the RFCE inquiry without a double slash in the path', async () => {
    // fc.dgii.gov.do answers `/eCF//consultarfce/...` with a malformed response
    const params = {
      rnc_emisor: '131880681',
      encf: 'E320000000001',
      cod_seguridad_eCF: 'ABC123',
    };
    const seenUrls: Array<string> = [];
    const stub = (async (input: unknown) => {
      seenUrls.push(String(input));
      return new Response(JSON.stringify({ encf: params.encf }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    const ecf = new ECF(credentials, ENVIRONMENT.PROD);

    await expect(
      ecf.getSummaryInvoiceInquiry(
        params.rnc_emisor,
        params.encf,
        params.cod_seguridad_eCF,
        stub
      )
    ).resolves.toEqual({ encf: params.encf });
    expect(seenUrls).toHaveLength(1);
    expect(seenUrls[0]).not.toContain('//consultarfce');
  });
});
