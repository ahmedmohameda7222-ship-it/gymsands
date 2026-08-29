# Plaivra Public MCP Surface Completeness Architecture

**Date:** 2026-08-29  
**Status:** Proposed architecture — written design awaiting explicit Planner approval before control-plane reconciliation or implementation planning  
**Scope:** Public member ChatGPT/OAuth/MCP surface across Plaivra  
**Runtime impact of this document:** None

## 1. Purpose

Plaivra uses ChatGPT as its reasoning and intelligent-execution layer while Plaivra remains the authority for persistent context, permissions, storage, visualization, tracking, history, correction, privacy, and direct execution.

The current repository contains meaningful member capabilities that are not consistently represented across the public MCP registry, OAuth scopes, MCP executors, and user-facing ChatGPT prompt surface. The result is an incomplete external execution contract: some Plaivra capabilities cannot be reached by ChatGPT even when the product architecture expects them to be reachable, while some user-facing prompts are considered executable because an internal Plaivra action exists even though no corresponding public MCP tool exists.

This design defines the target public MCP completeness model and the rules that prevent these gaps from recurring.

## 2. Core definition of completeness

Plaivra MCP completeness does **not** mean exposing every application route, database mutation, administrator action, or internal service as a public tool.

Plaivra is complete when all of the following are true:

1. Every member workflow that Plaivra intentionally presents as executable through ChatGPT has a real public MCP path with the minimum required authority.
2. Every public write path is backed by a real public write tool; an internal AI action alone never satisfies an external ChatGPT write prompt.
3. Every public MCP tool converges across registry, OAuth scope, handler/executor, input schema, output schema, ownership checks, confirmation requirements, idempotency/version checks where applicable, and result sanitization.
4. Every public member scope corresponds to an intentional, documented capability family. Reserved scopes may exist only when they are explicitly marked as reserved and are not used to advertise unsupported behavior.
5. Public tools use canonical Plaivra domain services and stable resource identities. They do not expose arbitrary table access or duplicate fact authorities.
6. Destructive and high-risk member actions remain explicit and separately confirmed.
7. Admin, ingestion, curation, security, billing, consent-management, arbitrary privacy operations, and internal service functions remain non-public unless a separate architecture decision explicitly promotes them.

## 3. Target system model

The public ChatGPT execution contract is a convergence of five layers:

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

### Required invariant

> If Plaivra presents a ChatGPT action to a member, ChatGPT must actually have the least-privilege public MCP capability required to complete that action.

## 4. Public, internal, and intentionally non-public classes

### 4.1 Public member MCP

A capability belongs in the public member MCP surface when all are true:

- it operates on the connected member's own data or on public/shared read-only catalog data;
- it is useful in natural ChatGPT workflows;
- the operation can be bounded by existing Plaivra ownership, permission, validation, confirmation, versioning, and idempotency rules;
- exposing it does not create a second source of truth;
- it does not require administrator or service-role authority.

### 4.2 Internal AI action

Internal AI actions may remain useful to Plaivra's own UI or orchestration. They are not evidence that external ChatGPT can perform the same operation.

Internal actions must therefore never satisfy `external_chatgpt` prompt capability validation unless a public MCP tool or explicit public composite execution path exists.

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
- Recipe publication, which remains a Plaivra-owned explicit Save Recipe action under current Nutrition authority.

## 5. Registry ↔ scope ↔ executor convergence

Each public tool must have one canonical contract entry that proves:

- public tool name and user-facing title;
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

The names below are target semantic contracts. During implementation planning, exact names may be reconciled with backward compatibility and existing stable client contracts, but the capability coverage is binding once this design is approved.

### 6.1 Connection and bounded context

Current context projections remain valid public patterns:

- `get_plaivra_status`
- `get_training_planning_context`
- `get_nutrition_planning_context`
- `get_daily_execution_context`
- `get_progress_context`
- `get_workout_adjustment_context`

These projections remain minimum-data reasoning context. They do not replace resource-level reads or CRUD where the member asks to act on a specific stored object.

### 6.2 Food Library, My Foods, and Diary

Retain existing food search/logging capabilities.

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
- barcode lookup returns bounded product resolution and source metadata allowed by the Food Catalog architecture;
- catalog verification/merge/import remains non-public;
- Diary write operations continue to freeze resolved nutrition/serving snapshots and must not retroactively change because a catalog item changes later.

### 6.3 Recipes

Recipe read and Working Draft write authority is part of Nutrition.

Target member capabilities:

- `list_recipes`
- `get_recipe`
- `create_recipe_draft`
- `update_recipe_draft`
- `discard_recipe_draft`
- `duplicate_recipe`
- `delete_recipe`
- `restore_recipe` if the underlying Recipe lifecycle supports recoverable deletion at implementation time

