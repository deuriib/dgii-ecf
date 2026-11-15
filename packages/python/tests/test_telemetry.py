"""Resilience & Observability tests (F-RES-01..07, F-OBS-01..02, F-DGII-03)."""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import httpx2
import pytest

from py_dgii_ecf import (
    ECF,
    DgiiErrorCode,
    EcfEvent,
    Endpoint,
    Environment,
    HttpClient,
    HttpClientOptions,
    P12ReaderData,
    ResilienceOptions,
    document_identity,
)

CREDENTIALS = P12ReaderData(key="unused", cert="unused")


def signed_ecf(rnc: str, encf: str) -> str:
    return (
        f"<ECF><Encabezado><RNCEmisor>{rnc}</RNCEmisor>"
        f"<IdDoc><eNCF>{encf}</eNCF></IdDoc></Encabezado></ECF>"
    )


def test_res_01_buyer_breaker_isolated_from_dgii_host() -> None:
    buyer_hits = 0
    dgii_hits = 0

    def handler(request: httpx2.Request) -> httpx2.Response:
        nonlocal buyer_hits, dgii_hits
        if request.url.host == "buyer.example.test":
            buyer_hits += 1
            return httpx2.Response(503, json={"message": "unavailable"})
        dgii_hits += 1
        return httpx2.Response(200, json={"trackId": "dgii-ok"})

    events: list[EcfEvent] = []
    client = httpx2.Client(transport=httpx2.MockTransport(handler))
    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=client,
        enforce_b2b_rules=False,
        resilience=ResilienceOptions(
            max_retries=1,
            breaker_threshold=5,
            reset_timeout_s=30.0,
        ),
        on_event=events.append,
    )

    for i in range(5):
        res = ecf.send_electronic_document(
            signed_ecf("130862346", f"E31000000000{i}"),
            f"doc-{i}.xml",
            buyer_host="https://buyer.example.test",
        )
        assert res.is_err()
    assert buyer_hits == 5

    sixth = ecf.send_electronic_document(
        signed_ecf("130862346", "E310000000009"),
        "doc-9.xml",
        buyer_host="https://buyer.example.test",
    )
    assert sixth.is_err()
    err_val = sixth.unwrap_err()
    assert err_val.code == DgiiErrorCode.IDEMPOTENCY
    assert isinstance(err_val.cause, object)
    assert getattr(err_val.cause, "code", None) == DgiiErrorCode.CIRCUIT_OPEN
    assert buyer_hits == 5
    assert any(
        e.type == "breaker.changed" and e.breaker_state == "open" for e in events
    )

    dgii_res = ecf.send_electronic_document(
        signed_ecf("130862346", "E310000000010"),
        "doc-10.xml",
    )
    assert dgii_res.is_ok()
    assert dgii_hits == 1


def test_res_02_07_bulkhead_saturation_returns_circuit_open_without_tripping_breaker() -> (
    None
):
    entered = threading.Event()
    release = threading.Event()
    calls = 0
    calls_lock = threading.Lock()

    def handler(_request: httpx2.Request) -> httpx2.Response:
        nonlocal calls
        with calls_lock:
            calls += 1
            current = calls
        if current == 1:
            entered.set()
            release.wait(timeout=2.0)
        return httpx2.Response(200, json={"ok": True})

    http = HttpClient(
        HttpClientOptions(
            base_url="https://ecf.dgii.gov.do",
            resilience=ResilienceOptions(
                max_retries=1,
                breaker_threshold=2,
                bulkhead_limit=1,
                bulkhead_queue=0,
                timeout_s=5.0,
            ),
        ),
        client=httpx2.Client(transport=httpx2.MockTransport(handler)),
    )

    first_result: list[object] = []

    def run_first() -> None:
        first_result.append(http.get("/a", resource="RES_A"))

    t = threading.Thread(target=run_first)
    t.start()
    assert entered.wait(timeout=1.0)

    p2 = http.get("/b", resource="RES_B")
    assert p2.is_err()
    assert p2.unwrap_err().code == DgiiErrorCode.CIRCUIT_OPEN
    assert p2.unwrap_err().retryable is True

    p3 = http.get("/c", resource="RES_C")
    assert p3.is_err()
    assert p3.unwrap_err().code == DgiiErrorCode.CIRCUIT_OPEN

    release.set()
    t.join(timeout=2.0)

    after = http.get("/d", resource="RES_D")
    assert after.is_ok()


def test_res_04_timeout_retries_and_surfaces_timeout_retryable() -> None:
    attempts = 0

    def handler(request: httpx2.Request) -> httpx2.Response:
        nonlocal attempts
        attempts += 1
        raise httpx2.ReadTimeout("timed out", request=request)

    http = HttpClient(
        HttpClientOptions(
            base_url="https://ecf.dgii.gov.do",
            resilience=ResilienceOptions(
                max_retries=2,
                timeout_s=0.05,
            ),
        ),
        client=httpx2.Client(transport=httpx2.MockTransport(handler)),
    )

    res = http.get("/slow", resource="SLOW_OP")
    assert attempts == 2
    assert res.is_err()
    err_val = res.unwrap_err()
    assert err_val.code == DgiiErrorCode.TIMEOUT
    assert err_val.retryable is True


