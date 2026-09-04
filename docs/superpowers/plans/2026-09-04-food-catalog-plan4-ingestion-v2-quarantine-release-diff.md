# Food Catalog Plan 4 — Ingestion V2, Quarantine, and Release-Diff Implementation Plan

> Use Superpowers execution discipline, causal TDD, systematic debugging on failures, requesting-code-review and verification-before-completion. In Classic ChatGPT without local worktrees/subagents, execute the same task order through GitHub + CI without weakening evidence.

**Goal:** Build the provider-neutral Plan 4 ingestion platform from deterministic adapter output through dry-run, canonical decision + quarantine disposition, privileged draft-only mutation, reconciliation, release diff and immutable operational evidence.

**Spec:** `docs/superpowers/specs/2026-09-04-food-catalog-plan4-ingestion-v2-quarantine-release-diff-design.md`

**Parent:** `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`

**Frozen base:** `7dde8c1166d255da493f6a5f0440c9078e5abd9a`

**Branch:** `feat/food-catalog-ingestion-v2`

**Migration:** `supabase/migrations/20260904100000_food_catalog_ingestion_v2_authority.sql`

## Constraints

- Plan 4 only; do not begin Plan 5.
- Canonical outcomes stay `MATCH | CREATE | POSSIBLE_DUPLICATE | REJECT`; quarantine is orthogonal disposition/audit state.
- Provider-neutral contracts only; synthetic/reference adapter is test-only; no USDA-specific code/data.
- Existing implementation is migration input, not target authority.
- Unknown nutrition stays `null`; known zero stays `0`; no imputation/conversion fabrication.
- No name/nutrition-only auto-match.
- Production execution is draft-only and command-bounded.
- No activation, verification approval, generation/current-pointer mutation, member cutover, deployment, Food population, Activity Catalog, My Foods or historical snapshot mutation.
- One forward migration only; never modify already-applied migration bytes.
- Every new behavior follows RED -> observed causal failure -> minimal GREEN -> focused verification.
- Canonical full `Quality` is the final exact-head phase-close gate.

## Bounded inspection

Must read: `AGENTS.md`, `README.md`, current control-plane architecture/state, parent Food Catalog architecture, Batch 0 plan/schema/runtime, Plan 1 core migration, Plan 3 design/migration, Food Catalog service contracts/store/index, migration ledger and reconciliation doc.

Search only for current ingestion-table consumers, direct physical-table writes, activation/generation references, database-verification registry, Quality/change-scope rules and service-role privilege expectations. Expand only when an import, failing test, SQL dependency or CI/security boundary requires it. Do not inspect/change unrelated Nutrition, Train, Activity Catalog, later Plan implementation, deployment or member UI work.

## Task 1 — Adapter contracts, structured evidence, normalization and manifest

Create `adapter.ts`, `adapter.test.ts`, `synthetic-adapter.ts`, `synthetic-adapter.test.ts`; modify existing ingestion contracts/normalize/validate/manifest and focused tests.

1. RED tests define deterministic adapter API and structured identity/name/serving/taxonomy/market evidence.
2. RED tests prove equivalent reordered semantic input has identical normalized ManifestContent checksum and volatile envelope metadata has no effect.
3. RED 1,001-candidate replay test proves deterministic checksum under reverse/permuted input.
4. Observe causal RED in CI/focused suite.
5. GREEN minimal provider-neutral implementation and full semantic collection canonicalization.
6. Verify focused GREEN; commit.

## Task 2 — Matching, disposition/quarantine and release diff

Create `matching.ts/.test.ts`, `quarantine.ts/.test.ts`, `release-diff.ts/.test.ts`.

1. RED matching precedence: exact versioned source identity -> exact GTIN -> redirect -> strong semantic identity -> high-confidence state/preparation/alias evidence -> `POSSIBLE_DUPLICATE` -> `CREATE`.
2. RED proves name-only/nutrition-only similarity never returns `MATCH`.
3. RED proves structural invalidity returns canonical `REJECT` + disposition `REJECT`; `POSSIBLE_DUPLICATE` is disposition `QUARANTINE`; otherwise-valid provisional `MATCH`/`CREATE` may be quarantined for explicit conflicts without changing the four canonical outcomes.
4. RED release-diff classifications/checksum cover required source, nutrition, serving, naming, barcode, taxonomy, market, canonical-match and quarantine transitions.
5. Observe RED; implement pure deterministic functions with no persistence/provider knowledge; verify GREEN; commit.

## Task 3 — Engine, semantic batch identity and reconciliation

Create `engine.ts/.test.ts`, `reconciliation.ts/.test.ts`.

