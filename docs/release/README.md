# Plaivra release integrity

A public Plaivra release is a compatible code, database, configuration, and browser-acceptance package. A successful local build, HTTP 200 health response, successful login, provider `READY` state, or matching schema marker is not sufficient on its own.

## Separate operations

Do not combine these operations conceptually or operationally:

1. **Merge** — reviewed source enters `main`; this does not authorize production.
2. **Automatic Git-connected deployment** — `vercel.json` enables this only for `main`; every other branch is disabled.
3. **Explicit on-demand preview** — a temporary preview may be created from an exact approved SHA as a deliberate operator action. It is not an automatic branch deployment and does not authorize production.
4. **Production promotion** — the exact reviewed commit is built and deployed after every release gate passes.
5. **Rollback** — a separately approved code/schema-compatible release pair is selected and verified. Rollback never weakens exact-SHA validation.

Do not redeploy an old provider artifact as a substitute for deploying the reviewed Git commit. The July 2026 incident persisted because production redeployed an old SHA while `main` had advanced.

## Provider controls

### Vercel

- `vercel.json` sets `git.deploymentEnabled["*"] = false` and `git.deploymentEnabled.main = true`.
- `scripts/vercel-production-release-gate.mjs` is the fail-closed ignored-build check.
- An explicitly invoked preview/development deployment may build, but normal Git-connected branch deployments remain disabled.
- Production proceeds only when `PLAIVRA_PRODUCTION_RELEASE_SHA` exactly equals `VERCEL_GIT_COMMIT_SHA`, both as 40-character Git SHAs.

### Netlify

Netlify remains configured as a secondary supported provider. Its production ignore gate also requires an exact approved SHA. Node 24 is pinned in `netlify.toml`. A Netlify preview does not replace Vercel production evidence.

Keep `PLAIVRA_PRODUCTION_RELEASE_SHA` empty during ordinary merges. Set it only after owner and quality-control approval for one exact commit. Clear or rotate it after the release so approval cannot carry to another commit.

## Required same-commit evidence

The release manifest requires retained evidence for:

- repository integrity;
- full local migration chain;
- database lint;
- read-only database preflight;
- migration-ledger validation;
- dependency audit;
- lint;
- typecheck;
- unit tests;
- integration tests;
- script tests;
- telemetry/redaction tests;
- production environment validation;
- release metadata tests;
- production build;
- rendered browser QA;
- deployment identity;
- anonymous smoke;
- authenticated populated synthetic smoke;
- authenticated empty-state synthetic smoke.

A gate is not `passed` unless its retained log or artifact exists. Browser QA with mock authentication is useful pre-deployment evidence but is not production acceptance.

## Build metadata

Build metadata is bundled into the artifact through `next.config.mjs` using direct compile-time environment reads and the machine-readable migration ledger.

Required public fields include:

- exact 40-character `commitSha`;
- valid ISO-8601 `buildTimestamp` generated for each build;
- `environment`;
- `schemaCompatibilityVersion`;
- `expectedDatabaseMigrationVersion`;
- `migrationLedgerReconciliationState`;
- `schemaAppliedUntrackedCount`.

A human does not type the build timestamp for provider builds. Vercel supplies its commit identity; CI captures a build timestamp before the build. A production artifact with `unknown`, malformed, or abbreviated required metadata is invalid.

## `/api/version` semantics

`GET /api/version` is a public release assertion. It returns explicit checks:

- `artifactIdentityValid`;
- `schemaMarkerCompatible`;
- `migrationVersionCompatible`;
- `migrationLedgerReconciled`;
- `releaseReady`.

The compatibility field `schemaCompatible` remains only as a backward-compatible alias for the compatibility-marker comparison. It does not prove physical schema equivalence.

The route returns HTTP 200 only when final release readiness is true. It returns HTTP 503 when artifact identity is invalid, the database marker is unavailable/mismatched, expected migration identity differs, or migration-history reconciliation is pending.

`/api/version` does not replace:

- the physical-schema read-only preflight;
- full migration rehearsal;
- authenticated browser smoke;
- provider deployment evidence;
- production monitoring.

The current repository ledger records six `applied_schema_untracked` migrations and reconciliation state `pending`, so production release preflight must remain blocked until the separately approved history repair is completed and independently verified.

## Release manifest

Generate the immutable evidence manifest from the checked-out exact commit:

```bash
npm run release:manifest -- \
  --commit "$REVIEWED_COMMIT" \
  --build-timestamp "$BUILD_TIMESTAMP" \
  --environment production \
  --schema-compatibility 2 \
  --quality-reports quality-reports \
  --output quality-reports/release-manifest.json
```

The generator rejects abbreviated SHAs and a commit that differs from `git rev-parse HEAD`. It records Node, npm, Next.js, platform, lockfile version, and lockfile SHA-256.

## Preflight

Run without deploying:

```bash
npm run release:preflight -- \
  --commit "$REVIEWED_COMMIT" \
  --repository ahmedmohameda7222-ship-it/gymsands \
  --quality-reports quality-reports \
  --output quality-reports/release-preflight.json
```

The command verifies checkout/repository identity, Node 24 pins, migration reconciliation, expected migration identity, manifest identity, and retained quality evidence. It performs no provider or Supabase write. It must fail while reconciliation is pending.

## Production runbook

1. Select one reviewed exact 40-character SHA from `main`.
2. Confirm the quality artifact and release manifest were generated from that same SHA.
3. Complete and independently verify migration-history reconciliation.
4. Confirm the database compatibility marker and expected migration version agree.
5. Run the release preflight and retain its passing JSON.
6. Confirm required Vercel environment variables pass strict production validation.
7. Set `PLAIVRA_PRODUCTION_RELEASE_SHA` to the exact reviewed SHA.
8. Deploy that Git commit. Do not redeploy an old deployment object.
9. Verify provider metadata and `/api/version` identity.
10. Run anonymous smoke.
11. Run authenticated populated and empty synthetic browser smoke.
12. Retain screenshots, route results, console/page/network evidence, request counts, and timings.
13. Monitor client error-boundary events and server errors.
14. Clear or rotate the approved SHA after acceptance.

## Authenticated smoke

The `Post-deploy release smoke` workflow requires:

- exact deployment URL;
- exact 40-character commit SHA;
- exact expected database migration version;
- protected populated synthetic credentials;
- protected empty-state synthetic credentials.

It verifies `/dashboard`, Train, applicable active-workout behavior, Eat, Meal Plan, Progress, Settings, and privacy/data controls. It fails on page errors, console errors, unhandled failures, critical request failures, HTTP 5xx, route-error UI, authentication loss, invalid identity/readiness, missing populated trigger state, or excessive request growth.

Synthetic credentials, cookies, tokens, emails, IDs, query strings, and user-entered content are not written to artifacts.

## Rollback

Rollback is not a provider “redeploy previous” shortcut. Select an identified commit and database marker that are compatible with the current physical schema. Run the same exact-SHA preflight, deploy the identified Git commit, verify `/api/version`, and run authenticated smoke. Additive migrations remain immutable; use a forward fix for incompatible data or schema state.

## Related operational authority

- `docs/operations/launch-runbook.md`
- `docs/operations/incident-response.md`
- `docs/operations/submission-checklists.md`
- `docs/architecture/migration-ledger-reconciliation.md`
- `plaivra_production_migration_reconciliation_plan.md`