def test_res_05_concurrent_calls_run_in_parallel() -> None:
    in_flight = 0
    peak_in_flight = 0
    lock = threading.Lock()

    def handler(_request: httpx2.Request) -> httpx2.Response:
        nonlocal in_flight, peak_in_flight
        with lock:
            in_flight += 1
            peak_in_flight = max(peak_in_flight, in_flight)
        time.sleep(0.2)
        with lock:
            in_flight -= 1
        return httpx2.Response(200, json={"ok": True})

    http = HttpClient(
        HttpClientOptions(
            base_url="https://ecf.dgii.gov.do",
            resilience=ResilienceOptions(max_retries=1, bulkhead_limit=20),
        ),
        client=httpx2.Client(transport=httpx2.MockTransport(handler)),
    )

    results: list[bool] = []
    threads = [
        threading.Thread(
            target=lambda idx=i: results.append(
                http.get(f"/item/{idx}", resource="ITEM").is_ok()
            )
        )
        for i in range(5)
    ]
    start = time.monotonic()
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=2.0)
    elapsed = time.monotonic() - start

    assert all(results)
    assert len(results) == 5
    assert peak_in_flight >= 2
    assert elapsed < 0.4


def test_obs_01_02_telemetry_events_silent_and_errors_carry_context(
    capsys: pytest.CaptureFixture[str],
) -> None:
    events: list[EcfEvent] = []

    def ok_handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(200, json={"trackId": "t1"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=httpx2.Client(transport=httpx2.MockTransport(ok_handler)),
        on_event=events.append,
    )

    xml = signed_ecf("130862346", "E310000000001")
    first = ecf.send_electronic_document(xml, "doc.xml")
    assert first.is_ok()
    second = ecf.send_electronic_document(xml, "doc.xml")
    assert second.is_ok()

    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == ""

    assert [e.type for e in events] == [
        "idempotency",
        "transmission.started",
        "transmission.succeeded",
        "idempotency",
    ]
    assert events[0].idempotency == "miss"
    assert events[3].idempotency == "hit"
    assert events[1].resource == Endpoint.SEND_INVOICE.value
    assert events[1].rnc == "130862346"
    assert events[1].encf == "E310000000001"
    assert events[1].document_hash == document_identity(xml).document_hash

    def boom(_event: EcfEvent) -> None:
        raise RuntimeError("boom from telemetry sink")

    throwing_ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=httpx2.Client(transport=httpx2.MockTransport(ok_handler)),
        on_event=boom,
    )
    assert throwing_ecf.send_electronic_document(xml, "doc.xml").is_ok()

    def err_handler(_request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(400, json={"message": "bad"})

    err_ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=httpx2.Client(transport=httpx2.MockTransport(err_handler)),
        on_event=boom,
    )
    err_res = err_ecf.status_track_id("t1")
    assert err_res.is_err()
    err_val = err_res.unwrap_err()
    assert err_val.resource == Endpoint.TRACK_RESULT_STATUS.value
    assert err_val.method == "GET"
    assert err_val.base_url == "https://ecf.dgii.gov.do"


def test_dgii_03_validate_before_send_allows_unavailable_schema() -> None:
    sent = 0

    def handler(_request: httpx2.Request) -> httpx2.Response:
        nonlocal sent
        sent += 1
        return httpx2.Response(200, json={"trackId": "t-e31"})

    ecf = ECF(
        CREDENTIALS,
        Environment.DEV,
        token="tok",
        http_client=httpx2.Client(transport=httpx2.MockTransport(handler)),
        validate_before_send=True,
    )

    e31_xml = (
        "<ECF><Encabezado><TipoeCF>31</TipoeCF><RNCEmisor>130862346</RNCEmisor>"
        "<IdDoc><eNCF>E310000000001</eNCF></IdDoc></Encabezado></ECF>"
    )
    res = ecf.send_electronic_document(e31_xml, "e31.xml")
    assert res.is_ok()
    assert sent == 1


def test_telemetry_vocabulary_fixture() -> None:
    vocab_path = (
        Path(__file__).resolve().parents[3]
        / "examples"
        / "fixtures"
        / "telemetry-vocabulary.json"
    )
    vocab = json.loads(vocab_path.read_text(encoding="utf-8"))
    assert "transmission.started" in vocab["eventTypes"]
    assert "transmission.succeeded" in vocab["eventTypes"]
    assert "transmission.failed" in vocab["eventTypes"]
    assert "idempotency" in vocab["eventTypes"]
    assert "breaker.changed" in vocab["eventTypes"]
    assert DgiiErrorCode.CIRCUIT_OPEN.value in vocab["errorCodes"]
    assert DgiiErrorCode.TIMEOUT.value in vocab["errorCodes"]
