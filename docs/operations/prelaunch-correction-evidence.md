# Pre-launch correction evidence

## Branch controls

- Branch: `prelaunch-remediation-2026-07`
- Pull request: Draft PR #40 against `main`
- Merge: prohibited
- Production migrations: prohibited
- Production data/config mutations performed by this correction pass: none

## Source and CI evidence

The correction pass now includes:

- closed output schemas and executable contract generation for all 35 public MCP tools;
- nullable context-output regression tests;
- atomic OAuth authorization-code consumption and fail-closed rate-limit tests;
- database-leased MCP idempotency with deterministic replay and uncertain-completion review guards;
- deletion-pending access denial and stale deletion-job recovery;
- durable Stripe event claim/retry behavior and duplicate-delivery tests;
- database-owned release compatibility checks;
- reconciliation, RLS/grant diff, schema-marker, ChatGPT acceptance, and release smoke scripts.

GitHub Actions has completed a green Quality run on the verified code head with all of the following gates passing:

- repository integrity
- lint
- production dependency audit at high severity
- migration-ledger validation
- TypeScript typecheck
- 55 unit-test files / 293 tests
- integration tests
- production Next.js build
- release manifest generation

The release manifest reported the exact audited commit and schema compatibility version `2`.

## Deployment evidence

Vercel accepted the branch preview after the billing maintenance cron was changed from hourly to a Hobby-compatible daily safety sweep. The preview build is not production acceptance: the current production database does not contain the branch-required compatibility marker or pending schemas, so authenticated/runtime acceptance must remain blocked until an isolated database rehearsal is available.

## Database evidence

Read-only production baseline evidence is recorded in `docs/operations/prelaunch-production-baseline-2026-07-11.md`.

Verification SQL is stored under `supabase/verification/` for:

- canonical row reconciliation;
- RLS policy, grant, and `SECURITY DEFINER` comparison;
- database schema compatibility markers.

The isolated rehearsal was attempted through Supabase database branching and rejected because the current plan does not support branching. No production database fallback was used.

## Acceptance evidence not available

The following must not be represented as passed:

- execution of the eleven pending migrations on an isolated production-like database;
- post-migration row reconciliation and RLS/grant diff;
- real ChatGPT CIMD/OAuth callback and token exchange against a compatible review deployment;
- live calls across the public 35-tool catalog with an issued reviewer token;
- populated reviewer-account browser QA;
- owner-controlled Vercel/Supabase/Stripe/Resend secret and callback configuration;
- Supabase leaked-password protection enablement;
- qualified German legal/privacy approval.

The branch remains **NO-GO** until these external gates are completed and independently reviewed.