1. RED desired `buildFoodCatalogDryRun(adapter, artifact, matchIndex)` flow.
2. RED proves identical semantic input => identical batch identity; changed source/config/release/manifest/expected counts => changed batch identity; run-attempt metadata does not affect identity.
3. RED reconciliation detects missing/extra/duplicate results, manifest mismatch, idempotency mismatch, partial execution, quarantine divergence and count mismatch.
4. Observe RED; GREEN compose normalization/validation/matching/disposition/manifest and pure reconciliation; verify including 1,001-candidate replay; commit.

## Task 4 — Forward schema: semantic batch authority, lease, quarantine, reconciliation, diff/events

Create:
- `lib/product/food-catalog-ingestion-v2-authority-migration.test.ts`
- `supabase/migrations/20260904100000_food_catalog_ingestion_v2_authority.sql`
- `supabase/verification/food-catalog-ingestion-v2-authority.sql`
- `scripts/food-catalog-ingestion-v2-verification-registry.test.mjs`

Modify database-verification registry, migration ledger and migration-reconciliation doc.

1. RED static migration test demands semantic checksum/expected quarantine count; lease owner/token/epoch/heartbeat/expiry; immutable quarantine + resolution; reconciliation; release diff; operational events; indexes/RLS/grants; narrow service-role-only RPCs.
2. RED ledger test expects exactly one pending Plan 4 migration (`pending=1`, `unresolved=1`, `historyRepair=pending`) while preserving physical Production count `118`, exact-name applied count, latest physical identity `20260903210503_food_catalog_generation_authority`, compatibility marker `20260724232734`, and no invented Production alias.
3. Observe RED.
4. GREEN forward migration; strengthen Batch 0 additively only.
5. Implement DB lease acquisition/heartbeat/takeover, immutable quarantine resolution/events, exact-manifest command guards and fail-closed reconciliation.
6. DB verification proves live-lease rejection, stale takeover, immutable history, RLS and command-only access for new Plan 4 authority tables.
7. Register verification and ledger pending truthfully. Do **not** apply migration to Production during implementation.
8. Verify GREEN; commit.

## Task 5 — Narrow server command store and draft-only executor

Create ingestion server contracts/store, Supabase command adapter + tests, ingestion service + tests; modify server index and V2 boundary test.

1. RED adapter tests require only approved Plan 4 RPC mutations and reject changed semantic command reuse.
2. RED service tests require exact reviewed manifest + lease for Production mutation; accepted CREATE remains `draft`; exact MATCH attaches provenance; quarantine creates no accepted canonical mutation; retries are idempotent; reconciliation precedes completion.
3. RED boundary proves no activation/verification/generation/current-pointer mutation and no arbitrary direct canonical `.from(...).insert/update/delete` path.
4. Observe RED.
5. GREEN narrow RPC port/adapter + orchestration with explicit operation IDs; no raw Supabase client export.
6. Verify GREEN; commit.

## Task 6 — Cross-boundary security/replay proof

Create `lib/product/food-catalog-ingestion-v2-boundary.test.ts`; touch only verified registry/change-scope dependencies if necessary.

1. RED asserts no real provider adapter/data/download runtime, member/client access, market inference, activation/promotion, historical/My Foods writes, or generic canonical editor.
2. RED requires executable >1,000 replay, duplicate source identity, changed semantic command reuse, lease and idempotency coverage.
3. Observe RED; fix only real gaps revealed; verify focused ingestion/domain/server/product/script suites plus typecheck/lint/prettier scope; commit after fresh evidence.

## Task 7 — Review, exact-head QA and technical gate

1. One Plan 4 PR to `main`; verify diff ancestry from frozen base and no unrelated scope.
2. Inspect checks. On failure, use systematic debugging: first causal failing job/step/log -> root cause -> smallest corrective TDD cycle; never blind rerun.
3. Perform independent code review against this spec; resolve every P0/P1 and correctness-affecting P2.
4. Freeze exact head after last correction.
5. Run exact-head PR verification and canonical `.github/workflows/quality.yml` phase-close on frozen head; do not change head afterward.
6. Confirm unresolved P0/P1 = 0; migration remains repo-pending/unapplied; Production Food/catalog generation unchanged; Activity Catalog untouched.
7. STOP. Return only PR number, exact head, canonical Quality run/job, unresolved P0/P1, migration status, Production safety status, exact squash-merge approval request.

## Preflight contradiction scan

- Task 1 -> 2/3: deterministic provider-neutral candidate/manifest contract: compatible.
- Task 2 -> 3: four canonical outcomes plus orthogonal disposition: compatible with program authority.
- Task 3 -> 4/5: semantic identity excludes operational run metadata: compatible.
- Task 4 -> 5: database owns Production serialization and trusted mutation commands: compatible.
- Task 5 -> 6: no raw canonical editor: compatible.
- Task 6 -> 7: executable boundary evidence feeds exact-head Quality: compatible.

No task requires a product-policy decision, real provider data, activation, verification approval, generation promotion, member cutover or Activity Catalog mutation.