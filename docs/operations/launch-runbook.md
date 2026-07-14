# Plaivra launch operations runbook

## Release ownership and evidence

A launch candidate is one exact reviewed commit, one release manifest, one reconciled migration history, one expected database migration marker, one provider deployment record, one anonymous smoke artifact, and two authenticated synthetic smoke artifacts. `/api/version` is a fail-closed release assertion; `/api/health` is secret-free liveness. Neither replaces physical-schema preflight or browser acceptance.

Required retained evidence is repository integrity, full migration chain, database lint/preflight, migration-ledger validation, dependency audit, lint, typecheck, unit/integration/script/telemetry tests, Node 24 production build, environment validation, rendered QA, deployment identity, anonymous smoke, populated synthetic smoke, empty-state synthetic smoke, Supabase advisors, and final owner verdict. Do not paste tokens, credentials, cookies, user IDs, email addresses, query strings, provider payloads, or user fitness content into incidents or tickets.

For every candidate branch push, inspect Vercel provider metadata for the exact pushed SHA. Repository configuration and green repository tests prove policy intent only; they do not prove actual provider enforcement. If Vercel creates an unexpected branch or pull-request deployment, retain its metadata and keep the release blocked until the main-only deployment behavior is corrected and reverified with a later push.

## Deployment identity

- `vercel.json` declares repository policy intent through minimatch rules: `"**": false` covers slash-delimited branch names and `"main": true` preserves automatic deployment for `main`.
- Vercel does not use `ignoreCommand`.
- Vercel does not use `PLAIVRA_PREVIEW_RELEASE_SHA` or `PLAIVRA_PRODUCTION_RELEASE_SHA`.
- Repository tests verify configuration intent, preserved cron schedules, and removal of obsolete gate dependencies; actual provider behavior requires post-push Vercel verification.
- Required GitHub review and CI checks, migration reconciliation, release preflight, and explicit release-owner approval must complete before changes enter `main`.
- Under the current Vercel Git model, a merge to `main` is production-triggering.
- After merge, confirm that Vercel built the exact resulting 40-character `main` SHA.
- Verify that provider metadata, `/api/version`, and `/api/health` identify the expected deployed commit.
- A provider `READY` state alone is not release acceptance.
- Never redeploy an old provider artifact as a substitute for deploying the reviewed Git commit.
- Netlify remains a separate secondary provider and retains its exact-SHA production gate through `PLAIVRA_PRODUCTION_RELEASE_SHA`.
- Rollback selects a separately identified code/schema-compatible pair and repeats deployment-identity and smoke verification.

## Monitoring and alerts

- GitHub `uptime-synthetic.yml` checks health, version, landing, login, Privacy, and Terms after it reaches `main`.
- Vercel runtime logs receive bounded structured JSON. Client boundaries provide sanitized error type, message, stack/component stack, route, boundary source, fingerprint, artifact identity, coarse browser version, and non-sensitive incident-state flags.
- Telemetry rejects unsupported fields and oversized bodies, strips tokens, cookies, emails, UUIDs, query strings, and authorization data, and never accepts raw profile, food, workout, prompt, or health content.
- Before launch, configure an owner-reviewed alert destination for repeated synthetic failure, client boundary clusters, elevated 5xx, OAuth/token failure, MCP error rate, deletion retries, retention failure, and billing webhook retry/terminal errors.
- Initial thresholds: synthetic failure twice consecutively; 5xx >2% for 5 minutes with at least 20 requests; repeated identical client-error fingerprint; any cross-user/authz signal; deletion job in retry/failed; webhook retry older than 15 minutes. Recalibrate from measured traffic without publishing user counts.
- A monitoring vendor, retention period, region, and DPA remain owner/privacy decisions. No external telemetry SDK is enabled by this implementation.

## Backups and data changes

Before any production migration, history repair, compatibility-marker update, or destructive job:

1. Verify Supabase automated backup status and most recent completed timestamp.
2. Retain a restore rehearsal on an isolated project using synthetic data.
3. Capture migration ledger, file hashes, catalog definitions, and row/count verification.
4. Keep privacy deletion, retention execution, and paid checkout flags false unless separately approved.
5. Run the read-only production preflight.
6. Apply only approved forward-only operations.
7. Run verification, advisors, cross-user tests, and release preflight.

Do not replay any migration classified as `applied_schema_untracked`. Do not claim backup readiness from configuration alone. Record restore duration, schema compatibility, synthetic row totals, storage verification, operator, and date.

## Rollback and forward-fix

- Before schema/history change: abandon the release candidate and leave production on the last verified compatible pair.
- After an additive backward-compatible migration but before new writers: select and deploy a verified compatible application commit; retain additive objects.
- After new writes begin: disable the relevant writer/flag, preserve rows, and apply an audited forward fix. Do not rewrite migration SQL.
- Migration-history repair failure: keep the release hold active, restore migration metadata only through the independently reviewed procedure, and do not advance the compatibility marker.
- OAuth/CIMD incident: revoke affected connections/tokens, rotate secrets where applicable, keep the resource unavailable if validation is uncertain, and require reconnection.
- Billing incident: set `BILLING_CHECKOUT_ENABLED=false`, preserve the event ledger, and reconcile through verified idempotent replay or forward fix.

Rollback is not “redeploy previous deployment.” It is a new controlled operation with an exact Git SHA, database identity, preflight evidence, deployment record, and authenticated smoke.

## Feature flags and safe defaults

`BILLING_CHECKOUT_ENABLED`, `PRIVACY_DELETION_EXECUTION_ENABLED`, and `PRIVACY_RETENTION_EXECUTION_ENABLED` default false. Changing them requires an owner change record, applicable legal/pricing review, completed dry run, monitoring, rollback/forward-fix owner, and credential availability. Strict production environment validation enforces dependent secrets and retention values without printing them.

## Support and security workflow

Public support/security contact: `Ahmed.Mohamed04@outlook.de`. Ask reporters to minimize sensitive content. Record receipt, severity, affected release, sanitized reproduction, containment, owner, and closure. Never request a password, access token, entire export, medical record, or unredacted provider payload by email.

## Launch-day sequence

1. Complete code review and all required CI checks for the candidate change.
2. Complete migration-history reconciliation and independent verification.
3. Confirm the compatibility marker and expected migration identity.
4. Run strict production environment validation without exposing secret values.
5. Run `npm run release:preflight` and retain its result.
6. Obtain explicit release-owner approval for the exact reviewed change.
7. Merge the approved exact change to `main`.
8. Record the exact resulting 40-character `main` SHA.
9. Confirm Vercel production was built from that exact SHA.
10. Verify provider metadata, `/api/version`, and `/api/health`.
11. Run anonymous smoke.
12. Run populated and empty authenticated synthetic smoke.
13. Review browser, console, network, screenshots, route timings, and request counts.
14. Record the final launch verdict.

Any failed or blocked preflight is a no-go before merge. The migration ledger must be reconciled before a production-triggering merge to `main`. A Vercel `READY` state alone is not acceptance. Netlify remains separate and keeps its exact-SHA production gate. A manual, external, missing, blocked, or failed item remains a no-go until resolved and evidenced.
