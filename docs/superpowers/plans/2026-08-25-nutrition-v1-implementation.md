# Nutrition V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the user-approved Nutrition V1 architecture end-to-end: Diary, Meal Plan + Shopping List, Food Library, My Recipes + Cooking Mode, and the shared Saved Meal utility, while preserving legacy user data and frozen historical truth.

**Architecture:** Build additive canonical Nutrition V1 tables and transactional commands beside current compatibility data, then move each user surface to authenticated server projections/commands instead of extending mixed legacy browser models. Reusable sources (Food, Recipe, Saved Meal) remain distinct; every committed consumer freezes the version/resolved facts it needs. Existing `/calories`, `/my-meal-plan`, and `/calories/food-hub` URLs remain compatibility URLs for V1, `/my-recipes` is added, and `/calories/weekly-overview` is removed from Nutrition navigation and redirected to Diary until the separate Global Summary program is designed.

**Tech Stack:** Next.js 16.2.11, React 19.2, TypeScript 5.9.3, Supabase/Postgres + RLS/RPC, Vitest 4.1.9, Playwright 1.61.1, Tailwind, existing Plaivra i18n/MCP/auth infrastructure.

**Spec:** `docs/superpowers/specs/2026-08-25-nutrition-wide-reconciliation-design.md` plus the five reconciliation amendments and original page/native specs listed in `docs/control/PLAIVRA_NUTRITION_AUTHORITIES.md`.

## Global Constraints

- Nutrition has exactly four peer destinations: Diary, Meal Plan, Food Library, My Recipes.
- Shopping List stays nested under Meal Plan. No Nutrition Summary route/navigation item.
- Future Global Summary is outside this implementation.
- Diary = actual intake; Meal Plan = intended intake. No silent plan-to-actual conversion.
- Food, Recipe, Saved Meal are distinct types. No Recipe→Recipe or Saved Meal→Saved Meal nesting in V1.
- Missing nutrition is `null`/unknown, never coerced to zero.
- Every committed Recipe consumer stores `recipe_id`, `recipe_version_id`, resolved serving/quantity, frozen nutrition, and enough frozen display data to survive source deletion.
- Recipe and Saved Meal deletion: Recently Deleted → 30 days → Restore/Delete Now → permanent source deletion; frozen consumers survive.
- Diary/Meal Plan use effective-dated Nutrition Targets for the selected/planned date.
- ChatGPT remains external prompt/reasoning. MCP writes require explicit user approval. ChatGPT is not nutrition authority.
- Cooking Mode never invents temperatures, durations, doneness, physical state, or safety guidance.
- Apple custom touch targets use Plaivra ≥44×44 pt product baseline; Android uses approximately 48 dp where appropriate.
- Preserve EN/DE/AR, RTL, Dynamic Type/large text, keyboard/focus, offline/session resilience, and all approved empty/error/loading states.
- Do not drop legacy `saved_recipes`, `custom_meals`, `user_meal_plan_items`, or existing food/log tables in this implementation. Retirement is a later verified migration decision.
- Every runtime task is TDD: failing test → minimal implementation → passing targeted tests → commit.

---

## File Structure Map

### Canonical domain/types
- Create `lib/nutrition-v1/contracts.ts` — shared Food/Recipe/SavedMeal/Diary/MealPlan snapshot contracts.
- Create `lib/nutrition-v1/nutrition-value.ts` — nullable nutrient math and completeness helpers.
- Create `lib/nutrition-v1/targets.ts` — effective-date selection semantics.
- Create `lib/nutrition-v1/recipe-versioning.ts` — version/draft lifecycle pure rules.
- Create `lib/nutrition-v1/cooking-engine.ts` — deterministic action/track/session scheduler.
- Create `lib/nutrition-v1/cooking-timers.ts` — timestamp timer reconstruction.

### Database migrations
- Create `supabase/migrations/20260825120000_nutrition_v1_reusable_domains.sql`.
- Create `supabase/migrations/20260825120100_nutrition_v1_plan_diary_targets.sql`.
- Create `supabase/migrations/20260825120200_nutrition_v1_cooking_sessions.sql`.
- Create `supabase/migrations/20260825120300_nutrition_v1_food_search.sql`.
- Create matching verification SQL in `supabase/verification/nutrition-v1-*.sql`.

