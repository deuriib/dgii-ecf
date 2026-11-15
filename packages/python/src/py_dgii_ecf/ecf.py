"""Typed models for e-CF electronic invoice documents.

Compact JSON shape compatible with ``xml-js`` and the DGII schema structure.
"""

from __future__ import annotations

from typing import TypedDict

XmlValue = str | int | float
XmlText = XmlValue | dict[str, object]


class EcfFormaDePago(TypedDict, total=False):
    FormaPago: XmlText
    MontoPago: XmlText


class EcfTablaFormasPago(TypedDict, total=False):
    FormaDePago: EcfFormaDePago | list[EcfFormaDePago]


class EcfIdDoc(TypedDict, total=False):
    TipoeCF: XmlText
    eNCF: XmlText
    FechaVencimientoSecuencia: XmlText
    IndicadorEnvioDiferido: XmlText
    IndicadorMontoGravado: XmlText
    IndicadorServicioTodoIncluido: XmlText
    TipoIngresos: XmlText
    TipoPago: XmlText
    FechaLimitePago: XmlText
    TerminoPago: XmlText
    TablaFormasPago: EcfTablaFormasPago
    TipoCuentaPago: XmlText
    NumeroCuentaPago: XmlText
    BancoPago: XmlText
    FechaDesde: XmlText
    FechaHasta: XmlText
    TotalPaginas: XmlText


class EcfTablaTelefonoEmisor(TypedDict, total=False):
    TelefonoEmisor: XmlText | list[XmlText]


class EcfEmisor(TypedDict, total=False):
    RNCEmisor: XmlText
    RazonSocialEmisor: XmlText
    NombreComercial: XmlText
    Sucursal: XmlText
    DireccionEmisor: XmlText
    Municipio: XmlText
    Provincia: XmlText
    TablaTelefonoEmisor: EcfTablaTelefonoEmisor
    CorreoEmisor: XmlText
    WebSite: XmlText
    ActividadEconomica: XmlText
    CodigoVendedor: XmlText
    NumeroFacturaInterna: XmlText
    NumeroPedidoInterno: XmlText
    ZonaVenta: XmlText
    RutaVenta: XmlText
    InformacionAdicionalEmisor: XmlText
    FechaEmision: XmlText


class EcfComprador(TypedDict, total=False):
    RNCComprador: XmlText
    IdentificadorExtranjero: XmlText
    RazonSocialComprador: XmlText
    ContactoComprador: XmlText
    CorreoComprador: XmlText
    DireccionComprador: XmlText
    MunicipioComprador: XmlText
    ProvinciaComprador: XmlText
    FechaEntrega: XmlText
    ContactoEntrega: XmlText
    DireccionEntrega: XmlText
    TelefonoAdicional: XmlText
    FechaOrdenCompra: XmlText
    NumeroOrdenCompra: XmlText
    CodigoInternoComprador: XmlText
    ResponsablePago: XmlText
    InformacionAdicionalComprador: XmlText


class EcfInformacionesAdicionales(TypedDict, total=False):
    FechaEmbarque: XmlText
    NumeroEmbarque: XmlText
    NumeroContenedor: XmlText
    NumeroReferencia: XmlText
    PesoBruto: XmlText
    PesoNeto: XmlText
    UnidadPesoBruto: XmlText
    UnidadPesoNeto: XmlText
    CantidadBulto: XmlText
    UnidadBulto: XmlText
    VolumenBulto: XmlText
    UnidadVolumen: XmlText


class EcfTransporte(TypedDict, total=False):
    Conductor: XmlText
    DocumentoTransporte: XmlText
    Ficha: XmlText
    Placa: XmlText
    RutaTransporte: XmlText
    ZonaTransporte: XmlText
    NumeroAlbaran: XmlText


class EcfImpuestoAdicional(TypedDict, total=False):
    TipoImpuesto: XmlText
    TasaImpuestoAdicional: XmlText
    MontoImpuestoSelectivoConsumoEspecifico: XmlText
    MontoImpuestoSelectivoConsumoAdvalorem: XmlText
    OtrosImpuestosAdicionales: XmlText


class EcfImpuestosAdicionales(TypedDict, total=False):
    ImpuestoAdicional: EcfImpuestoAdicional | list[EcfImpuestoAdicional]


