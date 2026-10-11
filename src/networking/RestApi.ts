import { ENVIRONMENT } from '../networking';
import { Effect } from 'effect';
import { HttpClient } from 'effect/http';
import type { HttpClientError } from 'effect/http';
import {
  getRequest,
  readJsonBody,
  requireOkStatus,
  runDgiiRequest,
  withBearerToken,
  xmlUploadRequest,
} from './transport';
import type { DgiiError } from './errors';
import { BaseUrl } from './restClient';
import {
  TrackingStatusResponse,
  AuthToken,
  InvoiceResponse,
  ServiceDirectoryResponse,
  SummaryTrackingStatusResponse,
  InvoiceSummaryResponse,
  InquiryStatusResponse,
  InquiryInvoiceSummary,
  Opperation,
  StatusOperation,
  ServiceStatusResponse,
  MaintenanceResponse,
  VerificationResponse,
} from './types';
export enum ENDPOINTS {
  SEED = 'Autenticacion/api/Autenticacion/Semilla',
  VALIDATE_SEED = 'autenticacion/api/Autenticacion/ValidarSemilla',
  SEND_INVOICE = 'recepcion/api/FacturasElectronicas',
  SEND_SUMMARY = 'recepcionfc/api/recepcion/ecf', //use with the https:fc.dgii... domain
  INQUIRY_INVOICE_SUMMARY = 'consultarfce/api/Consultas/Consulta', //Only works on PROD environment https://fc.dgii.gov.do/ecf/consultarfce/help/index.html
  COMMERCIAL_APPROVAL = 'aprobacionComercial/api/AprobacionComercial', //https://ecf.dgii.gov.do/testecf/aprobacioncomercial/help/index.html
  TRACK_RESULT_STATUS = 'consultaresultado/api/Consultas/Estado',
  INQUIRY_STATUS = 'consultaestado/api/Consultas/Estado', //https://ecf.dgii.gov.do/testecf/consultaestado/help/index.html
  ALL_TACKING_ECF = 'ConsultaTrackIds/api/TrackIds/Consulta', //https://ecf.dgii.gov.do/testecf/consultatrackids/help/index.html
  // DGII retired the bulk `listado` query in Sep 2026; only the per-RNC
  // lookup remains, in every environment.
  DIRECTORY = 'consultadirectorio/api/consultas/obtenerdirectorioporrnc',
  VOID = 'anulacionrangos/api/operaciones/anularrango',
  SERVICE_STATUS = 'api/estatusservicios/obtenerestatus', //Require API KEY
  SERVICE_MAINTENANCE = 'api/estatusservicios/obtenerventanamantenimiento', //Require API KEY
  SERVICE_VERIFICATION = 'api/estatusservicios/verificarconexion', //Require API KEY
}

export enum ENDPOINTS_SENDER_RECEIVER {
  SEED = 'recepcion/api/semilla',
  VALIDATE_SEED = 'recepcion/api/validarsemilla',
  SEND_INVOICE = 'recepcion/api/facturaselectronicas',
}

type QueryParams = Record<string, string | number | undefined>;

/**
 * Effect-native DGII transport.
 *
 * Every public member returns `Effect<unknown, DgiiError,
 * HttpClient.HttpClient>` so the full error context (status, resource,
 * typed `_tag`) survives into the error channel. The Promise-preserving
 * `ECF` facade runs these through `runDgiiRequest`; in PR-6 the facade
 * goes away and consumers consume the Effect directly.
 *
 * Auth is per-instance: the constructor holds the bearer token and every
 * request attaches it via `withBearerToken`. Nothing writes to a shared
 * axios singleton anymore (closes CRITICAL-1).
 */
class RestApi {
  private env: ENVIRONMENT = ENVIRONMENT.DEV;
  private accessToken?: string;

  constructor(env: ENVIRONMENT, accessToken?: string) {
    this.env = env;
    this.accessToken = accessToken;
  }

  /** Environment this instance talks to; the facade reuses it on re-auth. */
  get environment(): ENVIRONMENT {
    return this.env;
  }

  private get baseApi() {
    return `/${this.env}`;
  }

  private getResource(endpoint: ENDPOINTS) {
    return `${this.baseApi}/${endpoint}`;
  }

  private getBuyerResource(endpoint: ENDPOINTS_SENDER_RECEIVER) {
    return `/${endpoint}`;
  }