### Server authorities
- Create `services/nutrition-v1/server/food-library.ts`.
- Create `services/nutrition-v1/server/diary.ts`.
- Create `services/nutrition-v1/server/meal-plan.ts`.
- Create `services/nutrition-v1/server/recipes.ts`.
- Create `services/nutrition-v1/server/saved-meals.ts`.
- Create `services/nutrition-v1/server/cooking-sessions.ts`.
- Create route handlers under `app/api/nutrition/v1/*` using `requireUser(request)` and private/no-store responses.

### UI
- Create focused components under `components/nutrition/diary`, `food-library`, `meal-plan`, `recipes`, `saved-meals`, `cooking`.
- Keep compatibility route files thin: `/calories`, `/my-meal-plan`, `/calories/food-hub`.
- Create `app/(private)/my-recipes/page.tsx` and recipe detail/editor/cooking routes.

### Cross-domain compatibility
- Modify `components/layout/app-shell.tsx`, `lib/navigation/mobile-nav.ts`, translations, privacy export, account deletion, MCP scopes/executors/context projections, Today nutrition readers, and reporting readers only where they consume Nutrition authority.

---

### Task 1: Lock canonical TypeScript contracts and nullable nutrition math

**Files:**
- Create: `lib/nutrition-v1/contracts.ts`
- Create: `lib/nutrition-v1/nutrition-value.ts`
- Test: `lib/nutrition-v1/contracts.test.ts`
- Test: `lib/nutrition-v1/nutrition-value.test.ts`

**Interfaces:**
- Produces `NutritionFacts`, `FrozenNutritionSnapshot`, `RecipeConsumerSnapshot`, `SavedMealBundleSnapshot`, `PlannedOccurrenceSource`, `DiaryEntrySource`.
- `NutritionFacts` nutrient fields are `number | null`; no helper may convert `null` to `0`.

- [ ] **Step 1: Write failing nullable-math and snapshot-contract tests.**

```ts
it("keeps an unresolved nutrient unknown", () => {
  expect(sumNutritionFacts([{ calories: 100, protein_g: 10 }, { calories: null, protein_g: 5 }])).toEqual({
    calories: null,
    protein_g: 15,
  });
});

it("requires a Recipe consumer version", () => {
  expect(() => recipeConsumerSnapshot({ recipeId: "r", recipeVersionId: "" })).toThrow(/version/i);
});
```

