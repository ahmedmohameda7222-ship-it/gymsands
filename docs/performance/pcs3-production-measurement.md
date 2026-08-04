# PCS-3 Production request measurement

**Status:** PCS-3C.1 measurement authority candidate; Production measurement pending
**Scope:** PCS-3A Workout History and PCS-3B Today request architecture

## Purpose

PCS-3C.1 establishes a durable, deterministic, read-only Playwright measurement authority. It does not record Production measurements in this PR and does not close PCS-3.

The harness measures actual authenticated page behavior against approved populated and empty synthetic accounts. Direct API calls are used only for the exact deployed-identity gate; they are not substituted for page measurements.

## Synthetic boundary

Only the protected existing environment variables are accepted:

- `PLAIVRA_SMOKE_POPULATED_EMAIL`
- `PLAIVRA_SMOKE_POPULATED_PASSWORD`
- `PLAIVRA_SMOKE_EMPTY_EMAIL`
- `PLAIVRA_SMOKE_EMPTY_PASSWORD`

The harness fails closed when required credentials are absent. Credentials, access tokens, cookies, browser storage, storage state, request IDs, opaque record IDs, query values, response payloads, HAR files, and Playwright traces are never persisted.

Each account uses a fresh browser context with locale `en-GB` and timezone `Europe/Berlin`. The harness performs no mutation action and creates no fixture data.

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

The run aborts before measurement when the reviewed deployment identity does not match. Redirects to another origin are rejected.

## Methodology

For each selected synthetic account:

1. create a fresh browser context;
2. authenticate through the real login page;
3. run the configured warmups;
4. run the configured measured Today and Workout History page operations;
5. wait for main content, the required API response, and bounded settlement;
6. close the context before another account begins.

Warmups are excluded from percentile calculation. A bounded delay of at least 300 ms separates operations. Results describe post-warmup observations and are not cold-start metrics.

## Metrics

### Today

The harness records:

- `/api/dashboard/today` request count;
- direct Today browser-to-Supabase read count;
- PCS-2 bootstrap count separately;
- browser-observed request duration;
- safe server `total` duration and available domain timings;
- decoded response-body bytes;
- `Content-Length` when present;
- HTTP status;
- privacy, contract, and correlation-header results;
- page, console, request, HTTP 5xx, and error-boundary counts.

### Workout History

The harness records:

- first-page, cursor, and detail request counts separately;
- browser-observed request duration;
- safe server `total`, `list`, and `filters` timings for first-page responses;
- safe server `total` and `list` timings for cursor responses;
- decoded response-body bytes;
- `Content-Length` when present;
- HTTP status;
- privacy and correlation-header results;
- page, console, request, HTTP 5xx, and error-boundary counts;
- filter-panel, selected-only, and load-more interaction evidence when applicable.

Browser-observed duration is not labeled server execution time. Decoded response bytes are not labeled compressed wire bytes. Missing `Content-Length` is recorded as `null`.

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

## Evidence schema

Successful output:

```text
<output>/
  summary.json
  summary.md
  populated/
    samples.json
  empty/
    samples.json
```

A failed page may produce one sanitized screenshot. Successful runs produce no screenshots. No HAR, trace, storage state, token, cookie, raw request ID, response payload, email, password, opaque identifier, or query string is written.

`summary.md` distinguishes measured deployment facts, test-only architecture facts, and unavailable or not-applicable facts.

These measurements describe the reviewed Production deployment and approved
synthetic fixtures at the recorded time. They are not a general user-latency
SLA and do not establish final launch budgets.

## Pass/fail authority

The run passes only when exact deployed identity, synthetic authentication, request-count invariants, required headers, complete sample count, sanitization, and all browser/server failure gates pass. p50 and p95 magnitude are informational in PCS-3C.1 and do not determine pass/fail.

## Post-merge command

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

Credentials come only from the protected existing environment variables.

## Pending PCS-3C.2 reconciliation

After the future Production run:

1. the Lead reviews evidence for secrets and private data;
2. the Lead verifies deployment identity and Vercel runtime errors;
3. a docs-only PCS-3C.2 PR records measured facts;
4. PCS-3 closes only after independent QA/QC and explicit merge approval.

PCS-3 remains open. No Production request count, payload-size percentile, browser-duration percentile, or server-duration percentile is recorded by PCS-3C.1.
