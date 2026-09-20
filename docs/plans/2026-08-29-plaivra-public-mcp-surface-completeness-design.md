# Plaivra Public MCP Surface Completeness Architecture

**Date:** 2026-08-29  
**Status:** Proposed architecture — written design awaiting explicit Planner approval before control-plane reconciliation or implementation planning  
**Scope:** Public member ChatGPT/OAuth/MCP surface across Plaivra  
**Audit baseline:** `main` at `9c5428294937bbcfe240ea5190daeb0f56a611d9`  
**Runtime impact of this document:** None

## 1. Purpose

Plaivra uses ChatGPT as its reasoning and intelligent-execution layer while Plaivra remains the authority for persistent context, permissions, storage, visualization, tracking, history, correction, privacy, and direct execution.

The audited repository contains member capabilities that are not consistently represented across the public MCP registry, OAuth scopes, MCP executors, canonical domain services, and user-facing ChatGPT prompt surface. Some capabilities are implemented below the public registry but cannot be reached by ChatGPT. Some user-facing prompts are treated as executable because an internal Plaivra AI action exists even though no corresponding public MCP write path exists.

This design defines the target public MCP completeness model and the rules that prevent those gaps from recurring.

## 2. Core definition of completeness

Plaivra MCP completeness does **not** mean exposing every application route, database mutation, administrator action, or internal service as a public tool.

Plaivra is complete when all of the following are true:

1. Every member workflow that Plaivra intentionally presents as executable through ChatGPT has a real public MCP path with the minimum required authority.
2. Every external ChatGPT write prompt is backed by a real public write tool or an explicitly defined public composite write path; an internal AI action alone never satisfies it.
3. Every public MCP tool converges across registry, OAuth scope, handler/executor, input schema, output schema, ownership checks, confirmation requirements, idempotency/version checks where applicable, domain authority, and result sanitization.
4. Every public member scope corresponds to an intentional documented capability family. Reserved scopes may exist only when explicitly marked reserved and may not advertise unsupported behavior.
5. Public tools use canonical Plaivra domain services and stable resource identities. They do not expose arbitrary table access or create duplicate fact authorities.
6. Destructive and high-risk member actions remain explicit and separately confirmed.
7. Admin, ingestion, curation, security, billing, consent-management, arbitrary privacy operations, and internal service functions remain non-public unless a separate architecture decision promotes them.

### Required invariant

> If Plaivra presents a ChatGPT action to a member, ChatGPT must actually have the least-privilege public MCP capability required to complete that action.

## 3. Target system model

```text
Member intent in ChatGPT
        ↓
User-facing Plaivra prompt or direct conversation
        ↓
Public MCP registry
        ↓
OAuth scope + permission/ownership policy
        ↓
MCP executor/domain service
        ↓
Canonical Plaivra authority
```

A capability is not considered public merely because code exists below the registry. A capability is not considered executable merely because a prompt references it.

## 4. Public, internal, and intentionally non-public classes

### 4.1 Public member MCP

A capability belongs in the public member MCP surface when all are true:

- it operates on the connected member's own data or on public/shared read-only catalog data;
- it is useful in natural ChatGPT workflows;
- the operation can be bounded by Plaivra ownership, permission, validation, confirmation, versioning, and idempotency rules;
- exposing it does not create a second source of truth;
- it does not require administrator or service-role authority.

### 4.2 Internal AI action

Internal AI actions may remain useful to Plaivra UI/orchestration. They are not evidence that external ChatGPT can perform the same operation.

Internal actions must never satisfy external ChatGPT write capability validation unless a public MCP tool or explicit public composite execution path exists.

### 4.3 Intentionally non-public

The following remain outside normal member OAuth/MCP unless separately approved:

- admin controls;
- catalog ingestion, import, verification, approval, merge, and curation;
- service-role actions;
- authentication/token internals;
- OAuth-scope or AI-permission self-modification;
- billing and checkout controls;
- arbitrary database access;
- Activity Catalog administration;
- unrestricted account deletion, export-job, retention, or privacy-request internals;
- permanent purge operations by default;
- sensitive progress-photo access unless separately designed;
- Recipe publication, which remains a Plaivra-owned explicit Save Recipe action under current Nutrition authority;
- low-level Cooking Mode timer/session controls by default. Cooking remains a direct Plaivra execution surface; ChatGPT can reason from Recipe content without becoming the timer/state authority unless a later product decision explicitly requires it.

## 5. Registry ↔ scope ↔ executor convergence

Each public tool must have one canonical contract entry that proves:

