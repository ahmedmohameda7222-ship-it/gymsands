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

| Domain | Current canonical direction | Status |
|---|---|---|
| Profile/context | `profiles`, onboarding answers, structured preference profiles, functional constraints, AI permissions, app settings, consents | Active; task-specific context projections are implemented and continue to replace broad reads |
| Workout plans | Multi-week Phase 2A hierarchy under `user_workout_plans` | Additive model is applied; legacy writer cutover is not complete |
| Performed sessions | `workout_sessions` + `exercise_logs`; `user_workout_sessions` remains schedule-instance data | Decided by ADR 0001; compatibility links remain |
| Exercise catalog | `exercises` is the canonical global definition target | Generated 600-row legacy seed retired; canonical catalog awaits the reviewed curated cohort |
| Saved nutrition | `saved_recipes` + `saved_recipe_ingredients` | Active canonical target; legacy custom-meal data must be preserved during cutover |
| ChatGPT/OAuth | curated public MCP, task projections, OAuth/CIMD records, permissions, audit, idempotency | Foundation implemented; publication and production acceptance remain separate gates |
| Muscle Intelligence | code-authoritative taxonomy, versioned mappings, deterministic engine | Phase 1 applied and merged; no trusted mapping seed or visible runtime feature yet |
| Entitlements | provider-neutral offerings, customers, subscriptions, events, and entitlements | Database foundation exists; checkout remains disabled |
| Native | shared contracts only | No iOS or Android binary exists |

## Profile and context

Canonical responsibilities include:

- `profiles` for account-adjacent core profile data;
- `onboarding_answers` and structured preference/profile tables for editable planning context;
- `user_fitness_constraints` for user-authored functional constraints, not diagnoses;
- `user_ai_permission_settings`, `user_app_settings`, and `user_consents`;
- versioned task-specific context projections for ChatGPT.

`user_safety_profiles` and the broad AI request workflow were retired and dropped. Do not recreate them or expose detailed clinical fields through public tools.

## Workout plans

The approved target program architecture is:

```text
user_workout_plans
├── user_workout_plan_week_templates
│   └── user_workout_plan_sessions
│       └── user_workout_plan_phases
│           └── user_workout_plan_activities
└── user_workout_plan_weeks
    └── references one reusable week template
```

Phase 2A is additive. Until later projection, writer, schedule, privacy, and regression gates complete cutover, the active runtime plan write path remains:

- `user_workout_plans`;
- `user_workout_plan_days`;
- `user_workout_plan_exercises`.

Do not create new plan features on `user_workout_plan_blocks` or `user_workout_plan_block_items`. ADR 0004 governs the target hierarchy and prohibits a third performed-session root.

## Performed workout sessions

ADR 0001 selects:

- `workout_sessions` as the performed-session root;
- `exercise_logs` as performed exercise/set history;
- `user_workout_sessions` as the schedule-instance model;
- `user_exercise_logs` only as a bounded compatibility snapshot until link and backfill gates are complete.

No third performed-session model is allowed.

## Exercise catalog and Activity Catalog

ADR 0002 selects `exercises` as the target global definition table. The generated 600-row FitLife/Plaivra seed was retired from `exercises`, `workouts`, and `exercise_library` through applied migration `20260717032851_retire_legacy_600_exercise_catalog` after zero dependent user or mapping references were verified. The canonical catalog is intentionally empty until the reviewed curated resistance-exercise cohort is introduced.

`workouts` and `exercise_library` remain compatibility schemas only; they are not separate future catalogs and must not be repopulated with a duplicate curated seed.

The Activity Catalog boundary supports:

- `external` provider use when deliberately configured;
- `legacy` compatibility data;
- controlled `external_with_legacy_fallback`;
- structured provider/fallback observability;
- deterministic canonical ordering and pagination.

The external provider may still return exercises while the Supabase canonical catalog is empty. Provider names, slugs, translations, or free-text muscle fields are not canonical exercise identity.

## Muscle Intelligence

Phase 1 adds:

- one code-authoritative 24-muscle taxonomy;
- `exercise_provider_links` for explicit non-authoritative provider aliases;
- immutable versioned global and user-custom mapping sets/entries;
- server-hardened publication functions;
- a deterministic shared resistance-set calculation engine.

Mappings remain separate from exercise definitions. Phase 1 does not change Train runtime behavior, visible UI, plan/session writers, or seed trusted mappings.

## Nutrition

Active canonical user data includes food logs, nutrition targets and date overrides, meal-plan items, grocery items, food favorites, saved recipes, and saved recipe ingredients.

ADR 0003 selects `saved_recipes` plus `saved_recipe_ingredients` as the canonical saved-content target. Preserve and source-link existing `custom_meals` and `custom_meal_items` before writer cutover or removal.

## Progress and wellness

Active user-owned domains include progress entries, body measurements, progress photos, hydration, sleep/recovery, supplements, habits, daily tasks, personal records, and daily check-ins. Cleanup must preserve history, export, deletion, ownership, and privacy behavior.

## ChatGPT, OAuth, and CIMD

Current infrastructure includes:

- `chatgpt_connections`;
- OAuth authorization codes and access tokens;
- OAuth client assertions and authorization continuations;
- MCP idempotency, rate limits, audit logs, and permissions;
- CIMD metadata validation and discovery support;
- task-specific context projections.

Client identity, user-owned connection, and issued token records remain distinct. No public member OAuth surface may expose admin tools, internal security state, or arbitrary database access.

## Retired models

`ai_action_requests` and `user_safety_profiles` were removed through applied migrations. Their old removal plans are historical evidence only. No new code, documentation, export path, permission, or tool may depend on them.

## Dormant integrations/imports

Models such as `user_integrations`, imported foods/cardio, import batches, and video imports require a named roadmap owner and activation phase. Zero rows alone are not deletion proof. Third-party credentials require provider-specific encrypted storage, rotation, least privilege, and revocation.

## Cleanup procedure

For every data-model removal:

```text
prove code, route, MCP, export, deletion, test, and foreign-key dependencies
→ stop new writes
→ migrate or prove no required data
→ update reads
→ validate ownership, RLS, privacy, and release behavior
→ deploy and monitor
→ drop only in a later named migration
```

For repository files and assets, prove runtime, build, test, workflow, and documentation references before deletion. Historical reports and generated evidence belong in Git history, pull requests, or retained release artifacts rather than the active tree.

## Decisions

Accepted ADRs:

- 0001 — performed workout sessions;
- 0002 — exercise catalog;
- 0003 — saved nutrition content;
- 0004 — multi-week multi-sport program model;
- 0005 — Muscle Intelligence taxonomy and mapping authority.

Remaining work is staged implementation and cutover, not reopening these decisions without new evidence.
