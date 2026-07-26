# Plaivra release integrity

A Plaivra release is one compatible package: reviewed code, reconciled database history, approved configuration, exact provider deployment identity, and retained browser acceptance evidence.

## Operational boundaries

Keep these operations separate:

1. **Draft pull-request validation** — automatic path-scoped jobs validate only the affected core, database, UI/i18n, CI-contract, build, and dependency surfaces. Unknown paths fail safe to broad validation.
2. **Phase-close Quality** — marking the exact Draft PR head Ready for review runs the complete canonical Quality pipeline once and produces one immutable run-keyed artifact.
3. **Exact Release** — request-bound validation consumes that existing successful Quality artifact, verifies its identities and digests, and runs the read-only release preflight. It must not dispatch or rerun Quality.
4. **Production release gate** — reconcile migration history, compatibility markers, and the exact reviewed release candidate, then obtain explicit release-owner approval.
5. **Merge** — merge only the approved exact head to `main`.
6. **Automatic Vercel deployment** — the current Git-connected model may deploy the resulting `main` commit.
7. **Production verification and acceptance** — prove provider identity, `/api/version`, `/api/health`, smoke, browser, console, network, timing, and retained evidence.
8. **Rollback or forward fix** — use a separately reviewed code/schema-compatible release pair; never substitute an unrelated old deployment.

A passing Draft PR check is not phase closure. A passing phase-close Quality or read-only release preflight is not independent Production authorization. A provider `READY` state alone is not acceptance.

## Two-tier pull-request validation

### Automatic scoped PR Quality

`.github/workflows/pr-quality.yml` runs on each PR head and uses `scripts/ci-change-scope.mjs` to choose independent parallel jobs:

- repository identity and `git diff --check` always run;
- lint, typecheck, and unit tests run for non-document changes;
- migration replay, database lint, permanent SQL verification, ledger checks, and integration tests run only for database-impacting changes;
- rendered UI and message checks run only for runtime UI/i18n changes;
- CI/script contracts run only for workflow, script, agent-policy, or toolchain changes;
- production environment and build checks run only for runtime or dependency changes;
- dependency audit runs only when dependency manifests change;
- documentation-only changes run the integrity and summary jobs without reinstalling the application.

Test-only source changes do not trigger browser QA or a production build unless another changed path requires them. Unrecognized non-document paths use a conservative broad fallback.

Successful checks print concise status. Failed checks print a bounded useful tail and retain the full focused log as a short-lived workflow artifact. Superseded PR runs are cancelled by PR-number concurrency.

### Canonical phase-close Quality

`.github/workflows/quality.yml` runs only on the standard `ready_for_review` PR event. It retains every complete release gate and produces `quality-reports-<run-id>`.

The operational sequence is:

1. keep the implementation PR Draft while scoped validation and ordinary corrections continue;
2. when the exact head is stable and scoped checks pass, mark it Ready for review;
3. wait for the one complete canonical Quality run on that exact head;
4. if a correction changes the head, convert the PR back to Draft before editing, complete scoped validation, then mark it Ready again;
5. never reuse a Quality artifact from another head, base, run attempt, repository, migration target, or validation request.

## Current Production migration state

Verified from the reconciled machine ledger and AW-4 Production evidence captured on 2026-07-26:

- 75 physical Production migration records;
- 63 exact applications and 12 immutable generated-version aliases;
- latest physical identity `20260726114212_active_workout_aw4_session_engine`;
- `pendingCount=0`, `schemaVerifiedUntrackedCount=0`, and `unresolvedCount=0`;
- `historyRepair.state=reconciled` and `release_ready=true`;
- released compatibility marker remains `20260724232734`.

The AW-4 migration was applied exactly once to Plaivra Production and not to Activity Catalog. Applied repository SQL remains immutable. The machine authority is `supabase/migration-ledger.json`; the human summary is `docs/architecture/migration-ledger-reconciliation.md`.

Physical schema advancement does not independently authorize merge, deployment, or compatibility-marker promotion.

