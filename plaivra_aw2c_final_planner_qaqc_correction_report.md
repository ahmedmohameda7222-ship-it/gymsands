# Plaivra AW-2C — Final Planner QA/QC Runtime-Authority Correction Report

## Status

The AW-2C runtime-authority correction is implemented on the existing branch and Draft PR #83. This report records the completed correction scope for independent Planner QA/QC review. It does not claim Planner approval.

## Continuation identity

- Repository: `ahmedmohameda7222-ship-it/gymsands`
- Branch: `feat/active-workout-aw2c-timeline-events`
- Draft PR: `#83`
- PR base: `main`
- Approved comparison base: `5a7fd640c252a273a753748fcfdee713934fd241`
- Reviewed pre-correction head: `a2c064cada6edd9048541b7edf1712f8b2a819a1`
- Direct browser/service authority correction: `34f9c06bee32ae2950fd4c9ffcfa20a17a174678`
- Effective source-audit strengthening: `708ca8048a58d7261b387b838f085dfff2c109e1`
- MCP authority correction: `fcad82bb1c869747c07e7db66da35980409394bc`

The exact final report head and final CI identities are generated after this report update and are retained in GitHub Actions evidence and the final completion response.

## Root cause

The public `startWorkoutSession(...)` facade delegated to a legacy helper that directly inserted a performed-session root into `public.workout_sessions`. That path bypassed `public.start_or_resume_direct_workout_session_atomic(...)` and could create a performed session without the durable AW-2C `session_started` event.

The required complete call-site audit also identified server-side MCP fallbacks that directly inserted, updated, or upserted `workout_sessions` for `start_workout` and `skip_workout`. Those paths were removed or routed through existing reviewed authorities without adding a new RPC or migration.

## Final runtime authorities

### Direct browser workout start

```text
UI / public database facade
  -> startWorkoutSession(...) or getOrStartWorkoutSession(...)
  -> services/database/direct-workout-sessions.ts
  -> public.start_or_resume_direct_workout_session_atomic(...)
  -> canonical workout_sessions row
  -> exactly one runtime session_started timeline event
```

### Scheduled plan-day workout start

```text
Browser or MCP scheduled start
  -> public.start_or_resume_workout_session_atomic(...)
  -> canonical workout_sessions row
  -> exactly one runtime session_started timeline event
```

### Scheduled workout skip

```text
Browser or MCP skip
  -> public.skip_workout_day_atomic(...)
  -> canonical skipped workout_sessions state
  -> exactly one runtime session_skipped timeline event
```

MCP `start_workout` now fails closed when neither `scheduled_session_id` nor `plan_day_id` is supplied. MCP direct performed-session skip without a plan-day identity also fails closed rather than mutating canonical tables outside an AW-2C authority.

No second RPC or third performed-session root was added.

## Legacy isolation

The unsafe performed-session creation paths were removed from `services/database/workout-sessions-legacy.ts`:

- direct `startWorkoutSession` table insert;
- legacy direct `getOrStartWorkoutSession` creator;
- legacy skipped-day direct session insert;
- related promise-map and compatibility fallback code.

The file retains valid history, logging, scheduled-session, and compatibility behavior. The public wrapper preserves the existing TypeScript contracts.

## Stable identity behavior

The corrected public start path preserves:

- global exercise identity;
- external/provider activity identity;
- legacy-provider identity;
- resolved local legacy identity through the canonical global-exercise resolver;
- owner custom-exercise identity;
- display name;
- category/target-muscle fallback;
- planned sets, reps, and rest seconds;
- route-scoped candidate resume through `getOrStartWorkoutSession(...)`;
- fail-closed behavior for invalid resolved identities, invalid candidates, ownership violations, and authority failures.

## Call-site audit

The effective runtime audit covered:

- `services/database/workout-sessions.ts`
- `services/database/workout-sessions-legacy.ts`
- `services/database/direct-workout-sessions.ts`
- `services/database/legacy-repository.ts`
- `services/database/index.ts` — inspected as a required candidate path; the file is absent on this branch
- `components/workouts/workout-session-form.tsx`
- `components/workouts/active-workout-indicator.tsx`
- `lib/mcp/tool-executor.ts`
- all narrow repository-search results for direct `workout_sessions` insert, upsert, update, and delete operations associated with performed-session start or skip behavior

