# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`  
**Read-only verification:** 2026-07-13  
**Audited repository commit:** `c1ce801d66be57054edd13f14e744548511fc331`

This is an evidence record, not permission to edit Supabase migration history. Applied migration files and production migration identities must never be renamed, rewritten, deleted, or replayed.

## Reconciled state

The machine-readable authority is [`supabase/migration-ledger.json`](../../supabase/migration-ledger.json).

- Supabase migration history contains 24 applied migrations through `20260711014500_idempotency_uncertain_completion_guard`.
- The earlier onboarding drift is resolved: `20260703151807_onboarding_coaching_quick_log_preferences` now appears in Supabase migration history.
- The earlier version aliases are resolved: `functional_fitness_constraints` is recorded as `20260710135000`, and `drop_retired_ai_request_and_safety_tables` is recorded as `20260710170000`.
- No repository migration is currently classified as pending.
- Three repository migrations are absent from Supabase migration history but have verified production schema effects:
  - `20260711213000_adaptive_onboarding_v2.sql`
  - `20260712173000_persistent_meal_plan_skip_status.sql`
  - `20260712195000_nutrition_target_date_overrides.sql`

## Schema verification for untracked applications

### Adaptive onboarding

Verified all expected onboarding, nutrition-preference, and fitness-constraint columns; both onboarding constraints; the authenticated `complete_adaptive_onboarding_v2` RPC; and denial of anonymous execution.

### Persistent meal-plan skip state

Verified the `planned | done | skipped` status constraint, skipped-state integrity constraint, terminal-state transition trigger, and trigger function.

### Nutrition target date overrides

Verified the override table, unique/index structure, RLS, four ownership policies, updated-at trigger, authenticated CRUD grants, denial of anonymous reads, and authenticated `apply_nutrition_target_changes` RPC.

## Current action

Do not replay the three schema-untracked migrations. Their database objects already exist. Repairing Supabase migration history requires separate owner approval and evidence of how the SQL was originally applied.

Run `npm run migration:ledger:check` to validate repository classification. The checker now rejects unsupported states and requires explicit evidence and replay warnings for schema-untracked applications.

## Advisor status

The three verified migrations did not expose a missing RLS policy or grant problem in their own objects. Supabase still reports unrelated existing advisor items, including service-only tables with RLS and no user policies, leaked-password protection disabled on the current plan, unindexed foreign keys, duplicate indexes, and multiple permissive policies. These require separate security/performance work and were not modified during this reconciliation.
