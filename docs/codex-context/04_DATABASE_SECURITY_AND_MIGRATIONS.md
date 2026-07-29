# Database, Security and Migrations

> Generated: `2026-07-29T15:37:00+02:00`
> Repository: `ahmedmohameda7222-ship-it/gymsands`
> Canonical base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`
> Freshness: verify the manifest and Git diff before relying on this snapshot. Exact source, migrations, tests, and workflows remain executable truth.

## Environment identities

### Plaivra Production

- Supabase project ref: `bkwezjxvapaeasfvlhvv`
- Region: `eu-central-1`
- Status during audit: active/healthy
- Read-only audit snapshot:
  - 114 public tables
  - 55 public functions
  - 159 public RLS policies
  - 75 physical migration records
  - latest migration `20260726114212`
  - compatibility schema version `2`
  - released compatibility migration `20260724232734`

### Activity Catalog

- Separate Supabase project ref: `khlcctuefiuhunqymkbp`
- Region: `eu-west-1`
- Status during audit: active/healthy
- 19 public catalog tables reported, all with RLS enabled.
- The connector reported no rows in `supabase_migrations.schema_migrations`.
- This project is isolated. Main-app migrations, AW work and release-marker operations must not mutate it unless a separately approved Activity Catalog task explicitly authorizes that change.

No row contents, secrets or user records were read for this context base.

## Migration authority

- Repository migrations are immutable after application.
- Never rename, edit, reorder, delete or replay an applied migration.
- New DDL requires a new timestamped migration.
- `supabase/migration-ledger.json` is machine authority for repository-to-Production reconciliation.
- `docs/architecture/migration-ledger-reconciliation.md` is the human summary.
- `scripts/replay-local-migration-chain.mjs` proves chronological replay and future ordering.
- `scripts/check-migration-ledger.mjs` checks reconciliation.
- `supabase/verification/` carries permanent SQL assertions.
- Physical migration advancement and compatibility-marker promotion are separate actions.

## Canonical data directions

| Domain | Canonical root / important children |
|---|---|
| Profile/context | `profiles`, structured preferences, settings, permissions and consent records |
| Workout plans | `user_workout_plans`; Phase 2A week-template/session/phase/activity hierarchy; bounded day/exercise compatibility writer remains |
| Performed workout | `workout_sessions` → `exercise_logs` |
| Active execution | execution states, commands/idempotency receipts and timeline events under `workout_sessions` |
| Performed metrics | `exercise_log_metric_values` |
| Structured set detail | set details, segments and segment metric values under performed logs |
| Frozen prescription | immutable session snapshot items → prescription sets → metric targets |
| Exercise definition | `exercises`, localizations, aliases, provider links and reviewed mappings |
| Muscle Intelligence | mapping sets/entries/evidence/reviews plus immutable session snapshots/analysis |
| Nutrition | food logs, target profiles/overrides, meal-plan execution, saved recipes and ingredients |
| Privacy | privacy requests, export/deletion jobs/evidence and retention lifecycle |
| ChatGPT/MCP | connections, permissions, OAuth artifacts, audit, rate limits and idempotency |
| Entitlements | provider-neutral offerings, subscriptions, events and entitlements |

## Active Workout RPC authority

| RPC | Purpose |
|---|---|
| `start_or_resume_workout_session_atomic` | plan-day session start/resume |
| `start_or_resume_direct_workout_session_atomic` | direct workout start/resume |
| `apply_workout_session_execution_command_atomic` | revisioned/idempotent execution transition |
| `upsert_workout_set_logs_atomic` | canonical performed-set persistence |
| `complete_workout_session_atomic` | terminal completion and logs |
| `cancel_workout_session_atomic` | terminal cancellation |
| `replace_workout_session_snapshot_item_atomic` | session-scoped replacement |
| `skip_workout_session_snapshot_item_atomic` | session-scoped skip |
| `get_workout_session_frozen_global_mappings` | frozen Muscle Intelligence mapping hydration |
| `get_workout_replacement_candidate_eligibility` | candidate eligibility boundary |

Important input contracts include explicit `p_user_id`; do not assume that alone proves authorization. Read each current function body, grants and actor assertion before changing security behavior.

## Security model

- User-owned rows require an enforceable owner path.
- RLS is enabled broadly; policies, grants and RPC actor checks work together.
- Service-only tables may intentionally use RLS with no client policies.
- `SECURITY DEFINER` RPCs exposed to `authenticated` are not automatically vulnerabilities: determine whether they intentionally implement the public mutation boundary and call `assert_workout_actor` or equivalent ownership checks.
- Never “fix” Supabase Advisor output without reading the function, grants, tests and threat model.

### Advisor snapshot

The audit observed:

- informational `RLS enabled, no policy` findings on service-only/deny-all candidates including account deletion, billing, MCP/OAuth internals, release compatibility and execution-command tables;
- warnings for authenticated execution of several `SECURITY DEFINER` domain RPCs;
- leaked-password protection reported disabled.

Treat these as a review queue. Classify each as intentional, accepted risk or defect only in a dedicated security task.

## Mandatory database change checklist

1. Read the latest relevant migrations and current schema contract.
2. Inspect service, MCP, export, deletion, tests, RLS, grants, indexes and foreign keys.
3. Add a new migration; never rewrite history.
4. Add/update permanent SQL verification and integration tests.
5. Replay the complete local migration chain.
6. Run DB lint and ledger checks.
7. Verify Activity Catalog isolation.
8. Never apply Production changes without explicit authorization.
