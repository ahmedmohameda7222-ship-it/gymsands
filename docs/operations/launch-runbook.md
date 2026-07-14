# Plaivra launch operations runbook

## Release ownership and evidence

A launch candidate is one exact reviewed commit, one release manifest, one reconciled migration history, one expected database migration marker, one provider deployment record, one anonymous smoke artifact, and two authenticated synthetic smoke artifacts. `/api/version` is a fail-closed release assertion; `/api/health` is secret-free liveness. Neither replaces physical-schema preflight or browser acceptance.

Required retained evidence is repository integrity, full migration chain, database lint/preflight, migration-ledger validation, dependency audit, lint, typecheck, unit/integration/script/telemetry tests, Node 24 production build, environment validation, rendered QA, deployment identity, anonymous smoke, populated synthetic smoke, empty-state synthetic smoke, Supabase advisors, and final owner verdict. Do not paste tokens, credentials, cookies, user IDs, email addresses, query strings, provider payloads, or user fitness content into incidents or tickets.

For a candidate branch push, retain the exact-SHA Vercel deployment state and ignore-gate log. Repository configuration alone does not prove that an automatic preview was skipped; if an unapproved preview reaches `READY`, keep the release blocked.

For a candidate branch push, confirm that Vercel did not create an automatic Git-connected deployment. If an unexpected branch deployment exists, retain its metadata and keep the release blocked until the deployment configuration is corrected.

## Deployment identity

- `vercel.json` requests automatic Git-connected deployments only for `main`.
- Vercel does not use an `ignoreCommand` or an exact-SHA environment approval gate.
- Required GitHub review and CI checks must pass before changes enter `main`.
- After merge, confirm that Vercel built the exact resulting 40-character `main` SHA.
- Verify that provider metadata, `/api/version`, and `/api/health` identify the expected deployed commit.
- Never redeploy an old provider artifact as a substitute for deploying the reviewed Git commit.
- Netlify remains a separate secondary provider and retains its exact-SHA production gate.
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

1. verify Supabase automated backup status and most recent completed timestamp;
2. retain a restore rehearsal on an isolated project using synthetic data;
3. capture migration ledger, file hashes, catalog definitions, and row/count verification;
4. keep privacy deletion, retention execution, and paid checkout flags false unless separately approved;
5. run the read-only production preflight;
6. apply only approved forward-only operations;
7. run verification, advisors, cross-user tests, and release preflight.

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
1. Confirm the candidate change passed all required review and quality checks.
2. Complete migration-history reconciliation and independent verification.
3. Confirm the compatibility marker and expected migration identity.
4. Review strict production environment validation without exposing secret values.
5. Merge the approved change to `main`.
6. Record the exact resulting 40-character `main` SHA.
7. Confirm the quality artifact and release manifest belong to that exact SHA.
8. Run `npm run release:preflight`; any failure is a no-go.
9. Confirm Vercel created the production deployment from that exact `main` SHA. Do not redeploy an old provider deployment.
10. Verify provider metadata, `/api/version`, and `/api/health`.
11. Run anonymous smoke.
12. Run populated and empty authenticated synthetic smoke.12. Review page/console/network results, screenshots, route timings, and request counts.
13. Confirm alert delivery, support mailbox, backup evidence, and on-call owner.
14. Clear/rotate the approved SHA and record the final launch verdict.

A manual, external, missing, blocked, or failed item remains a no-go until resolved and evidenced.
