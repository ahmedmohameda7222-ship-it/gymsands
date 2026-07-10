# Plaivra Canonical Domain Model

**Version:** 2026.2  
**Status:** Target data architecture and cleanup authority

## 1. Purpose

The production database contains multiple generations of several domains. This document defines the target boundaries and prevents new code from extending duplicate models.

No table is dropped solely because it is empty. Applied migration history is never rewritten.

## 2. General rules

- one canonical write model per domain;
- compatibility reads are temporary and documented;
- user-owned rows always include an enforceable owner path;
- public ChatGPT tools use domain services, not arbitrary table access;
- records created through ChatGPT and records created through direct UI share the same canonical tables;
- source attribution is metadata, not a separate product silo;
- every deprecated table has a replacement and removal gate;
- every migration has validation and rollback strategy.

## 3. Profile and context domain

### Canonical responsibilities

- `profiles`: account-adjacent core profile only;
- `onboarding_answers`: current editable training/lifestyle profile until a versioned profile migration replaces it;
- `user_nutrition_preference_profiles`: structured nutrition planning preferences;
- `user_ai_permission_settings`: current user-controlled ChatGPT permissions;
- `user_consents`: versioned legal/product consent records;
- `user_app_settings`: client-independent preferences plus platform-safe display preferences;
- `user_safety_profiles`: private legacy/sensitive store; not a broad public ChatGPT profile endpoint.

### Target additions

Introduce versioned context projections in the service layer before adding new profile tables.

Public ChatGPT context should expose functional constraints, not detailed clinical fields.

## 4. Workout plans

Current canonical plan write path:

- `user_workout_plans`;
- `user_workout_plan_days`;
- `user_workout_plan_exercises`.

Do not create new plan features on:

- `user_workout_plan_blocks`;
- `user_workout_plan_block_items`;

unless an approved ADR explicitly adopts the block model.

Warmup, strength, cardio, and cooldown may remain represented by `block_type` on canonical plan exercises until a migration proves a separate block entity is necessary.

## 5. Performed workout sessions

The database currently contains two generations:

- `workout_sessions` + `exercise_logs`;
- `user_workout_sessions` + `user_exercise_logs`.

No new third model is allowed.

Before consolidation, produce an ADR comparing:

- current route reads/writes;
- MCP reads/writes;
- scheduled-session behavior;
- set-level logging requirements;
- history and PR calculations;
- data already stored in each generation.

Target model concepts:

- performed session;
- performed exercise instance;
- performed set;
- link to plan/day/exercise snapshot;
- scheduled date and actual timestamps;
- completed/skipped status;
- notes and source metadata.

The target physical table names must be selected in the ADR. Until then, both generations are compatibility models and neither may be dropped.

## 6. Exercise catalog

Current overlapping models:

- `workouts`;
- `exercise_library`;
- `exercises`;
- `exercise_videos`;
- `user_custom_exercises`;
- `user_exercise_videos`.

Target concepts:

- global exercise definition;
- exercise media;
- user-owned custom exercise;
- user media override;
- immutable plan-exercise snapshot.

`workouts` is a legacy name for exercise catalog records and must not cause new code to treat one exercise as a full workout.

Do not seed the same 600 exercises into multiple active catalogs.

## 7. Nutrition catalog and logs

Canonical active concepts:

- global food definition;
- user food definition;
- food log;
- meal-plan item;
- grocery item;
- saved meal/recipe with ingredients.

Current overlapping saved-content models:

- `meals` + `meal_food_items`;
- `custom_meals` + `custom_meal_items`;
- `saved_recipes` + `saved_recipe_ingredients`.

Before consolidation, preserve records in `custom_meals` and `custom_meal_items`.

Target model should support a saved item type such as meal, recipe, or template without three unrelated ownership systems.

`user_meal_plan_items`, `food_logs`, and `user_grocery_items` are active user-data models and must not be removed during documentation cleanup.

## 8. Progress and wellness

Active user-owned tracking domains include:

- `progress_entries`;
- `body_measurements`;
- `progress_photos`;
- `water_logs`;
- `sleep_recovery_logs`;
- `supplement_logs`;
- `fitness_habits`;
- `daily_fit_tasks`;
- `personal_records`;
- `user_daily_checkins`.

These are direct execution and tracking capabilities. Their existence does not make Plaivra manual-first.

Any merge must preserve data history, privacy controls, export, and deletion behavior.

## 9. ChatGPT and OAuth domain

Active security infrastructure:

- `chatgpt_connections`;
- `mcp_oauth_authorization_codes`;
- `mcp_oauth_access_tokens`;
- `mcp_rate_limits`;
- `oauth_rate_limits`;
- `mcp_audit_logs`;
- `user_ai_permission_settings`.

These tables are server-controlled. RLS-with-no-member-policy may be intentional, but grants and service-role-only access must be tested and documented.

CIMD migration must separate:

- ChatGPT client identity;
- user-owned Plaivra connection;
- issued authorization/token records.

The current connection UUID must not remain the final public OAuth client identity.

## 10. Obsolete AI request queue

`ai_action_requests` belongs to the retired review/import workflow.

Removal gates:

1. remove MCP tool definitions;
2. remove executor cases and database service functions;
3. remove permission/scope references;
4. remove UI references;
5. remove export/deletion references if any;
6. update tests;
7. deploy and monitor without the feature;
8. drop the table in a later migration.

No new code may write to `ai_action_requests`.

## 11. Integrations and imports

Potentially dormant models:

- `user_integrations`;
- `imported_foods`;
- `imported_cardio_activities`;
- `exercise_import_batches`;
- `workout_video_imports`.

A dormant model must have a documented roadmap owner and activation phase. Otherwise it should be removed after dependency proof.

Do not store third-party provider access or refresh tokens as plain text in a general public table. Future integration credentials require encryption, key management, least privilege, rotation, and provider-specific revocation.

## 12. Administration and audit

- `admin_audit_logs` records administrative mutations;
- `admin_data_access_logs` records administrative member-data access;
- `mcp_audit_logs` records redacted MCP security/operation events.

These may remain separate when their semantics and retention differ. They must not be merged merely to reduce table count.

## 13. Database cleanup procedure

For each candidate:

```text
prove code and runtime dependencies
→ stop new writes
→ migrate existing rows
→ update reads
→ test export/deletion/security
→ deploy
→ monitor
→ drop in a later named migration
```

Every cleanup migration must include:

- object list;
- row-count snapshot;
- dependency query;
- data migration or explicit proof of no data;
- application version requirement;
- validation query;
- rollback/restore strategy.

## 14. Current decisions

### Keep

- active user profiles, plans, logs, permissions, consent, privacy, OAuth, and audit data;
- current applied migration chain;
- active meal-plan, grocery, workout-plan, progress, and settings tables.

### Deprecate now

- `ai_action_requests` and related public tools;
- new writes to abandoned duplicate models;
- deprecated MCP aliases in the future public catalog;
- broad public safety/medical profile tools.

### Decide by ADR before deletion

- performed workout session generation;
- exercise catalog generation;
- saved meal/recipe generation;
- workout block tables;
- dormant third-party integration/import tables.
