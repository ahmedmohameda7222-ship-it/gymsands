# Plaivra Canonical Domain Model

**Version:** 2026.5
**Status:** Current convergence and cleanup authority

## Principles

- one canonical write model per domain;
- compatibility reads are temporary and documented;
- user-owned rows have an enforceable owner path;
- public ChatGPT tools use domain services, not arbitrary table access;
- ChatGPT-created and direct-UI records share canonical storage;
- source/provider identity is metadata, not a second product silo;
- applied migration history is immutable;
- no table or asset is removed only because it is empty or old.

## Current status matrix

| Domain | Canonical direction | Current status |
|---|---|---|
| Profile/context | `profiles`, onboarding answers, structured preferences, functional constraints, permissions, settings, consents | Active; task-specific projections continue replacing broad reads |
| Workout plans | Multi-week Phase 2A hierarchy under `user_workout_plans` | Additive model applied; legacy writer cutover remains |
| Performed sessions | `workout_sessions` plus `exercise_logs`; `user_workout_sessions` is schedule-instance data | ADR 0001 active; compatibility links remain |
| Exercise catalog | `exercises` | Generated 600-row legacy catalog retired; approved 60-exercise cohort applied and tracked |
| Saved nutrition | `saved_recipes` plus `saved_recipe_ingredients` | Canonical target active; legacy custom-meal data must be preserved during cutover |
| ChatGPT/OAuth | Curated MCP, task projections, OAuth/CIMD, permissions, audit, idempotency | Foundation implemented; publication and production acceptance remain separate gates |
| Muscle Intelligence | Code-authoritative taxonomy, immutable mappings, deterministic calculation | Phase 2 curated registry and mappings applied; visible runtime features remain separate |
| Entitlements | Provider-neutral offerings, subscriptions, events, entitlements | Foundation exists; checkout remains disabled |
| Native | Shared contracts only | No iOS or Android binary exists |

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

Until later projection, writer, schedule, privacy, and regression gates complete cutover, the active runtime plan write path remains:

- `user_workout_plans`;
- `user_workout_plan_days`;
- `user_workout_plan_exercises`.

Do not create a third performed-session model or new features on the retired block architecture.

## Performed workout sessions

ADR 0001 selects:

- `workout_sessions` as the performed-session root;
- `exercise_logs` as performed exercise/set history;
- `user_workout_sessions` as schedule-instance state;
- `user_exercise_logs` only as a bounded compatibility snapshot until link and backfill gates complete.

## Exercise catalog and Activity Catalog

ADR 0002 selects `exercises` as the canonical global definition table.

Applied migration `20260717032851_retire_legacy_600_exercise_catalog` removed the generated legacy seed from `exercises`, `workouts`, and `exercise_library` after dependency checks. The approved registry under `data/muscle-intelligence/v1/` was then applied through:

- `20260717051008_muscle_intelligence_phase2_curated_schema`;
- `20260717051011_muscle_intelligence_phase2_curated_seed`.

Production now contains the reviewed 60-exercise cohort. `workouts` and `exercise_library` remain compatibility schemas and must not be repopulated with a duplicate curated seed.

The Activity Catalog boundary supports explicit external use, legacy compatibility, controlled external-with-legacy fallback, provider observability, and deterministic ordering/pagination. Provider names and text fields are not canonical identity. Only the nine reviewed exact links create provider-link rows.

For compatibility, the legacy provider converts curated JSON instruction arrays stored in the text field into ordered instruction steps. Historical plain text remains one step. Provider selection and fallback policy are unchanged.

## Muscle Intelligence

Phase 1 provides:

- one code-authoritative 24-muscle taxonomy;
- explicit provider identity links;
- immutable versioned global and user-custom mapping sets and entries;
- hardened publication functions;
- deterministic resistance-set calculation.

Phase 1 does not change Train runtime behavior, visible UI, plan or session writers, or seed trusted mappings.

Phase 2 provides:

- 60 canonical curated exercises;
- 180 EN/DE/AR localizations;
- 180 controlled aliases;
- 32 reviewed relationships;
- 21 research sources and 89 evidence rows;
- 60 internal reviews;
- nine exact provider links;
- 60 published mapping sets with 180 entries.

Both Phase 2 migrations are applied and reconciled in production. All mappings are published, checksum-valid, and immutable. This does not by itself authorize a compatibility-marker update, UI cutover, Heat Map, or later runtime phase.

The physical production migration head is `20260717051011`. The deployed compatibility marker remains `20260717032851` until a coordinated exact-code merge and production deployment.

## Other canonical domains

- Profile and context remain under `profiles`, onboarding answers, structured preference tables, `user_fitness_constraints`, AI permission settings, app settings, consents, and task-specific context projections.
- Saved nutrition converges on `saved_recipes` plus `saved_recipe_ingredients`; preserve and source-link legacy custom-meal data before cutover.
- Progress and wellness include progress entries, measurements, photos, hydration, sleep/recovery, supplements, habits, daily tasks, personal records, and daily check-ins.
- ChatGPT/OAuth infrastructure includes connections, authorization records, tokens, assertions, continuations, idempotency, rate limits, audit, permissions, and task-specific projections.
- Entitlement and billing foundations remain disabled for checkout until separately approved.

## Retired and dormant models

`ai_action_requests` and `user_safety_profiles` were removed through applied migrations and must not be recreated.

Dormant integrations and imports require a named roadmap owner and activation phase. Zero rows are not deletion proof. Provider credentials require encrypted storage, rotation, least privilege, and revocation.

## Cleanup procedure

For any removal:

```text
prove code, route, MCP, export, deletion, test, and foreign-key dependencies
stop new writes
migrate or prove no required data
update reads
validate ownership, RLS, privacy, and release behavior
deploy and monitor
drop only in a later named migration
```

## Decisions

Accepted ADRs:

- 0001 - performed workout sessions;
- 0002 - exercise catalog;
- 0003 - saved nutrition content;
- 0004 - multi-week multi-sport program model;
- 0005 - Muscle Intelligence taxonomy and mapping authority.

Remaining work is staged implementation and cutover, not reopening approved decisions without new evidence.