- [ ] **Step 2: Run `npx vitest run --config vitest.unit.config.mjs lib/nutrition-v1/contracts.test.ts lib/nutrition-v1/nutrition-value.test.ts` and verify FAIL because the new contracts/helpers do not exist.**
- [ ] **Step 3: Implement the exact contracts and null-preserving helpers; reject non-finite/negative supplied nutrient values without inventing values.**
- [ ] **Step 4: Re-run the targeted command and verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add canonical v1 contracts`.**

### Task 2: Add reusable Recipe + Saved Meal canonical schema and recovery lifecycle

**Files:**
- Create: `supabase/migrations/20260825120000_nutrition_v1_reusable_domains.sql`
- Create: `supabase/verification/nutrition-v1-reusable-domains.sql`
- Test: `lib/product/nutrition-v1-reusable-domains-migration.test.ts`
- Modify: `types/database-legacy.ts` only to mark compatibility mappings; do not redefine new product types there.

**Interfaces:**
- Create owner-scoped `nutrition_recipes`, `nutrition_recipe_versions`, `nutrition_recipe_drafts`, `nutrition_recipe_ingredients`, `nutrition_recipe_actions`, `nutrition_recipe_equipment`, `nutrition_saved_meals`, `nutrition_saved_meal_items`.
- `nutrition_recipes` and `nutrition_saved_meals`: `deleted_at`, `purge_after`; normal queries exclude deleted rows.
- Published Recipe versions are immutable after insert.
- Saved Meal Recipe child stores `recipe_id` + `recipe_version_id` + frozen resolved facts.

- [ ] **Step 1: Write the migration contract test that asserts table names, RLS, owner policies, version FK, no recursive Saved Meal FK, and 30-day deletion columns.**
- [ ] **Step 2: Run `npx vitest run --config vitest.unit.config.mjs lib/product/nutrition-v1-reusable-domains-migration.test.ts` and verify FAIL.**
- [ ] **Step 3: Write the additive migration with constraints/indexes/RLS and RPCs `soft_delete_nutrition_recipe`, `restore_nutrition_recipe`, `purge_nutrition_recipe_now`, `soft_delete_nutrition_saved_meal`, `restore_nutrition_saved_meal`, `purge_nutrition_saved_meal_now`. `purge_after = deleted_at + interval '30 days'`; purge removes only live-source rows and never consumer snapshots.**
- [ ] **Step 4: Add verification SQL proving no legacy table was dropped and every owner table has RLS enabled. Run migration contract test and repository migration-ledger checks.**
- [ ] **Step 5: Commit `feat(nutrition): add recipe and saved meal domain schema`.**

### Task 3: Add effective-dated targets, canonical weekly planning, and frozen Diary/plan source snapshots

**Files:**
- Create: `supabase/migrations/20260825120100_nutrition_v1_plan_diary_targets.sql`
- Create: `supabase/verification/nutrition-v1-plan-diary-targets.sql`
- Test: `lib/product/nutrition-v1-plan-diary-targets-migration.test.ts`
- Modify: `services/database/meal-plan.ts` only through a compatibility adapter after canonical functions exist.

**Interfaces:**
- `nutrition_target_periods(user_id, effective_from, effective_to, calories, protein_g, carbs_g, fat_g, water_ml)` with non-overlapping effective periods per owner.
- `nutrition_meal_plan_weeks(id,user_id,week_start_date,revision,week_override_json,...)`.
- `nutrition_planned_occurrences(... source_type food|recipe|saved_meal|placeholder, source_id, source_version_id, frozen_snapshot, status planned|completed|completed_changed|skipped, ...)`.
- Add canonical source fields/snapshot JSON to actual logging authority or create `nutrition_log_groups` + `nutrition_log_group_items` linked to existing `food_logs` without rewriting historical rows.

- [ ] **Step 1: Write failing migration tests for effective periods, week uniqueness/revision, version-specific Recipe occurrences, nullable nutrition, and frozen actual-consumer snapshots.**
- [ ] **Step 2: Run the targeted migration test and verify FAIL.**
- [ ] **Step 3: Implement additive tables, owner RLS, indexes, and atomic RPCs for plan occurrence create/update/status transition and grouped actual logging. Keep `user_meal_plan_items`/`food_logs` readable as compatibility data.**
- [ ] **Step 4: Verify SQL plus unit migration test PASS; verify no `coalesce(nutrient,0)` is used for unknown source nutrition.**
- [ ] **Step 5: Commit `feat(nutrition): add effective targets and plan diary snapshots`.**

### Task 4: Add Cooking Session persistence schema

**Files:**
- Create: `supabase/migrations/20260825120200_nutrition_v1_cooking_sessions.sql`
- Create: `supabase/verification/nutrition-v1-cooking-sessions.sql`
- Test: `lib/product/nutrition-v1-cooking-session-migration.test.ts`

**Interfaces:**
- `nutrition_cooking_sessions`: owner, frozen recipe/version snapshot, status active|completed|ended, current_action_id, started_at, last_active_at.
- `nutrition_cooking_action_states`: not_available|ready|active|waiting_for_condition|running_background|completed|deferred|skipped.
- `nutrition_cooking_timers`: action-owned named timer with duration, started_at, target_end_at, paused_at, accumulated_pause_ms.

- [ ] **Step 1: Write failing schema contract tests for owner isolation, multiple timers, version snapshot, and resumable state.**
- [ ] **Step 2: Run targeted test and verify FAIL.**
- [ ] **Step 3: Implement migration/RLS/indexes; no schema field represents Plaivra-predicted physical state.**
- [ ] **Step 4: Run migration test and verification SQL; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add cooking session persistence`.**

### Task 5: Add indexed multilingual Food Library search projection

**Files:**
- Create: `supabase/migrations/20260825120300_nutrition_v1_food_search.sql`
- Create: `services/nutrition-v1/server/food-library.ts`
- Create: `services/nutrition-v1/server/food-library.test.ts`
- Create: `app/api/nutrition/v1/foods/route.ts`

