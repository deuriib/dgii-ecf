/**
 * Typed models for e-CF electronic invoice documents (compact JSON shape
 * compatible with `xml-js` and the Python transformer).
 *
 * Each XML text element can be represented either as a primitive scalar (e.g.
 * `'1.0'`, `1000.00`) or as an object carrying `_text` (`{ _text: '1.0' }`).
 */

export type XmlValue = string | number;

export type XmlText<T extends XmlValue = XmlValue> =
  | T
  | {
      _text?: T;
      _attributes?: Record<string, string>;
      [key: string]: unknown;
    };

export interface EcfFormaDePago {
  FormaPago: XmlText;
  MontoPago: XmlText;
}

export interface EcfTablaFormasPago {
  FormaDePago: EcfFormaDePago | EcfFormaDePago[];
}

export interface EcfIdDoc {
  TipoeCF: XmlText;
  eNCF: XmlText;
  FechaVencimientoSecuencia?: XmlText;
  IndicadorEnvioDiferido?: XmlText;
  IndicadorMontoGravado?: XmlText;
  IndicadorServicioTodoIncluido?: XmlText;
  TipoIngresos: XmlText;
  TipoPago: XmlText;
  FechaLimitePago?: XmlText;
  TerminoPago?: XmlText;
  TablaFormasPago?: EcfTablaFormasPago;
  TipoCuentaPago?: XmlText;
  NumeroCuentaPago?: XmlText;
  BancoPago?: XmlText;
  FechaDesde?: XmlText;
  FechaHasta?: XmlText;
  TotalPaginas?: XmlText;
}

export interface EcfTablaTelefonoEmisor {
  TelefonoEmisor: XmlText | XmlText[];
}

export interface EcfEmisor {
  RNCEmisor: XmlText;
  RazonSocialEmisor: XmlText;
  NombreComercial?: XmlText;
  Sucursal?: XmlText;
  DireccionEmisor: XmlText;
  Municipio?: XmlText;
  Provincia?: XmlText;
  TablaTelefonoEmisor?: EcfTablaTelefonoEmisor;
  CorreoEmisor?: XmlText;
  WebSite?: XmlText;
  ActividadEconomica?: XmlText;
  CodigoVendedor?: XmlText;
  NumeroFacturaInterna?: XmlText;
  NumeroPedidoInterno?: XmlText;
  ZonaVenta?: XmlText;
  RutaVenta?: XmlText;
  InformacionAdicionalEmisor?: XmlText;
  FechaEmision: XmlText;
}

export interface EcfComprador {
  RNCComprador?: XmlText;
  IdentificadorExtranjero?: XmlText;
  RazonSocialComprador?: XmlText;
  ContactoComprador?: XmlText;
  CorreoComprador?: XmlText;
  DireccionComprador?: XmlText;
  MunicipioComprador?: XmlText;
  ProvinciaComprador?: XmlText;
  FechaEntrega?: XmlText;
  ContactoEntrega?: XmlText;
  DireccionEntrega?: XmlText;
  TelefonoAdicional?: XmlText;
  FechaOrdenCompra?: XmlText;
  NumeroOrdenCompra?: XmlText;
  CodigoInternoComprador?: XmlText;
  ResponsablePago?: XmlText;
  InformacionAdicionalComprador?: XmlText;
}

export interface EcfInformacionesAdicionales {
  FechaEmbarque?: XmlText;
  NumeroEmbarque?: XmlText;
  NumeroContenedor?: XmlText;
  NumeroReferencia?: XmlText;
  PesoBruto?: XmlText;
  PesoNeto?: XmlText;
  UnidadPesoBruto?: XmlText;
  UnidadPesoNeto?: XmlText;
  CantidadBulto?: XmlText;
  UnidadBulto?: XmlText;
  VolumenBulto?: XmlText;
  UnidadVolumen?: XmlText;
}

export interface EcfTransporte {
  Conductor?: XmlText;
  DocumentoTransporte?: XmlText;
  Ficha?: XmlText;
  Placa?: XmlText;
  RutaTransporte?: XmlText;
  ZonaTransporte?: XmlText;
  NumeroAlbaran?: XmlText;
}

export interface EcfImpuestoAdicional {
  TipoImpuesto: XmlText;
  TasaImpuestoAdicional?: XmlText;
  MontoImpuestoSelectivoConsumoEspecifico?: XmlText;
  MontoImpuestoSelectivoConsumoAdvalorem?: XmlText;
  OtrosImpuestosAdicionales?: XmlText;
}

export interface EcfImpuestosAdicionales {
  ImpuestoAdicional: EcfImpuestoAdicional | EcfImpuestoAdicional[];
}

