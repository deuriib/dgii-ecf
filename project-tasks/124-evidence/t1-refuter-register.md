# T1 (Refuter) — `project-tasks/124-source-register.md`, attempt 1 of 3

**Verdict: FAIL — not safe to publish from.**

The register is well-built where it is verifiable (TEC-04's contingency section, TEC-11's OpenAPI
enum, the ACECF field list, the RFCE/threshold rules all check out against the sources). It fails on
one ⚠ note that is **factually inverted**, one column that **attributes sections the documents do not
govern**, and three precision claims that the PDFs contradict. Because the downstream writer is
instructed to soften a guide sentence that is in fact correctly sourced, publishing from this register
would put a false attribution on the public site — the exact failure this task exists to prevent.

## Evidence base (reproducible; do this before attempt 2)

`dgii.gov.do` PDFs are text-extractable — the register's caution does not apply to the TEC block, only
to LEG-01/LEG-02. Verified 2026-11-09 with a browser UA:

```bash
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
curl -s -A "$UA" -L -o tec02.pdf "…/Informe y Descripción Técnica/Descripcion Tecnica Servicios DGII.pdf"
uv run --with pypdf python -c "from pypdf import PdfReader; print('\n'.join(p.extract_text() or '' for p in PdfReader('tec02.pdf').pages))"
```

Read in full this way: TEC-01 (53 pp), TEC-02 (47 pp), TEC-03 (13 pp), TEC-04 (13 pp). Also read:
`examples/fixtures/schemas/{MANIFEST.json,anecf.xsd,semilla.xsd}`, `upstream-invalid/{ACECF,RFCE 32}.xsd`,
TEC-11 `definition.json`, `project-docs/dgii-ground-truth.md`, the three guides, issue #124, and the SDK
sources (`client.ts`, `reconciliation.ts`, `types.ts`, `reception.ts`). Spot-checked 8 URLs (all 200;
W3C needs a plain UA, as the register says — judgement call 11 holds).

---

## Blocking refutations

### R1 — Step 6 ⚠ is inverted: `secuenciaUtilizada` **is** in `consultaresultado`

**Register says** (line 257–262): "`secuenciaUtilizada` does not belong to this step. In every published
document it is a field of the RFCE reception response and of the RFCE consultation (TEC-02, TEC-01
§4.3/§9), **never of `consultaresultado`/`consultaestado`** … the flag that tells you so is not in the
general-consult responses." Residual risk (line 402) promotes this to one of the two highest risks.

**Evidence.** TEC-02, _Consulta de resultado e-CF_ (p. 24) response, JSON **and** XML:

```
{ "trackId": …, "codigo": 0, "estado": …, "rnc": …, "eNCF": …,
  "secuenciaUtilizada": true, "fechaRecepcion": …, "mensajes": [ … ] }
```

and its `DESCRIPCION PARAMETROS DE SALIDA`: "`secuenciaUtilizada` permite dar a conocer si el número de
secuencia que fue recibido … puede reutilizarse … en el escenario de que el resultado de la validación
haya sido 'Rechazado' por los siguientes motivos: certificado y/o firma inválida; estructura (XML) no
válida; firmante no delegado; e-NCF no autorizado…". TEC-02's own bitácora, _Actualizaciones al
18-04-2022_, item 1: "Se incluyeron dos parámetros a la respuesta del servicio de **Consulta Resultado**
para retroalimentar cuando el e-NCF puede ser reutilizado."

So the field is documented on (a) `consultaresultado`/trackId, (b) the RFCE reception response, (c)
`consultarfce` — and is absent **only** from `consultaestado` (verified: `RespuestaConsultaEstado` has
no such element). TEC-01 does not mention the field at all, so the ⚠'s "TEC-01 §4.3/§9" citation is
unsupported.

