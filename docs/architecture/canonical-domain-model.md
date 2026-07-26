# Plaivra Canonical Domain Model

**Version:** 2026.7
**Status:** Current convergence and cleanup authority

## Principles

- one canonical write model per domain;
- compatibility reads and writers are bounded and tested;
- every user-owned row has an enforceable owner path;
- public ChatGPT tools use domain services rather than arbitrary table access;
- ChatGPT-created and direct-UI records share canonical storage;
- source/provider identity is metadata, not a second product silo;
- applied migrations and frozen historical facts are immutable;
- age, emptiness, or a legacy filename alone is not deletion proof.

## Current domain matrix

| Domain | Canonical direction | Current status |
|---|---|---|
| Profile/context | Profiles, structured preferences, constraints, permissions, settings, and task projections | Active |
| Workout plans | Phase 2A multi-week hierarchy under `user_workout_plans` | Additive model active; bounded compatibility writer remains |
| Performed sessions | `workout_sessions` with `exercise_logs` and normalized children | Canonical root active |
| Active execution | Execution state, commands, receipts, timeline events, deterministic engine, serialized dispatcher, and one official client store under `workout_sessions` | AW-4 implementation candidate; Production migration pending |
| Performed metrics | `exercise_log_metric_values` plus structured set-detail hierarchy | AW-3A/AW-3B complete |
| Frozen prescriptions | Snapshot items with normalized immutable sets and metric targets | AW-3C implemented and applied |
| Exercise catalog | `exercises` with reviewed provider links and mapping registries | Approved 60-exercise cohort active |
| Muscle Intelligence | Code taxonomy, V1/V2 mappings, immutable session snapshots, deterministic analysis, advanced atlas | V2 runtime cutover active |
| Saved nutrition | `saved_recipes` and `saved_recipe_ingredients` | Canonical target active; preserve compatibility data during cutover |
| ChatGPT/OAuth | Curated MCP, task projections, OAuth/CIMD, permissions, audit, and idempotency | Foundation active; publication acceptance remains separate |
| Entitlements | Provider-neutral offering, subscription, event, and entitlement contracts | Foundation exists; checkout disabled |
| Native | Shared contracts only | No iOS or Android binary |

## Workout plans

The approved target program architecture is:

```text
user_workout_plans
- user_workout_plan_week_templates
  - user_workout_plan_sessions
    - user_workout_plan_phases
      - user_workout_plan_activities
- user_workout_plan_weeks
  - references one reusable week template
```

Until the remaining projection, writer, schedule, privacy, and regression gates complete cutover, the active runtime plan write path remains:

- `user_workout_plans`;
- `user_workout_plan_days`;
- `user_workout_plan_exercises`.

Phase 2A is additive architecture, not permission to introduce another plan authority or a third performed-session root.

## Workout and Active Workout authority

`workout_sessions` is the performed-session root. `exercise_logs` records performed sets. AW-2 execution-state, command, receipt, and timeline relations remain owner-bound children of that root.

AW-4 retains those PostgreSQL relations as final durable authority while moving client transition rules into a pure engine, command ordering into one serialized lane per session, timer projection into one shared timestamp clock, and React state ownership into one identity-scoped official store. It adds no second session root, activity-timer table, or heartbeat write path.

AW-3 extends the same model rather than creating another session authority:

- AW-3A stores normalized performed metrics beneath `exercise_logs`;
- AW-3B stores structured set details, segments, and segment metrics;
- AW-3C stores immutable normalized prescription sets and metric targets beneath frozen session snapshot items.

After session start, the frozen prescription graph is the prescription authority. Mutable plan values may support pre-start planning and explicitly degraded compatibility only; they must not silently replace missing frozen execution data.

## Exercise catalog and Muscle Intelligence

`exercises` is the canonical global exercise-definition table. The generated 600-row legacy catalog is retired. The reviewed cohort contains 60 exercises with EN/DE/AR localization, controlled aliases, provenance, exact provider links where approved, and immutable V1/V2 mappings.

Muscle Intelligence Phase 1 established the code-authoritative taxonomy, immutable mapping authority, publication security, and deterministic resistance-set calculation. Phase 1 does not change Train runtime behavior, visible UI, plan or session writers, or trusted mapping seeds.

Muscle Intelligence preserves historical mapping identity in session snapshots. Phase 4A supplies the advanced visible atlas, Phase 4B publishes reviewed V2 regional mappings, and Phase 4C cuts new session snapshots and completed workload analysis to V2 without rewriting historical V1 sessions.

## Privacy and deletion

Privacy export and account deletion must include every owned canonical child relation. Historical interpretation may retain deletion-safe compact immutable snapshot content where a mutable external definition cannot remain authoritative.

## Cleanup procedure

Before removing code, files, or schema:

```text
prove runtime, route, MCP, export, deletion, test, CI, and foreign-key dependencies
stop new writes where relevant
migrate or prove no required data/evidence is lost
update current readers and authority documents
validate ownership, RLS, privacy, migration replay, and release behavior
remove only inside a named reviewed change
```

Completed implementation reports and generated evidence are preserved through Git history, pull requests, and workflow artifacts rather than the active source tree.

## Decisions

ADRs 0001–0005 remain accepted for performed sessions, exercise catalog, saved nutrition, multi-week programs, and Muscle Intelligence authority. Later phases extend those decisions; they do not reopen them without new evidence.