export interface EcfTotales {
  MontoGravadoTotal?: XmlText;
  MontoGravadoI1?: XmlText;
  MontoGravadoI2?: XmlText;
  MontoGravadoI3?: XmlText;
  MontoExento?: XmlText;
  ITBIS1?: XmlText;
  ITBIS2?: XmlText;
  ITBIS3?: XmlText;
  TotalITBIS?: XmlText;
  TotalITBIS1?: XmlText;
  TotalITBIS2?: XmlText;
  TotalITBIS3?: XmlText;
  MontoImpuestoAdicional?: XmlText;
  ImpuestosAdicionales?: EcfImpuestosAdicionales;
  MontoTotal: XmlText;
  MontoNoFacturable?: XmlText;
  MontoPeriodo?: XmlText;
  SaldoAnterior?: XmlText;
  MontoAvancePago?: XmlText;
  ValorPagar?: XmlText;
}

export interface EcfImpuestoAdicionalOtraMoneda {
  TipoImpuestoOtraMoneda: XmlText;
  TasaImpuestoAdicionalOtraMoneda?: XmlText;
  MontoImpuestoSelectivoConsumoEspecificoOtraMoneda?: XmlText;
  MontoImpuestoSelectivoConsumoAdvaloremOtraMoneda?: XmlText;
  OtrosImpuestosAdicionalesOtraMoneda?: XmlText;
}

export interface EcfImpuestosAdicionalesOtraMoneda {
  ImpuestoAdicionalOtraMoneda:
    EcfImpuestoAdicionalOtraMoneda | EcfImpuestoAdicionalOtraMoneda[];
}

export interface EcfOtraMoneda {
  TipoMoneda: XmlText;
  TipoCambio?: XmlText;
  MontoGravadoTotalOtraMoneda?: XmlText;
  MontoGravado1OtraMoneda?: XmlText;
  MontoGravado2OtraMoneda?: XmlText;
  MontoGravado3OtraMoneda?: XmlText;
  MontoExentoOtraMoneda?: XmlText;
  TotalITBISOtraMoneda?: XmlText;
  TotalITBIS1OtraMoneda?: XmlText;
  TotalITBIS2OtraMoneda?: XmlText;
  TotalITBIS3OtraMoneda?: XmlText;
  MontoImpuestoAdicionalOtraMoneda?: XmlText;
  ImpuestosAdicionalesOtraMoneda?: EcfImpuestosAdicionalesOtraMoneda;
  MontoTotalOtraMoneda?: XmlText;
}

export interface EcfEncabezado {
  Version: XmlText;
  IdDoc: EcfIdDoc;
  Emisor: EcfEmisor;
  Comprador: EcfComprador;
  InformacionesAdicionales?: EcfInformacionesAdicionales;
  Transporte?: EcfTransporte;
  Totales: EcfTotales;
  OtraMoneda?: EcfOtraMoneda;
}

export interface EcfCodigoItem {
  TipoCodigo: XmlText;
  CodigoItem: XmlText;
}

export interface EcfTablaCodigosItem {
  CodigosItem: EcfCodigoItem | EcfCodigoItem[];
}

export interface EcfSubcantidadItem {
  Subcantidad?: XmlText;
  CodigoSubcantidad?: XmlText;
}

export interface EcfTablaSubcantidad {
  SubcantidadItem: EcfSubcantidadItem | EcfSubcantidadItem[];
}

export interface EcfMineria {
  PesoNetoKilogramo?: XmlText;
  PesoNetoMineria?: XmlText;
  TipoAfiliacion?: XmlText;
  Liquidacion?: XmlText;
}

export interface EcfSubDescuento {
  TipoSubDescuento: XmlText;
  SubDescuentoPorcentaje?: XmlText;
  MontoSubDescuento?: XmlText;
}

export interface EcfTablaSubDescuento {
  SubDescuento: EcfSubDescuento | EcfSubDescuento[];
}

export interface EcfSubRecargo {
  TipoSubRecargo: XmlText;
  SubRecargoPorcentaje?: XmlText;
  MontoSubRecargo?: XmlText;
}

export interface EcfTablaSubRecargo {
  SubRecargo: EcfSubRecargo | EcfSubRecargo[];
}

export interface EcfTablaImpuestoAdicionalItem {
  ImpuestoAdicional:
    { TipoImpuesto: XmlText } | Array<{ TipoImpuesto: XmlText }>;
}

export interface EcfOtraMonedaDetalle {
  PrecioOtraMoneda?: XmlText;
  DescuentoOtraMoneda?: XmlText;
  RecargoOtraMoneda?: XmlText;
  MontoItemOtraMoneda?: XmlText;
}

