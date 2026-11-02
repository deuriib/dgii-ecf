"""Standalone DGII helpers: security code, QR URLs, dates, RFCE conversion."""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo

from ._xml import extract_element_text
from .environment import BaseUrl, Environment
from .errors import DgiiError, DgiiErrorCode
from .result import DgiiResult, Err, Ok
from .transformer import Transformer

_SANTO_DOMINGO = ZoneInfo("America/Santo_Domingo")


def get_code_six_digit_from_signature(signed_xml: str) -> DgiiResult[str]:
    """Return the first 6 chars of ``<SignatureValue>`` (DGII security code)."""
    value = extract_element_text(signed_xml, "SignatureValue")
    if value is None:
        return Err(DgiiError("SignatureValue not found", code=DgiiErrorCode.SIGNING))
    if len(value) < 6:
        return Err(DgiiError("SignatureValue is too short", code=DgiiErrorCode.SIGNING))
    return Ok(value[:6])


def generate_fc_qr_code_url(
    rncemisor: str,
    encf: str,
    montototal: int | float | str,
    codigoseguridad: str,
    env: Environment,
) -> str:
    """QR URL for a factura de consumo (FC)."""
    return (
        f"{BaseUrl.CF.value}/{env.value.lower()}/consultatimbrefc"
        f"?rncemisor={quote(rncemisor, safe='')}"
        f"&encf={quote(encf, safe='')}"
        f"&montototal={quote(str(montototal), safe='')}"
        f"&codigoseguridad={quote(codigoseguridad, safe='')}"
    )


def generate_ecf_qr_code_url(
    rncemisor: str,
    rnc_comprador: str,
    encf: str,
    montototal: str,
    fecha_emision: str,
    fecha_firma: str,
    codigoseguridad: str,
    env: Environment,
) -> str:
    """QR URL for a crédito fiscal (e-CF)."""
    rnc_comprador_param = ""
    if rnc_comprador and not re.search(r"E43|E47", encf, re.I):
        rnc_comprador_param = f"RncComprador={quote(rnc_comprador, safe='')}&"
    return (
        f"{BaseUrl.ECF.value}/{env.value.lower()}/consultatimbre"
        f"?rncemisor={quote(rncemisor, safe='')}"
        f"&{rnc_comprador_param}"
        f"encf={quote(encf, safe='')}"
        f"&fechaemision={quote(fecha_emision, safe='')}"
        f"&montototal={quote(montototal, safe='')}"
        f"&fechafirma={quote(fecha_firma, safe='')}"
        f"&codigoseguridad={quote(codigoseguridad, safe='')}"
    )


def get_current_formatted_datetime(now: datetime | None = None) -> str:
    """``DD-MM-YYYY HH:mm:ss`` in America/Santo_Domingo."""
    current = (now or datetime.now(tz=_SANTO_DOMINGO)).astimezone(_SANTO_DOMINGO)
    return current.strftime("%d-%m-%Y %H:%M:%S")


def get_current_formatted_date(now: datetime | None = None) -> str:
    """``DD-MM-YYYY`` in America/Santo_Domingo."""
    current = (now or datetime.now(tz=_SANTO_DOMINGO)).astimezone(_SANTO_DOMINGO)
    return current.strftime("%d-%m-%Y")


def get_xml_from_body_response(
    body: str,
    last_tag_name: str = "ACECF",
) -> str | None:
    """Extract the XML payload embedded in a DGII commercial-approval body."""
    match = re.search(rf"<\?xml[\s\S]*?</{last_tag_name}>", body)
    return match.group(0) if match else None


def _as_dict(value: object) -> dict[str, object] | None:
    return value if isinstance(value, dict) else None


def _deep_get(node: object, *keys: str) -> object | None:
    current: object | None = node
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _as_list(value: object) -> list[object]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _remove_empty(value: object) -> object:
    if value is None or value == "":
        return None
    if isinstance(value, dict):
        cleaned: dict[str, object] = {}
        for key, item in value.items():
            result = _remove_empty(item)
            if result is not None and result != "":
                cleaned[key] = result
        return cleaned or None
    if isinstance(value, list):
        items = [
            item_cleaned
            for item in value
            if (item_cleaned := _remove_empty(item)) is not None
        ]
        return items or None
    return value


