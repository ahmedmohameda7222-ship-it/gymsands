# Incident response

## Severity

- SEV-0: suspected cross-user disclosure, credential/payment compromise, unauthorized destructive processing, or broad account lockout. Contain immediately and suspend affected capability.
- SEV-1: authentication/OAuth/MCP unavailable, deletion lifecycle stuck after access disable, billing state materially wrong, or sustained production outage.
- SEV-2: degraded feature with safe retry/fallback and no ownership/privacy impact.
- SEV-3: cosmetic, documentation, or low-impact operational defect.

## Response

1. Acknowledge and assign incident commander, technical owner, privacy/security owner where relevant, and communications owner.
2. Preserve release manifest, version response, redacted structured logs, migration/job/event identifiers, and timestamps. Do not copy raw tokens, provider payloads, prompts, or user fitness records.
3. Contain with the narrowest flag, connection revocation, endpoint disable, or previous application artifact that preserves data.
4. Determine affected operations from stable IDs and aggregate counts. Do not estimate or publish affected-user counts without verified evidence.
5. Notify the owner/legal/privacy reviewer when contractual or regulatory assessment is needed. Do not claim breach notification is unnecessary without review.
6. Recover through verified rollback where still safe or additive forward fix where data/schema writes occurred.
7. Run regression, cross-user, smoke, and rendered checks before closure.
8. Document root cause, detection gap, corrective action, and evidence-retention/deletion decision.

## Domain playbooks

- OAuth/MCP: revoke affected access tokens and connections; validate issuer/resource/scope/PKCE/CIMD; rotate signing/token secrets if exposed; require reconnection.
- Supabase/RLS: remove public exposure or disable affected route, inspect advisors/grants/policies, test user A/user B/service role, then additive migration.
- Deletion/export: stop workers, preserve job evidence, verify legal holds/storage/auth stages, and follow the privacy forward-fix plan.
- Billing: disable checkout, preserve signed event IDs and hashes, reconcile provider state, correct entitlement reducer/mapping, and replay verified events idempotently.
- Deployment: compare `/api/version` with manifest, roll back the application artifact if schema-compatible, then smoke the recovered release.

The support/security mailbox and platform dashboards require owner credentials; repository agents do not send incident communications or change production state automatically.