- public tool name and user-facing title;
- semantic capability ID;
- domain and risk classification;
- required OAuth scope(s);
- whether write implies read only within the same section;
- input schema;
- output schema;
- server-side ownership/resource validation;
- explicit confirmation requirement for destructive/high-risk actions;
- expected revision or `updated_at` check for conflict-sensitive mutation where required;
- idempotency/operation identity where duplicate execution could create duplicate facts;
- canonical domain service or transactional RPC invoked;
- sanitized result envelope;
- privacy constraints;
- tests proving registry and handler coverage.

No tool may be registered without a handler. No public-intended handler may remain hidden from the registry without being explicitly classified as internal/reserved.

## 6. Domain target matrix

The names below are target semantic contracts. Exact public names may be reconciled during implementation planning for backward compatibility, but capability coverage is binding once this design is approved.

### 6.1 Connection and bounded context

Current context projections remain valid public patterns:

- `get_plaivra_status`
- `get_training_planning_context`
- `get_nutrition_planning_context`
- `get_daily_execution_context`
- `get_progress_context`
- `get_workout_adjustment_context`

These are minimum-data reasoning contexts. They do not replace resource-level reads or CRUD when the member asks to inspect or change a specific stored object.

### 6.2 Food Library and My Foods

Retain existing `search_foods` and Custom Food creation.

Target additional member capabilities:

- `get_food`
- `update_custom_food`
- `delete_custom_food`
- `set_food_personal_correction`
- `clear_food_personal_correction`
- `set_food_favorite`
- `lookup_food_barcode`

Rules:

- canonical Food Catalog identity remains Plaivra authority;
- user-owned Custom Foods remain distinct from global canonical foods;
- personal corrections are user overlays and must not mutate the global catalog;
- barcode lookup returns bounded product resolution and permitted source metadata;
- catalog verification/merge/import remains non-public.

### 6.3 Diary and actual nutrition

Existing food-log read/update/delete capabilities remain valid for current legacy/simple log records, but they are not sufficient for the full Nutrition V1 source-aware Diary model.

The canonical Nutrition V1 Diary supports source identity for Food, Recipe, Saved Meal, Quick Add, and Planned Occurrence and freezes source/version/serving/nutrition snapshots.

Target capability:

- a canonical source-aware Diary logging operation, semantically `log_diary_meal`, that can log a Food, Recipe version, Saved Meal, Quick Add, or completed Planned Occurrence without degrading the source to anonymous food-name text.

Rules:

- Diary is actual consumption;
- source/version identity and frozen snapshots must be preserved;
- Recipe/Saved Meal/Planned Occurrence handoffs must use canonical source identity;
- historical logs must not change because a catalog, Recipe, or Saved Meal changes later;
- existing `add_food_log` may remain as a compatibility/simple-entry path if semantics stay explicit.

### 6.4 Hydration

Current Nutrition V1 member authority supports idempotent water logging and hydration reads. The audited canonical Diary route exposes add/read but no member edit/delete water command.

Current public MCP capabilities:

- `add_water_log`
- `get_water_summary`

At the audited baseline, no additional Hydration MCP is required solely to mirror a nonexistent app correction/delete authority. If Plaivra later adds member-visible water correction/deletion, the capability matrix must add matching safe MCP coverage before a ChatGPT prompt can advertise it.

### 6.5 Recipes

Recipe read and Working Draft write authority is part of Nutrition.

Target member capabilities:

- `list_recipes`
- `get_recipe`
- `create_recipe_draft`
- `update_recipe_draft`
- `discard_recipe_draft`
- `duplicate_recipe`
- `delete_recipe`
- `restore_recipe`

Rules:

- MCP may create/update Working Draft state only;
- MCP must not publish a Recipe;
- `Save Recipe`/publication remains an explicit Plaivra-owned UI action;
- Recipe handoff to Diary, Meal Plan, or Saved Meal preserves Recipe/version identity and frozen nutrition/serving snapshots;
- ChatGPT nutrient estimates are never Plaivra nutrition authority;
- permanent Recipe purge remains intentionally non-public.

### 6.6 Saved Meals

Existing `create_custom_meal` represents Saved Meal creation. Public naming should be reconciled without breaking current clients.

Target capability family:

- create Saved Meal (existing capability; canonical name to be reconciled)
- `list_saved_meals`
- `get_saved_meal`
- `update_saved_meal`
- `delete_saved_meal`
- `restore_saved_meal`

Rules:

- Saved Meal identity remains stable;
- using a Saved Meal in Diary or Meal Plan preserves Saved Meal source/frozen bundle semantics;
- soft deletion/recovery may be public;
- permanent purge remains intentionally non-public unless separately approved.