**Consequence.** `docs/en/guides/flow.md` step 6 ("On a rejection, `secuenciaUtilizada` decides the next
step") reads the field from `statusTrackId` → `consultaresultado` — **correct and DGII-documented**. The
register's prescribed remedy (re-attribute it to "the summary/RFCE flow") would print a false
attribution and delete a correct rule from the flow guide and its mermaid diagram.

**Fix.** Replace the ⚠ with: _"`secuenciaUtilizada` is published on `consultaresultado` (TEC-02
Consulta de resultado e-CF, p. 24), on the RFCE reception response and on `consultarfce`; it is **not**
on `consultaestado`. Cite TEC-02 for the track-step sentence — it is sourced."_ Then file the real
finding the register missed, as a code issue, not a docs issue: `reconcileSubmission` →
`canReuseSequence` is fed from `inquiryStatus` (`consultaestado`), where the flag does not exist, so
`canReuseSequence` is always `false`; `resilience.md`'s paragraph points the reader at the wrong
consult. Remove R1's twin from "Residual risk".

### R2 — the "Ground-truth §" column attributes sections the documents do not govern

The register's own method says "Every row names the ground-truth section it governs" (line 16). Checked
section by section:

| Row               | Claims              | Reality                                                                                                                                                                                                                                                                                         |
| ----------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LEG-01            | §1, §7, §9          | §1 is _Hosts and environments_ — a law does not state `ecf.dgii.gov.do`/`testecf`. §7 is contradicted by the register's own line 205: "LEG-01 → the obligation … (not a routing rule)".                                                                                                         |
| LEG-02            | §9 (deadline), §1   | Judgement call 6 declares the deadline not locatable ⇒ **zero verified claims**, yet the row is counted in the 37. §1 impossible.                                                                                                                                                               |
| LEG-03            | §4, §9, §10         | §4 is _Authentication_ (seed XML, token JSON/TTL) — a Norma General does not define the seed. Step 1 maps to TEC-02/TEC-01/XSD-12/TEC-10 only.                                                                                                                                                  |
| TEC-04            | §1, §2, §5, §9      | TEC-04 §5–6 is availability/contingency. It carries none of §5 (status codes) and none of §9 (AC/voiding). Its real contribution — contingency conduct quoting Decreto 587-24 Arts. 40–43 — has **no ground-truth section at all**. The column hides a ground-truth gap instead of exposing it. |
| TEC-02            | §1,2,3,4,5,6,7,8,10 | Omits **§9**, although the mapping cites TEC-02 for commercial approval (step 8) and anulación (step 9).                                                                                                                                                                                        |
| XSD-01/02, XSD-03 | §8; §7+§9           | A schema provides the `Signature` slot; it does not govern C14N/URI/reference rules (§8), nor the "rejection obliges an E34" rule (§9). Tangential.                                                                                                                                             |

(TEC-01's blanket "§1–§10" survives scrutiny — §4.9 does describe the status service — but it is
non-discriminating and should not be used as a per-section claim.)

**Fix.** Make the column load-bearing: every § listed must be backed by a mapping line. Delete §1 from
LEG-01/LEG-02/TEC-04, §7 from LEG-01, §4 from LEG-03, and §5/§9 from TEC-04; add §9 to TEC-02; give
TEC-04 the same "— (operational: availability/contingency, no ground-truth claim)" label the OPS block
already uses, and say explicitly in "Residual risk" that `dgii-ground-truth.md` has no contingency
section so any contingency citation must be scoped to TEC-04 §5–6.

### R3 — "the only published list that includes 46 and 47" is false; a better source is omitted

**Register says** (step 3): "**TEC-05** … the only published list that includes 46 (Exportaciones) and
47 (Pagos al Exterior)."

