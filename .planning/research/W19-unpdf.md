# W19 — Replace `pdf-parse` with `unpdf`

**Researched:** 2026-05-23
**Domain:** Server-side PDF text extraction in Next.js 16 (Node runtime, Vercel + Docker/Cloud Run)
**Confidence:** HIGH (API and Edge-compat verified against repo + npm; downstream consumer impact zero)
**Estimated effort:** 45–60 min (10 callsites, identical refactor shape, vitest fixture work is the long pole)

---

## 1. Current `pdf-parse` callsites

Every callsite uses the same ugly pattern: `dynamic import("pdf-parse")` + manual `.default` fallback to dodge ESM/CJS interop. This exists because `pdf-parse@2.x` is CJS and Next 16 turbopack bundling chokes without `serverExternalPackages: ["pdf-parse"]` in `next.config.ts:4`.

| # | File | Line | Wrapper function | Notes |
|---|------|------|------------------|-------|
| 1 | `src/lib/rag.ts` | 13–19 (`getPdfParser`), 21 (`textFromPdfBuffer`), 30 (`textFromPdfUrl`) | Module-level helper. Re-exported as `textFromPdfBuffer` / `textFromPdfUrl`. | The canonical entry point — used by `/api/ingest` and `/api/lab-extract`. |
| 2 | `src/lib/crawlers/india-gov.ts` | 4–15 (`parsePdfBuffer`), 120 (call) | Local helper, swallows errors → `""`. | |
| 3 | `src/lib/crawlers/naco-hiv.ts` | 5–15, 80 | Same shape as #2. | |
| 4 | `src/lib/crawlers/aiims-protocols.ts` | 7–18, 101, 127 | Two calls: real PDF + mislabeled-HTML-that-is-PDF (`startsWith("%PDF-")` branch). | |
| 5 | `src/lib/crawlers/ncvbdc-malaria.ts` | 5–15, 80 | Same shape as #2. | |
| 6 | `src/lib/crawlers/uip-immunization.ts` | 5–15, 80 | Same shape as #2. | |
| 7 | `src/lib/crawlers/ntep-tb.ts` | 9–19, 77 | Same shape as #2. | |
| 8 | `src/lib/crawlers/nfi.ts` | 8–18, 75 | Same shape as #2. | |
| 9 | `src/lib/crawlers/nlem-2022.ts` | 5–15, 43 | Same shape as #2. | |
| 10 | `next.config.ts` | 4 | `serverExternalPackages: ["pdf-parse"]` — delete after migration. | |
| 11 | `package.json` | 15, 21 | `@types/pdf-parse@^1.1.5`, `pdf-parse@^2.4.5` — remove both. | |

**Downstream consumers of parsed text:** `src/app/api/ingest/route.ts:59,81` and `src/app/api/lab-extract/route.ts:32` — both consume the **string** return value of `textFromPdfBuffer` / `textFromPdfUrl`. They do NOT touch `numpages`, `info`, `metadata`. (See section 7.)

Eight of the nine crawler wrappers are byte-identical copy-paste. Migration is a single search/replace plus one new shared helper.

---

## 2. API surface diff — side-by-side

`pdf-parse@2.4.5` [VERIFIED: npm view pdf-parse]:

```ts
const data = await pdfParse(buffer);
// data: { text: string, numpages: number, numrender: number, info: object, metadata: object, version: string }
```

`unpdf@1.6.2` [VERIFIED: npm view unpdf, published 2026-04-29]:

```ts
import { extractText, getDocumentProxy } from "unpdf";
const pdf = await getDocumentProxy(new Uint8Array(buffer));
const { totalPages, text } = await extractText(pdf, { mergePages: true });
// totalPages: number, text: string  (without mergePages: text is string[])
```

Field mapping (all callsites):

| pdf-parse field | unpdf equivalent | Used by Mediq? |
|---|---|---|
| `text` (string) | `extractText(..., { mergePages: true }).text` (string) | YES — every callsite |
| `numpages` | `totalPages` | NO — no callsite reads this |
| `info` | `(await getMeta(pdf)).info` | NO |
| `metadata` | `(await getMeta(pdf)).metadata` | NO |
| `numrender` | n/a | NO |
| `version` | n/a | NO |

**Conclusion:** Every Mediq callsite only consumes `result.text`. Migration is mechanical — no downstream contract change.

---

## 3. Bundle size, cold-start, Edge runtime

