# Plaivra

Plaivra is a user-controlled fitness context, execution, tracking, history, and visualization platform designed to work with ChatGPT.

```text
User maintains Plaivra context
-> grants task-specific access
-> ChatGPT reads the minimum authorized context
-> Plaivra executes authorized tools
-> the user reviews, tracks, corrects, exports, or deletes the result
```

Plaivra does not independently invent workout or meal plans, diagnose medical conditions, or create a duplicate AI approval queue after successful authorized tool execution.

## Current project authority

Every implementation session must start with [`docs/control/README.md`](docs/control/README.md). It defines the current precedence order for product direction, project sequencing, implementation state, architecture authority, and delivery rules.

Historical PRs, completed phase reports, chat messages, and GitHub Actions artifacts remain evidence, not current planning authority.

## Authoritative documentation

For deeper product, design, platform, and release references, use:

1. `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
2. `docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md`
3. `docs/product/ai-first-tracker-model.md`
4. `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md`
5. `docs/chatgpt-app/README.md`
6. `docs/chatgpt-app/cimd-authentication-architecture.md`
7. `docs/architecture/canonical-domain-model.md`
8. `docs/architecture/migration-ledger-reconciliation.md`
9. `docs/platform-roadmap/README.md`
10. `docs/release/README.md`

Only current product, architecture, privacy, operations, release, and design authority belongs in `docs/`. Merged pull requests, Git history, and GitHub Actions artifacts preserve implementation evidence. Completed implementation reports, branch handoffs, audit snapshots, generated screenshots, one-off reconciliation pointers, and redundant prose contracts must not remain in the active repository tree.

Tests enforce source code, schema, SQL verification, structured manifests, and other machine-readable contracts. Normal Markdown wording is explanatory authority, not executable test input.

## Current stack

- Next.js App Router, React, TypeScript, and Tailwind
- Supabase Auth, PostgreSQL, RLS, Storage, and immutable migrations
- MCP with OAuth/CIMD, scoped context projections, permissions, idempotency, and audit
- Vitest, Node test runner, Playwright, and exact-head release gates
- Node.js 24.x with the committed npm lockfile

## Current architecture status

- Web is the active product surface; native applications remain future work.
- Train Phase 2A provides the additive multi-week program hierarchy while compatibility writers remain bounded until later cutover.
- Muscle Intelligence uses the approved 60-exercise registry, V1/V2 mapping authorities, advanced visible atlas, deterministic analysis, immutable session snapshots, and V2 runtime cutover.
- Active Workout AW-1 through AW-10 are implemented, including language contracts, persisted execution authority, structured performance data, immutable prescription snapshots, the shared session engine, the completed Active Workout UI, derived metrics, offline and multi-device control, and final QA/QC closure.
- Workout History Production migration history remains reconciled through `20260802114733_workout_history_filter_options`.
- `20260803152000_private_app_bootstrap_v1.sql` was applied exactly once to Plaivra Production as generated migration `20260803173755_private_app_bootstrap_v1`. The immutable repository SQL remains unchanged and is represented by the migration ledger as `applied_version_alias`.
- `20260804174500_fix_profiles_update_policy_recursion.sql` was applied exactly once to Plaivra Production as generated migration `20260804180932_fix_profiles_update_policy_recursion`; its repository file remains immutable and is represented as `applied_version_alias`.
- Plaivra Production contains **87** physical migration records; the latest physical migration is `20260804180932_fix_profiles_update_policy_recursion`.
- P10F introduces repository migration `20260811234000_p10f_v2_plan_activity_catalog_authority_snapshot.sql` as a **pending, pre-merge-only** migration. It has not been applied to Production, has no Production identity, and must not be replayed or applied before explicit Planner approval.
- Exercise Detail + Personal Records introduces repository migration `20260813042754_exercise_detail_personal_records_authority.sql` as a **pending, repository-only** migration. It has not been applied to Production, has no Production identity, and must not be replayed or applied before explicit Planner approval.
- Workout History redesign migration `20260813071926_workout_history_redesign_read_contract.sql` remains **pending, repository-only** and absent from Production.
- Active Workout feedback preferences introduce repository migration `20260816044500_active_workout_feedback_preferences.sql` as a **pending, repository-only** additive settings migration. It has not been applied to Production and has no Production identity.
- While these four migrations are pending, the canonical ledger records `pendingCount = 4`, `unresolvedCount = 4`, and `historyRepair.state = pending`; the previously applied Production history remains reconciled and unchanged.
- The released compatibility marker remains `20260724232734`. Physical migration advancement and application-release promotion remain separate operations.
- No application deployment accompanied the PCS-2 or P0 migration applications.
- Repository state alone does not authorize merge, manual deployment, migration application, or compatibility-marker promotion.

## Repository areas

- `app/` — routes and API endpoints
- `components/` — UI and domain components
- `lib/` — auth, MCP, privacy, security, validation, release, and shared helpers
- `services/` — domain and database boundaries
- `types/` — shared contracts
- `supabase/migrations/` — immutable migration chain
- `supabase/verification/` — executable database verification
- `docs/` — current product, architecture, operations, release, and design authority
- `.codex/` and `.agents/` — implementation assistance, not runtime product code

Applied migrations must never be renamed, rewritten, reordered, deleted, or replayed. Generated QA evidence belongs in workflow artifacts, not permanent source files.

### AW-9 Production migration

`20260731090000_active_workout_aw9_offline_multi_device.sql` was applied exactly once to Supabase Production as generated migration `20260801045628_active_workout_aw9_offline_multi_device`. The immutable repository SQL remains unchanged. The Production compatibility marker remains `20260724232734`; do not replay applied migrations.

## P0 onboarding Production repair

- `20260804174500_fix_profiles_update_policy_recursion.sql` was applied exactly once to Plaivra Production as generated version `20260804180932_fix_profiles_update_policy_recursion`.
- The repository filename and Production version differ, so the migration ledger preserves the immutable mapping as `applied_version_alias`. Do not replay.
- The compatibility marker remained unchanged and Activity Catalog was not modified.

## P10F pending migration

- `20260811234000_p10f_v2_plan_activity_catalog_authority_snapshot.sql` is repository-only during P10F Stage A and is classified `pending` in the canonical migration ledger.
- It has **not** been applied to Plaivra Production and intentionally has no Production migration version or name.
- Do not replay or apply it before explicit Planner approval of the P10F merge/cutover sequence.

## Exercise Detail + Personal Records pending migration

- `20260813042754_exercise_detail_personal_records_authority.sql` is repository-only and classified `pending` in the canonical migration ledger.
- It has **not** been applied to Plaivra Production and intentionally has no Production migration version or name.
- Do not replay or apply it before explicit Planner approval of this phase's merge and release sequence.

## Workout History redesign pending migration

- `20260813071926_workout_history_redesign_read_contract.sql` is repository-only and classified `pending` in the canonical migration ledger.
- It adds owner-scoped first-page summary and global-history existence read functions; it has **not** been applied to Plaivra Production and intentionally has no Production migration identity.
- Do not replay or apply it before explicit Planner approval of the Workout History redesign merge and release sequence.

## Active Workout feedback preferences pending migration

- `20260816044500_active_workout_feedback_preferences.sql` adds durable account-scoped workout sound and haptic preferences to the existing `user_app_settings` authority.
- It is repository-only and classified `pending`; it has **not** been applied to Plaivra Production and intentionally has no Production migration identity.
- Existing `user_app_settings` owner RLS remains authoritative. Do not replay or apply the migration before explicit Planner approval of the Active Workout merge/release sequence.