**Interfaces:**
- Server-bounded search over canonical/global + user Foods, aliases/localized names, barcode, category/cuisine filters, Favorites/My Foods.
- Cursor pagination; default first page ≤20 useful rows.
- Result exposes positive-only `verified` boolean and nullable nutrients.

- [ ] **Step 1: Write failing reader tests: exact personal match outranks broad catalog, EN/DE/AR alias matching, cursor boundedness, missing nutrient stays null.**
- [ ] **Step 2: Run `npx vitest run --config vitest.unit.config.mjs services/nutrition-v1/server/food-library.test.ts` and verify FAIL.**
- [ ] **Step 3: Add Postgres search projection/indexes and server reader; route authenticates via `requireUser(request)`, derives owner server-side, returns private/no-store.**
- [ ] **Step 4: Run targeted tests plus `npm run typecheck`; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add indexed food library search`.**

### Task 6: Implement effective-dated target service and compatibility backfill

**Files:**
- Create: `lib/nutrition-v1/targets.ts`
- Create: `lib/nutrition-v1/targets.test.ts`
- Create: `services/nutrition-v1/server/targets.ts`
- Modify: `services/database/eat-targets.ts`
- Modify: `services/nutrition/active-target.ts`

**Interfaces:**
- `getEffectiveNutritionTarget(supabase,userId,date)` returns the stored period effective on `date`; it does not recompute history from today's current profile/workout plan.
- Existing base/profile/assignment model is backfilled into dated periods at migration/cutover and remains compatibility input only.

- [ ] **Step 1: Write failing tests proving a January target stays January after an August target change and missing target remains `null`.**
- [ ] **Step 2: Run targeted tests and verify the current resolver fails the historical invariant.**
- [ ] **Step 3: Implement effective-period resolver and compatibility adapter; no historical re-resolution from current workout schedule.**
- [ ] **Step 4: Run target tests plus existing Eat/Meal Plan target tests and verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): make targets effective dated`.**

### Task 7: Implement Saved Meal server authority and contextual UI

**Files:**
- Create: `services/nutrition-v1/server/saved-meals.ts`
- Create: `services/nutrition-v1/server/saved-meals.test.ts`
- Create: `components/nutrition/saved-meals/saved-meal-editor.tsx`
- Create: `components/nutrition/saved-meals/saved-meal-picker.tsx`
- Create: `components/nutrition/saved-meals/recently-deleted-saved-meals.tsx`
- Modify: `components/meals/custom-nutrition-manager.tsx` to remove Saved Meal ownership after parity is proven.

**Interfaces:**
- Create/Edit accepts Foods + published Recipe versions only.
- Delete/Restore/Delete Now use canonical RPCs.
- `resolveSavedMealBundleSnapshot(id)` returns frozen child display/nutrition/recipe-version facts for consumers.

- [ ] **Step 1: Write failing server tests for mixed Food+Recipe children, no nesting, future-only edit semantics, restore same ID, purge preserving consumer snapshots.**
- [ ] **Step 2: Run targeted tests and verify FAIL.**
- [ ] **Step 3: Implement server authority + contextual editor/picker; do not create a Saved Meal nav page.**
- [ ] **Step 4: Add component tests for Create/Detail/Edit/Recently Deleted and verify targeted tests PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add shared saved meal utility`.**

### Task 8: Implement Recipe versions, Working Drafts, lifecycle, and MCP write contract

**Files:**
- Create: `lib/nutrition-v1/recipe-versioning.ts`
- Create: `lib/nutrition-v1/recipe-versioning.test.ts`
- Create: `services/nutrition-v1/server/recipes.ts`
- Create: `services/nutrition-v1/server/recipes.test.ts`
- Modify: `lib/mcp/scopes.ts`
- Modify: `lib/mcp/tool-executor-safe.ts`
- Modify: `lib/ai/prompt-catalog/nutrition.ts`
- Modify: `lib/ai/prompt-contracts/nutrition.ts`

**Interfaces:**
- `createRecipeDraft`, `autosaveRecipeDraft`, `publishRecipeDraft`, `discardRecipeDraft`, `softDeleteRecipe`, `restoreRecipe`, `purgeRecipeNow`.
- Publishing validates Name + servings/yield + ≥1 ingredient + ≥1 instruction and creates immutable next version.
- MCP may mutate Draft only after user-authorized tool invocation; published version never mutates in place.

- [ ] **Step 1: Write failing version/lifecycle tests including publish v1→draft→v2, deletion/restore same identity/history, and MCP rejection of direct published mutation.**
- [ ] **Step 2: Run targeted tests and verify FAIL.**
- [ ] **Step 3: Implement pure lifecycle + server authority + MCP/prompt contracts. Ensure external ChatGPT is reasoning only and nutrition is calculated by Plaivra authorities.**
- [ ] **Step 4: Run Recipe tests, MCP public-tool coverage tests, prompt contract tests, and typecheck; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add canonical recipe version workflow`.**

