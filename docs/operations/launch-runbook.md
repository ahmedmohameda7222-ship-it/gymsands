# Plaivra launch operations runbook

## Release ownership and evidence

A launch candidate is one reviewed commit, one release manifest, one ordered additive migration set, one deployment record, and one post-deploy smoke artifact. `/api/version` proves artifact identity and `/api/health` provides a secret-free liveness signal. Never promote a build whose commit differs from the manifest.

Required evidence is integrity, lint, migration-ledger reconciliation, dependency audit, typecheck, unit/integration tests, production build, isolated migration/RLS validation, deployment success, post-deploy smoke, Supabase advisors, and rendered QA. Store logs as CI artifacts; do not paste tokens or production user data into an incident or ticket.

## Monitoring and alerts

- GitHub `uptime-synthetic.yml` checks health, version, landing, login, Privacy, and Terms hourly after it reaches `main`.
- Vercel runtime logs receive bounded structured JSON. Client boundaries send only route, stable error code, and framework digest; no error message, stack, prompt, identity, or fitness value is accepted.
- Before launch, configure an owner-reviewed alert destination for repeated synthetic failure, elevated 5xx, OAuth/token failure, MCP error rate, deletion job retries, retention job failure, and billing webhook retry/terminal errors.
- Initial thresholds: synthetic failure twice consecutively; 5xx >2% for 5 minutes with at least 20 requests; any cross-user/authz signal; deletion job in retry/failed; webhook retry older than 15 minutes. Recalibrate with real traffic without publishing user counts.
- A monitoring vendor, retention period, region, and DPA remain owner/privacy decisions. No external telemetry SDK is enabled by this source change.

## Backups and data changes

Before any production migration or destructive job:

1. verify Supabase automated backup status and most recent completed timestamp in the dashboard;
2. perform and retain evidence of a restore rehearsal on an isolated project using synthetic data;
3. capture migration ledger and row/count verification queries;
4. keep privacy deletion, retention execution, and paid checkout flags false;
5. apply additive migrations in order and run each verification file plus security/performance advisors;
6. approve cutover only after RLS/cross-user and application compatibility tests.

Do not claim backup readiness from configuration alone. The owner must record restore duration, restored schema compatibility, synthetic row totals, storage-object verification, and operator/date.

## Rollback and forward-fix

- Before schema application: abandon the release candidate and keep the previous deployment.
- After an additive backward-compatible migration but before new writers: roll back the application artifact; retain additive objects.
- After new writes begin: disable the relevant flag/writer, preserve all rows, and apply an audited forward fix. Do not rewrite migration history.
- After deletion/storage destruction starts: stop new jobs and follow the privacy lifecycle forward-fix plan; lost data is not presented as rollback-capable.
- OAuth/CIMD incident: revoke affected connections/tokens, rotate secrets where applicable, keep the protected resource unavailable if validation is uncertain, and require reconnection.
- Billing incident: set `BILLING_CHECKOUT_ENABLED=false`, disable Stripe endpoint delivery if signature verification is in doubt, preserve the event ledger, and reconcile through verified replay/forward fix.

## Feature flags and safe defaults

`BILLING_CHECKOUT_ENABLED`, `PRIVACY_DELETION_EXECUTION_ENABLED`, and `PRIVACY_RETENTION_EXECUTION_ENABLED` default false. Changing them requires an owner change record, applicable legal/pricing review, completed dry run, monitoring, rollback/forward-fix owner, and credential availability. Flags are emergency brakes, not evidence that a migration is reversible.

## Support and security workflow

Public support/security contact: `Ahmed.Mohamed04@outlook.de`. Ask reporters to minimize sensitive content. Record receipt, severity, affected release, safe reproduction, containment, owner, and closure. Never request a password, access token, entire export, medical record, or unredacted provider payload by email.

## Launch-day sequence

1. Freeze the reviewed branch and generate manifest.
2. Review destructive/manual actions, legal content, and any paid offering separately.
3. Validate migrations in isolation; record counts and advisors.
4. Deploy the reviewed commit without promoting unknown artifacts.
5. Verify `/api/version`, `/api/health`, and post-deploy smoke.
6. Complete synthetic reviewer walkthrough and rendered accessibility checks.
7. Confirm alert delivery, support mailbox, backup evidence, and on-call owner.
8. Record the final launch verdict. A manual/blocking item remains a no-go until resolved.
