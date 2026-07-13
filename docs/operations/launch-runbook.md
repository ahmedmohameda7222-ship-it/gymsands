# Plaivra launch operations runbook

## Release ownership and evidence

A launch candidate is one exact reviewed commit, one release manifest, one reconciled migration history, one expected database migration marker, one provider deployment record, one anonymous smoke artifact, and two authenticated synthetic smoke artifacts. `/api/version` is a fail-closed release assertion; `/api/health` is secret-free liveness. Neither replaces physical-schema preflight or browser acceptance.

Required retained evidence is repository integrity, full migration chain, database lint/preflight, migration-ledger validation, dependency audit, lint, typecheck, unit/integration/script/telemetry tests, Node 24 production build, environment validation, rendered QA, deployment identity, anonymous smoke, populated synthetic smoke, empty-state synthetic smoke, Supabase advisors, and final owner verdict. Do not paste tokens, credentials, cookies, user IDs, email addresses, query strings, provider payloads, or user fitness content into incidents or tickets.

## Deployment identity

- Vercel automatic Git-connected deployments are enabled only for `main`.
- A temporary preview is an explicit operation from an approved SHA, not an automatic branch deployment.
- Production requires `PLAIVRA_PRODUCTION_RELEASE_SHA` to exactly equal the provider’s 40-character commit SHA.
- Never redeploy an old provider artifact as a substitute for deploying the reviewed Git commit.
- Clear or rotate the approval SHA after acceptance.
- Rollback selects a separately identified code/schema-compatible pair and repeats exact-SHA verification and smoke.

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

1. Freeze one reviewed `main` SHA.
2. Confirm quality artifacts and release manifest belong to that SHA.
3. Complete migration-history reconciliation and independent verification.
4. Confirm the compatibility marker and expected migration identity.
5. Run `npm run release:preflight`; any failure is a no-go.
6. Review strict provider environment validation without exposing values.
7. Set `PLAIVRA_PRODUCTION_RELEASE_SHA` to the exact SHA.
8. Deploy that Git commit, not an old provider deployment.
9. Verify provider metadata, `/api/version`, and `/api/health`.
10. Run anonymous smoke.
11. Run populated and empty authenticated synthetic smoke.
12. Review page/console/network results, screenshots, route timings, and request counts.
13. Confirm alert delivery, support mailbox, backup evidence, and on-call owner.
14. Clear/rotate the approved SHA and record the final launch verdict.

A manual, external, missing, blocked, or failed item remains a no-go until resolved and evidenced.