**Evidence.** TEC-01 §6.1 _Tipos de Comprobantes Fiscales Electrónicos_ prints the same 31/32/33/34/41/43/
44/45/**46/47** table. And TEC-01 §7 _Estructura, Formato y Vencimiento de los Números Comprobantes
Fiscales Electrónicos_ states both rules the register leaves unmapped: "una estructura de trece (13)
posiciones" and "hasta el 31 de diciembre del año siguiente y no podrá ser usada posterior a su
vencimiento" — i.e. ground-truth §9's last bullet (e-NCF validity) has a locatable, machine-verified
source that the register never names, and step 3's `ENCF`/13-character rule is attributed only to
LEG-07 when TEC-01 §7 is both stronger and extractable.

**Fix.** Step 3: "TEC-05 `<TipoeCF>` and TEC-01 §6.1 both list 31–47; Aviso 24-19 (LEG-07) stops at 45."
Add to step 3 and/or a new note: _TEC-01 §7 → e-NCF structure (13 positions) and validity (31 Dec of the
following year)_, and add §7 to TEC-01's § column. Consider demoting LEG-07 to "structure notice, 31–45"
rather than a source for the field layout.

### R4 — TEC-03's escape rule is understated: eight characters, not five

**Register says** (line 216): "the **five** reserved characters and their entity forms (`"` `'` `<` `>`
`&`)". TEC-03's table lists **eight**: `"`, `'`, `<`, `>`, `&`, `©`, `€`, `®` (each with named, decimal
and hex escapes), followed by a _second, separate_ table of QR/URL reserved characters with hex-only
replacements. A writer reproducing "five" on a public page understates a DGII requirement.

**Fix.** Restate as: eight reserved characters with their `&quot;`-style / `&#nn;` / `&#xnn;` forms, plus
the distinct QR-URL set in the following table of the same section.

---

## Medium refutations (evidence attached, fix required but not independently blocking)

- **M1 — Judgement call 1 overstates the absence.** The literal `/api/estatus…` paths are indeed only in
  TEC-11, but TEC-01 §4.9 _Web Service – Consulta Estatus Servicios_ documents the service and defers
  detail to the Descripción Técnica, and TEC-04 §5.1 names and mandates the portal. Fix wording to "the
  paths are published only in TEC-11; the service is described in TEC-01 §4.9 and its use mandated in
  TEC-04 §5.1", and add TEC-01 §4.9 to step 2.
- **M2 — "the multipart parameter name `xml*` exists only inside TEC-02" is false.** TEC-03's cURL
  examples post the same field: `-f 'xml=@archivosemillafirmado.xml;type=text/xml'` (and two more). Only
  the Swagger-style `xml*` annotation is TEC-02-only. Fix the sentence.
- **M3 — the B2B remedy is mis-attributed.** Judgement call 10's diagnosis holds (no exclusion list in
  TEC-02 or TEC-03 — verified), but the restriction is implemented in the SDK: `checkB2BApplicability` /
  `enforceB2BRules` in `packages/typescript/src/{reception,client}.ts`. The truthful sentence is "the SDK
  refuses B2B delivery for these types (`enforceB2BRules`); DGII's published documents do not state a
  type exclusion". Do **not** write the softened "in practice, these types are not delivered B2B" — it
  keeps a DGII voice on an SDK rule.
- **M4 — judgement call 6 withholds the article but not the date.** If NG 01-2020 Art. 14 is _Consultas_
  (the register's own reading), then `dgii-ground-truth.md` §9's "Art. 14 ¶I" is **wrong**, not merely
  unverified, and the 15th-of-following-month date is equally unsourced. Fix: state the mis-citation as
  a correction, and forbid publishing the deadline **date** as well as the article number.
- **M5 — the 34 vs 37 paragraph is a guess presented as reconciliation.** "the two standards the notebook
  almost certainly folded into the signing document" is unfalsifiable; combined with LEG-02 carrying no
  verified claim, "37 normative sources … with a named ground-truth claim" is not a count of verified
  claims. Fix: drop the causal story; write "we verified 37 URLs; the audit's 34 cannot be enumerated, so
  the two numbers are not comparable — publish the list, not a comparison."
- **M6 — missing source: `consultarfce`.** Ground truth §2 lists
  `fc/{env}/consultarfce/api/Consultas/Consulta?RNC_Emisor=&ENCF=&Cod_Seguridad_eCF=`. No register row,
  step or section maps it, yet steps 6–7 tell the writer the sequence-reuse signal comes from "the RFCE
  consultation". Name the endpoint and its TEC-02 section, or step 7's advice is unactionable. Not
  acceptable to leave out.

## Padding / invention

The 15-XSD framing is defensible: each is a distinct document with its own URL and `sha256`, and #124
asks for a catalogue, not a claim count. Three of them (XSD-13/14/15) are reference-only and support no
step beyond "reference", which is honest at the item level but should be said in the count sentence.
The actual padding is elsewhere: **LEG-02** (its only claims are ones the register itself calls
unverifiable), **LEG-01's §1/§7**, and **TEC-11** counted as a "normative source" when it is a
machine-readable service spec (needed, but label it). Honest framing: "36 documents that carry at least
one verified normative claim, plus 1 service spec, plus 6 operational manuals" — or keep 37 and state
per row what each adds. Do not present 37 as a correction or an overshoot of 34.

## Judgement calls that hold (do not re-litigate in attempt 2)

1 (diagnosis, with M1's wording fix), 2 (`Ambiente` enum is `[1,2,3]` unlabelled — verified in
`definition.json`; `ApiKey` scheme description verified), 3 (TEC-03's bitácora _Actualizaciones al
02-01-2026_ records the split — quote that date, it is in TEC-03, not only in TEC-02), 4, 5, 7, 9, 10
(diagnosis only), 11 (W3C 403/200 UA divergence reproduced; `/rfc/rfc6931` 200).

## Minor nits (do not block)

- ANECF: `TablaRangoSecuenciasAnuladaseNCF` wraps a `Secuencias` element (1..10000), each holding
  `SecuenciaeNCFDesde`/`Hasta`; the register's "1..10000 ranges of Desde/Hasta" drops the wrapper
  (`anecf.xsd` lines 19–32).
- Step 8's ACECF field list and "the tag is `Estado`" are machine-verifiable from the repo's
  `upstream-invalid/ACECF v.1.0.xsd` (`Estado` type `EstadoType` {1,2}); cite XSD-15 there, not only
  TEC-07.
- TEC-04 has **two** 15-day rules: 15 _días hábiles_ for a DGII outage (§5.2) and 15 _días calendario_ as
  the issuer's maximum impossibility contingency (§6.2). "the 72-hour / 15-day limits" collapses them.
- TEC-02's own file-name example is an 11-character e-NCF (`101672919E3100000001.xml`) while TEC-03's and
  every schema require 13. Step 5 should cite TEC-03's table and warn off TEC-02's example.
- Ground truth §8's "`<KeyValue>`/`<RSAKeyValue>`/`<Exponent>` must **NOT** be emitted" has no mapped
  source (TEC-03's _Firmado de XML_ list does not contain it; it is inference from TEC-10's example).
  Label it "SDK rule / no DGII text found" so the writer does not cite TEC-03 for it.
- Manifest bookkeeping: the 15 XSD URLs are 12 entries in `schemas` plus the 3 in `excluded` (whose
  `reason` fields are the source of the "does not compile" claim). Say so.
- `project-tasks/124-dgii-official-sources-ledger.md` already records **T1 attempt 1 = PASS**; that row
  must be corrected to FAIL when this evidence is consumed.

## Downstream risk — the two instructions to soften a guide

- **`secuenciaUtilizada` (flow.md step 6 + mermaid + "Common mistakes"): the instruction is unjustified
  and destroys correct information.** See R1. Withdraw it.
- **B2B exclusion (flow.md "Common mistakes"): the instruction to change is right, the target is wrong.**
  Keep the warning — a reader who sends an E41 straight to a buyer will fail — and move the attribution
  from DGII to the SDK (`enforceB2BRules`). See M3.

## Decision

**Reject — attempt 1 of 3 fails.** Re-run T1 after: R1 (withdraw the ⚠, cite TEC-02 p. 24), R2 (§ column
backed by mapping lines; TEC-04 relabelled; §9 added to TEC-02), R3 (TEC-01 §6.1/§7), R4 (eight escape
characters). M1–M6 and the nits should land in the same revision; they are cheap and they are the same
class of defect.

## Outcome

Outcome: FAIL — the register's headline ⚠ inverts the evidence, so publishing from it would put a false DGII attribution in `flow.md`.
Details: R1 is decisive: `secuenciaUtilizada` is documented on `consultaresultado` (TEC-02 p. 24 + bitácora 18-04-2022), so the guide sentence the register orders softened is already correctly sourced; R2's ground-truth-§ column and R3/R4 are verified against the extracted PDFs (recipe in the file). Medium fixes M1–M6 plus nits should ride the same revision.
`project-tasks/124-evidence/t1-refuter-register.md` — attempt-1 QA verdict: 4 blocking refutations, 6 medium, verified judgement calls, and per-issue fix instructions.