def convert_ecf32_to_rfce(ecf32_xml: str) -> DgiiResult[dict[str, str]]:
    """Build the RFCE (summary invoice) document from a signed ECF-32 document."""
    security = get_code_six_digit_from_signature(ecf32_xml)
    if security.is_err():
        return Err(security.unwrap_err())
    security_code = security.unwrap()

    parsed = Transformer().xml_to_json(ecf32_xml)
    if parsed.is_err():
        return Err(parsed.unwrap_err())

    encabezado = _as_dict(_deep_get(parsed.unwrap(), "ECF", "Encabezado"))
    if encabezado is None:
        return Err(DgiiError("Encabezado not found", code=DgiiErrorCode.VALIDATION))

    totales = _as_dict(encabezado.get("Totales"))
    impuestos_raw = _as_list(
        _deep_get(totales, "ImpuestosAdicionales", "ImpuestoAdicional")
        if totales
        else None
    )
    impuestos = [
        {
            "TipoImpuesto": _deep_get(impuesto, "TipoImpuesto"),
            "MontoImpuestoSelectivoConsumoEspecifico": _deep_get(
                impuesto, "MontoImpuestoSelectivoConsumoEspecifico"
            ),
            "MontoImpuestoSelectivoConsumoAdvalorem": _deep_get(
                impuesto, "MontoImpuestoSelectivoConsumoAdvalorem"
            ),
            "OtrosImpuestosAdicionales": _deep_get(
                impuesto, "OtrosImpuestosAdicionales"
            ),
        }
        for impuesto in impuestos_raw
    ]

    rfce_data: dict[str, object] = {
        "RFCE": {
            "Encabezado": {
                "Version": encabezado.get("Version"),
                "IdDoc": {
                    "TipoeCF": _deep_get(encabezado, "IdDoc", "TipoeCF"),
                    "eNCF": _deep_get(encabezado, "IdDoc", "eNCF"),
                    "TipoIngresos": _deep_get(encabezado, "IdDoc", "TipoIngresos"),
                    "TipoPago": _deep_get(encabezado, "IdDoc", "TipoPago"),
                    "TablaFormasPago": _deep_get(
                        encabezado, "IdDoc", "TablaFormasPago"
                    ),
                },
                "Emisor": {
                    "RNCEmisor": _deep_get(encabezado, "Emisor", "RNCEmisor"),
                    "RazonSocialEmisor": _deep_get(
                        encabezado, "Emisor", "RazonSocialEmisor"
                    ),
                    "FechaEmision": _deep_get(encabezado, "Emisor", "FechaEmision"),
                },
                "Comprador": {
                    "RNCComprador": _deep_get(encabezado, "Comprador", "RNCComprador"),
                    "IdentificadorExtranjero": _deep_get(
                        encabezado, "Comprador", "IdentificadorExtranjero"
                    ),
                    "RazonSocialComprador": _deep_get(
                        encabezado, "Comprador", "RazonSocialComprador"
                    ),
                },
                "Totales": {
                    "MontoGravadoTotal": _deep_get(
                        encabezado, "Totales", "MontoGravadoTotal"
                    ),
                    "MontoGravadoI1": _deep_get(
                        encabezado, "Totales", "MontoGravadoI1"
                    ),
                    "MontoGravadoI2": _deep_get(
                        encabezado, "Totales", "MontoGravadoI2"
                    ),
                    "MontoGravadoI3": _deep_get(
                        encabezado, "Totales", "MontoGravadoI3"
                    ),
                    "MontoExento": _deep_get(encabezado, "Totales", "MontoExento"),
                    "TotalITBIS": _deep_get(encabezado, "Totales", "TotalITBIS"),
                    "TotalITBIS1": _deep_get(encabezado, "Totales", "TotalITBIS1"),
                    "TotalITBIS2": _deep_get(encabezado, "Totales", "TotalITBIS2"),
                    "TotalITBIS3": _deep_get(encabezado, "Totales", "TotalITBIS3"),
                    "MontoImpuestoAdicional": _deep_get(
                        encabezado, "Totales", "MontoImpuestoAdicional"
                    ),
                    "ImpuestosAdicionales": {
                        "ImpuestoAdicional": impuestos or None,
                    },
                    "MontoTotal": _deep_get(encabezado, "Totales", "MontoTotal"),
                    "MontoNoFacturable": _deep_get(
                        encabezado, "Totales", "MontoNoFacturable"
                    ),
                    "MontoPeriodo": _deep_get(encabezado, "Totales", "MontoPeriodo"),
                },
                "CodigoSeguridadeCF": security_code,
            }
        }
    }

    cleaned = _remove_empty(rfce_data)
    if not isinstance(cleaned, dict):
        return Err(
            DgiiError("Unable to build RFCE document", code=DgiiErrorCode.VALIDATION)
        )

    xml = Transformer().json_to_xml(cleaned)
    if xml.is_err():
        return Err(xml.unwrap_err())
    return Ok({"xml": xml.unwrap(), "securityCode": security_code})