### Task 9: Build My Recipes Home, search, editor, detail, and Recently Deleted

**Files:**
- Create: `app/(private)/my-recipes/page.tsx`
- Create: `app/(private)/my-recipes/[recipeId]/page.tsx`
- Create: `app/(private)/my-recipes/[recipeId]/edit/page.tsx`
- Create: `components/nutrition/recipes/recipe-home.tsx`
- Create: `components/nutrition/recipes/recipe-row.tsx`
- Create: `components/nutrition/recipes/recipe-editor.tsx`
- Create: `components/nutrition/recipes/recipe-detail.tsx`
- Create: `components/nutrition/recipes/recently-deleted-recipes.tsx`
- Test: `lib/product/nutrition-v1-my-recipes.test.ts`

**Interfaces:**
- Home = Search → adaptive Continue/Recently Used/Favorites → All Recipes.
- No folders/Collections/grid dashboard.
- Detail serving control is preview-only until explicit edit/save.

- [ ] **Step 1: Write failing product/component contract tests for adaptive Home, Ready/Draft restrictions, shield-check verification, Delete/Restore, and no Archive terminology.**
- [ ] **Step 2: Run targeted tests and verify FAIL.**
- [ ] **Step 3: Implement page/components using Recipe server authority; editor autosave displays `Saved` only after persistence confirmation.**
- [ ] **Step 4: Run My Recipes tests + typecheck + lint scoped to changed files; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): build my recipes workspace`.**

### Task 10: Implement deterministic Cooking Mode engine and timers

**Files:**
- Create: `lib/nutrition-v1/cooking-engine.ts`
- Create: `lib/nutrition-v1/cooking-engine.test.ts`
- Create: `lib/nutrition-v1/cooking-timers.ts`
- Create: `lib/nutrition-v1/cooking-timers.test.ts`

**Interfaces:**
- `deriveCookingTimeline(recipeFacts,sessionState)` outputs Attention/Now/Running/UpNext from supplied facts only.
- Timer expiry is deterministic session event, not proof of condition/doneness.
- `Later` = deferred required action; `Skip` = intentionally omitted action.

- [ ] **Step 1: Write failing tests for parallel tracks, dependency release, linear fallback, timer reconstruction after app termination, condition waiting, Later vs Skip, and no inferred boiling/doneness.**
- [ ] **Step 2: Run targeted tests and verify FAIL.**
- [ ] **Step 3: Implement minimal pure engine/timer functions; prohibit physical-state inference in types and reducers.**
- [ ] **Step 4: Run all engine/timer tests and verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add deterministic cooking engine`.**

### Task 11: Implement Cooking Session server/local persistence and Cooking Mode UI

**Files:**
- Create: `services/nutrition-v1/server/cooking-sessions.ts`
- Create: `services/nutrition-v1/server/cooking-sessions.test.ts`
- Create: `lib/nutrition-v1/cooking-local-store.ts`
- Create: `lib/nutrition-v1/cooking-local-store.test.ts`
- Create: `app/(private)/my-recipes/[recipeId]/cook/page.tsx`
- Create: `components/nutrition/cooking/cooking-mode.tsx`
- Create: `components/nutrition/cooking/cooking-resume.tsx`

**Interfaces:**
- Start materializes frozen Recipe version + execution-critical state locally.
- Resume + Start Over; Back ≠ End Cooking.
- Touch path always exposes Back, Repeat, Done, conditional Later; voice activation is restrained/optional and permission requested only on first activation.

