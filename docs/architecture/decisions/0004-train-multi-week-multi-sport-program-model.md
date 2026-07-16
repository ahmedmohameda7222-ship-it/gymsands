# ADR 0004: Train multi-week, multi-sport program model

**Status:** Accepted for staged implementation
**Date:** 2026-07-15

## Context

The active workout-plan write path stores one plan as a set of plan days and resistance-oriented plan exercises:

```text
user_workout_plans
→ user_workout_plan_days
→ user_workout_plan_exercises
```

`program_duration_weeks` repeats that same day structure for schedule generation. It cannot represent a program whose weeks differ structurally, reuse one week definition across selected weeks without duplicating descendants, or preserve sport/session/phase/activity taxonomy from the Activity Catalog.

The repository also contains `user_workout_plan_blocks` and `user_workout_plan_block_items`. Those tables encode the assumptions of the legacy resistance block model and include execution-state concepts in plan-template data. They are not a suitable basis for the approved generic program architecture.

ADR 0001 already selected `workout_sessions` plus `exercise_logs` as the performed-session/set model and retained `user_workout_sessions` as the scheduled-session instance model. A third performed-session root is prohibited.

## Decision

Plaivra adopts the following target program hierarchy:

```text
User Workout Plan
├── Week Templates
│   └── Sessions
│       └── Phases
│           └── Training Activities
└── Assigned Program Weeks
    └── Each week references one Week Template
```

The canonical entity order is:

```text
Plan
→ Week Templates
→ Assigned Weeks
→ Sessions
→ Phases
→ Training Activities
```

Phase 2A adds this model as an additive architecture foundation. The legacy plan tables remain the active runtime compatibility path until later cutover gates are complete.

## Week-template reuse and assigned weeks

`user_workout_plan_week_templates` owns reusable structural week definitions through `user_workout_plans`. `user_workout_plan_weeks` stores the ordered weeks actually assigned to a program. Multiple assigned weeks may reference one template, so repeated weeks do not duplicate sessions, phases, or activities.

A program may therefore represent:

```text
Week 1 → Template A
Week 2 → Template A
Week 3 → Template B
Week 4 → Template C
```

Same-plan composite integrity prevents an assigned week from referencing a template owned by another plan.

## Detach-week semantics

Editing one occurrence of a shared week requires an explicit detach operation. `detach_workout_plan_week_atomic` locks the assigned week and parent plan, clones the active template graph, stores `derived_from_template_id`, reassigns only the selected week, and marks it detached in one transaction.

The operation is owner-scoped, idempotent, concurrency-safe, and rollback-safe. Other assigned weeks remain attached to the original template. Legacy source IDs are intentionally not duplicated into the detached clone because one live Phase 2 row may map to each legacy plan day or exercise; immutable snapshots and template provenance are preserved instead.

## Session-level sport identity

Sport identity belongs to a planned session, not to the complete program or individual activity. A session stores the catalog sport slug when verified and a required name snapshot for historical readability. Legacy-backfilled sessions may have no sport slug because migration must not invent a catalog mapping; they use an explicit legacy compatibility name snapshot.

Catalog session-type identity is optional because not every activity or imported plan has a verified session type.

## Activity Catalog taxonomy snapshots

The Activity Catalog remains a separate, global, user-data-free system. Plaivra stores provider identity, version, source, and immutable user-plan snapshots. No cross-database foreign key is introduced and the migration never contacts the external provider.

A planned activity may preserve:

- catalog activity identity and slug;
- activity type identity and snapshot;
- instructions snapshot;
- equipment snapshot;
- taxonomy snapshot;
- metric-schema snapshot.

Historical snapshots are not rewritten when the global catalog later changes.

## Metric schema and planned prescription

`metric_schema_snapshot` describes the fields understood for an activity. `planned_prescription` stores the user-owned planned values independently. The service layer validates new planned prescriptions against the saved metric schema, including required fields, primitive types, finite numbers, disallowed negative values, and unknown fields under the strict Phase 2A policy.

