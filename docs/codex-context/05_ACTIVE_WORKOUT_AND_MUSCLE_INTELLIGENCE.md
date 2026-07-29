# Active Workout and Muscle Intelligence

> Generated: `2026-07-29T15:37:00+02:00`  
> Repository: `ahmedmohameda7222-ship-it/gymsands`  
> Canonical base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`  
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`  
> Freshness: verify the manifest and Git diff before relying on this snapshot. Exact source, migrations, tests, and workflows remain executable truth.

## Phase state

| Phase | State on canonical `main` |
|---|---|
| AW-1 | EN/DE/AR language contracts merged |
| AW-2A | persisted execution state merged |
| AW-2B | revisioned command authority and idempotency merged |
| AW-2C | durable timeline events merged |
| AW-3A | structured performed metrics merged |
| AW-3B | structured set details/segments merged |
| AW-3C | immutable normalized prescription snapshots merged |
| AW-4 | deterministic session engine, serialized dispatcher, official store and shared timestamp clock merged; Production migration applied exactly once |
| AW-5 | unmerged in PR #90; read `active-work/pr-90-aw5-overlay.md` |
| AW-6+ | future phase; do not start without approved scope |

## Durable authority graph

```text
workout_sessions
├─ workout_session_execution_states
├─ workout_session_execution_commands / receipts
├─ workout_session_timeline_events
├─ frozen prescription snapshot items
│  ├─ normalized prescription sets
│  └─ metric targets
└─ exercise_logs
   ├─ performed metric values
   ├─ structured set details
   ├─ segments
   └─ segment metric values
```

`workout_sessions` remains the only performed-session root.

## AW-4 client authority

| Concern | Authority |
|---|---|
| command and state contracts | `lib/workouts/session-engine/contracts.ts` |
| deterministic transitions | `lib/workouts/session-engine/reducer.ts` |
| command construction/validation | `lib/workouts/session-engine/commands.ts` |
| timer projection | `lib/workouts/session-engine/timers.ts` and active-session clock |
| official React/session state | `lib/workouts/active-session-store/` |
| durable command transport | `services/database/workout-session-execution.ts` |
| persistence adapter | `services/database/active-session-persistence-adapter.ts` |
| canonical performed-set write | `services/database/workout-performance.ts` / `upsert_workout_set_logs_atomic` boundary |
| structured detail autosave | `services/database/workout-set-details.ts` |
| frozen prescription hydration | `services/database/workout-session-prescriptions.ts` |

Before changing a symbol, confirm the exact current export/path. The table describes responsibility, not permission to edit every listed file.

## Invariants

- PostgreSQL is final durable authority.
- Client transitions are deterministic and pure.
- Commands are ordered through one serialized lane per session.
- Revision conflict and idempotency conflict are distinct outcomes.
- Retry a transport-uncertain command only with identical command identity and payload.
- One timestamp-projected clock owns elapsed/rest/activity timer projection.
- Do not add heartbeat writes or a second activity-timer table.
- After start, frozen prescription data is authoritative.
- Mutable plan data may support pre-start planning or explicitly degraded compatibility only.
- Canonical performed-set persistence and execution transition are separate responsibilities and must converge safely.
- Direct and plan-day sessions share canonical storage and runtime authority.

## Muscle Intelligence

- `exercises` is the main-app canonical global exercise definition table.
- The reviewed cohort is 60 exercises with EN/DE/AR localization, controlled aliases and approved provider links.
- Code-authoritative taxonomy and immutable mapping identity must remain stable.
- V1/V2 mapping history is frozen into session snapshots.
- Phase 4A provides the visible advanced atlas.
- Phase 4B provides reviewed V2 regional mappings.
- Phase 4C cuts new sessions/completed workload analysis to V2 without rewriting historical V1 sessions.
- Heat-map rendering consumes analysis/mapping authority; it must not invent a second mapping source.

## Editing expansion checklist

For Active Workout changes, inspect only as required:

1. route and UI controller;
2. relevant view model;
3. official store/engine contract;
4. database adapter/RPC;
5. performed logs and prescription hydration;
6. i18n messages/contracts;
7. privacy/export/deletion and MCP projections if data shape changes;
8. focused behavior tests and rendered QA.

Do not reopen the session root, store, engine, migration history or Activity Catalog merely to implement UI work.
