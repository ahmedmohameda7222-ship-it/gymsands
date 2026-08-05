# PCS-5A Production Deployment Convergence Authority

## Purpose

PCS-5A establishes a repository-owned, read-only authority that proves the exact checked-out `main` commit is live on the canonical Production origin and that the existing public release-readiness contract is healthy.

The authority closes the stale-but-healthy gap between a merge to `main` and the Vercel deployment served by `https://app.plaivra.com`. It does not deploy or mutate anything.

## Authority boundary

The authority is implemented by:

- `.github/workflows/uptime-synthetic.yml`;
- `scripts/uptime-synthetic.mjs`;
- sanitized retained evidence uploaded by the workflow.

It may perform only public read requests against:

- `/api/health`;
- `/api/version`;
- `/`;
- `/login`;
- `/legal/privacy`;
- `/legal/terms`.

It does not use credentials, cookies, tokens, synthetic accounts, provider APIs, Supabase CLI, database writes, fixture writes, GitHub writes, or Production mutations.

## Triggers

The workflow runs:

- after every push to `main`;
- hourly at minute `23`;
- through explicit `workflow_dispatch` for a public continuity check.

A newer `main` push cancels an obsolete older push-convergence run. Scheduled and manual runs retain a shorter bounded retry window.

## Exact identity requirements

The workflow checks out the event commit and resolves the expected identity through `git rev-parse HEAD`. The result must be an exact 40-character hexadecimal Git SHA.

Production must report that exact SHA through both `/api/health` and `/api/version`. Both routes must also agree on:

- environment `production`;
- schema compatibility version.

`/api/version` must return HTTP `200` and preserve the existing ready-state facts: valid artifact identity, compatible schema and migration identities, reconciled migration ledger, zero pending/untracked/unresolved migrations, and `releaseReady=true`.

## Retry and convergence semantics

One attempt starts all six required endpoint requests concurrently and awaits every result. Evidence remains ordered deterministically as `/api/health`, `/api/version`, `/`, `/login`, `/legal/privacy`, and `/legal/terms`, regardless of response completion order. Response bodies are consumed to completion for transfer-inclusive duration measurement, but bodies are never retained.

A push-triggered run uses `16` attempts with `55,000 ms` between failed attempts. Scheduled and manual checks use `3` attempts with `10,000 ms` between failed attempts. With the `15,000 ms` per-request timeout and concurrent requests, the push synthetic is bounded at approximately `1,065,000 ms` (`17 minutes 45 seconds`). The workflow job timeout is `25` minutes so setup and final evidence upload retain explicit margin. No sleep occurs after the final attempt.

The process passes only when one complete attempt passes. A stale commit is retryable during the window and becomes `DEPLOYMENT_COMMIT_NOT_CONVERGED` if the window expires. Unavailable, inconsistent, non-ready, malformed, timed-out, or body-stream-failed responses fail closed with bounded safe failure codes.

## Evidence safety

The single JSON evidence format records only:

- format version and timestamps;
- canonical target origin;
- expected commit and environment;
- bounded retry configuration and attempt count;
- convergence duration and final outcome;
- stable failure codes;
- route path, status, duration, and bounded extracted release/readiness facts.

Evidence never includes response bodies, credentials, cookies, tokens, authorization headers, emails, user IDs, UUID record identifiers, query strings, private routes, user content, provider payloads, raw thrown error text, or raw stack traces. Evidence is written on both pass and final failure and retained for 30 days by the workflow.

## What a pass proves

A passing run proves only:

> The exact checked-out `main` commit is live on the canonical Production origin and the existing public release-readiness contract is healthy.

It also proves the public landing, login, Privacy, and Terms surfaces returned successful responses during the attempt.

## What a pass does not prove

A pass does not replace:

- canonical Quality;
- Exact Release;
- strict release preflight;
- provider deployment inspection;
- authenticated populated/empty smoke;
- Production performance measurement;
- alert routing;
- backup or restore validation;
- incident response;
- final launch authorization.

## Failure handling

A failed push-convergence run blocks any claim that the new `main` commit is live and ready. Review the sanitized artifact, then inspect provider metadata and public route health without copying private provider payloads into repository evidence.

Do not redeploy an old artifact as a shortcut. Any correction follows the normal reviewed release path. Scheduled failures remain operational signals; external alert routing is a later PCS-5 authority and is not introduced by PCS-5A.

## Relationship to other release authorities

Canonical Quality and Exact Release validate the reviewed candidate before integration. Strict release preflight is the final pre-merge repository release gate. PCS-5A begins after a `main` push and proves public exact-commit convergence.

The existing post-deploy smoke remains the explicit authenticated acceptance authority and is not invoked or changed by PCS-5A. Alert routing and backup/restore readiness remain later Production-foundation work. Final launch authorization still requires the complete owner-reviewed release and operations evidence set.