| Metric | pdf-parse@2.4.5 | unpdf@1.6.2 | Source |
|---|---|---|---|
| `dist.unpackedSize` | 21.2 MB | 2.0 MB | [VERIFIED: `npm view <pkg> dist.unpackedSize`] |
| Native deps | `@napi-rs/canvas` (NAPI bindings) | none — pure JS | [VERIFIED: npm view + repo deps:none] |
| Cold start on Vercel | OOMs / fails at bundle time without `serverExternalPackages` workaround | ~3–5 s first request | [CITED: dev.to/chudi_nnorukam, buildwithmatija.com] |
| Vercel Node runtime | Works only with `serverExternalPackages: ["pdf-parse"]` hack | Works out of the box | [VERIFIED: this repo's `next.config.ts:4`] |
| Vercel Edge runtime | NO — needs Node `Buffer`, `fs` | NO — pdfjs serverless bundle still uses some Node-isms | [CITED: buildwithmatija.com, chudi.dev — multiple sources confirm Node-only on Vercel] |

**Edge-runtime status of Mediq routes:** `grep -rn "runtime.*edge"` across `src/` returns **zero** matches [VERIFIED: ran grep]. All API routes default to Node. Both `/api/ingest/route.ts:8` and `/api/lab-extract/route.ts:5` use `export const dynamic = "force-dynamic"` only — no `runtime = "edge"`. **No route change required.**

**Project Node version:** `Dockerfile` uses `node:22-alpine` and `@types/node@22.19.15` [VERIFIED: read]. unpdf's PDF.js 5.x relies on `Promise.withResolvers` which needs Node ≥ 22 — but the default `unpdf` import uses the bundled serverless build with the polyfill, so we are safe even if a future deploy drops to Node 20 [CITED: unpdf README].

---

## 4. Edge cases (PDF.js error taxonomy)

PDF.js (the engine inside unpdf) throws named exceptions [CITED: github.com/mozilla/pdf.js, Snyk advisor]:

| Failure mode | Thrown by unpdf as | Current pdf-parse behavior in this repo | Required new behavior |
|---|---|---|---|
| Password-protected | `PasswordException` (err.name) | Resolves with `text: ""` (silent) | Catch and skip; log once with URL. RAG content < 200 chars already drops these. |
| Encrypted (no password) | `PasswordException` thrown synchronously during `getDocumentProxy` | Silent empty | Same as above. |
| Malformed XRef / corrupt | `InvalidPDFException` | Silent empty | Same: caller falls through `content.length < 200` filter. |
| Empty/wrong MIME | `MissingPDFException` | Silent empty | Same. |
| Scanned PDF (no extractable text) | Succeeds, returns `text: ""` (no error) | Same — `text` is empty | Both libs behave identically. **Drop on `length < 200` already in place.** |
| Hebrew/Arabic RTL | unpdf has known reversal bug ([CITED: unjs/unpdf#31]) | pdf-parse: same (pdfjs-dist underlies it) | No regression. |

**Sample fixtures to commit at `tests/fixtures/pdf/`** (research-only — NOT to be committed yet, fixture dir does not currently exist):
- `good.pdf` — text-bearing, multi-page (e.g. a known NLEM page download)
- `encrypted.pdf` — generate via `qpdf --encrypt foo foo 256 -- good.pdf encrypted.pdf`
- `scanned.pdf` — flatten a real PDF to image then re-embed (no text layer)
- `corrupt.pdf` — `head -c 200 good.pdf > corrupt.pdf` (truncated xref)

`/tmp/pdf-test/` does NOT exist on this machine [VERIFIED: ls]. The task should create test fixtures during the dev session, not assume they exist.

**Recommended error-handling shape for the new shared helper:**

```ts
// src/lib/pdf.ts (new)
import { extractText, getDocumentProxy } from "unpdf";

export type PdfError =
  | { kind: "password" }
  | { kind: "invalid" }
  | { kind: "empty" }
  | { kind: "unknown"; message: string };

export async function textFromPdfBuffer(
  input: ArrayBuffer | Buffer | Uint8Array,
): Promise<string> {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  let pdf;
  try {
    pdf = await getDocumentProxy(u8);
  } catch (err) {
    const name = (err as Error & { name?: string }).name;
    if (name === "PasswordException") throw new Error("PDF is password-protected");
    if (name === "InvalidPDFException") throw new Error("PDF is corrupted");
    if (name === "MissingPDFException") throw new Error("Not a PDF");
    throw err;
  }
  const { text } = await extractText(pdf, { mergePages: true });
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) throw new Error("No text found in PDF");
  return cleaned;
}
```

Note the explicit `new Uint8Array(input)` — passing a Node `Buffer` (which IS a Uint8Array) sometimes works, but `unjs/unpdf#17` reports buffer-sharing issues across operations. Always materialize a fresh Uint8Array per call [CITED: github.com/unjs/unpdf/issues/17].

---

## 5. Memory profile

[CITED: buildwithmatija.com — measured Vercel Hobby, 1 GiB limit, May 2026]:

| Pages | pdf-parse | unpdf |
|---|---|---|
| 1 page | ~150 MB | ~100 MB |
| 5 pages | OOM risk on Hobby | ~200 MB |
| 10 pages | OOM at ~80 MB input PDF | ~350 MB |
| 20 pages | crash | ~500 MB |

unpdf reads pages on demand from the PDF.js document proxy — it does NOT load everything into a JS string up front. It's not "streaming" in the HTTP sense, but page-iterator-streaming. Mediq's current 15 MB upload cap (`MAX_PDF_BYTES` in `rag.ts:7`) and 10 MB lab-extract cap (`MAX_LAB_BYTES` in `lab-extract/route.ts:8`) stay valid and don't need adjustment.

**Memory hygiene:** Call `pdf.destroy()` after `extractText` in long-running cron contexts (`/api/cron/refresh`, `/api/cron/learn`). [CITED: buildwithmatija.com]. Crawlers process URLs sequentially in batches — without `destroy()` the proxies accumulate until GC kicks. Add `await pdf.destroy()` in a `finally` block.

---

## 6. Migration steps (concrete)

1. `npm uninstall pdf-parse @types/pdf-parse`
2. `npm install unpdf` (currently 1.6.2)
3. Remove `serverExternalPackages: ["pdf-parse"]` from `next.config.ts:4` — the entire `serverExternalPackages` key can go (no other packages in that list).
4. Create `src/lib/pdf.ts` with the shared `textFromPdfBuffer` helper from section 4. Add a `textFromPdfUrl` wrapper that calls `safeFetch` (preserve the existing `MAX_PDF_BYTES` guard from `rag.ts`).
5. In `src/lib/rag.ts`:
   - Delete `getPdfParser` (lines 13–19) and the existing `textFromPdfBuffer` / `textFromPdfUrl` (lines 21–38).
   - Re-export from `./pdf` so existing imports `from "@/lib/rag"` keep working: `export { textFromPdfBuffer, textFromPdfUrl } from "./pdf";`
6. In each of the 8 crawlers (`india-gov`, `naco-hiv`, `ncvbdc-malaria`, `uip-immunization`, `ntep-tb`, `nfi`, `nlem-2022`, `aiims-protocols`):
   - Delete the local `parsePdfBuffer` function.
   - Replace its uses with: `import { textFromPdfBuffer } from "@/lib/pdf";` and call `await textFromPdfBuffer(arrayBuffer).catch(() => "")` to preserve the swallow-errors semantics.
7. Write `src/__tests__/pdf.test.ts` with fixtures from section 4. Use `vitest`'s existing config (no setup needed — `npm test` already works via `vitest run` per `package.json:10`).
8. Run `npm run typecheck && npm test && npm run build`.
9. Live smoke test against `/api/ingest`:
   ```bash
   curl -X POST http://localhost:3000/api/ingest \
     -H "Content-Type: application/json" \
     -d '{"kind":"pdf","url":"https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadConsumer/nlem2022.pdf","title":"NLEM 2022 smoke"}'
   ```
   Expected: `{ok: true, chunkCount: >0, sourceId: <int>}`.
10. Live smoke test against `/api/lab-extract` with any small CBC report PDF (`form-data: file=@cbc.pdf`).

---

## 7. Risks

- **Downstream `numpages`/`totalPages` rename — NONE.** Grep across `src/` and `scripts/` for `numpages|numPages|totalPages|pdfInfo|pdfMetadata` returns **zero** matches outside of unpdf's own returned shape [VERIFIED: ran grep]. Both `/api/ingest` and `/api/lab-extract` consume only `text` (the string). Both crawler chunks and lab-parser take string input only. Safe.
- **Silent extraction loss on crawlers that previously succeeded.** The current `parsePdfBuffer` wraps everything in `try { … } catch { return ""; }`. unpdf will throw `PasswordException` on PDFs that pdf-parse previously returned empty for. The new helper must preserve the swallow-on-failure shape for crawlers (`await textFromPdfBuffer(buf).catch(() => "")`) but throw for `/api/ingest` and `/api/lab-extract` (which need user-facing error messages — they already do `try/catch` and return 4xx).
- **`%PDF-` binary-as-string branch in `aiims-protocols.ts:124–143`.** That code path takes `Buffer.from(html, "binary")` from a string. After migration, pass it through `textFromPdfBuffer` which now accepts `ArrayBuffer | Buffer | Uint8Array`. No behavior change.
- **PDF.js 5.x + Node 22 polyfill assumption.** Default unpdf import bundles the polyfill — fine. If a future engineer switches to `import { ... } from "unpdf/pdfjs"`, they MUST keep Node ≥ 22. Add an ADR-style comment in `src/lib/pdf.ts`.
- **Vercel function size limit.** unpdf is 2 MB unpacked vs pdf-parse's 21 MB. Cold-start improves; no risk of crossing the 50 MB function-size cap.

---

## 8. Test plan additions

New tests live in `src/__tests__/pdf.test.ts` (vitest, follows existing conventions in `src/__tests__/*.test.ts`):

- `textFromPdfBuffer` returns the expected substring on `good.pdf` fixture.
- Throws `Error("PDF is password-protected")` on `encrypted.pdf`.
- Throws `Error("PDF is corrupted")` on `corrupt.pdf`.
- Throws `Error("No text found in PDF")` on `scanned.pdf` (text-layer empty).
- Returns `""` (does not throw) when called via the crawler wrapper `parsePdfBuffer(...).catch(() => "")`.

Existing test suite must remain green: `npm test` runs all 10 existing tests in `src/__tests__/`. No mocks for pdf-parse exist in the test tree [VERIFIED: grep] so no test-side cleanup needed.

Integration smoke (manual, post-deploy):
- POST `/api/ingest` with `kind:"pdf"` and NLEM 2022 URL → expect `chunkCount > 0`.
- POST `/api/lab-extract` with a small lab PDF (form-data) → expect `panel.values.length > 0`.
- Trigger `/api/admin/crawl/india-gov` and confirm at least one PDF source persisted with `content.length > 200`.

---

## 9. Estimate

- Helper + tests: 20 min
- 10 callsite refactor (mechanical): 15 min
- `next.config.ts` cleanup, npm scripts, lockfile: 5 min
- Smoke tests live: 15 min
- **Total: ~55 min.** Within the ≤1h target.

---

## Sources

**Primary (HIGH):**
- npm registry: `unpdf@1.6.2`, published 2026-04-29, deps:none, unpacked 2.0 MB
- npm registry: `pdf-parse@2.4.5`, unpacked 21.2 MB
- Local: `next.config.ts`, `vercel.json`, `Dockerfile`, all 10 callsites — read in this session
- [unpdf README on GitHub](https://github.com/unjs/unpdf) — exports field, API signatures, serverless build claim

**Secondary (MEDIUM, cross-verified):**
- [Process PDFs on Vercel: Reliable Serverless Guide (2026) — buildwithmatija.com](https://www.buildwithmatija.com/blog/process-pdfs-on-vercel-serverless-guide) — memory numbers, Node-runtime requirement, `pdf.destroy()` pattern
- [Using pdf-parse on Vercel Is Wrong — dev.to/chudi_nnorukam](https://dev.to/chudi_nnorukam/serverless-pdf-processing-why-unpdf-beats-pdf-parse-2jji) — cold-start numbers, migration steps
- [Mozilla PDF.js Snyk advisor](https://snyk.io/advisor/npm-package/pdfjs-dist/functions/pdfjs-dist.InvalidPDFException) — exception taxonomy (PasswordException, InvalidPDFException, MissingPDFException)
- [unjs/unpdf#17](https://github.com/unjs/unpdf/issues/17) — Uint8Array buffer-sharing pitfall

**Tertiary (LOW, single-source):**
- [pkgpulse 2026 comparison](https://www.pkgpulse.com/blog/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-parsing-extraction-nodejs-2026) — claims Edge compat; contradicted by two other sources; treat Node-runtime-only as the working assumption.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | Vercel Edge runtime is unavailable for any current Mediq route, so the unpdf-edge limitation is irrelevant. | §3 | None — grep confirmed zero `runtime = "edge"` declarations in `src/`. Verified, not assumed. |
| A2 | `pdf.destroy()` is a no-op safety call in serverless contexts and only matters for cron workers. | §5 | LOW — if omitted, may add ~50 MB per crawled PDF until GC. Cron path processes batches sequentially so cumulative memory could matter. Mitigation: always call it. |
| A3 | The 8 crawler files all swallow errors identically; one shared helper with `.catch(() => "")` at the callsite is acceptable rather than try/catch inside the helper. | §6 | LOW — keeps semantics identical; tests in §8 cover both throw and swallow modes. |