Rules:

- MCP may create/update Working Draft state only;
- MCP must not publish a Recipe;
- `Save Recipe`/publication remains an explicit Plaivra-owned UI action;
- Recipe handoff to Diary, Meal Plan, or Saved Meal must preserve Recipe/version identity and frozen nutrition/serving snapshots rather than reducing the source to anonymous food-name text;
- ChatGPT nutrient estimates are never Plaivra nutrition authority;
- Recipe nutrition uses Plaivra-resolved canonical ingredients and current Nutrition authority.

### 6.4 Saved Meals

Existing `create_custom_meal` currently represents Saved Meal creation. Public naming should be reconciled without breaking existing clients.

Target capability family:

- create Saved Meal (existing capability, canonical naming to be reconciled)
- `list_saved_meals`
- `get_saved_meal`
- `update_saved_meal`
- `delete_saved_meal`
- `restore_saved_meal`

Rules:

- Saved Meal identity remains stable;
- using a Saved Meal in Diary or Meal Plan must preserve the Saved Meal source/frozen bundle semantics supported by Nutrition V1;
- soft deletion/recovery is preferred over exposing permanent purge;
- permanent purge remains intentionally non-public unless separately approved.

### 6.5 Meal Plan and Shopping

Existing day/week read and write tools remain subject to reconciliation with canonical Nutrition V1 week mutation/revision authority.

Target additional member capabilities:

- `skip_meal_plan_occurrence`
- `set_shopping_item_state`
- canonical source-aware Meal Plan mutation sufficient to express replace/move/update operations without inventing one MCP tool for every prompt phrase

Rules:

- Meal Plan is intended/planned nutrition; Diary is actual consumption;
- Shopping needs remain derived from Meal Plan; no second saved grocery fact authority is created;
- `generate_shopping_list` remains a read/derived operation;
- marking an item Needed/Purchased updates the existing shopping-state authority only;
- semantic requests such as cheaper/faster/higher-protein/dairy-free/gluten-free are reasoning intents, not separate database authorities; ChatGPT should produce an exact proposed canonical mutation and execute it through the general Meal Plan mutation contract after approval;
- conflict-sensitive writes must use the canonical week revision/operation identity model.

### 6.6 Workout Plans, Exercise Library, and active execution

Retain existing plan creation/read/activation/deletion and active execution capabilities.

Immediate target read capabilities:

- `list_workout_plans`
- public exposure of existing `get_today_workout` handler, subject to verification that its current semantics match the public contract
- `search_exercises`
- `get_exercise`

Training mutation capability family required by product intent:

- replace an exercise in an owned planned/scheduled workout;
- adjust sets/reps/load/rest or session composition;
- adapt a planned workout to available time/equipment/readiness;
- rebalance the remaining week when requested.

Exact canonical write contracts are intentionally **deferred to the Train V2 architecture**, because Train V2 is redesigning plan/session/exercise authorities. This deferment does not mean the product may continue advertising unsupported writes: until the public Train mutation contract exists, external write prompts for those operations must not be presented as executable.

Exercise catalog administration/import/approval remains non-public.

### 6.7 Workout History

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
- soft delete/recovery may be public with clear confirmation;
- permanent purge remains intentionally non-public by default;
- repeat must preview the new scheduled/planned result before the destructive or state-changing step when current Train authority requires confirmation.

### 6.8 Progress

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
- conflicting edits use version/revision checks where the current domain supports them;
- no tool may infer or fabricate health measurements.

### 6.9 Wellness, sleep, habits, and supplements

Target member capabilities:

Sleep/recovery:

- `get_sleep_recovery_logs`
- `update_sleep_recovery_log`
- `delete_sleep_recovery_log`

Habits:

- `list_habits`
- `upsert_habit`
- `delete_habit`
- `mark_habit_done` or an equivalent canonical occurrence-state mutation

Supplements:

- `list_supplements`
- `upsert_supplement`
- `delete_supplement`
- `mark_supplement_taken`
- `get_supplement_adherence`

Rules:

- Plaivra may track member-entered supplement behavior;
- the execution layer must not diagnose, prescribe medication/supplement treatment, or determine individualized dosage as a Plaivra authority;
- any health-related recommendation remains ChatGPT reasoning and must respect product safety boundaries, while MCP writes only persist explicit user-owned tracking facts.

### 6.10 Daily Fit Tasks

Daily Fit Tasks currently have partial/unclear relationship to the Today authority and are **not approved for public MCP expansion yet**.

Before adding task CRUD MCPs, the product architecture must decide whether Daily Fit Tasks remain a canonical member domain or are a legacy/duplicate presentation model. No new MCP should entrench duplicate authority.

### 6.11 Profile