- [ ] **Step 1: Write failing persistence tests for background/termination reconstruction, multiple timers, Resume/Start Over, offline mutation queue, and explicit End Cooking.**
- [ ] **Step 2: Run targeted tests and verify FAIL.**
- [ ] **Step 3: Implement local-first session adapter + server sync and focused UI hierarchy Attention > Now > Running > Up Next; request screen wakefulness only while foreground active.**
- [ ] **Step 4: Add UI contract tests for Done (not Done/Next), Repeat, Later, ATTENTION authority, large text, RTL, and completion≠consumption; run tests and verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): build resumable cooking mode`.**

### Task 12: Replace Food Hub with canonical Food Library UI

**Files:**
- Modify: `app/(private)/calories/food-hub/page.tsx`
- Create: `components/nutrition/food-library/food-library-page.tsx`
- Create: `components/nutrition/food-library/food-row.tsx`
- Create: `components/nutrition/food-library/food-detail.tsx`
- Create: `components/nutrition/food-library/food-filters.tsx`
- Modify: `components/meals/food-browser.tsx` into compatibility wrapper or retire after parity.
- Test: `lib/product/nutrition-v1-food-library.test.ts`

**Interfaces:**
- Search-first server-bounded rows, Recent/Favorites/My Foods, Category/Cuisine browse, live filters, positive-only Plaivra Verified shield.
- Add To destinations: Diary, Meal Plan, Saved Meal, Recipe.

- [ ] **Step 1: Write failing product tests for flat rows, no Saved Meal masquerading as Food, no full-client catalog slicing, live filters, nullable nutrition, and Add To handoff.**
- [ ] **Step 2: Run targeted tests and verify FAIL.**
- [ ] **Step 3: Implement Food Library page over server search API; keep Custom Food creation inside Food Library and remove legacy combined Food/Saved Meal manager from normal path.**
- [ ] **Step 4: Run Food Library tests + typecheck; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): replace food hub with food library`.**

### Task 13: Implement Diary projection and unified Food Logging Session

**Files:**
- Create: `services/nutrition-v1/server/diary.ts`
- Create: `services/nutrition-v1/server/diary.test.ts`
- Create: `app/api/nutrition/v1/diary/route.ts`
- Create: `app/api/nutrition/v1/log/route.ts`
- Modify: `app/(private)/calories/page.tsx`
- Create: `components/nutrition/diary/diary-page.tsx`
- Create: `components/nutrition/diary/logging-session.tsx`
- Create: `components/nutrition/diary/plate-dock.tsx`
- Modify/retire after parity: `components/meals/eat-page.tsx`, `eat-add-food-surface.tsx`, `eat-food-log.tsx`, `eat-day-sections.tsx`, `services/database/eat-food-logging.ts`.

**Interfaces:**
- One date-scoped Diary projection: actual logs, effective target, hydration, planned context, partial-domain error envelopes.
- One logical `LogMealCommand(operationId,date,meal,items[])`, owner derived server-side, idempotent/all-or-nothing.
- Plate accepts Food, Recipe serving, Saved Meal bundle; source snapshots preserved.