  private withAuth(
    url: string,
    buyerToken?: string
  ): {
    url: string;
    token?: string;
  } {
    return { url, token: buyerToken ?? this.accessToken };
  }

  /**
   * Run a GET request against the Effect client and decode the JSON body.
   */
  private getJson<T>(
    url: string,
    params?: QueryParams,
    token?: string,
    baseURL: string = BaseUrl.ECF
  ): Effect.Effect<
    T,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > {
    return Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const target = `${baseURL}${url}`;
      let request = getRequest(target, params);
      if (token !== undefined) {
        request = withBearerToken(request, token);
      }
      const response = yield* client.execute(request);
      yield* requireOkStatus(response, request);
      return (yield* readJsonBody(response)) as T;
    });
  }

  /**
   * Run a multipart XML upload against the Effect client and decode the
   * JSON body.
   */
  private postXml<T>(
    url: string,
    xml: string,
    fileName: string,
    token?: string,
    baseURL: string = BaseUrl.ECF
  ): Effect.Effect<
    T,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > {
    return Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const target = `${baseURL}${url}`;
      let request = xmlUploadRequest(target, xml, fileName);
      if (token !== undefined) {
        request = withBearerToken(request, token);
      }
      const response = yield* client.execute(request);
      yield* requireOkStatus(response, request);
      return (yield* readJsonBody(response)) as T;
    });
  }

  /**
   * Get an initial XML payload called seed, should be signed using the certificate .p12
   * @param buyerHost optional - If buyerHost is defined the authentication will be againt the buyer HOST to stablish the communication Sender<->Receiver
   * @returns
   */
  getSeedApi = (
    buyerHost?: string
  ): Effect.Effect<
    string,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > => {
    //If buyerHost is defined the authentication will be againt the buyer HOST to stablish the communication Sender<->Receiver
    const resource = buyerHost
      ? this.getBuyerResource(ENDPOINTS_SENDER_RECEIVER.SEED)
      : this.getResource(ENDPOINTS.SEED);
    const baseURL = buyerHost ?? BaseUrl.ECF;

    return Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const response = yield* client.execute(
        getRequest(`${baseURL}${resource}`)
      );
      yield* requireOkStatus(response, getRequest(`${baseURL}${resource}`));
      const text = yield* Effect.mapError(
        response.text,
        (): DgiiError => ({
          _tag: 'SerializationError',
          message: 'DGII seed response is not readable text',
        })
      );
      return text;
    });
  };
  /**
   * Return the token from a signed seed
   * @param signedSeed the seed should be signed in order to get the token
   * @param buyerHost optional - If buyerHost is defined the authentication will be againt the buyer HOST to stablish the communication Sender<->Receiver
   * @returns promise with the access token
   */

  getAuthTokenApi = (
    signedSeed: string,
    buyerHost?: string
  ): Effect.Effect<
    AuthToken,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > => {
    const resource = buyerHost
      ? this.getBuyerResource(ENDPOINTS_SENDER_RECEIVER.VALIDATE_SEED)
      : this.getResource(ENDPOINTS.VALIDATE_SEED);
    const baseURL = buyerHost ?? BaseUrl.ECF;

    return this.postXml<AuthToken>(
      resource,
      signedSeed,
      'signed.xml',
      undefined,
      baseURL
    );
  };

  /**
   * Send the signed invoice to DGII
   * @param signedXml XML signed invoice
   * @param fileName the composition of the file name should be RNC+e-NCF.xml example: “101672919E3100000001.xml”
   * @param buyerHost optional - If buyerHost is defined the authentication will be againt the buyer HOST to stablish the communication Sender<->Receiver
   * @returns
   */
  sendElectronicDocumentApi = <T = InvoiceResponse>(
    signedInvoice: string,
    fileName: string,
    buyerHost?: string
  ): Effect.Effect<
    T,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > => {
    const { url, token } = this.withAuth(
      buyerHost
        ? this.getBuyerResource(ENDPOINTS_SENDER_RECEIVER.SEND_INVOICE)
        : this.getResource(ENDPOINTS.SEND_INVOICE),
      undefined
    );
    const baseURL = buyerHost ?? BaseUrl.ECF;

    return this.postXml<T>(url, signedInvoice, fileName, token, baseURL);
  };

  /**
   * Sign any XML document and perform the opperation like void document, receipt, commercial approval
   * @param signedDocument
   * @param fileName
   * @param opperation Opperation Enum
   * @returns
   */

  sendSignedDocumentApi = <T>(
    signedDocument: string,
    fileName: string,
    opperation: Opperation
  ): Effect.Effect<
    T,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > => {
    let resource = '';
    switch (opperation) {
      case Opperation.VOID_DOCUMENT:
        resource = this.getResource(ENDPOINTS.VOID);
        break;
      case Opperation.COMMERCIAL_APPROVAL:
        resource = this.getResource(ENDPOINTS.COMMERCIAL_APPROVAL);
        break;
      default:
        return Effect.fail({
          _tag: 'ValidationError',
          message: `Unknown opperation: ${String(opperation)}`,
          field: 'opperation',
          expected: 'VOID_DOCUMENT | COMMERCIAL_APPROVAL',
          received: opperation,
        } satisfies DgiiError);
    }
    const { url, token } = this.withAuth(resource);

    return this.postXml<T>(url, signedDocument, fileName, token);
  };

  /**
   * Send the signed summary invoice to DGII (Factura de consumo)
   * @param signedXml XML signed invoice
   * @param fileName the composition of the file name should be RNC+e-NCF.xml example: “101672919E3100000001.xml”
   * @returns
   */
  sendSummaryApi = (
    signedInvoice: string,
    fileName: string
  ): Effect.Effect<
    InvoiceSummaryResponse,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > => {
    const { url, token } = this.withAuth(
      this.getResource(ENDPOINTS.SEND_SUMMARY)
    );

    return this.postXml<InvoiceSummaryResponse>(
      url,
      signedInvoice,
      fileName,
      token,
      BaseUrl.CF
    );
  };

  /**
   * Get the status using the track id generated after send a new invoice or other document
   * @param trackId string
   * @returns promise with the tracking status
   */

  statusTrackIdApi = (
    trackId: string
  ): Effect.Effect<
    TrackingStatusResponse,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > => {
    const { url, token } = this.withAuth(
      this.getResource(ENDPOINTS.TRACK_RESULT_STATUS)
    );

    return this.getJson<TrackingStatusResponse>(url, { trackId }, token);
  };
  /**
   * Consulta de estado e‐CF (CONSUMO Y CRÉDITO FISCAL)
   *Servicio web responsable de responder la validez o estado de un e‐CF a un receptor o
   incluso a un emisor, a través de la presentación del RNC emisor, e‐NCF y dos campos
   condicionales a la vigencia del comprobante, RNC Comprador y el código de seguridad.

   * @param rncEmisor
   * @param ncfElectronico
   * @param rncComprador optional solo factura de consumo
   * @param codigoSeguridad  CONSUMO: 6 digitos asignado en el resumen. CREDITO FISCAL >>> codigoSeguridad: extraído de los primeros seis (6) dígitos del
   * hash generado en el SignatureValue de la firma digital del e-CFrecibido. Factura de credito fiscal
   * @returns
   */
  inquiryStatusApi = (
    rncEmisor: string,
    ncfElectronico: string,
    rncComprador?: string,
    codigoSeguridad?: string
  ): Effect.Effect<
    InquiryStatusResponse,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > => {
    const { url, token } = this.withAuth(
      this.getResource(ENDPOINTS.INQUIRY_STATUS)
    );

    return this.getJson<InquiryStatusResponse>(
      url,
      { rncEmisor, ncfElectronico, rncComprador, codigoSeguridad },
      token
    );
  };

  /**
   * Return all the tracking associated with a NCF
   * @param rncEmisor Receiver RNC
   * @param encf electronic NCF
   * @returns
   */
  getAllTrackingncfApi = (
    rncEmisor: string,
    encf: string
  ): Effect.Effect<
    SummaryTrackingStatusResponse[],
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > => {
    const { url, token } = this.withAuth(
      this.getResource(ENDPOINTS.ALL_TACKING_ECF)
    );

    return this.getJson<SummaryTrackingStatusResponse[]>(
      url,
      { rncEmisor, encf },
      token
    );
  };

  /**
   * Return the URLs for the customer if the customer is authorize to receive and approve electronic eCF
   *
   * The DGII directory service is inconsistent about the response shape: some
   * environments/records return an array of directory entries while others return a
   * single directory entry object (see PR #24). To keep the contract stable for every
   * consumer, the response is normalized here so this method always resolves to an
   * array (or `undefined` when the service returns no body).
   *
   * @param rnc
   * @returns Promise ServiceDirectory array of URL
   */
  getCustomerDirectoryApi = (
    rnc: string
  ): Effect.Effect<
    ServiceDirectoryResponse[] | undefined,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > => {
    const { url, token } = this.withAuth(this.getResource(ENDPOINTS.DIRECTORY));

    return Effect.gen(function* () {
      const data = (yield* Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const target = `${BaseUrl.ECF}${url}`;
        let request = getRequest(target, { rnc });
        if (token !== undefined) {
          request = withBearerToken(request, token);
        }
        const response = yield* client.execute(request);
        yield* requireOkStatus(response, request);
        return yield* readJsonBody(response);
      })) as
        | ServiceDirectoryResponse[]
        | ServiceDirectoryResponse
        | undefined
        | null;

      if (data == null) {
        return undefined;
      }

      // Normalize the inconsistent DGII response: wrap a single entry in an array so
      // callers always receive ServiceDirectoryResponse[].
      return Array.isArray(data) ? data : [data];
    });
  };

  /**
   * Consulta de Resumen de Factura (RFCE)
   * Servicio web responsable de responder la validez o estado de un ENCF a un receptor o
   * incluso a un emisor, a través de la presentación del RNC emisor, e‐NCF y el código de seguridad.
   * >>>>>>>>>>>>>> ONLY AVAILABLE ON PRODUCTION ENVIRONEMNT <<<<<<<<<<<<<<<
   * @param rnc_emisor
   * @param encf
   * @param cod_seguridad_eCF CONSUMO: 6 digitos asignado en el resumen.
   * @returns
   */
  getSummaryInvoiceInquiryApi = (
    rnc_emisor: string,
    encf: string,
    cod_seguridad_eCF: string
  ): Effect.Effect<
    InquiryInvoiceSummary,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > => {
    const { url, token } = this.withAuth(
      this.getResource(ENDPOINTS.INQUIRY_INVOICE_SUMMARY)
    );

    return this.getJson<InquiryInvoiceSummary>(
      url,
      { rnc_emisor, encf, cod_seguridad_eCF },
      token,
      BaseUrl.CF
    );
  };

  /**
   * This method combine 3 different endpoint to get the status of the service
   * In order to consume it need the API key given by the DGII
   * @param statusOperation
   * @param apiKey
   * @returns
   */
  dgiiCloudServicesStatusApi = <
    T = ServiceStatusResponse | MaintenanceResponse | VerificationResponse
  >(
    statusOperation: StatusOperation,
    apiKey: string
  ): Effect.Effect<
    T | undefined,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  > => {
    let resource = '';
    let params: QueryParams = {};
    switch (statusOperation) {
      case StatusOperation.SERVICES_STATUS:
        resource = this.getResource(ENDPOINTS.SERVICE_STATUS);
        break;
      case StatusOperation.SERVICE_MAINTENANCE_WINDOW:
        resource = this.getResource(ENDPOINTS.SERVICE_MAINTENANCE);
        break;
      case StatusOperation.SERVICE_VERIFICATION:
        resource = this.getResource(ENDPOINTS.SERVICE_VERIFICATION);
        const currentEnv = {
          [ENVIRONMENT.DEV]: 1,
          [ENVIRONMENT.PROD]: 2,
          [ENVIRONMENT.CERT]: 3,
        };

        params = { ambiente: currentEnv[this.env] };

        break;
      default:
        return Effect.fail({
          _tag: 'ValidationError',
          message: `Unknown status operation: ${String(statusOperation)}`,
          field: 'statusOperation',
          expected:
            'SERVICES_STATUS | SERVICE_MAINTENANCE_WINDOW | SERVICE_VERIFICATION',
          received: statusOperation,
        } satisfies DgiiError);
    }

    const url = `${BaseUrl.STATUS}${resource}`;

    return Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      let request = getRequest(url, params);
      // Cloud status endpoints use the DGII API key, not the bearer token.
      request = withBearerToken(request, apiKey);
      const response = yield* client.execute(request);
      yield* requireOkStatus(response, request);
      return (yield* readJsonBody(response)) as T | undefined;
    });
  };
}

export default RestApi;
export { runDgiiRequest };
