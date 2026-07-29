# High-Value File and Symbol Index

> Generated: `2026-07-29T15:37:00+02:00`
> Repository: `ahmedmohameda7222-ship-it/gymsands`
> Canonical base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`
> Freshness: verify the manifest and Git diff before relying on this snapshot. Exact source, migrations, tests, and workflows remain executable truth.

Use this index to choose the first files. Always read the exact current source before editing.

## Repository and authority

| Concern | Entry point |
|---|---|
| agent rules | `AGENTS.md` |
| repository overview | `README.md` |
| product authority | `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md` |
| canonical domains | `docs/architecture/canonical-domain-model.md` |
| migration reconciliation | `docs/architecture/migration-ledger-reconciliation.md` |
| release model | `docs/release/README.md` |
| machine migration ledger | `supabase/migration-ledger.json` |
| stack/scripts | `package.json` |
| environment contract | `lib/env.ts`, `scripts/validate-production-env.mjs` |

## App and domains

| Concern | Entry points |
|---|---|
| root/public shell | `app/layout.tsx`, `app/page.tsx` |
| private shell | `app/(private)/layout.tsx` and layout components |
| workouts hub | `app/(private)/workouts/page.tsx`, `components/workouts/` |
| active session route | `app/(private)/workouts/session/[id]/page.tsx` |
| plan builder | `app/(private)/my-workout/plans/builder/page.tsx` |
| workout history | `app/(private)/workout-history/page.tsx` |
| exercise detail | `app/(private)/my-workout/exercises/[exerciseId]/page.tsx` |
| personal records | `app/(private)/personal-records/page.tsx` |
| nutrition | `app/(private)/calories/`, nutrition components/services |
| wellness | `app/(private)/wellness/page.tsx`, `components/lifestyle/` |
| settings | `app/(private)/settings/` |
| ChatGPT connection | `app/(private)/settings/connections/chatgpt/page.tsx`, `lib/mcp/` |
| OAuth | `app/oauth/authorize/page.tsx`, auth/OAuth route handlers |
| admin | `app/(private)/admin/` |
| privacy | `app/(private)/settings/data-privacy/page.tsx`, `lib/privacy/` |

## Active Workout engine and store

| Concern | File / symbols to locate |
|---|---|
| command types and errors | `lib/workouts/session-engine/contracts.ts` — `sessionCommandTypes`, `SessionCommandRequest`, `SessionCommandResponse`, `ActiveSessionError*` |
| deterministic transition | `lib/workouts/session-engine/reducer.ts` |
| command creation | `lib/workouts/session-engine/commands.ts` |
| timer projection | `lib/workouts/session-engine/timers.ts` |
| store | `lib/workouts/active-session-store/store.ts` |
| shared clock | `lib/workouts/active-session-store/clock.ts` |
| persistence adapter | `services/database/active-session-persistence-adapter.ts` |
| execution RPC client | `services/database/workout-session-execution.ts` |
| prescription hydration | `services/database/workout-session-prescriptions.ts` |
| performed metrics | `services/database/workout-performance.ts` |
| set detail/autosave | `services/database/workout-set-details.ts`, `services/database/workout-set-autosave.ts` |
| store/engine contracts | related tests under the same paths and `components/workouts/active-session-store-contract.test.ts` |

## Active Workout UI overlay (PR #90 only)

| Concern | Entry point |
|---|---|
| route/controller | `components/workouts/active-workout/active-workout-core-session.tsx` |
| execution shell | `components/workouts/active-workout/active-workout-execution-shell.tsx` |
| runtime model | `components/workouts/active-workout/active-workout-runtime-model.ts` |
| UI model | `components/workouts/active-workout/active-workout-ui-model.ts` |
| source compatibility | `components/workouts/active-workout/active-workout-source-compatibility.ts` |
| details bridge | `components/workouts/active-workout/active-workout-details-bridge.tsx` |
| review/completion | `components/workouts/active-workout/active-workout-review-bridge.tsx` |
| sticky actions | `components/layout/mobile-sticky-actions.tsx` |
| i18n | `lib/i18n/active-workout.ts`, `messages/{en,de,ar}.json` |
| rendered QA | `scripts/run-aw5-correction-layout-qa.mjs`, `scripts/aw5-correction-qa-*.mjs`, `scripts/train-layout-qa-fixture.mjs` |

## Muscle Intelligence

| Concern | Entry point |
|---|---|
| taxonomy/registry | `lib/train/muscle-intelligence/` |
| advanced mappings | `lib/train/muscle-intelligence/advanced-mapping-registry.ts` |
| plan analysis | `lib/train/muscle-intelligence/plan-advanced-analysis.ts` |
| session analysis | `lib/train/muscle-intelligence/session-analysis.ts` and advanced analysis files |
| heat-map UI | `components/train/muscle-heat-map/` |
| exercise display | `lib/train/exercise-display.ts` |
| migration contracts | `lib/product/muscle-intelligence-*.test.ts` |
| atlas geometry | `scripts/verify-muscle-atlas-geometry.mjs` |

## MCP, privacy and security

| Concern | Entry point |
|---|---|
| tool allowlist/contracts | `lib/mcp/tools.ts` |
| task projections | `lib/mcp/context-projections.ts` |
| safe execution | `lib/mcp/tool-executor-safe.ts` |
| public handler coverage | `lib/mcp/public-tool-handler-coverage.test.ts` |
| export/deletion | `lib/privacy/` and database privacy services |
| OAuth/CIMD authority | `docs/chatgpt-app/` |
| security migrations | relevant immutable files under `supabase/migrations/` |

## CI and database

| Concern | Entry point |
|---|---|
| scoped PR gate | `.github/workflows/pr-quality.yml`, `scripts/ci-change-scope.mjs` |
| full Quality | `.github/workflows/quality.yml`, `scripts/run-quality-gate.mjs` |
| Exact Release | `.github/workflows/exact-release-quality-validation.yml`, `scripts/exact-release-orchestrator.mjs` |
| preflight | `.github/workflows/release-preflight.yml`, `scripts/release-preflight.mjs` |
| migration replay | `scripts/replay-local-migration-chain.mjs` |
| DB verification | `scripts/run-database-verification.mjs`, `supabase/verification/` |
| ledger | `scripts/check-migration-ledger.mjs`, `supabase/migration-ledger.json` |
| rendered QA | `scripts/run-rendered-qa.mjs`, `scripts/run-train-layout-qa.mjs` |
| release metadata | `scripts/create-release-manifest.mjs`, `scripts/verify-built-release-metadata.mjs` |

## Search patterns

Prefer narrow searches:

```bash
rg -n "symbolName|rpc_name" exact/relevant/paths
rg -n "from [\"']@/path|import\\(" app components lib services
rg -n "table_name|rpc_name" services lib supabase/verification supabase/migrations
rg -n "export|delete|privacy" lib/privacy services
```

Do not begin with an unrestricted full-repository read.