Final audit result:

- Direct browser workouts use `start_or_resume_direct_workout_session_atomic`.
- Scheduled browser workouts use `start_or_resume_workout_session_atomic`.
- MCP scheduled starts use `start_or_resume_workout_session_atomic`.
- Browser and MCP scheduled skips use `skip_workout_day_atomic`.
- No exported or reachable browser/client performed-session creator directly inserts into `workout_sessions`.
- No MCP performed-session start or skip path directly inserts, upserts, updates, or deletes `workout_sessions`.
- No compatibility facade re-exports the removed unsafe creator.
- No service-role browser bypass or legacy fallback was added.

## Test corrections

The permanent source contract now inspects the effective implementation across:

- public workout-session wrapper;
- legacy compatibility implementation;
- direct authority helper;
- public database barrel;
- optional database index candidate;
- active-workout UI caller;
- MCP tool executor.

It rejects:

- reachable `.from("workout_sessions").insert(...)` performed-session creation;
- MCP direct insert, upsert, update, or delete mutations for performed-session start/skip;
- unsafe legacy starter/get-or-start/skip exports;
- delegation to `startLegacyWorkoutSession`;
- loss of the reviewed direct, scheduled-start, or scheduled-skip RPC paths.

Behavioral unit coverage verifies:

- public standalone start uses the direct atomic RPC;
- resolved legacy/local IDs are passed as canonical global identities;
- invalid resolved IDs fail before an RPC call;
- no client-side table fallback is used;
- MCP unbound start fails closed without any table or RPC call;
- MCP scheduled start uses `start_or_resume_workout_session_atomic`;
- MCP scheduled skip uses `skip_workout_day_atomic`;
- MCP direct-session skip without a plan day fails closed.

The PostgreSQL AW-2C integration proof verifies:

- one canonical direct session root;
- exactly one runtime `session_started` event;
- correct owner and session association;
- one positive database-allocated global sequence token for the initial event;
- absence of forbidden payload fields;
- candidate retry returns the same session;
- identity retry returns the same session;
- no duplicate root or `session_started` event;
- sequence ordering remains intact.

Existing AW-2C append-only, ownership, RLS, idempotency, payload, set-event, execution-command, replacement, terminal-event, privacy, deletion, backfill, and old-client bridge assertions remain in force.

## Database and Production boundaries

This correction is application/service/test-only.

- New migration created: no
- Existing AW-2C migration edited: no
- Existing migration reapplied: no
- Migration ledger identity changed: no
- Production workout data mutated: no
- Production timeline evidence inserted manually: no
- Compatibility marker changed: no

The Production migration remains:

```text
20260722093115_active_workout_aw2c_timeline_events
```

The compatibility state remains:

```text
schema version: 2
migration marker: 20260721224813
```

Final read-only Production verification retained:

```text
AW-2C migration records: 1
workout_sessions: 10
exercise_logs: 64
execution states: 1
command receipts: 0
muscle snapshots: 10
snapshot items: 34
timeline events: 83
ownership mismatches: 0
forbidden payload rows: 0
```

Timeline backfill remains:

```text
migration_backfill:session_started = 10
migration_backfill:set_completed = 64
migration_backfill:session_completed = 9
total = 83
```

## Activity Catalog isolation

The Activity Catalog project `khlcctuefiuhunqymkbp` was not queried, migrated, or mutated. Database verification remained restricted to Plaivra project `bkwezjxvapaeasfvlhvv`.

## Explicit non-actions

- Merge performed: no
- Deployment performed: no
- Draft status changed: no
- PR base changed: no
- Compatibility marker promoted: no
- Migration created, edited, or reapplied: no
- Production data workaround performed: no
- Activity Catalog changed: no
- AW-3 started: no

## Remaining action

After successful exact-final-head required CI and independent Planner QA/QC approval, the remaining release action is authorization to merge Draft PR #83 using the repository's normal merge process.