export interface EcfItem {
  NumeroLinea: XmlText;
  TablaCodigosItem?: EcfTablaCodigosItem;
  IndicadorFacturacion: XmlText;
  NombreItem: XmlText;
  IndicadorBienoServicio: XmlText;
  DescripcionItem?: XmlText;
  CantidadItem: XmlText;
  UnidadMedida?: XmlText;
  CantidadReferencia?: XmlText;
  UnidadReferencia?: XmlText;
  TablaSubcantidad?: EcfTablaSubcantidad;
  GradosAlcohol?: XmlText;
  PrecioUnitarioReferencia?: XmlText;
  FechaElaboracion?: XmlText;
  FechaVencimientoItem?: XmlText;
  Mineria?: EcfMineria;
  PrecioUnitarioItem: XmlText;
  DescuentoMonto?: XmlText;
  TablaSubDescuento?: EcfTablaSubDescuento;
  RecargoMonto?: XmlText;
  TablaSubRecargo?: EcfTablaSubRecargo;
  TablaImpuestoAdicional?: EcfTablaImpuestoAdicionalItem;
  OtraMonedaDetalle?: EcfOtraMonedaDetalle;
  MontoItem: XmlText;
}

export interface EcfDetallesItems {
  Item: EcfItem | EcfItem[];
}

export interface EcfSubtotal {
  NumeroSubTotal?: XmlText;
  DescripcionSubtotal?: XmlText;
  Orden?: XmlText;
  SubTotalMontoGravadoTotal?: XmlText;
  SubTotalMontoGravadoI1?: XmlText;
  SubTotalMontoGravadoI2?: XmlText;
  SubTotalMontoGravadoI3?: XmlText;
  SubTotaITBIS?: XmlText;
  SubTotaITBIS1?: XmlText;
  SubTotaITBIS2?: XmlText;
  SubTotaITBIS3?: XmlText;
  SubTotalImpuestoAdicional?: XmlText;
  SubTotalExento?: XmlText;
  MontoSubTotal?: XmlText;
  Lineas?: XmlText;
}

export interface EcfSubtotales {
  Subtotal: EcfSubtotal | EcfSubtotal[];
}

export interface EcfDescuentoORecargo {
  NumeroLinea: XmlText;
  TipoAjuste: XmlText;
  IndicadorNorma1007?: XmlText;
  DescripcionDescuentooRecargo?: XmlText;
  TipoValor?: XmlText;
  ValorDescuentooRecargo?: XmlText;
  MontoDescuentooRecargo?: XmlText;
  MontoDescuentooRecargoOtraMoneda?: XmlText;
  IndicadorFacturacionDescuentooRecargo?: XmlText;
}

export interface EcfDescuentosORecargos {
  DescuentoORecargo: EcfDescuentoORecargo | EcfDescuentoORecargo[];
}

export interface EcfPagina {
  PaginaNo?: XmlText;
  NoLineaDesde?: XmlText;
  NoLineaHasta?: XmlText;
  SubtotalMontoGravadoPagina?: XmlText;
  SubtotalMontoGravado1Pagina?: XmlText;
  SubtotalMontoGravado2Pagina?: XmlText;
  SubtotalMontoGravado3Pagina?: XmlText;
  SubtotalExentoPagina?: XmlText;
  SubtotalItbisPagina?: XmlText;
  SubtotalItbis1Pagina?: XmlText;
  SubtotalItbis2Pagina?: XmlText;
  SubtotalItbis3Pagina?: XmlText;
  SubtotalImpuestoAdicionalPagina?: XmlText;
  MontoSubtotalPagina?: XmlText;
  SubtotalMontoNoFacturablePagina?: XmlText;
}

export interface EcfPaginacion {
  Pagina: EcfPagina | EcfPagina[];
}

export interface EcfInformacionReferencia {
  NCFModificado?: XmlText;
  RNCOtroContribuyente?: XmlText;
  FechaNCFModificado?: XmlText;
  CodigoModificacion?: XmlText;
}

export interface EcfDocument {
  Encabezado: EcfEncabezado;
  DetallesItems: EcfDetallesItems;
  Subtotales?: EcfSubtotales;
  DescuentosORecargos?: EcfDescuentosORecargos;
  Paginacion?: EcfPaginacion;
  InformacionReferencia?: EcfInformacionReferencia | EcfInformacionReferencia[];
  FechaHoraFirma?: XmlText;
  Signature?: Record<string, unknown>;
}

export interface EcfInvoice {
  ECF: EcfDocument;
}