- [ ] **Step 1: Write failing server tests for actual-only remaining calories, effective historical target, Recipe version logging, Saved Meal frozen bundle, multi-item atomicity/idempotency, unknown nutrition, and plan linkage.**
- [ ] **Step 2: Run targeted tests and verify FAIL.**
- [ ] **Step 3: Implement authenticated projection/command and unified logger; remove method-first landing behavior while keeping Barcode/Quick Add/Saved Meals/Recipes as secondary methods in the same session.**
- [ ] **Step 4: Run Diary/unit/integration tests including existing Eat regressions and verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): build canonical diary logging`.**

### Task 14: Implement week-authoritative Meal Plan and Shopping List

**Files:**
- Create: `services/nutrition-v1/server/meal-plan.ts`
- Create: `services/nutrition-v1/server/meal-plan.test.ts`
- Create: `app/api/nutrition/v1/meal-plan/week/route.ts`
- Modify: `app/(private)/my-meal-plan/page.tsx`
- Replace coordinator responsibilities in `components/meals/my-meal-plan/my-meal-plan-page-client.tsx` with focused components under `components/nutrition/meal-plan/`.
- Modify: `components/meals/grocery-list-panel.tsx` or wrap with `components/nutrition/meal-plan/shopping-list.tsx`.

**Interfaces:**
- Week is canonical object; selected day is workspace inside week.
- Occurrence types Food/Recipe/SavedMeal/Placeholder with frozen snapshots.
- Add workspace search-first; no method picker.
- Atomic plan→actual completion uses Diary command and linkage; `Completed with changes` and `Skipped` preserve intent history.

- [ ] **Step 1: Write failing tests for week lazy creation/revision, custom slots, Recipe version snapshot, Saved Meal snapshot, placeholder rules, copy/repeat fresh identities, plan→actual atomicity, and Shopping frozen ingredient derivation.**
- [ ] **Step 2: Run targeted tests and verify FAIL.**
- [ ] **Step 3: Implement server week projection/commands and split UI into week header, selected-day planner, add workspace, occurrence row, Shopping route/surface; remove `Day | Week | Shopping` peer-tab mental model.**
- [ ] **Step 4: Run new tests plus `my-meal-plan-redesign`, post-merge refinement, and navigation tests; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): rebuild meal plan around weekly intent`.**

### Task 15: Reconcile Nutrition navigation, routes, i18n, and deprecated Summary compatibility

**Files:**
- Modify: `components/layout/app-shell.tsx`
- Modify: `lib/navigation/mobile-nav.ts`
- Modify: `lib/navigation/mobile-nav.test.ts`
- Modify: `lib/i18n/translations.ts`
- Modify: `lib/i18n/types.ts`
- Modify: `app/(private)/calories/weekly-overview/page.tsx`
- Create/modify product navigation test: `lib/product/nutrition-v1-navigation.test.ts`

**Interfaces:**
- Eat/Nutrition group contains Diary (`/calories`), Meal Plan (`/my-meal-plan`), Food Library (`/calories/food-hub`), My Recipes (`/my-recipes`) only.
- `/calories/weekly-overview` performs compatibility redirect to `/calories`; it is not a fifth Nutrition experience.

- [ ] **Step 1: Write failing nav tests asserting exactly four peer Nutrition destinations and no `nav.nutritionSummary` link.**
- [ ] **Step 2: Run nav/product tests and verify FAIL against current sidebar.**
- [ ] **Step 3: Update navigation/i18n/active-route logic and redirect legacy weekly overview. Preserve mobile quick-log action and existing Train behavior.**
- [ ] **Step 4: Run navigation + i18n tests and typecheck; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): reconcile four-destination navigation`.**

### Task 16: Update privacy export, deletion, Today/reporting consumers, and MCP compatibility

**Files:**
- Modify: `lib/privacy/data-export.ts`
- Modify: `lib/privacy/data-export-legacy.ts`
- Modify: account-deletion table/cleanup registry files discovered by existing deletion tests.
- Modify: `services/dashboard/today-projection-server.ts`
- Modify: `lib/dashboard/today-projection-contract.ts`
- Modify: `services/reports/reporting.ts` only to consume actual Nutrition truth; do not recreate Nutrition Summary.
- Modify: `lib/mcp/context-projections.ts`
- Modify: `lib/mcp/tool-executor-safe.ts`
- Tests: `lib/privacy/data-export.test.ts`, existing account deletion tests, Today projection tests, MCP coverage tests.

**Interfaces:**
- Export includes new Recipe versions/drafts, Saved Meals/items, Meal Plan weeks/occurrences, Cooking Sessions/timers, target periods, and consumer snapshot lineage.
- Account deletion removes owner data according to privacy authority including Recently Deleted live sources.
- Today reads canonical Diary actuals/effective target and Meal Plan intention separately.

- [ ] **Step 1: Extend existing tests first; assert all new owner tables/export sections and no secret/internal-only leakage.**
- [ ] **Step 2: Run privacy/Today/MCP targeted tests and verify FAIL.**
- [ ] **Step 3: Implement compatibility readers/export/deletion/MCP mapping. Do not make reporting or Today a second Nutrition fact store.**
- [ ] **Step 4: Run privacy + Today + MCP suites and verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): integrate privacy today and mcp consumers`.**

