# Plaivra release integrity

A Plaivra release is one compatible package: reviewed code, reconciled database history, approved configuration, exact provider deployment identity, and retained browser acceptance evidence.

## Operational boundaries

Keep these operations separate:

1. **Pre-merge release gate** — complete review, exact-head CI, migration-history reconciliation, compatibility checks, environment validation, release preflight, and explicit release-owner approval.
2. **Merge** — merge only the approved exact head to `main`.
3. **Automatic Vercel deployment** — the current Git-connected model may deploy the resulting `main` commit.
4. **Production verification** — prove the provider built the exact resulting 40-character `main` SHA and that `/api/version` and `/api/health` identify it.
5. **Production acceptance** — complete anonymous and authenticated synthetic smoke, browser/console/network review, timings, request counts, and retained evidence.
6. **Rollback or forward fix** — use a separately reviewed code/schema-compatible release pair; never substitute an unrelated old deployment.

Any failed or blocked preflight is a no-go before merge. The migration ledger must be reconciled before the production-triggering merge. A provider `READY` state alone is not acceptance.

## Current production migration state

Verified on 2026-07-17:

- 35 applied migrations;
- latest identity: `20260717032851_retire_legacy_600_exercise_catalog`;
- two repository-only Muscle Intelligence Phase 2 migrations pending production application;
- zero schema-applied-untracked migrations, with `pendingCount=2` and `unresolvedCount=2`;
- `historyRepair.state=pending`;
- ledger-level `releaseReady=false`.

The latest migration retired only the provenance-matched generated 600-row legacy exercise catalog across `exercises`, `workouts`, and `exercise_library`. Post-application verification confirmed zero target rows remain and existing user workout plans and performed sessions were preserved.

The pending Phase 2 schema and seed migrations are repository artifacts only. They must not be applied, marked applied, or used to advance the release marker without separate authorization and production reconciliation.

The machine authority is `supabase/migration-ledger.json`. The human record is `docs/architecture/migration-ledger-reconciliation.md`. Applied migrations are immutable and must never be replayed, renamed, rewritten, deleted, or manually reordered.

## Provider controls

### Vercel

`vercel.json` declares main-only deployment policy intent. Repository configuration and tests verify policy intent only. They do not prove actual Vercel provider enforcement.

After candidate pushes, inspect the Vercel deployment list for the exact pushed SHA. Any unexpected feature-branch or pull-request deployment is a release-control failure.

Vercel does not use `ignoreCommand`, `PLAIVRA_PREVIEW_RELEASE_SHA`, or `PLAIVRA_PRODUCTION_RELEASE_SHA`. Vercel does not use preview or production exact-SHA approval environment variables. A merge to `main` is production-triggering under the current model, so all fail-closed gates and explicit authorization must precede merge.

### Netlify

Netlify remains separate. Its production ignore gate uses `scripts/netlify-production-release-gate.mjs` and requires the exact approved `PLAIVRA_PRODUCTION_RELEASE_SHA`. Preview and branch behavior do not replace Vercel production evidence.

## Required exact-head evidence

Quality must retain results for:

- repository integrity;
- full migration-chain rehearsal;
- database lint and disposable database verification;
- migration-ledger validation;
- dependency audit;
- lint, typecheck, unit, integration, script, and telemetry tests;
- production environment validation;
- release metadata and production build;
- rendered QA and Train QA;
- release manifest and release preflight.

After deployment, retain exact-provider identity, anonymous smoke, populated synthetic smoke, empty-state synthetic smoke, browser/console/network review, screenshots, timings, and the final release verdict.

Generated screenshots, logs, and manifests belong in workflow artifacts or external release evidence. They are not committed as permanent source files.

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

Run before any production-triggering merge:

```bash
npm run release:preflight --   --commit "$REVIEWED_COMMIT"   --repository ahmedmohameda7222-ship-it/gymsands   --quality-reports quality-reports   --output quality-reports/release-preflight.json
```

The command performs no provider or Supabase write.

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

## Rollback

Do not use provider “redeploy previous” as an unverified shortcut. Select a commit and database state compatible with the current physical schema, pass the same gates, deploy through the controlled path, and verify the resulting release. Additive migrations remain immutable; incompatible schema or data requires a forward fix.

## Related current authority

- `docs/operations/launch-runbook.md`
- `docs/operations/incident-response.md`
- `docs/operations/submission-checklists.md`
- `docs/architecture/migration-ledger-reconciliation.md`
- `supabase/migration-ledger.json`
