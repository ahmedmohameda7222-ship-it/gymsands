# Plaivra Muscle Intelligence Phase 3 — Current Implementation and Correction Report

Generated: 2026-07-18

Status: Draft PR #68 open; unmerged; no application deployment; six forward corrections pending production migration-history reconciliation.

## 1. Repository boundary

- Repository: `ahmedmohameda7222-ship-it/gymsands`
- Base branch: `main`
- Starting base SHA: `2cfc1f3f56676c98e8a64eac702f74aa04ff6be6`
- Working branch: `feat/train-muscle-intelligence-phase3-session-snapshots`
- Pull request: Draft PR #68, `feat(train): add muscle intelligence session snapshots`
- The live PR head is authoritative. This report intentionally does not freeze a head SHA because every correction commit creates a new exact-head validation run.

No merge, application deployment, compatibility-marker update, Heat Map UI, or Phase 4 work is authorized by this report.

## 2. Applied Phase 3 production baseline

The following migrations are already applied and must remain byte-immutable:

1. `20260717194847_muscle_intelligence_phase3_session_snapshots.sql`
   - Git blob: `865f918091fbb9cf054e170417caaf384c65f049`
2. `20260717202151_muscle_intelligence_phase3_integrity_corrections.sql`
   - Git blob: `af02da43e4d61f9248ad6110b9e58f99cac84560`

Production migration history remains at 39 applied migrations ending at `20260717202151`. The compatibility marker remains `20260717051011`.

The applied baseline contains nine session snapshots and 29 snapshot items for the existing performed sessions, with zero missing snapshot headers and zero owner mismatches in the previously verified production state.

## 3. Pending forward corrections

The repository contains six pending Phase 3 forward migrations, in exact order:

```text
20260717215400_muscle_intelligence_phase3_account_deletion_authority.sql
20260717215500_muscle_intelligence_phase3_lifecycle_provider_corrections.sql
20260717215600_muscle_intelligence_phase3_direct_session_authority.sql
20260717215700_muscle_intelligence_phase3_replacement_repair_hardening.sql
20260717215800_muscle_intelligence_phase3_plan_session_start_authority.sql
20260717215900_muscle_intelligence_phase3_set_log_completion_authority.sql
```

All six remain `pending` in `supabase/migration-ledger.json` until the exact production migration identities are recorded and independently verified. Repository presence alone is not proof of production application.

## 4. CI failure audit

The repeated Quality failures exposed separate defects in sequence because the SQL verifier is fail-fast.

### 4.1 Verification state leakage

An internal transaction-local snapshot mutation capability survived into a later negative immutability assertion. The assertion helpers now clear the internal setting before attempting unauthorized changes.

### 4.2 No-op immutability probe

The snapshot assertion attempted to set `completeness = 'complete'` when the row was already complete. The immutable trigger correctly allowed the no-op update. The verifier now forces a real valid change:

- snapshot header: increments `frozen_at` by one microsecond;
- snapshot item: switches to a different valid state.

Both helpers confirm their target row exists before probing immutability.

### 4.3 Real account-deletion defect

The original final verifier deleted `auth.users` directly. PostgreSQL cascaded into `profiles` and `user_workout_plans`, but `public.prevent_workout_history_identity_delete()` correctly blocked deleting a workout plan that contained session history.

The defect was architectural: normal Train history protection and full account deletion shared the same implicit cascade path, with no explicit trusted application-data deletion boundary.

### 4.4 Overlapping Train cascade defect

The first authoritative-purge implementation still deleted `profiles` and relied on its Train cascades. Exact-head Quality #804 proved that this remained unsafe: one cascade deleted `user_workout_plan_phases` while another cascade attempted to update `user_workout_plan_activities.source_legacy_plan_exercise_id`, causing a foreign-key failure.

This was a second real schema interaction, not a false CI test. The final correction therefore removes reliance on implicit Train cascades entirely.

## 5. Long-term account-deletion correction

The correction does not disable triggers, replace the Train history guard, or create a generic bypass.

### 5.1 Authoritative purge RPC

The new migration creates:

```text
public.purge_account_application_data_atomic(uuid)
```

Properties:

- `SECURITY DEFINER`;
- fixed empty `search_path`;
- executable only by `service_role`;
- denied to `PUBLIC`, `anon`, and `authenticated`;
- serialized per user with a transaction advisory lock;
- idempotent when application data is already absent;
- Auth deletion remains a later provider operation.

### 5.2 Deletion-lifecycle binding

The purge is allowed only when all of these are true:

1. exactly one `account_deletion_jobs` row exists for the user with:
   - `state = 'processing'`;
   - `stage = 'deleting_database'`;
2. `account_access_states` shows:
   - `state = 'deletion_processing'`;
   - `disabled_at` is present;
3. no unreleased `privacy_deletion_legal_holds` row exists.

The active deletion job is locked before destructive work. Missing, duplicate, incorrectly staged, non-disabled, or legally held deletion attempts fail closed.

### 5.3 Deterministic Train deletion