### Task 17: Prove legacy-data compatibility and prohibit destructive cutover

**Files:**
- Create: `services/nutrition-v1/compatibility/legacy-nutrition.ts`
- Create: `services/nutrition-v1/compatibility/legacy-nutrition.test.ts`
- Create: `supabase/verification/nutrition-v1-legacy-reconciliation.sql`
- Modify: `lib/architecture/canonical-convergence.test.ts`

**Interfaces:**
- Map historical `saved_recipes(saved_item_type meal|recipe|template)`, `custom_meals`, flat `user_meal_plan_items`, and existing `food_logs` into explicit compatibility projections without declaring mixed legacy identity canonical.
- No automatic destructive deduplication or row deletion.

- [ ] **Step 1: Write fixture tests with legacy recipe, custom meal, completed plan item, and food log; assert each remains visible under the correct new semantic projection.**
- [ ] **Step 2: Run compatibility/convergence tests and verify FAIL.**
- [ ] **Step 3: Implement read/backfill compatibility adapters and verification SQL; explicitly classify unresolved ambiguous rows instead of guessing.**
- [ ] **Step 4: Run convergence + compatibility + privacy tests; verify PASS and zero destructive cleanup statements.**
- [ ] **Step 5: Commit `feat(nutrition): preserve legacy nutrition compatibility`.**

### Task 18: Full visual/accessibility/responsive QA and final repository verification

**Files:**
- Create: `scripts/run-nutrition-v1-qa.mjs`
- Create: `scripts/run-nutrition-v1-qa.test.mjs`
- Modify: `scripts/run-rendered-qa.mjs` only to register the new bounded Nutrition suite if appropriate.
- Add product contract tests for RTL/large text/focus where missing.
- Update: `docs/control/PLAIVRA_CURRENT_STATE.md` only with verified implementation state at phase close.

**Interfaces:**
- Required screenshot/state matrix includes mobile Home/Diary/Meal Plan/Food Library/My Recipes/editor/detail/Cooking, desktop Home/detail/Cooking/Meal Plan, RTL mobile Home + Cooking, large-text stress, empty/error/offline/autosave failure, Recently Deleted, and Shopping.

- [ ] **Step 1: Write QA harness tests first for expected routes, viewport matrix, console/runtime error capture, and deterministic screenshot names.**
- [ ] **Step 2: Run harness test and verify FAIL before harness exists.**
- [ ] **Step 3: Implement rendered QA harness and fix only verified Nutrition defects until the approved visual/state matrix passes; do not redesign during QA.**
- [ ] **Step 4: Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, Nutrition rendered QA, migration ledger check, privacy/MCP regression tests, and any repository-required canonical Quality workflow. Record exact outputs/run IDs; zero failures required before completion claim.**
- [ ] **Step 5: Re-run migration verification against the exact implementation head; verify no legacy table retirement and no pending/untracked schema authority issues.**
- [ ] **Step 6: Update `PLAIVRA_CURRENT_STATE.md` with evidence, commit `docs: record Nutrition V1 implementation evidence`, then use `superpowers:verification-before-completion` before requesting merge approval.**

---

## Plan Self-Review Checklist

Before execution begins, the executor must preserve these dependency rules:

1. Tasks 1–6 establish data/type/search/target foundations before any page is treated as canonical.
2. Task 7 Saved Meal and Task 8 Recipe version authority precede Diary/Meal Plan consumer cutover.
3. Tasks 10–11 Cooking Mode depend on published Recipe versions and Cooking Session schema.
4. Tasks 12–14 can be developed after shared foundations, but Diary/Meal Plan must not ship against legacy aggregate Saved Meal logging.
5. Task 15 navigation cutover occurs only after all four destinations have working routes.
6. Task 16 privacy/MCP/Today integration is mandatory before release readiness.
7. Task 17 proves legacy continuity; it does not delete legacy storage.
8. Task 18 is the only phase that may claim implementation closure, and only with fresh evidence.

**No implementation task may silently collapse nullable nutrition into zero, silently mutate a frozen consumer, reintroduce Nutrition Summary, add a Saved Meal peer page, expose Archive-first Recipe removal, or make ChatGPT an in-app nutrition/cooking authority.**