class EcfTotales(TypedDict, total=False):
    MontoGravadoTotal: XmlText
    MontoGravadoI1: XmlText
    MontoGravadoI2: XmlText
    MontoGravadoI3: XmlText
    MontoExento: XmlText
    ITBIS1: XmlText
    ITBIS2: XmlText
    ITBIS3: XmlText
    TotalITBIS: XmlText
    TotalITBIS1: XmlText
    TotalITBIS2: XmlText
    TotalITBIS3: XmlText
    MontoImpuestoAdicional: XmlText
    ImpuestosAdicionales: EcfImpuestosAdicionales
    MontoTotal: XmlText
    MontoNoFacturable: XmlText
    MontoPeriodo: XmlText
    SaldoAnterior: XmlText
    MontoAvancePago: XmlText
    ValorPagar: XmlText


class EcfImpuestoAdicionalOtraMoneda(TypedDict, total=False):
    TipoImpuestoOtraMoneda: XmlText
    TasaImpuestoAdicionalOtraMoneda: XmlText
    MontoImpuestoSelectivoConsumoEspecificoOtraMoneda: XmlText
    MontoImpuestoSelectivoConsumoAdvaloremOtraMoneda: XmlText
    OtrosImpuestosAdicionalesOtraMoneda: XmlText


class EcfImpuestosAdicionalesOtraMoneda(TypedDict, total=False):
    ImpuestoAdicionalOtraMoneda: (
        EcfImpuestoAdicionalOtraMoneda | list[EcfImpuestoAdicionalOtraMoneda]
    )


class EcfOtraMoneda(TypedDict, total=False):
    TipoMoneda: XmlText
    TipoCambio: XmlText
    MontoGravadoTotalOtraMoneda: XmlText
    MontoGravado1OtraMoneda: XmlText
    MontoGravado2OtraMoneda: XmlText
    MontoGravado3OtraMoneda: XmlText
    MontoExentoOtraMoneda: XmlText
    TotalITBISOtraMoneda: XmlText
    TotalITBIS1OtraMoneda: XmlText
    TotalITBIS2OtraMoneda: XmlText
    TotalITBIS3OtraMoneda: XmlText
    MontoImpuestoAdicionalOtraMoneda: XmlText
    ImpuestosAdicionalesOtraMoneda: EcfImpuestosAdicionalesOtraMoneda
    MontoTotalOtraMoneda: XmlText


class EcfEncabezado(TypedDict, total=False):
    Version: XmlText
    IdDoc: EcfIdDoc
    Emisor: EcfEmisor
    Comprador: EcfComprador
    InformacionesAdicionales: EcfInformacionesAdicionales
    Transporte: EcfTransporte
    Totales: EcfTotales
    OtraMoneda: EcfOtraMoneda


class EcfCodigoItem(TypedDict, total=False):
    TipoCodigo: XmlText
    CodigoItem: XmlText


class EcfTablaCodigosItem(TypedDict, total=False):
    CodigosItem: EcfCodigoItem | list[EcfCodigoItem]


class EcfSubcantidadItem(TypedDict, total=False):
    Subcantidad: XmlText
    CodigoSubcantidad: XmlText


class EcfTablaSubcantidad(TypedDict, total=False):
    SubcantidadItem: EcfSubcantidadItem | list[EcfSubcantidadItem]


class EcfMineria(TypedDict, total=False):
    PesoNetoKilogramo: XmlText
    PesoNetoMineria: XmlText
    TipoAfiliacion: XmlText
    Liquidacion: XmlText


class EcfSubDescuento(TypedDict, total=False):
    TipoSubDescuento: XmlText
    SubDescuentoPorcentaje: XmlText
    MontoSubDescuento: XmlText


class EcfTablaSubDescuento(TypedDict, total=False):
    SubDescuento: EcfSubDescuento | list[EcfSubDescuento]


class EcfSubRecargo(TypedDict, total=False):
    TipoSubRecargo: XmlText
    SubRecargoPorcentaje: XmlText
    MontoSubRecargo: XmlText


class EcfTablaSubRecargo(TypedDict, total=False):
    SubRecargo: EcfSubRecargo | list[EcfSubRecargo]


class EcfImpuestoAdicionalItem(TypedDict, total=False):
    TipoImpuesto: XmlText


class EcfTablaImpuestoAdicionalItem(TypedDict, total=False):
    ImpuestoAdicional: EcfImpuestoAdicionalItem | list[EcfImpuestoAdicionalItem]


class EcfOtraMonedaDetalle(TypedDict, total=False):
    PrecioOtraMoneda: XmlText
    DescuentoOtraMoneda: XmlText
    RecargoOtraMoneda: XmlText
    MontoItemOtraMoneda: XmlText


