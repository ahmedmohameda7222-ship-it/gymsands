# Plaivra release integrity

A public Plaivra release is a compatible code, database, configuration, and browser-acceptance package. A successful local build, HTTP 200 health response, successful login, provider `READY` state, or matching schema marker is not sufficient on its own.

## Separate operations

Do not combine these operations conceptually or operationally:

1. **Review and merge** - reviewed source enters `main` only after the required GitHub checks and approval have passed.
2. **Automatic Vercel deployment** - `vercel.json` requests Git-connected deployments only for `main`. Vercel does not use an `ignoreCommand` or an exact-SHA environment approval.
3. **Production verification** - confirm that Vercel built the exact merged `main` commit and that the deployed `/api/version` identity matches it.
4. **Production acceptance** - complete the required migration, quality, smoke, and browser-acceptance checks for that deployed commit.
5. **Rollback** - select and verify a separately approved code/schema-compatible release pair. Do not redeploy an unrelated old deployment object.

Do not redeploy an old provider artifact as a substitute for deploying the reviewed Git commit. The July 2026 incident persisted because production redeployed an old SHA while `main` had advanced.

## Provider controls

### Vercel

- `vercel.json` requests automatic Git-connected deployments only for `main`.
- Vercel does not use an `ignoreCommand` or the exact-SHA environment approval gate.
- Release safety depends on required review and CI checks before merge, followed by deployed-commit identity, migration, smoke, and browser-acceptance verification.
- Confirm that the deployed provider metadata and `/api/version` identity match the exact merged `main` commit.
- A deployment is not accepted merely because Vercel reports it as `READY`.

### Netlify

Netlify remains configured as a secondary supported provider. Its production ignore gate continues to require an exact approved SHA. Node 24 is pinned in `netlify.toml`. A Netlify preview does not replace Vercel production evidence.

For a Netlify production release, keep `PLAIVRA_PRODUCTION_RELEASE_SHA` empty during ordinary merges. Set it only after owner and quality-control approval for one exact commit, then clear or rotate it after acceptance.

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
- telemetry and redaction tests;
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

The route returns HTTP 200 only when final release readiness is true. It returns HTTP 503 when artifact identity is invalid, the database marker is unavailable or mismatched, expected migration identity differs, or migration-history reconciliation is pending.

`/api/version` does not replace:

- the physical-schema read-only preflight;
- full migration rehearsal;
- authenticated browser smoke;
- provider deployment evidence;
- production monitoring.

The current repository ledger records six `applied_schema_untracked` migrations and reconciliation state `pending`, so production release preflight must remain blocked until the separately approved history repair is completed and independently verified.

## Release manifest

Generate the pre-deployment evidence manifest from the checked-out exact commit:

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

After deployment, the post-deploy workflow downloads the exact quality artifact by GitHub Actions run ID, verifies that its manifest belongs to the reviewed commit, runs all three smoke layers, and generates `quality-reports/final-release-manifest.json`.

That final manifest binds the same commit to the deployed URL, deployed build timestamp, provider evidence, anonymous smoke, populated synthetic smoke, and empty-state synthetic smoke. A deployment without this final same-commit manifest is not accepted.

## Preflight

Run without deploying:

```bash
npm run release:preflight -- \
  --commit "$REVIEWED_COMMIT" \
  --repository ahmedmohameda7222-ship-it/gymsands \
  --quality-reports quality-reports \
  --output quality-reports/release-preflight.json
```

The command verifies checkout and repository identity, Node 24 pins, migration reconciliation, expected migration identity, manifest identity, and retained quality evidence. It performs no provider or Supabase write. It must fail while reconciliation is pending.

Release preflight does not prove which commit Vercel deployed. After every production deployment, inspect the provider record for the exact commit and retain its deployment identity and state.

Neither `vercel.json` nor a green GitHub workflow is sufficient production evidence by itself. A production deployment whose commit differs from the reviewed merged `main` SHA remains a release-control failure.

## Production runbook

1. Select one reviewed exact 40-character SHA from `main`.
2. Confirm the quality artifact and release manifest were generated from that same SHA; record the quality workflow run ID.
3. Complete and independently verify migration-history reconciliation.
4. Confirm the database compatibility marker and expected migration version agree.
5. Run the release preflight and retain its passing JSON.
6. Confirm required Vercel production environment variables pass strict validation.
7. Merge the reviewed commit to `main` only after all required checks and approvals pass.
8. Confirm Vercel created the production deployment from that exact merged `main` SHA. Do not redeploy an old deployment object.
9. Verify provider metadata and `/api/version` match the exact deployed commit.
10. Dispatch `Post-deploy release smoke` with the exact deployment URL, commit, migration, environment, and same-commit quality workflow run ID.
11. Run and retain anonymous, populated synthetic, and empty-state synthetic smoke evidence.
12. Verify `final-release-manifest.json` records all quality, deployment, and smoke gates as passed.
13. Monitor client error-boundary events and server errors.

## Authenticated smoke

The `Post-deploy release smoke` workflow requires:

- exact deployment URL;
- exact 40-character commit SHA;
- exact expected database migration version;
- exact GitHub Actions quality run ID for that commit;
- protected populated synthetic credentials;
- protected empty-state synthetic credentials.

It rejects a downloaded quality manifest from any other commit or with missing gate evidence.

It verifies `/dashboard`, Train, applicable active-workout behavior, Eat, Meal Plan, Progress, Settings, and privacy and data controls.

It fails on:

- page errors;
- console errors;
- unhandled failures;
- critical request failures;
- HTTP 5xx responses;
- route-error UI;
- authentication loss;
- invalid identity or readiness;
- missing populated trigger state;
- excessive request growth;
- failure to generate the final deployed-release manifest.

Synthetic credentials, cookies, tokens, emails, IDs, query strings, and user-entered content are not written to artifacts.

## Rollback

Rollback is not a provider `redeploy previous` shortcut.

Select an identified commit and database marker that are compatible with the current physical schema. Run the same commit-bound preflight, deploy the identified Git commit through the controlled release path, verify `/api/version`, and run authenticated smoke.

Additive migrations remain immutable. Use a forward fix for incompatible data or schema state.

## Related operational authority

- `docs/operations/launch-runbook.md`
- `docs/operations/incident-response.md`
- `docs/operations/submission-checklists.md`
- `docs/architecture/migration-ledger-reconciliation.md`
- `plaivra_production_migration_reconciliation_plan.md`