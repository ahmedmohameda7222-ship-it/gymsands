# Plaivra release integrity

A public Plaivra release is a compatible code, database, configuration, and browser-acceptance package. A successful local build, HTTP 200 health response, successful login, provider `READY` state, or matching schema marker is not sufficient on its own.

## Separate operations

Do not combine these operations conceptually or operationally:

1. **Pre-merge release gate** - complete required code review and CI, migration-history reconciliation, compatibility-marker verification, strict production environment validation, `npm run release:preflight`, and explicit release-owner approval for the exact candidate change.
2. **Merge** - merge the approved exact change to `main`. Under the current Vercel Git model, this merge is production-triggering.
3. **Automatic Vercel deployment** - Vercel should create a production deployment only for the resulting `main` commit. Feature branches and pull requests must not create automatic Vercel deployments.
4. **Production verification** - confirm that Vercel built the exact resulting 40-character `main` SHA and that provider metadata, `/api/version`, and `/api/health` identify that commit.
5. **Production acceptance** - complete anonymous smoke, populated and empty authenticated synthetic smoke, browser/console/network review, screenshots, route timings, request counts, and the final launch verdict.
6. **Rollback** - select and verify a separately approved code/schema-compatible release pair. Do not redeploy an unrelated old deployment object.

Any failed or blocked preflight is a no-go before merge. The migration ledger must be reconciled before the production-triggering merge to `main`. Do not redeploy an old provider artifact as a substitute for deploying the reviewed Git commit. The July 2026 incident persisted because production redeployed an old SHA while `main` had advanced.

## Provider controls

### Vercel

- `vercel.json` declares repository policy intent with minimatch branch rules: `"**": false` disables automatic deployments for slash-delimited and non-main branch names, while `"main": true` preserves automatic production deployment for `main`.
- Repository configuration and tests verify policy intent only. They do not prove actual Vercel provider enforcement.
- After every candidate branch push, inspect the Vercel deployment list for the exact pushed SHA. Any new branch or pull-request deployment means the main-only policy remains unresolved.
- Vercel does not use `ignoreCommand`.
- Vercel does not use preview or production exact-SHA approval environment variables, including `PLAIVRA_PREVIEW_RELEASE_SHA` or `PLAIVRA_PRODUCTION_RELEASE_SHA`.
- Required GitHub review and CI checks, migration reconciliation, release preflight, and explicit owner approval protect `main` before merge.
- A merge to `main` is production-triggering under the current Vercel Git-connected model.
- After merge, confirm that provider metadata, `/api/version`, and `/api/health` identify the exact resulting 40-character `main` SHA.
- Migration reconciliation, release preflight, smoke tests, browser QA, and release manifests remain mandatory.
- A deployment is not accepted merely because Vercel reports it as `READY`.
- Do not redeploy an old Vercel deployment object as a substitute for deploying the reviewed Git commit.

### Netlify

Netlify remains configured as a separate secondary provider. Its production ignore gate continues to require an exact approved SHA through `scripts/netlify-production-release-gate.mjs`. Node 24 remains pinned in `netlify.toml`. Netlify preview and branch deployments retain their existing behavior and do not replace Vercel production evidence.

For a Netlify production release, keep `PLAIVRA_PRODUCTION_RELEASE_SHA` empty during ordinary merges. Set it only after owner and quality-control approval for one exact commit, then clear or rotate it after acceptance. Vercel does not use this variable.

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

The current repository ledger records 32 applied migrations, zero pending migrations, zero schema-applied-untracked migrations, zero unresolved migrations, and reconciliation state `reconciled`. Repository metadata expects migration `20260715010000`, while the production compatibility marker remains `20260711014500`; application release readiness therefore remains blocked until the marker is separately advanced and all remaining release gates pass.

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

Run without deploying and before any production-triggering merge:

```bash
npm run release:preflight -- \
  --commit "$REVIEWED_COMMIT" \
  --repository ahmedmohameda7222-ship-it/gymsands \
  --quality-reports quality-reports \
  --output quality-reports/release-preflight.json
```

The command verifies checkout and repository identity, Node 24 pins, migration reconciliation, expected migration identity, manifest identity, and retained quality evidence. It performs no provider or Supabase write. With reconciliation complete, it must pass for the exact reviewed commit before merge; production compatibility-marker verification remains a separate mandatory pre-merge gate.

Release preflight does not prove which branches Vercel deploys or which commit Vercel deployed. Repository policy tests do not prove provider enforcement. Verify branch suppression after candidate pushes and verify exact production identity after a production-triggering merge.

Neither `vercel.json` nor a green GitHub workflow is sufficient provider evidence by itself. An unexpected branch deployment or a production deployment whose commit differs from the reviewed merged `main` SHA remains a release-control failure.

## Production runbook

1. Complete code review and all required CI checks for the candidate change.
2. Complete migration-history reconciliation and independent verification.
3. Confirm the compatibility marker and expected migration identity.
4. Run strict production environment validation without exposing secret values.
5. Run `npm run release:preflight` and retain its passing result.
6. Obtain explicit release-owner approval for the exact reviewed change.
7. Merge the approved exact change to `main`.
8. Record the exact resulting 40-character `main` SHA.
9. Confirm Vercel production was built from that exact SHA.
10. Verify provider metadata, `/api/version`, and `/api/health`.
11. Run anonymous smoke.
12. Run populated and empty authenticated synthetic smoke.
13. Review browser, console, network, screenshots, route timings, and request counts.
14. Record the final launch verdict.

Any failed or blocked preflight is a no-go before merge. A provider `READY` state alone is not acceptance. Netlify remains separate and keeps its exact-SHA production gate.

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