The purge explicitly removes Train data child-to-parent instead of relying on profile cascades.

Deletion order:

```text
performed workout sessions
→ scheduled workout sessions
→ plan activities
→ plan phases
→ plan sessions
→ assigned plan weeks
→ week templates
→ legacy block items
→ legacy blocks
→ legacy plan exercises
→ legacy plan days
→ workout plans
→ profile
```

This order has three important properties:

1. session logs, snapshots, and snapshot items are removed before plan identities;
2. the normal plan/day/exercise history guard remains unchanged and naturally allows deletion only after history is gone;
3. shared legacy bridge columns cannot receive competing `CASCADE` and `SET NULL` actions after their newer-hierarchy rows have already been removed.

The function counts every targeted hierarchy before deletion, records every direct delete row count, and aborts if actual deletions differ from the precomputed target counts.

### 5.4 Normal Train protection remains unchanged

The migration does not recreate or weaken `public.prevent_workout_history_identity_delete()`.

Outside the authoritative account-deletion RPC:

- deleting a plan with session history remains blocked;
- deleting a day with session history remains blocked;
- deleting an exercise with exercise history remains blocked.

No client-controlled capability, transaction flag, private bypass table, or broad authenticated table grant is introduced.

### 5.5 Atomic postconditions

After deterministic Train deletion, the purge deletes the profile and verifies that no target-owned rows remain in:

- `profiles`;
- `user_workout_plans`;
- `user_workout_sessions`;
- `workout_sessions`;
- `workout_session_muscle_snapshots`;
- `workout_session_muscle_snapshot_items`.

Any failed count comparison or postcondition rolls back the entire database purge.

### 5.6 Auth deletion last

`lib/privacy/account-deletion-worker.ts` performs this order:

```text
external/log dependency cleanup
→ service-role application-data purge RPC
→ Supabase Auth deleteUser
```

If the application-data purge fails, the Auth user is not deleted. If Auth deletion fails after application data was purged, the worker can retry: the RPC recognizes the already-absent profile, verifies no owner-scoped Train data remains, and returns an idempotent success result before Auth deletion is retried.

The `account_deletion_jobs` evidence row survives Auth deletion because its `user_id` foreign key uses `ON DELETE SET NULL`.

## 6. Migration safety

Applying `20260717215400_muscle_intelligence_phase3_account_deletion_authority.sql` performs DDL only. It does not invoke the purge RPC and does not delete user data.

The migration records baseline counts before function creation and verifies the same counts afterward for:

- Auth users;
- profiles;
- access states, deletion jobs, and legal holds;
- both Train plan representations;
- performed and scheduled sessions;
- snapshot headers and items.

Any unexpected row-count mutation aborts the migration transaction.

## 7. Executable verification

The Phase 3 SQL verification proves:

- authenticated members cannot execute the purge RPC;
- the account is disabled before purge;
- one processing `deleting_database` job exists;
- the purge returns that exact job ID;
- the Auth user remains present immediately after application-data purge;
- profile, plans, sessions, snapshots, and snapshot items are removed;
- a second purge call is idempotent;
- final Auth deletion succeeds after application-data purge;
- the deletion evidence job survives with `user_id = null`;
- the transaction reaches the verifier entrypoint’s final `ROLLBACK`.

Worker unit tests additionally prove:

- purge RPC executes before Auth deletion;
- Auth deletion is not called when the purge RPC fails;
- legal holds and unresolved provider cleanup continue to fail closed;
- notification-stage retries do not repeat destructive work.

## 8. Ledger and documentation state

Current repository ledger state:

```text
productionMigrationCount = 39
pendingCount = 6
unresolvedCount = 6
historyRepair.state = pending
schemaAppliedUntrackedCount = 0
```

The six exact pending filenames are listed in:

- `supabase/migration-ledger.json`;
- `README.md`;
- `docs/architecture/migration-ledger-reconciliation.md`;
- Phase 3 migration contract tests.

## 9. Production status

No pending correction migration has been applied by this correction session. Production migration history remains at `20260717202151`.

A direct SQL Editor execution must not be represented as tracked production application until Supabase migration history is reconciled through a supported migration-history workflow and `Supabase.list_migrations` shows the exact identity once.

## 10. Quality-control authority

The authoritative acceptance sequence is:

1. exact-head Phase A Diff Validation succeeds;
2. the full disposable Supabase migration chain applies from zero;
3. database lint succeeds;
4. all database preflight and Phase 3 executable SQL checks succeed;
5. migration-ledger validation succeeds;
6. lint, typecheck, unit, integration, telemetry, environment, build, release-metadata, and rendered QA gates succeed;
7. the final Quality workflow concludes successfully on the same exact PR head.

No success is claimed in this report before the exact-head workflow completes.

## 11. Remaining boundary

After exact-head Quality is green, production application still requires a separately controlled action. The six pending migrations must be applied in filename order, their exact production identities verified once, and the migration ledger reconciled afterward.

The PR must remain Draft and unmerged until that reconciliation and a fresh final exact-head Quality run are complete.
