# PCS-3 Production request measurement

**Status:** PCS-3C.2 Production measurement complete; PCS-3 closed
**Scope:** PCS-3A Workout History and PCS-3B Today request architecture

## Purpose

PCS-3C.1 established the durable, deterministic, read-only Playwright measurement authority. PCS-3C.2 executed it against the exact reviewed Production deployment and closed PCS-3. The complete measured evidence and hashes are recorded in [`pcs3-production-closure.md`](pcs3-production-closure.md).

The harness measures actual authenticated page behavior against approved populated and empty synthetic accounts. Direct API calls are used only for the exact deployed-identity gate; they are not substituted for page measurements.

## Synthetic boundary

Only the protected existing environment variables are accepted:

- `PLAIVRA_SMOKE_POPULATED_EMAIL`
- `PLAIVRA_SMOKE_POPULATED_PASSWORD`
- `PLAIVRA_SMOKE_EMPTY_EMAIL`
- `PLAIVRA_SMOKE_EMPTY_PASSWORD`

The harness fails closed when required credentials are absent. Credentials, access tokens, cookies, browser storage, storage state, request IDs, opaque record IDs, query values, response payloads, images, HAR files, Playwright traces, and videos are never persisted.

Each account uses a fresh browser context with locale `en-GB` and timezone `Europe/Berlin`. The harness performs no mutation action and creates no fixture data.

## Production origin authority

Canonical Production measurement may use:

- `plaivra.com`
- `app.plaivra.com`
- `www.plaivra.com`

A Vercel deployment URL may be used only when `--reviewed-vercel-host` supplies the exact reviewed `.vercel.app` hostname. The argument accepts a hostname only: no wildcard, scheme, credentials, path, port, query, or fragment. The URL hostname and reviewed hostname must match exactly, case-insensitively.

Preview mode remains preview evidence. Supplying an arbitrary Vercel preview URL does not convert the run into Production evidence.

## Exact deployed identity gate

Before login, `/api/version` must return HTTP 200 and prove:

- exact commit equality;
- exact expected and database migration-marker equality;
- `artifactIdentityValid=true`;
- `releaseReady=true`;
- `schemaCompatible=true`;
- pending migrations `0`;
- untracked applications `0`;
- unresolved migrations `0`.

The run aborts before measurement when the reviewed deployment identity does not match. Redirects to another origin are rejected. Commit and migration identity supplement the reviewed-host authority; they do not replace it.

## Methodology

For each selected synthetic account:

1. create a fresh browser context;
2. authenticate through the real login page;
3. run the configured warmups;
4. run the configured measured Today and Workout History page operations;
5. wait for main content, the required API response, full response-body completion, and bounded settlement;
6. close the context before another account begins.

Warmups are excluded from percentile calculation. A bounded delay of at least 300 ms separates operations. Results describe post-warmup observations and are not cold-start metrics.

## Metrics

### Today

The harness records:

- `/api/dashboard/today` request count;
- direct Today browser-to-Supabase read count;
- PCS-2 bootstrap count separately;
- browser-observed request duration from request start through decoded response-body completion;
- safe server `total` duration and available domain timings;
- decoded response-body bytes;
- `Content-Length` when present;
- HTTP status;
- privacy, contract, and correlation-header results;
- page, console, request, HTTP 5xx, and error-boundary counts.

### Workout History

The harness records:

- first-page, cursor, and detail request counts separately;
- browser-observed request duration from request start through decoded response-body completion;
- safe server `total`, `list`, and `filters` timings for first-page responses;
- safe server `total` and `list` timings for cursor responses;
- decoded response-body bytes;
- `Content-Length` when present;
- HTTP status;
- privacy and correlation-header results;
- page, console, request, HTTP 5xx, and error-boundary counts;
- filter-panel, selected-only, and load-more interaction evidence when applicable.

The response-capture authority starts timing on Playwright's `request` event, waits for `response.finished()`, reads the decoded response body, and records `browserObservedDurationMs` only after body completion. A finish or body-read failure creates one safe request failure and invalidates the sample.

Every accepted response task receives a stable promise identity and is inserted into the bounded pending-task Set before its work can reach a synchronous failure path. Settlement cleanup removes that exact registered promise once. Capture listeners are detached before draining, all already accepted tasks are awaited, and `finish()` terminates after the Set reaches zero. Missing or invalid request-start state cannot strand a settled promise.