## Required exact-head evidence

Canonical Quality must retain results for:

- repository integrity;
- full migration-chain rehearsal;
- database lint and disposable database verification;
- migration-ledger validation;
- dependency audit;
- lint, typecheck, unit, integration, script, i18n, and telemetry tests;
- production environment validation;
- release metadata and production build;
- rendered QA and Train QA;
- release manifest, evidence index, artifact metadata, and unit-failure parity.

Exact Release must verify the existing canonical run and artifact, then retain its own validation summary and read-only release-preflight artifact. Generated screenshots, logs, and manifests belong in workflow artifacts, not permanent source files.

## Build metadata and `/api/version`

Build metadata must include:

- exact 40-character commit SHA;
- generated ISO-8601 build timestamp;
- environment;
- schema compatibility version;
- expected database migration version;
- migration reconciliation state;
- schema-applied-untracked count.

`GET /api/version` is a public release assertion. It fails closed when artifact identity, schema compatibility, expected migration identity, or migration reconciliation is invalid. It does not replace physical-schema verification, migration rehearsal, provider evidence, or authenticated browser smoke.

## Preflight

The repository preflight is non-deploying and accepts only an exact canonical Quality artifact whose manifest, metadata, evidence index, gates, commit, base, run ID, request identity, and expected migration all match.

For an explicit local review:

```bash
npm run release:preflight -- \
  --mode review \
  --commit "$REVIEWED_COMMIT" \
  --comparison-base "$COMPARISON_BASE" \
  --quality-run-id "$QUALITY_RUN_ID" \
  --validation-request-id "$VALIDATION_REQUEST_ID" \
  --preflight-request-id "$PREFLIGHT_REQUEST_ID" \
  --expected-migration "$EXPECTED_MIGRATION" \
  --repository ahmedmohameda7222-ship-it/gymsands \
  --validation-context stage1-infrastructure-validation \
  --production-authorization-token "" \
  --quality-reports quality-reports \
  --output quality-reports/release-preflight.json
```

Unknown modes, mismatched identities, missing files, stale evidence, failed gates, or tampered digests fail closed. The command performs no provider or Supabase write.

## Provider controls

### Vercel

`vercel.json` declares main-only deployment policy intent. Repository tests prove policy intent only, not provider enforcement. A merge to `main` is production-triggering under the current model, so all fail-closed gates and explicit authorization must precede merge.

### Netlify

Netlify remains separate. Its production ignore gate uses `scripts/netlify-production-release-gate.mjs` and requires the exact approved `PLAIVRA_PRODUCTION_RELEASE_SHA`. Preview and branch behavior do not replace Vercel Production evidence.

## Production runbook

1. Complete scoped PR validation and code review.
2. Mark the stable exact head Ready for review and obtain one passing canonical Quality artifact.
3. Complete Exact Release and read-only release preflight against that same artifact.
4. Confirm migration history, compatibility marker, expected migration, and Activity Catalog isolation.
5. Obtain explicit release-owner approval for the exact head.
6. Merge the approved exact change to `main`.
7. Record the resulting 40-character `main` SHA and verify provider build identity.
8. Verify `/api/version`, `/api/health`, anonymous smoke, populated and empty authenticated synthetic smoke, browser, console, network, screenshots, route timings, and request counts.
9. Record the final launch verdict.

## Rollback

Do not use provider “redeploy previous” as an unverified shortcut. Select a commit and database state compatible with the current physical schema, pass the same gates, deploy through the controlled path, and verify the resulting release. Additive migrations remain immutable; incompatible schema or data requires a forward fix.

## Related current authority

- `AGENTS.md`
- `.github/workflows/pr-quality.yml`
- `.github/workflows/quality.yml`
- `.github/workflows/exact-release-quality-validation.yml`
- `docs/operations/launch-runbook.md`
- `docs/operations/incident-response.md`
- `docs/operations/submission-checklists.md`
- `docs/architecture/migration-ledger-reconciliation.md`
- `supabase/migration-ledger.json`
