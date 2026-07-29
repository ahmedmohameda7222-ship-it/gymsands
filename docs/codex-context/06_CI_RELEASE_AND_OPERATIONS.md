# CI, Release and Operations

> Generated: `2026-07-29T15:37:00+02:00`  
> Repository: `ahmedmohameda7222-ship-it/gymsands`  
> Canonical base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`  
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`  
> Freshness: verify the manifest and Git diff before relying on this snapshot. Exact source, migrations, tests, and workflows remain executable truth.

## Validation layers

| Layer | Trigger / purpose | Write boundary |
|---|---|---|
| Phase A / planner evidence | task-specific repository and scope validation | no Production write |
| Scoped PR Quality | every PR head; path-classified jobs | no Production write |
| Canonical Quality | `ready_for_review` event on exact stable head; full release evidence | no Production write |
| Exact Release | validates and reuses the existing immutable canonical Quality artifact | no Quality rerun; read-only preflight |
| Strict release preflight | exact reviewed identity and schema compatibility | no provider/Supabase write |
| Merge | explicit approved exact head to `main` | production-triggering under current Vercel model |
| Post-deploy acceptance | provider identity, version/health, smoke, browser/network evidence | observational unless separately authorized |

## Scoped PR Quality

`.github/workflows/pr-quality.yml`:

- checks exact PR identity and clean diff;
- classifies changes through `scripts/ci-change-scope.mjs`;
- selects core, database, UI/i18n, CI-contract, build and dependency jobs;
- unknown non-doc paths fail safe to broad validation;
- docs-only changes run integrity and summary without application install;
- superseded runs are cancelled by PR-number concurrency.

## Canonical phase-close Quality

`.github/workflows/quality.yml`:

- runs only when a Draft PR is marked Ready for review;
- checks exact head/base identity;
- performs full migration, database, dependency, lint, typecheck, unit, integration, script, i18n, telemetry, environment, production-build and rendered-QA gates;
- emits one immutable `quality-reports-<run-id>` artifact;
- must be rerun on a new exact head by returning the PR to Draft, correcting, then marking Ready again.

Never reuse an artifact from another head, base, run, request, repository or migration target.

## Exact Release

`.github/workflows/exact-release-quality-validation.yml` and `scripts/exact-release-orchestrator.mjs`:

- accept a named successful canonical Quality run/artifact;
- verify repository, exact commit, base, run, request, migration, manifest and digest identities;
- must not dispatch or rerun Quality;
- run a read-only release preflight.

## Release compatibility

- Latest physical Production migration: `20260726114212`.
- Released compatibility marker remains `20260724232734`.
- Marker version is `2`.
- Schema advancement does not authorize marker promotion.
- Repository state or passing CI does not authorize merge/deploy.

## Deployment boundaries

- A merge to `main` may trigger Vercel Production.
- Explicit release-owner approval must precede a production-triggering merge.
- Netlify is separate and does not replace Vercel production identity.
- Do not use provider-ready status alone as acceptance.
- Do not redeploy an unrelated old build as an unverified rollback shortcut.

## High-value files

- `docs/release/README.md`
- `.github/workflows/pr-quality.yml`
- `.github/workflows/quality.yml`
- `.github/workflows/exact-release-quality-validation.yml`
- `.github/workflows/release-preflight.yml`
- `scripts/ci-change-scope.mjs`
- `scripts/run-quality-gate.mjs`
- `scripts/exact-release-orchestrator.mjs`
- `scripts/create-release-manifest.mjs`
- `scripts/release-preflight.mjs`
- `scripts/verify-built-release-metadata.mjs`
- `scripts/replay-local-migration-chain.mjs`
- `scripts/check-migration-ledger.mjs`
- `supabase/migration-ledger.json`

## Phase-close order

```text
Draft implementation
→ focused local validation
→ scoped PR Quality
→ manual source/rendered evidence review
→ mark exact stable head Ready once
→ canonical Quality
→ verify immutable artifact
→ Exact Release using that same artifact
→ strict read-only preflight
→ explicit merge/release approval
→ merge exact approved head
→ provider and post-deploy acceptance
```
