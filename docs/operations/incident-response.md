# Incident response

## Severity

- SEV-0: suspected cross-user disclosure, credential/payment compromise, unauthorized destructive processing, or broad account lockout. Contain immediately and suspend the affected capability.
- SEV-1: authentication/OAuth/MCP unavailable, authenticated primary route crashing, migration/code identity drift, deletion lifecycle stuck after access disable, materially incorrect billing state, or sustained production outage.
- SEV-2: degraded feature with safe retry/fallback and no ownership/privacy impact.
- SEV-3: cosmetic, documentation, or low-impact operational defect.

## Response

1. Assign incident commander, technical owner, privacy/security owner where relevant, and communications owner.
2. Preserve provider deployment metadata, exact Git SHA, release manifest, `/api/version`, `/api/health`, sanitized client fingerprints, structured logs, migration/marker identity, and timestamps.
3. Do not copy raw tokens, cookies, authorization headers, emails, user IDs, query strings, provider payloads, prompts, meal/workout names, notes, or user fitness records.
4. Compare four identities separately: reviewed Git commit, deployed artifact, database compatibility/migration marker, and physical schema/migration history.
5. Contain using the narrowest safe flag, endpoint disable, connection revocation, or separately verified compatible release pair.
6. Do not redeploy an old provider artifact merely because it previously built successfully.
7. Determine affected operations from sanitized fingerprints, routes, timestamps, and aggregate counts. Do not estimate or publish affected-user counts without verified evidence.
8. Notify owner/legal/privacy reviewer when contractual or regulatory assessment is required.
9. Recover through exact-SHA rollback only when code/schema compatible, otherwise use an additive forward fix.
10. Run relevant regression, cross-user, migration preflight, anonymous smoke, authenticated populated/empty smoke, and rendered checks before closure.
11. Document root cause, production-only trigger, detection gap, corrective action, and evidence-retention/deletion decision.

## Client rendering incidents

For an authenticated route failure:

1. group sanitized events by fingerprint, route, boundary source, commit, and build timestamp;
2. compare client and server artifact metadata and flag stale-chunk mismatches;
3. reproduce using a dedicated synthetic account with the same non-sensitive state flags;
4. inspect page errors, console errors, failed requests, 5xx responses, and route-boundary UI;
5. confirm whether local data state differs from the synthetic production state;
6. add a runtime regression that fails when the trigger returns;
7. do not close solely because `next build`, login, health, or anonymous pages pass.

## Deployment and migration drift

When code, marker, schema, or migration history disagree:

- activate the production release hold;
- capture read-only catalog and history evidence;
- do not replay migration SQL;
- do not edit applied migration files;
- do not insert or delete migration-history rows without the approved reconciliation plan;
- do not advance the compatibility marker before history and physical schema are independently verified;
- keep `/api/version` non-ready;
- deploy only after exact-SHA preflight and authenticated smoke can pass.

## Domain playbooks

- OAuth/MCP: revoke affected access tokens and connections; validate issuer/resource/scope/PKCE/CIMD; rotate signing/token secrets if exposed; require reconnection.
- Supabase/RLS: remove public exposure or disable the affected route, inspect definitions/advisors/grants/policies, test user A/user B/service role, then use an additive migration.
- Deletion/export: stop workers, preserve job evidence, verify legal holds/storage/auth stages, and follow the privacy forward-fix plan.
- Billing: disable checkout, preserve signed event IDs and hashes, reconcile provider state, correct entitlement reducer/mapping, and replay verified events idempotently.
- Deployment: compare reviewed SHA, provider SHA, release manifest, build timestamp, expected migration, database marker, and physical schema. Recover only with a compatible pair and full smoke evidence.

The support/security mailbox and platform dashboards require owner credentials. Repository agents do not send incident communications, deploy, mutate provider settings, or change production data automatically.