### 6.7 Meal Plan and Shopping

Existing day/week read and write tools require reconciliation with canonical Nutrition V1 week mutation/revision authority.

Target additional member capabilities:

- `skip_meal_plan_occurrence`
- `set_shopping_item_state`
- a canonical source-aware Meal Plan mutation contract sufficient to express add/replace/move/update/remove operations without inventing one persistence tool for every prompt phrase

Rules:

- Meal Plan is intended/planned nutrition; Diary is actual consumption;
- Shopping needs remain derived from Meal Plan; no second saved grocery fact authority is created;
- `generate_shopping_list` remains read/derived;
- Needed/Purchased state updates the existing shopping-state authority only;
- semantic intents such as cheaper/faster/higher-protein/dairy-free/gluten-free are ChatGPT reasoning intents, not separate fact authorities;
- after approval, ChatGPT executes an exact canonical Meal Plan mutation;
- conflict-sensitive writes use canonical week revision and operation identity.

### 6.8 Workout Plans, Exercise Library, and active execution

Retain existing plan creation/read/activation/deletion and active execution capabilities.

Immediate target read capabilities:

- `list_workout_plans`
- public exposure of the existing `get_today_workout` handler, subject to verification that current semantics match the public contract
- `search_exercises`
- `get_exercise`

Training mutation capability family required by product intent:

- replace an exercise in an owned planned/scheduled workout;
- adjust sets/reps/load/rest or session composition;
- adapt a planned workout to available time/equipment/readiness;
- rebalance the remaining week when requested.

Exact canonical write contracts are intentionally **deferred to Train V2 architecture**, because Train V2 is redesigning plan/session/exercise authorities. Until those public write contracts exist, external write prompts for these operations must not be presented as executable.

Exercise catalog administration/import/approval remains non-public.

### 6.9 Workout History

Workout History is a projection over canonical performed workout authorities, not a new fact store.

Target member capabilities:

- `list_workout_history`
- `get_workout_history_session`
- `correct_workout_history_session`
- `delete_workout_history_session`
- `restore_workout_history_session`
- `preview_repeat_workout`
- `repeat_workout`
- optional bounded `get_verified_records` read if it maps cleanly to current canonical Personal Record/verified-record semantics

Rules:

- corrections mutate canonical performed history through existing safe authority, not the list projection;
- soft delete/recovery may be public with confirmation;
- permanent purge remains intentionally non-public by default;
- repeat must preserve current Train scheduling/preview authority.

### 6.10 Progress

Current context summaries are not a replacement for member CRUD.

Target member capabilities:

- `list_progress_entries`
- `get_progress_entry`
- `update_progress_entry`
- `delete_progress_entry`
- `list_body_measurements`
- `update_body_measurement`
- `delete_body_measurement`
- `list_personal_records`
- `upsert_personal_record`
- `delete_personal_record`

Rules:

- progress photos remain outside the default public MCP surface pending separate privacy architecture;
- conflicting edits use version/revision checks where the domain supports them;
- no tool may infer or fabricate health measurements.

### 6.11 Wellness, sleep, habits, and supplements

Target member capabilities:

Sleep/recovery:

- `get_sleep_recovery_logs`
- `update_sleep_recovery_log`
- `delete_sleep_recovery_log`

Habits:

- `list_habits`
- `upsert_habit`
- `delete_habit`
- `mark_habit_done` or equivalent canonical occurrence-state mutation

Supplements:

- `list_supplements`
- `upsert_supplement`
- `delete_supplement`
- `mark_supplement_taken`
- `get_supplement_adherence`

Rules:

- Plaivra may track member-entered supplement behavior;
- Plaivra MCP must not diagnose, prescribe medication/supplement treatment, or determine individualized dosage as a Plaivra authority;
- health-related recommendation remains ChatGPT reasoning within safety boundaries; MCP writes persist explicit user-owned tracking facts only.

### 6.12 Daily Fit Tasks

Daily Fit Tasks currently have a partial/unclear relationship to Today authority and are **not approved for public MCP expansion yet**.

Before adding task CRUD MCPs, the product architecture must decide whether Daily Fit Tasks remain a canonical member domain or a legacy/duplicate presentation model. No new MCP should entrench duplicate authority.

### 6.13 Profile

The OAuth model already contains profile read/write scopes, but the public tool surface lacks a matching safe write family.

Target capability family:

- `get_profile_preferences`
- `update_profile_preferences`

Rules:

- writes use a strict allowlist of member-editable fields;
- no arbitrary profile-object patching;
- no auth identity, role, eligibility, consent, billing, or security field mutation;
- onboarding-derived fields may be writable only if current profile/onboarding architecture explicitly permits post-onboarding editing;
- implementation planning maps each field to its canonical authority before exposure.

