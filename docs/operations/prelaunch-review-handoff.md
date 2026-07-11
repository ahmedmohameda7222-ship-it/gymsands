# Plaivra pre-launch review handoff

**Verdict:** NO-GO for merge or public launch

**Branch:** `prelaunch-remediation-2026-07`

**Audited base:** `60a204d5fc20fc396be1b1b47e748c42ebba6abf`

**Verified head:** `af9aa63ef4c14db4bfa389b0148d5f3fb4121029`
**Draft PR:** [#40](https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/40)

No production migration, production-data mutation, production deployment promotion, merge, paid-service activation, or external production configuration change was performed.

## Workstream-to-file evidence

| Workstream | Primary implementation evidence | Test/review evidence | Remaining external action |
| --- | --- | --- | --- |
| 1 Release integrity | `app/api/version/route.ts`, `lib/release/database-compatibility.ts`, `scripts/create-release-manifest.mjs`, `scripts/post-deploy-smoke.mjs`, `vercel.json`, `netlify.toml` | `lib/release/*test.ts`, `.github/workflows/quality.yml` | Deploy an approved exact SHA, then run production smoke |
| 2 Product model | `app/page.tsx`, `app/(private)/onboarding/page.tsx`, connection routes, deleted import-review components | `lib/product/product-model-integrity.test.ts` | None for source; historical migration evidence remains intentionally |
| 3 Age/consent | `lib/auth/eligibility.ts`, auth/onboarding/API guards, `20260710164946_enforce_initial_launch_age_16.sql` | `lib/auth/eligibility.test.ts`, `lib/legal/age-migration.test.ts`, bypass tests | Review existing ineligible accounts; do not delete them |
| 4 CIMD/OAuth | `lib/mcp/cimd.ts`, `lib/mcp/oauth.ts`, `lib/mcp/auth.ts`, OAuth routes and metadata routes | CIMD/OAuth/security/rate-limit/replay suites under `lib/mcp/` | Real ChatGPT callback/token/revocation acceptance |
| 5 MCP catalog | `lib/mcp/tools.ts`, `server.ts`, executors, catalog JSON/Markdown | catalog, server, safety, handler-coverage and output-contract tests | Live 35-tool reviewer-token acceptance |
| 6 Context projection | `lib/mcp/context-projections.ts` | `context-projections.test.ts`, cross-user/security suites | Validate with real scoped reviewer tokens |
| 7 Onboarding/constraints | onboarding page, profile/execution services, database types, progressive migration | onboarding and progressive-migration tests | Populated reviewer-account QA |
| 8 Canonical data | canonical ADRs/domain model, canonical executors, convergence migration and verification SQL | `lib/architecture/canonical-convergence.test.ts`, ledger checks | Isolated migration rehearsal and row reconciliation |
| 9 Supabase security/performance | private-admin/RLS/index migration, advisor baseline, dashboard fan-out report | `lib/security/supabase-launch-hardening.test.ts` | Isolated RLS tests, advisor rerun, leaked-password protection |
| 10 Deletion/export/retention | privacy routes, deletion worker/contracts, ZIP export, lifecycle migration | privacy/deletion/export/retention tests | Isolated DB/storage exercise; approve provider adapters and periods |
| 11 Legal/trust | Privacy, Terms, disclaimer, legal notice, operator/version configuration | `lib/legal/phase6.test.ts` and legal-link tests | Qualified German legal/privacy review |
| 12 IA/UX | landing, app shell, Today, onboarding, connections, privacy settings | `scripts/run-rendered-qa.mjs`, `docs/qa/rendered-qa-results.json` | Populated/deployed QA and physical assistive technology |
| 13 Entitlements | billing contracts, reducer, Stripe routes/worker, subscription settings, entitlement migration | billing migration/reducer/webhook/worker tests | Owner capabilities/pricing and provider configuration |
| 14 Native readiness | `docs/native-readiness/`, `lib/platform/` | platform contract tests | Build native projects before claiming native QA/availability |
| 15 Operations | observability routes/libs, runbooks, synthetic workflows, incident/submission checklists | operations/runtime-safety tests | Configure monitors, alerts, reviewer account, platform assets |

The exact 268-file base-to-head change set and every commit/file status are recorded in `release/prelaunch-handoff-manifest.json`.

## P0/P1 finding-to-evidence matrix

| Finding | Changed files / proof | Remaining action |
| --- | --- | --- |
| P0-01 audited release not proven in production | version/health APIs, schema compatibility marker, manifests, exact-SHA Vercel/Netlify holds, release tests | Production remains unproven; deploy only after all blockers and verify exact SHA |
| P0-02 obsolete approval/import queue | landing/onboarding/private copy, new execution card, three obsolete components deleted | Integrity test must remain required; historical SQL/docs may describe retirement only |
| P0-03 13/16 age conflict | shared `MINIMUM_LAUNCH_AGE`, consent/API/database guards, staged NOT VALID constraint | Review existing under-16 rows and legal policy; no silent deletion |
| P0-04 transitional OAuth/CIMD | canonical metadata, HTTPS/origin/redirect checks, DNS-pinned public-IP lookup, bounded fetch, JWKS/kid/algorithm/private-key JWT checks, PKCE/resource/issuer/token/revocation/cleanup | Real ChatGPT acceptance and platform configuration |
| P1 MCP output/handler drift | closed 35-tool schemas, schema projection/minimization, runtime rejection, deterministic handler coverage | Live tool calls after isolated schema migration |
| P1 cross-user/scope isolation | authenticated context, owner-bound queries, saved-scope intersection, account/connection state checks | Isolated RLS/grant suite and reviewer-token negative tests |
| P1 replay/partial mutation | authorization continuation and assertion replay stores, atomic code consumption, leased idempotency and uncertain-completion guard | Rehearse migrations; monitor/recover uncertain operations |
| P1 broad profile reads | five task projections with scope-to-field allowlists | Validate real token scope reduction |
| P1 duplicate data models | ADR-selected canonical writes and source-linked additive backfill | Run row/per-user reconciliation before cutover; no drops authorized |
| P1 Supabase advisor findings | private admin helper, safe search paths, grants, measured indexes/policy rewrites | Post-migration advisors and leaked-password dashboard action |
| P1 privacy lifecycle gaps | reauthentication, staged jobs, connection revocation, storage/provider stages, ZIP export, retention dry run | Approve retention and external deletion adapters; run isolated end to end |
| P1 billing entitlement gaps | provider-neutral states, event ledger/worker, server gates, checkout disabled without approved offering | Owner decision, Stripe configuration, refund/restore production acceptance |
| P1 UX/trust/operations gaps | truthful platform status, legal-review labels, rendered matrix, observability/runbooks | Deployed candidate, populated reviewer, legal review, native work |

## MCP catalog and classification

The complete ordered list is in `docs/chatgpt-app/public-tool-catalog.json`. The launch catalog has 35 tools: 13 read-only and 22 mutating. The three destructive tools are `delete_food_log`, `delete_meal_plan_item`, and `delete_workout_plan`; every irreversible public delete requires `confirm:true`. Create/log/composite mutations listed by `MCP_IDEMPOTENT_WRITE_TOOL_NAMES` require durable idempotency keys. Updates require optimistic concurrency where exposed. `lib/mcp/public-tool-handler-coverage.test.ts` executes every public handler; `public-tool-output-contracts.test.ts`, `server.test.ts`, `safety.test.ts`, and `catalog-versioning.test.ts` prove schemas, annotations, scopes, security schemes, output rejection, and retired-tool list/invocation denial.

## Age-16 existing-account behavior

The staged database check is `NOT VALID`: existing rows are not scanned, changed, deleted, or newly exposed. New/changed invalid age values are rejected. The later onboarding backfill explicitly excludes saved ages below 16, preventing the migration chain from failing on those rows. Runtime product routes and MCP access fail closed for an account that lacks the current 16+ confirmation or has a saved age below 16. The account remains intact and may still reach export, deletion, account, and ChatGPT-revocation controls. `supabase/verification/age-eligibility-review.sql` reports rows requiring an owner/legal decision.

## Canonical write paths

| Domain | Single new-write path | Compatibility preserved |
| --- | --- | --- |
| Plans/schedule | `user_workout_plans`, days/exercises, `user_workout_sessions` schedule rows | Old scheduled snapshots retained |
| Performed workouts/sets | `workout_sessions` + `exercise_logs` | `user_exercise_logs` read/backfill only |
| Exercise definitions | `exercises` | `exercise_library`/`workouts` source-linked only |
| Food execution/plans | `food_logs` + `user_meal_plan_items` | older meal tables exported during convergence |
| Saved meals/recipes | `saved_recipes` + `saved_recipe_ingredients` | custom-meal rows source-linked/backfilled |
| Progress | existing typed progress/measurement/log tables documented by the canonical model | all owned generations remain exportable |
| Functional constraints | `user_fitness_constraints` | legacy free text retained as user-authored data |

No source migration drops a production-era data table. Destructive cleanup requires a separate, owner-reviewed migration after zero-reference, backup, reconciliation, and rollback gates.

## Migration review and validation status

All 11 pending migrations are additive or forward-fix migrations. They were statically reviewed for ordering, existing-row behavior, uniqueness, ownership, `SECURITY DEFINER` search paths, RLS/grants, and bounded cleanup. Verification/rollback instructions are in the migrations, ADRs, ledger, and `supabase/verification/`.

| Migration | Main risk control | Status |
| --- | --- | --- |
| age 16 | `NOT VALID`; no deletion; later backfill excludes invalid rows | isolated run blocked |
| canonical convergence | source IDs, one-to-one candidate links, bounded casts, no drops | isolated run blocked |
| private admin/RLS/indexes | safe search paths, least grants, measured indexes | isolated RLS/advisor run blocked |
| CIMD/OAuth lifecycle | service-only tables, bounded cleanup | isolated run blocked |
| MCP idempotency | hashed keys, service-only ledger, cleanup | isolated run blocked |
| progressive onboarding | retains legacy text; age-safe update | isolated run blocked |
| privacy lifecycle | staged/idempotent jobs; dry-run retention | owner periods/adapters and isolated run blocked |
| legal version | versioned records; professional-review marker | legal approval blocked |
| entitlement foundation | seeds no price/capability; provider-consistent FKs | owner/provider approval blocked |
| runtime safety corrections | access/schema/runtime guards and verification functions | isolated run blocked |
| uncertain completion guard | durable lease/claim state, forward recovery | isolated run blocked |

Supabase CLI 2.109.1 is available, but Docker/Postgres is unavailable and Supabase cloud branching is unsupported on the current plan. Therefore migration validity is **not claimed**. Production was never used as a fallback.

## Exact verification at head

- `npm ci`: passed
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: 59 files / 306 tests passed
- `npm run test:unit`: 58 files / 304 tests passed
- `npm run test:integration`: 1 file / 2 tests passed
- `npm run migration:ledger:check`: 24 classified; 11 pending
- `npm audit --audit-level=moderate`: zero vulnerabilities
- `npm run build`: passed; 87 pages generated
- `npm run qa:rendered`: 126 observations, zero structural failures, seven required viewports
- `git diff --check`: passed before the final evidence commit
- secret-pattern scan: passed before the final evidence commit
- GitHub Actions Quality run `29162636543`: passed at the exact head

The Vercel preview and Netlify deploy preview passed. A direct preview smoke attempt could not reach the application JSON because Vercel deployment protection returned its HTML challenge; this is not counted as an application smoke pass. Production smoke was not run because no production candidate was authorized or promoted.