The OAuth model already contains profile read/write scopes, but the public tool surface does not currently provide a matching safe write family.

Target capability family:

- `get_profile_preferences`
- `update_profile_preferences`

Rules:

- writes use a strict allowlist of member-editable fields;
- no arbitrary profile-object patching;
- no auth identity, role, eligibility, consent, billing, or security field mutation;
- onboarding-derived fields may be writable only if current profile/onboarding architecture explicitly permits post-onboarding editing;
- the implementation plan must map each field to its canonical authority before exposure.

### 6.12 App Settings

The OAuth model contains settings read/write scopes. The actual user settings domain includes display, units, language, accessibility, tracking preferences, reminders, and privacy-related presentation settings.

Target capability family:

- `get_app_preferences`
- `update_app_preferences`

Rules:

- use strict field-level allowlists and validation;
- never expose a generic arbitrary settings blob write;
- public settings MCP must not mutate AI permissions, OAuth scopes, connected apps, billing, authentication/security, consent, account deletion, or administrator settings;
- privacy-sensitive presentation settings may require an additional confirmation or narrower field policy;
- whether the existing broad `settings.write` scope should be split is an implementation-planning security decision to be resolved before code changes.

## 7. Scope policy

Public OAuth remains section-based and least privilege.

Write scope implies read only within the same section. Cross-domain implication is forbidden.

`full_access` is an explicit member choice and expands only to normal-user scopes. Admin and legacy blanket scopes remain excluded from public discovery.

Where a capability spans domains, the tool must require the minimum union of scopes actually needed. A prompt must not request or disclose broader context simply because it is available.

## 8. Confirmation, idempotency, and conflicts

Public writes must follow these rules:

- show the proposed user-meaningful change before write when the workflow is generated/reasoned by ChatGPT;
- destructive actions require explicit confirmation;
- no success claim before tool-confirmed success;
- create/log operations that can be replayed must be idempotent or carry an operation identity;
- conflict-sensitive updates must use expected revision/version/`updated_at` where supported;
- stale conflicts return a structured recoverable result rather than overwriting newer user data;
- user-visible prompts do not need to mention these implementation mechanisms; they are enforced server-side.

## 9. Tests and architecture guards

Implementation must add regression coverage proving:

1. every public tool has exactly one public registry definition and an executable handler;
2. every public write prompt maps to at least one real public write MCP capability;
3. internal AI action names alone cannot satisfy external ChatGPT write support;
4. every public-intended executor capability is either registered or explicitly classified internal/reserved;
5. every public scope has documented tool coverage or an explicit reserved marker;
6. all public tools validate ownership/resource boundaries;
7. destructive tools require confirmation;
8. input and output schemas validate all registered tools;
9. admin/internal tools cannot enter normal public OAuth discovery;
10. prompt-to-tool mappings use stable semantic capability IDs rather than UI copy strings;
11. Recipe publish remains absent from public MCP;
12. Shopping remains derived and no second grocery fact authority is introduced.

## 10. Migration and backward compatibility

Implementation must prefer additive evolution:

- preserve existing stable tool names when practical;
- if a misleading name such as `create_custom_meal` is replaced, keep a compatibility alias until current clients are proven migrated;
- do not silently change existing tool semantics while retaining the same name;
- catalog/tool version metadata must advance when externally observable MCP contracts change;
- no Production migration is authorized by this design itself;
- no compatibility marker promotion is authorized by this design itself.

## 11. Rollout order

Recommended implementation sequence after approval and detailed implementation planning:

1. **P0 — Convergence guardrails:** registry/scope/executor/prompt capability model, hidden-handler detection, external-vs-internal support distinction.
2. **P0 — Recipe Working Draft MCP:** close the currently architected but missing public path.
3. **P0 — Prompt/runtime gating:** prevent unsupported external write prompts from appearing executable.
4. **P1 — Nutrition completion:** Saved Meals, My Foods/corrections/favorites/barcode, canonical Meal Plan/Shopping gaps.
5. **P1 — Read completion for Train:** workout-plan list, today workout, Exercise Library read.
6. **P1 — History/Progress/Wellness/Profile safe member CRUD.**
7. **Train V2 dependent — canonical Train mutation writes.**
8. **Decision dependent — Daily Fit Tasks and any settings-scope split.**

Each implementation phase remains one approved scope/branch/PR and must not begin automatically after the previous phase.

## 12. Acceptance criteria for this architecture

The architecture is ready for implementation planning only when:

- the Planner explicitly approves this written design;
- the Prompt Presentation Architecture is approved alongside it;
- all intentional non-public boundaries are accepted;
- Train V2-dependent writes and Daily Fit Tasks are explicitly recorded as deferred decisions rather than silently omitted;
- canonical control-plane documents are reconciled in the same documentation PR before runtime implementation begins.