class EcfItem(TypedDict, total=False):
    NumeroLinea: XmlText
    TablaCodigosItem: EcfTablaCodigosItem
    IndicadorFacturacion: XmlText
    NombreItem: XmlText
    IndicadorBienoServicio: XmlText
    DescripcionItem: XmlText
    CantidadItem: XmlText
    UnidadMedida: XmlText
    CantidadReferencia: XmlText
    UnidadReferencia: XmlText
    TablaSubcantidad: EcfTablaSubcantidad
    GradosAlcohol: XmlText
    PrecioUnitarioReferencia: XmlText
    FechaElaboracion: XmlText
    FechaVencimientoItem: XmlText
    Mineria: EcfMineria
    PrecioUnitarioItem: XmlText
    DescuentoMonto: XmlText
    TablaSubDescuento: EcfTablaSubDescuento
    RecargoMonto: XmlText
    TablaSubRecargo: EcfTablaSubRecargo
    TablaImpuestoAdicional: EcfTablaImpuestoAdicionalItem
    OtraMonedaDetalle: EcfOtraMonedaDetalle
    MontoItem: XmlText


class EcfDetallesItems(TypedDict, total=False):
    Item: EcfItem | list[EcfItem]


class EcfSubtotal(TypedDict, total=False):
    NumeroSubTotal: XmlText
    DescripcionSubtotal: XmlText
    Orden: XmlText
    SubTotalMontoGravadoTotal: XmlText
    SubTotalMontoGravadoI1: XmlText
    SubTotalMontoGravadoI2: XmlText
    SubTotalMontoGravadoI3: XmlText
    SubTotaITBIS: XmlText
    SubTotaITBIS1: XmlText
    SubTotaITBIS2: XmlText
    SubTotaITBIS3: XmlText
    SubTotalImpuestoAdicional: XmlText
    SubTotalExento: XmlText
    MontoSubTotal: XmlText
    Lineas: XmlText


class EcfSubtotales(TypedDict, total=False):
    Subtotal: EcfSubtotal | list[EcfSubtotal]


class EcfDescuentoORecargo(TypedDict, total=False):
    NumeroLinea: XmlText
    TipoAjuste: XmlText
    IndicadorNorma1007: XmlText
    DescripcionDescuentooRecargo: XmlText
    TipoValor: XmlText
    ValorDescuentooRecargo: XmlText
    MontoDescuentooRecargo: XmlText
    MontoDescuentooRecargoOtraMoneda: XmlText
    IndicadorFacturacionDescuentooRecargo: XmlText


class EcfDescuentosORecargos(TypedDict, total=False):
    DescuentoORecargo: EcfDescuentoORecargo | list[EcfDescuentoORecargo]


class EcfPagina(TypedDict, total=False):
    PaginaNo: XmlText
    NoLineaDesde: XmlText
    NoLineaHasta: XmlText
    SubtotalMontoGravadoPagina: XmlText
    SubtotalMontoGravado1Pagina: XmlText
    SubtotalMontoGravado2Pagina: XmlText
    SubtotalMontoGravado3Pagina: XmlText
    SubtotalExentoPagina: XmlText
    SubtotalItbisPagina: XmlText
    SubtotalItbis1Pagina: XmlText
    SubtotalItbis2Pagina: XmlText
    SubtotalItbis3Pagina: XmlText
    SubtotalImpuestoAdicionalPagina: XmlText
    MontoSubtotalPagina: XmlText
    SubtotalMontoNoFacturablePagina: XmlText


class EcfPaginacion(TypedDict, total=False):
    Pagina: EcfPagina | list[EcfPagina]


class EcfInformacionReferencia(TypedDict, total=False):
    NCFModificado: XmlText
    RNCOtroContribuyente: XmlText
    FechaNCFModificado: XmlText
    CodigoModificacion: XmlText


class EcfDocument(TypedDict, total=False):
    Encabezado: EcfEncabezado
    DetallesItems: EcfDetallesItems
    Subtotales: EcfSubtotales
    DescuentosORecargos: EcfDescuentosORecargos
    Paginacion: EcfPaginacion
    InformacionReferencia: EcfInformacionReferencia | list[EcfInformacionReferencia]
    FechaHoraFirma: XmlText
    Signature: dict[str, object]


class EcfInvoice(TypedDict, total=False):
    ECF: EcfDocument