Browser-observed duration is not labeled server execution time. Decoded response bytes are not labeled compressed wire bytes. Missing `Content-Length` is recorded as `null`; decoded bytes and Content-Length remain separate metrics.

## Request-count hard gates

Every valid measured operation must satisfy:

- Today projection requests: exactly `1`;
- Today direct Supabase data reads: exactly `0`;
- Workout History initial first-page requests: exactly `1`;
- Workout History initial cursor requests: exactly `0`.

Filter-panel open/close and selected-only navigation must add zero first-page requests. Load More, when available, must add exactly one cursor request and zero first-page requests.

## Percentile method

The harness uses nearest-rank percentiles over valid measured samples only. Every account and route reports sample count, minimum, p50, p95, and maximum. Populated and empty account percentiles remain separate. A combined summary is calculated from the combined raw samples rather than averaging account percentiles.

Failed samples are excluded from percentile math and cause the overall run to fail. PCS-3C.1 defines no latency magnitude budget.

## Evidence schema and output ownership

Successful output:

```text
<repository-root>/quality-reports/<dedicated-measurement-directory>/
  summary.json
  summary.md
  populated/
    samples.json
  empty/
    samples.json
```

The default dedicated directory remains:

```text
quality-reports/pcs3-production-measurement
```

Production execution may write only to a strict descendant of the current repository's `quality-reports` directory. Filesystem root, repository root, the `quality-reports` root itself, home/Desktop/Documents-style parent paths, sibling paths, `..` escapes, and existing symlink paths that resolve outside the permitted root are rejected before any deletion or write. An absolute path is accepted only when its resolved ownership remains inside the repository's `quality-reports` directory.

After ownership validation succeeds, cleanup removes only the known PCS-3 entries inside the dedicated measurement directory: `summary.json`, `summary.md`, populated/empty samples, and legacy screenshot/trace/video/storage artifacts. It does not recursively delete the selected directory and preserves unrelated files.

Invalid CLI arguments combined with an unsafe `--output` produce only the generic safe command failure line. Nothing is deleted from or written to the unsafe location.

Failed output contains only sanitized `summary.json` and `summary.md`. Failure evidence contains the checked time, `passed=false`, one safe allowlisted failure code, synthetic-only and credentials-not-logged declarations, and already validated mode/origin/commit fields when available. Raw exception detail, page text, URLs with queries, request IDs, response bodies, credentials, tokens, cookies, browser storage, images, HAR, trace, video, and storage-state files are never written.

`summary.md` distinguishes measured deployment facts, test-only architecture facts, and unavailable or not-applicable facts. Failure Markdown records the safe failure code, states that raw error detail was not recorded, and includes the same disclaimer.

These measurements describe the reviewed Production deployment and approved
synthetic fixtures at the recorded time. They are not a general user-latency
SLA and do not establish final launch budgets.

## Pass/fail authority

The run passes only when exact deployed identity, reviewed Production hostname authority, synthetic authentication, request-count invariants, required headers, complete sample count, sanitization, and all browser/server failure gates pass. p50 and p95 magnitude are informational in PCS-3C.1 and do not determine pass/fail.

## Post-merge command

Canonical custom-domain command:

```bash
npm run measure:pcs3-production -- \
  --mode production \
  --url https://app.plaivra.com \
  --expected-commit <POST_MERGE_MAIN_SHA> \
  --expected-migration 20260724232734 \
  --samples 20 \
  --warmups 2 \
  --account both \
  --output quality-reports/pcs3-production-measurement
```

Reviewed Vercel deployment command:

```bash
npm run measure:pcs3-production -- \
  --mode production \
  --url https://<EXACT_REVIEWED_DEPLOYMENT>.vercel.app \
  --reviewed-vercel-host <EXACT_REVIEWED_DEPLOYMENT>.vercel.app \
  --expected-commit <POST_MERGE_MAIN_SHA> \
  --expected-migration 20260724232734 \
  --samples 20 \
  --warmups 2 \
  --account both \
  --output quality-reports/pcs3-production-measurement
```

Credentials come only from the protected existing environment variables.

## PCS-3C.2 reconciliation

The canonical Production run, evidence review, runtime-error verification, and docs reconciliation are complete. See [`pcs3-production-closure.md`](pcs3-production-closure.md).

PCS-3 is closed. PCS-4 CI Operating Model is the next authorized phase.