### 6.14 App Settings

The OAuth model contains settings read/write scopes. The actual user-settings domain includes display, units, language, accessibility, tracking preferences, reminders, and privacy-related presentation settings.

Target capability family:

- `get_app_preferences`
- `update_app_preferences`

Rules:

- strict field-level allowlists and validation;
- no generic arbitrary settings blob write;
- no AI permissions, OAuth scopes, connected apps, billing, authentication/security, consent, account deletion, or administrator settings mutation;
- privacy-sensitive presentation settings may require additional confirmation/narrower field policy;
- whether the broad `settings.write` scope should be split is a security design decision to resolve before runtime implementation.

## 7. Scope policy

Public OAuth remains section-based and least privilege.

Write scope implies read only within the same section. Cross-domain implication is forbidden.

`full_access` is an explicit member choice and expands only to normal-user scopes. Admin and legacy blanket scopes remain excluded from public discovery.

Where a capability spans domains, the tool requires the minimum union of scopes actually needed. A prompt must not request or disclose broader context simply because it is available.

## 8. Confirmation, idempotency, and conflicts

Public writes must follow these rules:

- show the proposed user-meaningful change before write when the workflow is generated/reasoned by ChatGPT;
- destructive actions require explicit confirmation;
- no success claim before tool-confirmed success;
- create/log operations that can be replayed must be idempotent or carry operation identity;
- conflict-sensitive updates use expected revision/version/`updated_at` where supported;
- stale conflicts return a structured recoverable result rather than overwriting newer member data;
- these mechanisms are enforced server-side and do not need to be rendered as technical prompt text.

## 9. Tests and architecture guards

Implementation must add regression coverage proving:

1. every public tool has one public registry definition and executable handler;
2. every public external write prompt maps to at least one real public write MCP capability;
3. internal AI action names alone cannot satisfy external ChatGPT write support;
4. every public-intended executor capability is registered or explicitly classified internal/reserved;
5. every public scope has documented tool coverage or an explicit reserved marker;
6. all public tools validate ownership/resource boundaries;
7. destructive tools require confirmation;
8. input/output schemas validate all registered tools;
9. admin/internal tools cannot enter normal public OAuth discovery;
10. prompt-to-tool mappings use stable semantic capability IDs rather than UI copy strings;
11. Recipe publish remains absent from public MCP;
12. Shopping remains derived and no second grocery fact authority is introduced;
13. canonical Diary source identity is preserved for Recipe, Saved Meal, Food, Quick Add, and Planned Occurrence logging;
14. Hydration coverage is re-audited whenever the canonical app gains correction/delete behavior.

## 10. Migration and backward compatibility

Implementation prefers additive evolution:

- preserve existing stable tool names when practical;
- if a misleading name such as `create_custom_meal` is replaced, keep a compatibility alias until current clients are proven migrated;
- do not silently change tool semantics while retaining the same name;
- catalog/tool version metadata advances when externally observable contracts change;
- no Production migration is authorized by this design itself;
- no compatibility marker promotion is authorized by this design itself.

## 11. Rollout order

Recommended implementation sequence after approval and detailed implementation planning:

1. **P0 — Convergence guardrails:** registry/scope/executor/prompt capability model, hidden-handler detection, external-vs-internal support distinction.
2. **P0 — Recipe Working Draft MCP:** close the architected but missing public path.
3. **P0 — Prompt/runtime gating:** prevent unsupported external write prompts from appearing executable.
4. **P1 — Nutrition completion:** canonical Diary source-aware write, Saved Meals, My Foods/corrections/favorites/barcode, canonical Meal Plan/Shopping gaps.
5. **P1 — Read completion for Train:** workout-plan list, today workout, Exercise Library read.
6. **P1 — History/Progress/Wellness/Profile safe member CRUD.**
7. **P1/P2 — safe App Settings MCP after field/scope security decision.**
8. **Train V2 dependent — canonical Train mutation writes.**
9. **Decision dependent — Daily Fit Tasks.**

Each implementation phase remains one approved scope/branch/PR and must not begin automatically after the previous phase.

## 12. Acceptance criteria for this architecture

The architecture is ready for implementation planning only when:

- the Planner explicitly approves this written design;
- the Prompt Presentation Architecture is approved alongside it;
- all intentional non-public boundaries are accepted;
- Train V2-dependent writes and Daily Fit Tasks are recorded as explicit deferred decisions rather than silently omitted;
- canonical control-plane documents are reconciled in the same documentation PR before runtime implementation begins.
