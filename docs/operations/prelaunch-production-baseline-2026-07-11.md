# Production baseline — 2026-07-11

This evidence was captured read-only from Supabase project `bkwezjxvapaeasfvlhvv`. No migration or data mutation was performed.

## Row counts before the pending migration chain

| Object | Rows |
|---|---:|
| `auth.users` | 11 |
| `workouts` | 600 |
| `exercises` | 0 |
| `custom_meals` | 3 |
| `custom_meal_items` | 12 |
| `saved_recipes` | 0 |
| `saved_recipe_ingredients` | 0 |
| `user_workout_sessions` | 24 |
| `workout_sessions` | 7 |
| `user_exercise_logs` | 0 |
| `exercise_logs` | 45 |
| `user_integrations` | 0 |

These values prove that canonical convergence migrations operate on real production data and require an isolated rehearsal before production application.

## RLS and grant fingerprint before migrations

- Public policy count: **133**
- Policy snapshot MD5: `24933b635d102f5ed72ae154dd5e801e`
- Relevant table-grant count: **797**
- Grant snapshot MD5: `ed12b289312e9ba1b6fdd685ba394cce`
- Public `SECURITY DEFINER` functions: `handle_new_user()`, `is_admin()`

The pending private-admin/RLS migration must be validated by comparing its isolated post-migration output with this baseline and by testing member/admin/service-role behavior, not only by comparing hashes.

## Production compatibility state

The following branch-required objects are intentionally absent from production:

- `release_schema_compatibility`
- `account_access_states`
- `billing_event_ledger`
- `consume_mcp_oauth_authorization_code(...)`
- `claim_mcp_idempotency_key(...)`
- `claim_billing_events(...)`

Therefore the branch release is expected to fail its database compatibility gate against the current production database. This prevents a code-first deployment from silently claiming schema compatibility.

## Current production advisor blockers

- `public.is_admin()` remains an exposed `SECURITY DEFINER` function until the pending private-schema migration is rehearsed and applied.
- Supabase leaked-password protection remains disabled and requires an Auth configuration change.
- Service-only OAuth/rate-limit tables intentionally have RLS enabled with no member policies; grants and service-role behavior must be revalidated after migration.
- Performance advisors still report baseline RLS init-plan, foreign-key index, duplicate-policy, and duplicate-index findings. The pending RLS/index migration addresses a measured subset; unused indexes must not be removed in bulk without query evidence.

## Missing evidence

Because Supabase database branching is unavailable on the current plan, no isolated post-migration counts, RLS diff, concurrency result, or rollback/forward-fix evidence has been produced. Production was not used as a test environment.
