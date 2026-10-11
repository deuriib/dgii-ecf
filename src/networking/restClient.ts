import axios, { isAxiosError } from 'axios';
import https from 'https';
import { toDgiiApiError } from './DgiiApiError';

export enum ENVIRONMENT {
  DEV = 'TesteCF',
  CERT = 'CerteCF',
  PROD = 'eCF',
}

export enum BaseUrl {
  ECF = 'https://ecf.dgii.gov.do', //Crédito fiscal
  CF = 'https://fc.dgii.gov.do', //Factura de consumo < 250K
  STATUS = 'https://statusecf.dgii.gov.do', //status
}

export const restClient = axios.create({
  baseURL: BaseUrl.ECF,
  httpsAgent: new https.Agent({
    keepAlive: true,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    ciphers: [
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'DHE-RSA-AES128-GCM-SHA256',
      'DHE-RSA-AES256-GCM-SHA384',
    ].join(':'),
    honorCipherOrder: true,
  }),
});

const HTTP_STATUS_FALLBACKS: Record<number, string> = {
  401: 'ERROR 401: Unauthorized, please check your credentials',
  429: 'ERROR 429: Too many requests, please retry later',
  500: 'ERROR 500: DGII internal server error',
  502: 'ERROR 502: Bad gateway from DGII',
  503: 'ERROR 503: DGII service unavailable',
  504: 'ERROR 504: DGII gateway timeout',
};

restClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Every axios failure goes through the normalization chokepoint so the
    // SDK only ever surfaces `DgiiApiError` (never a raw AxiosError). DGII
    // explains many rejections in the body; keep that description instead of
    // a generic status message.
    if (isAxiosError(error)) {
      const status = error.response?.status;
      throw toDgiiApiError(error, {
        fallbackMessage:
          (status !== undefined && HTTP_STATUS_FALLBACKS[status]) ||
          'DGII network request failed',
      });
    }
    // Non-axios failures (programming errors, aborts) pass through unchanged.
    throw error;
  }
);

export const setAuthToken = (token: string) => {
  restClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export default restClient;
