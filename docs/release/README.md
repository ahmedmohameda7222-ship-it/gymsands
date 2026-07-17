# Plaivra release integrity

A Plaivra release is one compatible package: reviewed code, reconciled database history, approved configuration, exact provider deployment identity, and retained browser acceptance evidence.

## Operational boundaries

Keep these operations separate:

1. **Pull-request review gate** — prove exact-head repository integrity, full migration-chain rehearsal, database verification, manifest consistency, runtime identity, and all quality evidence. A migration PR may be review-ready while its repository-only migrations remain pending, but only when the state is pending-only and contains zero schema-applied-untracked migrations.
2. **Production release gate** — reconcile migration history, compatibility markers, and the exact reviewed release candidate, then pass strict release preflight and obtain explicit release-owner approval.
3. **Merge** — merge only the approved exact head to `main`.
4. **Automatic Vercel deployment** — the current Git-connected model may deploy the resulting `main` commit.
5. **Production verification** — prove the provider built the exact resulting 40-character `main` SHA and that `/api/version` and `/api/health` identify it.
6. **Production acceptance** — complete anonymous and authenticated synthetic smoke, browser/console/network review, timings, request counts, and retained evidence.
7. **Rollback or forward fix** — use a separately reviewed code/schema-compatible release pair; never substitute an unrelated old deployment.

A passing review preflight is not production release authorization. Any failed or blocked strict release preflight is a no-go before merge. The migration ledger must be reconciled before the production-triggering merge. A provider `READY` state alone is not acceptance.

## Current production migration state

Verified on 2026-07-17:

- 37 applied migrations;
- latest identity: `20260717051011_muscle_intelligence_phase2_curated_seed`;
- the two Muscle Intelligence Phase 2 migrations are applied and tracked;
- zero schema-applied-untracked migrations, with `pendingCount=0` and `unresolvedCount=0`;
- `historyRepair.state=reconciled`;
- ledger-level migration-history `releaseReady=true`.

The applied Phase 2 schema and seed produced the reviewed 60-exercise cohort, six RLS-protected curation tables, 60 published mapping sets, 180 entries, 180 localizations, 180 aliases, 32 relationships, 21 research sources, 89 evidence rows, 60 reviews, and nine exact provider links. Post-application verification found zero checksum drift, zero drafts, zero alias collisions, and zero retired legacy target rows.

The physical production migration head is `20260717051011`. The deployed release compatibility marker intentionally remains `20260717032851` until a separately coordinated exact-head code merge and production deployment. Do not advance the marker independently.

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
- release manifest and preflight evidence, including separate review and release readiness.

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

## Preflight modes

### Pull-request review

For an explicit local review of a migration PR:

```bash
npm run release:preflight -- \
  --mode review \
  --commit "$REVIEWED_COMMIT" \
  --repository ahmedmohameda7222-ship-it/gymsands \
  --quality-reports quality-reports \
  --output quality-reports/release-preflight.json
```

The GitHub Quality workflow explicitly passes `--mode review` for `pull_request` events and `--mode release` for pushes to `main`. The Node preflight never infers a weaker mode from environment context. Review mode still validates the exact commit, manifest, runtime, migration state, and every required quality gate.

With reconciled migration history, both review and strict release evaluation may report migration readiness. This still does not authorize merge, compatibility-marker advancement, or deployment.

### Strict production release

Run before any production-triggering merge:

```bash
npm run release:preflight -- \
  --mode release \
  --commit "$REVIEWED_COMMIT" \
  --repository ahmedmohameda7222-ship-it/gymsands \
  --quality-reports quality-reports \
  --output quality-reports/release-preflight.json
```

`release` is the universal default whenever mode is omitted, including in a pull-request environment. Only an explicit `--mode review` selects review behavior. Release mode remains fail-closed for identity, evidence, runtime, manifest, or migration-history failures, and unknown modes fail closed. The command performs no provider or Supabase write.

## Production runbook

1. Complete code review and all required CI checks for the candidate change.
2. Complete migration-history reconciliation and independent verification.
3. Confirm the compatibility marker and expected migration identity.
4. Run strict production environment validation without exposing secret values.
5. Run `npm run release:preflight -- --mode release ...` and retain its passing result.
6. Obtain explicit release-owner approval for the exact reviewed change.
7. Merge the approved exact change to `main` only as part of the coordinated compatibility-marker and deployment operation.
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