# Plaivra AW-2C — Final Planner QA/QC Runtime-Authority Correction Report

## Status

The identified AW-2C runtime-authority blocker is corrected on the existing branch and Draft PR #83. Independent Planner QA/QC approval is still required before merge.

## Continuation identity

- Repository: `ahmedmohameda7222-ship-it/gymsands`
- Branch: `feat/active-workout-aw2c-timeline-events`
- Draft PR: `#83`
- PR base: `main`
- Approved comparison base: `5a7fd640c252a273a753748fcfdee713934fd241`
- Reviewed pre-correction head: `a2c064cada6edd9048541b7edf1712f8b2a819a1`
- Runtime-authority correction commit: `34f9c06bee32ae2950fd4c9ffcfa20a17a174678`

## Root cause

The public `startWorkoutSession(...)` facade delegated to a legacy helper that directly inserted a performed-session root into `public.workout_sessions`. That path bypassed `public.start_or_resume_direct_workout_session_atomic(...)` and could therefore create a session without the durable AW-2C `session_started` event.

## Corrected runtime authority

The public direct-workout start path is now:

```text
UI / public database facade
  -> startWorkoutSession(...) or getOrStartWorkoutSession(...)
  -> services/database/direct-workout-sessions.ts
  -> public.start_or_resume_direct_workout_session_atomic(...)
  -> canonical workout_sessions row
  -> exactly one runtime session_started timeline event
```

Scheduled workout-day starts remain on:

```text
public.start_or_resume_workout_session_atomic(...)
```

No second RPC or third performed-session root was added.

## Legacy isolation

The unsafe legacy performed-session creation paths were removed from `services/database/workout-sessions-legacy.ts`:

- direct `startWorkoutSession` table insert;
- legacy direct `getOrStartWorkoutSession` creator;
- legacy skipped-day direct session insert;
- related promise-map and compatibility fallback code.

The file retains valid history, logging, scheduled-session, and compatibility behavior. The public wrapper continues to expose the preserved TypeScript contracts.

## Stable identity behavior

The corrected public start path preserves:

- global exercise identity;
- external/provider activity identity;
- legacy local identity through the canonical global-exercise resolver;
- owner custom-exercise identity;
- display name;
- category/target-muscle fallback;
- planned sets, reps, and rest seconds;
- route-scoped candidate resume through `getOrStartWorkoutSession(...)`;
- fail-closed behavior for invalid resolved identities and authority errors.

## Call-site audit

The correction inspected the effective runtime surface, including:

- `services/database/workout-sessions.ts`
- `services/database/workout-sessions-legacy.ts`
- `services/database/direct-workout-sessions.ts`
- `services/database/legacy-repository.ts`
- `components/workouts/workout-session-form.tsx`
- `components/workouts/active-workout-indicator.tsx`

Direct workouts use the reviewed direct atomic RPC. Scheduled plan-day starts use the reviewed scheduled atomic RPC. No browser-facing performed-session start path directly inserts into `workout_sessions`.

## Test corrections

The source contract now inspects the effective implementation across the wrapper, legacy implementation, direct helper, public barrel, and UI caller. It rejects:

- reachable `.from("workout_sessions").insert(...)` session creation;
- unsafe legacy starter/get-or-start/skip exports;
- delegation to `startLegacyWorkoutSession`;
- loss of either reviewed atomic RPC path.

Behavioral unit coverage now verifies:

- the public standalone start uses the direct atomic RPC;
- resolved legacy/local IDs are passed as canonical global identities;
- invalid resolved IDs fail before an RPC call;
- no client-side table fallback is used.

The PostgreSQL AW-2C integration proof now verifies:

- one canonical direct session root;
- exactly one runtime `session_started` event;
- correct owner and session association;
- sequence number `1` for the initial event;
- absence of forbidden payload fields;
- candidate retry returns the same session;
- identity retry returns the same session;
- no duplicate root or `session_started` event;
- sequence ordering remains intact.

## Database boundaries

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

The compatibility marker remains:

```text
schema version: 2
migration marker: 20260721224813
```

## Activity Catalog isolation

The Activity Catalog project `khlcctuefiuhunqymkbp` was not queried, migrated, or mutated. All database verification is restricted to Plaivra project `bkwezjxvapaeasfvlhvv`.

## Explicit non-actions

- Merge performed: no
- Deployment performed: no
- Draft status changed: no
- PR base changed: no
- Compatibility marker promoted: no
- AW-3 started: no

## Remaining action

After successful exact-head CI and independent Planner QA/QC review, the remaining release action is authorization to merge Draft PR #83 using the repository's normal merge process.