Performed metric results are not part of Phase 2A. Resistance set results continue to use `exercise_logs`.

## Extensible phases

`user_workout_plan_phases` stores ordered phase slugs and names as snapshots. Phases are not a fixed database enum. The model can represent warm-up, technique, main work, intervals, recovery, accessories, conditioning, cool-down, and future Activity Catalog phases.

## Scheduled and performed sessions

The existing split remains authoritative:

- `user_workout_sessions`: scheduled session instances;
- `workout_sessions`: performed-session headers;
- `exercise_logs`: performed resistance/set logs;
- `user_exercise_logs`: bounded scheduled compatibility snapshots.

Phase 2A adds only nullable bridge references to assigned weeks, planned sessions, and planned activities. Existing columns, RPC signatures, writers, UI routes, history, and personal-record calculations remain unchanged.

Ambiguous historical `week_index` values are not converted into assigned-week IDs. `plan_week_id` remains null unless a future operation can prove the exact assigned week.

## Legacy backfill

Every legacy plan receives exactly one initial legacy week template. Valid `program_duration_weeks` values create the corresponding assigned weeks; otherwise one week is assigned. All initial assigned weeks share that template.

Each legacy plan day becomes one Phase 2 session. Weekday determines `day_offset` when available; otherwise a deterministic `day_number` fallback is used. Legacy exercises are grouped into phases with this mapping:

```text
warmup   → warmup
strength → main_work
cardio   → conditioning
cooldown → cooldown
other    → main_work
null     → main_work
```

Each legacy plan exercise becomes one generic planned activity. Existing sets, reps, rest, weight, and tempo are copied into `planned_prescription` with null values omitted. A local `plaivra_legacy_strength_prescription_v1` metric schema is stored only when needed to interpret preserved values. The schema is explicitly a Plaivra compatibility snapshot, not an Activity Catalog response.

Legacy rows are not deleted or rewritten. Archived state and source identity are retained. Contradictory ownership or plan references fail the migration without deleting data.

## Compatibility and cutover gates

The new model is the approved target architecture, but Phase 2A is not a runtime cutover. The legacy plan hierarchy remains the active compatibility writer and schedule source.

A later phase must implement and verify a Phase 2-aware schedule projection based on:

```text
assigned program week
+ session day_offset
+ explicit local schedule start date
```

User-visible calendar dates must not be derived from the database server timezone.

Cutover requires verified writer migration, schedule projection, UI support, export/deletion coverage, owner isolation, history compatibility, and a separately approved removal plan for legacy reads. No legacy table is authorized for deletion by this ADR.

## Privacy, export, and deletion

All new structural rows are user-owned through their parent plan. RLS follows the complete ownership chain. Same-plan constraints and bridge-integrity triggers prevent cross-plan and cross-owner references.

User data export includes week templates, assigned weeks, sessions, phases, and planned activities with stable IDs and parent relationships. Account deletion remains safe because `profiles → user_workout_plans → Phase 2 hierarchy` cascades. Plan deletion cascades through the new hierarchy subject to the existing workout-history preservation rules. Provider credentials and server secrets are never exported.

## Phase 2A non-goals

Phase 2A does not implement:

- Train UI or navigation changes;
- builder, sport-picker, phase-editor, prescription-editor, or detach UI;
- `/my-workout` to `/train` route migration;
- Phase 2-aware schedule cutover;
- performed generic metric-result tables;
- personal-record redesign;
- MCP or ChatGPT tool changes;
- Activity Catalog schema, seed, provider, or repository changes;
- production migration application or deployment;
- removal of legacy plan, block, schedule, or compatibility models.

## Consequences

Plaivra gains a reusable and extensible program model without destabilizing the current Train runtime. The cost is a bounded compatibility period where both the legacy active plan graph and the Phase 2 target graph exist. Phase boundaries and verification gates must prevent silent divergence until the runtime writer cutover is explicitly approved.
