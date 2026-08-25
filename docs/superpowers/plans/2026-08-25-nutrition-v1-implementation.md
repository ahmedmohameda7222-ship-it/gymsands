# Nutrition V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the user-approved Nutrition V1 architecture end-to-end: Diary, Meal Plan + Shopping List, Food Library, My Recipes + Cooking Mode, and the shared Saved Meal utility, while preserving legacy user data and frozen historical truth.

**Architecture:** Add canonical Nutrition V1 tables and transactional commands beside current compatibility data, then move each surface to authenticated server projections/commands instead of extending mixed legacy browser models. Reusable sources (Food, Recipe, Saved Meal) remain distinct; committed consumers freeze the version/resolved facts needed to remain correct after source edits/deletion. Existing `/calories`, `/my-meal-plan`, and `/calories/food-hub` URLs remain compatibility URLs for V1, `/my-recipes` is added, and `/calories/weekly-overview` is removed from Nutrition navigation and redirects to Diary until the separately designed Global Summary exists.

**Tech Stack:** Next.js 16.2.11, React 19.2, TypeScript 5.9.3, Supabase/Postgres + RLS/RPC, Vitest 4.1.9, Playwright 1.61.1, Tailwind, existing Plaivra i18n/MCP/auth/privacy infrastructure.

**Spec:** `docs/superpowers/specs/2026-08-25-nutrition-wide-reconciliation-design.md` plus its five binding reconciliation amendments and the original page/native specs referenced by `docs/control/PLAIVRA_NUTRITION_AUTHORITIES.md`.

## Global Constraints

- Nutrition has exactly four peer destinations: Diary, Meal Plan, Food Library, My Recipes.
- Shopping List stays nested under Meal Plan. No Nutrition Summary route/navigation item.
- Future Global Summary is outside this implementation.
- Diary = actual intake; Meal Plan = intended intake. No silent plan-to-actual conversion.
- Food, Recipe, Saved Meal are distinct types. No Recipe→Recipe or Saved Meal→Saved Meal nesting in V1.
- Missing nutrition is `null`/unknown, never coerced to zero.
- Every committed Recipe consumer stores `recipe_id`, `recipe_version_id`, resolved serving/quantity, frozen nutrition, and enough frozen display data to survive source deletion.
- Consumer `recipe_id` / `recipe_version_id` lineage must survive permanent source deletion. Consumer lineage columns therefore do **not** use a cascading FK to purgeable Recipe source/version rows; source existence is resolved separately.
- Recipe and Saved Meal deletion: Recently Deleted → 30 days → Restore/Delete Now → permanent source deletion; frozen consumers survive.
- Diary/Meal Plan use effective-dated Nutrition Targets for selected/planned dates. Never invent pre-cutover target history that current data cannot prove.
- ChatGPT remains external prompt/reasoning. MCP writes require explicit user approval. ChatGPT is not nutrition authority.
- Cooking Mode never invents temperatures, durations, doneness, physical state, or safety guidance.
- Apple custom touch targets use Plaivra ≥44×44 pt product baseline; Android uses approximately 48 dp where appropriate.
- Preserve EN/DE/AR, RTL, Dynamic Type/large text, keyboard/focus, offline/session resilience, and all approved empty/error/loading states.
- Do not drop legacy `saved_recipes`, `custom_meals`, `user_meal_plan_items`, existing food/log tables, or old target tables in this implementation. Retirement is a later verified migration decision.
- Every runtime task is TDD: failing test → minimal implementation → passing targeted tests → commit.

---

## File Structure Map

### Canonical domain/types
- Create `lib/nutrition-v1/contracts.ts` — shared Food/Recipe/SavedMeal/Diary/MealPlan snapshot contracts.
- Create `lib/nutrition-v1/nutrition-value.ts` — nullable nutrient math and completeness helpers.
- Create `lib/nutrition-v1/targets.ts` — effective-date target semantics.
- Create `lib/nutrition-v1/recipe-versioning.ts` — version/draft/deletion pure rules.
- Create `lib/nutrition-v1/cooking-engine.ts` — deterministic action/track/session scheduler.
- Create `lib/nutrition-v1/cooking-timers.ts` — timestamp timer reconstruction.
- Create `lib/nutrition-v1/cooking-voice.ts` — deterministic voice command parser/capability state.

### Database migrations
- `supabase/migrations/20260825120000_nutrition_v1_reusable_domains.sql`
- `supabase/migrations/20260825120100_nutrition_v1_plan_diary_targets.sql`
- `supabase/migrations/20260825120200_nutrition_v1_cooking_sessions.sql`
- `supabase/migrations/20260825120300_nutrition_v1_food_search_and_curation.sql`
- Matching files in `supabase/verification/`.

### Server authorities
- `services/nutrition-v1/server/food-library.ts`
- `services/nutrition-v1/server/targets.ts`
- `services/nutrition-v1/server/diary.ts`
- `services/nutrition-v1/server/meal-plan.ts`
- `services/nutrition-v1/server/recipes.ts`
- `services/nutrition-v1/server/saved-meals.ts`
- `services/nutrition-v1/server/cooking-sessions.ts`
- Route handlers under `app/api/nutrition/v1/*` use `requireUser(request)`, owner derived server-side, and private/no-store responses.

### UI
- New focused components under `components/nutrition/diary`, `food-library`, `meal-plan`, `recipes`, `saved-meals`, `cooking`.
- Compatibility route files stay thin: `/calories`, `/my-meal-plan`, `/calories/food-hub`.
- New My Recipes route family under `app/(private)/my-recipes`.

### Cross-domain compatibility
- Update `components/layout/app-shell.tsx`, `lib/navigation/mobile-nav.ts`, i18n, privacy export/deletion, MCP scopes/executors/context projections, Today readers, and reporting readers only where they consume Nutrition authority.

---

### Task 1: Canonical TypeScript contracts and nullable nutrition math

**Files:**
- Create: `lib/nutrition-v1/contracts.ts`
- Create: `lib/nutrition-v1/nutrition-value.ts`
- Test: `lib/nutrition-v1/contracts.test.ts`
- Test: `lib/nutrition-v1/nutrition-value.test.ts`

**Interfaces:**
- Produce `NutritionFacts`, `FrozenNutritionSnapshot`, `RecipeConsumerSnapshot`, `SavedMealBundleSnapshot`, `PlannedOccurrenceSource`, `DiaryEntrySource`.
- Nutrients are `number | null`; unknown remains unknown through scaling/summing/comparison.

- [ ] **Step 1: Write failing tests.**
```ts
it("keeps unresolved nutrients unknown", () => {
  expect(sumNutritionFacts([
    { calories: 100, protein_g: 10 },
    { calories: null, protein_g: 5 },
  ])).toMatchObject({ calories: null, protein_g: 15 });
});

it("requires Recipe version lineage", () => {
  expect(() => recipeConsumerSnapshot({ recipeId: "r", recipeVersionId: "" })).toThrow(/version/i);
});
```
- [ ] **Step 2: Run `npx vitest run --config vitest.unit.config.mjs lib/nutrition-v1/contracts.test.ts lib/nutrition-v1/nutrition-value.test.ts`; verify FAIL because files/functions do not exist.**
- [ ] **Step 3: Implement contracts/helpers; reject invalid supplied numbers and never default missing nutrition to zero.**
- [ ] **Step 4: Re-run targeted tests; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add canonical v1 contracts`.**

### Task 2: Recipe + Saved Meal canonical schema and 30-day recovery

**Files:**
- Create: `supabase/migrations/20260825120000_nutrition_v1_reusable_domains.sql`
- Create: `supabase/verification/nutrition-v1-reusable-domains.sql`
- Test: `lib/product/nutrition-v1-reusable-domains-migration.test.ts`
- Modify: `types/database-legacy.ts` only for compatibility annotations/mappings.

**Interfaces:**
- Tables: `nutrition_recipes`, `nutrition_recipe_versions`, `nutrition_recipe_drafts`, `nutrition_recipe_ingredients`, `nutrition_recipe_actions`, `nutrition_recipe_equipment`, `nutrition_saved_meals`, `nutrition_saved_meal_items`.
- Recipe version source rows immutable after publish.
- `nutrition_recipes` / `nutrition_saved_meals`: `deleted_at timestamptz`, `purge_after timestamptz`.
- Saved Meal child types only `food|recipe`; Recipe child stores source UUIDs as lineage plus frozen facts, without cascade dependency on purgeable source rows.
- Optional Recipe cover uses owner-scoped `recipe-covers` storage bucket metadata; photo is presentation metadata, not Recipe-version content.

- [ ] **Step 1: Write failing migration contract test for tables, RLS, owner policies, immutable version guard, non-recursive Saved Meal items, cover bucket policy, and deletion columns/RPC names.**
- [ ] **Step 2: Run `npx vitest run --config vitest.unit.config.mjs lib/product/nutrition-v1-reusable-domains-migration.test.ts`; verify FAIL.**
- [ ] **Step 3: Implement additive schema plus RPCs `soft_delete_nutrition_recipe`, `restore_nutrition_recipe`, `purge_nutrition_recipe_now`, `soft_delete_nutrition_saved_meal`, `restore_nutrition_saved_meal`, `purge_nutrition_saved_meal_now`; set `purge_after = deleted_at + interval '30 days'`.**
- [ ] **Step 4: Add verification SQL proving legacy tables remain and every new owner table/bucket is owner-scoped; run migration contract test + `npm run migration:ledger:check`; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add reusable domain schema`.**

### Task 3: Effective targets, weekly planning, and canonical frozen consumer records

**Files:**
- Create: `supabase/migrations/20260825120100_nutrition_v1_plan_diary_targets.sql`
- Create: `supabase/verification/nutrition-v1-plan-diary-targets.sql`
- Test: `lib/product/nutrition-v1-plan-diary-targets-migration.test.ts`
- Modify: `services/database/meal-plan.ts` only after canonical service exists, as compatibility adapter.

**Interfaces:**
- `nutrition_target_periods(user_id,effective_from,effective_to,calories,protein_g,carbs_g,fat_g,water_ml,source)` with owner/date non-overlap.
- `nutrition_meal_plan_weeks(id,user_id,week_start_date,revision,week_override_json,...)`.
- `nutrition_planned_occurrences(... source_type food|recipe|saved_meal|placeholder, source_id, source_version_id, frozen_snapshot, status planned|completed|completed_changed|skipped, ...)`.
- `nutrition_meal_plan_change_requests(id,user_id,week_id,base_revision,proposal_json,state,...)` for stale-safe external ChatGPT proposals.
- `nutrition_log_groups(id,user_id,log_date,meal_type,operation_id,source_type,source_id,source_version_id,frozen_snapshot,...)`.
- `nutrition_log_group_items(id,group_id,food_log_id,position,frozen_item_snapshot,...)` links canonical grouped consumption to existing `food_logs` without rewriting historical rows.

- [ ] **Step 1: Write failing migration tests for target-period non-overlap, week uniqueness/revision, version-specific Recipe occurrences, nullable nutrition, change-request base revision, log operation idempotency, and frozen group snapshots.**
- [ ] **Step 2: Run targeted migration test; verify FAIL.**
- [ ] **Step 3: Implement additive tables/RLS/indexes and atomic RPCs for week mutation, change-request apply, grouped actual logging, plan completion/undo. `operation_id` unique per owner for idempotency.**
- [ ] **Step 4: Run verification SQL + migration test; verify no unknown nutrient is `coalesce(...,0)` and no legacy table is dropped.**
- [ ] **Step 5: Commit `feat(nutrition): add plan diary and target schema`.**

### Task 4: Cooking Session persistence schema

**Files:**
- Create: `supabase/migrations/20260825120200_nutrition_v1_cooking_sessions.sql`
- Create: `supabase/verification/nutrition-v1-cooking-sessions.sql`
- Test: `lib/product/nutrition-v1-cooking-session-migration.test.ts`

**Interfaces:**
- `nutrition_cooking_sessions`: frozen Recipe version snapshot, current action, active/completed/ended, started/last-active timestamps.
- `nutrition_cooking_action_states`: `not_available|ready|active|waiting_for_condition|running_background|completed|deferred|skipped`.
- `nutrition_cooking_timers`: action-owned named timers using duration/start/target/pause timestamps.

- [ ] **Step 1: Write failing schema tests for owner isolation, multiple timers, frozen Recipe snapshot, and resumable state.**
- [ ] **Step 2: Run targeted test; verify FAIL.**
- [ ] **Step 3: Implement schema/RLS/indexes; no field claims inferred boiling/browning/doneness/safety state.**
- [ ] **Step 4: Run test + verification SQL; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add cooking session persistence`.**

### Task 5: Food search, provenance, personal correction, favorites, and curation schema

**Files:**
- Create: `supabase/migrations/20260825120300_nutrition_v1_food_search_and_curation.sql`
- Create: `supabase/verification/nutrition-v1-food-search-and-curation.sql`
- Test: `lib/product/nutrition-v1-food-search-migration.test.ts`

**Interfaces:**
- Add/normalize `food_aliases`, `food_source_records`, `food_personal_corrections`, `food_favorites`, search projection/indexes, provenance/verification fields needed by the Food Library spec.
- Food identity stays in Main Supabase; external provider rows do not silently become Verified canonical Foods.
- User correction is owner-scoped and future-use effective nutrition only; verification remains canonical.

- [ ] **Step 1: Write failing migration tests for EN/DE/AR aliases, positive-only verification source fields, personal correction ownership, favorite uniqueness, provenance/license fields, and indexed search.**
- [ ] **Step 2: Run targeted test; verify FAIL.**
- [ ] **Step 3: Implement additive schema/indexes/RLS and safe duplicate redirect support; no destructive AI auto-merge.**
- [ ] **Step 4: Run migration test + verification SQL + ledger check; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add food search and curation schema`.**

### Task 6: Effective-dated target service and truthful legacy cutover

**Files:**
- Create: `lib/nutrition-v1/targets.ts`
- Create: `lib/nutrition-v1/targets.test.ts`
- Create: `services/nutrition-v1/server/targets.ts`
- Modify: `services/database/eat-targets.ts`
- Modify: `services/nutrition/active-target.ts`

**Interfaces:**
- `getEffectiveNutritionTarget(supabase,userId,date)` reads persisted effective periods.
- Current legacy base/profile values are inserted as effective **from cutover forward**, not retroactively over history.
- Existing trustworthy date-specific target assignments may be preserved as date-specific evidence. If pre-cutover historical target cannot be proven, return target unavailable for historical comparison rather than inventing one.

- [ ] **Step 1: Write failing tests: January stored target remains January after August change; unprovable pre-cutover date returns unavailable; current cutover target applies only from its effective date.**
- [ ] **Step 2: Run targeted test; verify current resolver fails historical truth requirement.**
- [ ] **Step 3: Implement period resolver and explicit compatibility backfill rules.**
- [ ] **Step 4: Run target tests + existing Eat/Meal Plan target tests; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): make targets effective dated`.**

### Task 7: Authenticated Nutrition route/service foundation

**Files:**
- Create: `lib/nutrition-v1/http.ts`
- Create: `lib/nutrition-v1/http.test.ts`
- Create: `services/nutrition-v1/server/errors.ts`
- Use pattern from: `app/api/dashboard/today/route.ts`

**Interfaces:**
- Shared `requireNutritionUser(request)` wrapper delegates to existing `requireUser`.
- Shared private/no-store headers, bounded safe errors, owner never accepted from browser payload.

- [ ] **Step 1: Write failing tests for 401 ownership, private/no-store headers, invalid input 400, and sanitized 5xx.**
- [ ] **Step 2: Run targeted tests; verify FAIL.**
- [ ] **Step 3: Implement shared route helpers without creating a second auth authority.**
- [ ] **Step 4: Run tests + typecheck; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add authenticated server route foundation`.**

### Task 8: Saved Meal server authority and contextual UI

**Files:**
- Create: `services/nutrition-v1/server/saved-meals.ts`
- Test: `services/nutrition-v1/server/saved-meals.test.ts`
- Create: `components/nutrition/saved-meals/saved-meal-editor.tsx`
- Create: `components/nutrition/saved-meals/saved-meal-picker.tsx`
- Create: `components/nutrition/saved-meals/recently-deleted-saved-meals.tsx`
- Modify after parity: `components/meals/custom-nutrition-manager.tsx`

**Interfaces:**
- `createSavedMeal`, `updateSavedMeal`, `resolveSavedMealBundleSnapshot`, `softDeleteSavedMeal`, `restoreSavedMeal`, `purgeSavedMealNow`.
- Contents: Foods + published Recipe versions only.

- [ ] **Step 1: Write failing tests for Food+Recipe composition, no nesting, future-only edits, same-ID restore, and purge preserving consumer snapshots.**
- [ ] **Step 2: Run targeted tests; verify FAIL.**
- [ ] **Step 3: Implement server authority + contextual Create/Detail/Edit/Recently Deleted UI; no Saved Meal nav page.**
- [ ] **Step 4: Add component tests and verify targeted tests PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add shared saved meal utility`.**

### Task 9: Recipe versions, Working Drafts, deletion, and MCP write contract

**Files:**
- Create: `lib/nutrition-v1/recipe-versioning.ts`
- Test: `lib/nutrition-v1/recipe-versioning.test.ts`
- Create: `services/nutrition-v1/server/recipes.ts`
- Test: `services/nutrition-v1/server/recipes.test.ts`
- Modify: `lib/mcp/scopes.ts`
- Modify: `lib/mcp/tool-executor-safe.ts`
- Modify: `lib/ai/prompt-catalog/nutrition.ts`
- Modify: `lib/ai/prompt-contracts/nutrition.ts`

**Interfaces:**
- `createRecipeDraft`, `autosaveRecipeDraft`, `publishRecipeDraft`, `discardRecipeDraft`, `softDeleteRecipe`, `restoreRecipe`, `purgeRecipeNow`.
- Ready contract: Name + servings/yield + ≥1 ingredient + ≥1 instruction.
- MCP writes Working Draft only unless creating a new Draft; published version immutable.

- [ ] **Step 1: Write failing tests for publish v1→draft→v2, incomplete Draft, immutable published row, same-ID delete/restore, and rejection of direct MCP published mutation.**
- [ ] **Step 2: Run targeted tests; verify FAIL.**
- [ ] **Step 3: Implement lifecycle/server/MCP/prompt contracts; Plaivra resolves Food nutrition rather than accepting ChatGPT as nutrient authority.**
- [ ] **Step 4: Run Recipe + MCP public-tool coverage + prompt contract tests + typecheck; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add canonical recipe workflow`.**

### Task 10: My Recipes discovery, editor, detail, import/create-with-ChatGPT, share, and Recently Deleted

**Files:**
- Create: `app/(private)/my-recipes/page.tsx`
- Create: `app/(private)/my-recipes/[recipeId]/page.tsx`
- Create: `app/(private)/my-recipes/[recipeId]/edit/page.tsx`
- Create: `components/nutrition/recipes/recipe-home.tsx`
- Create: `components/nutrition/recipes/recipe-row.tsx`
- Create: `components/nutrition/recipes/recipe-editor.tsx`
- Create: `components/nutrition/recipes/recipe-detail.tsx`
- Create: `components/nutrition/recipes/recently-deleted-recipes.tsx`
- Create: `lib/nutrition-v1/recipe-cache.ts`
- Test: `lib/product/nutrition-v1-my-recipes.test.ts`

**Interfaces:**
- Search-first adaptive Home; no folders/Collections/ecommerce grid.
- Editor progressively exposes cooking detail; autosave status follows confirmed persistence.
- Create Manually/Create with ChatGPT/Import with ChatGPT/Finish with ChatGPT all preserve external prompt + explicit approval model.
- Cover photo max one; Share uses frozen published snapshot/system share, no public collaborative link.

- [ ] **Step 1: Write failing product tests for Home hierarchy, Draft restrictions, ingredient Food linking/manual fallback, objective filters only on complete nutrition, shield-check verification, one cover, external ChatGPT flow, frozen Share, and no Archive wording.**
- [ ] **Step 2: Run targeted tests; verify FAIL.**
- [ ] **Step 3: Implement server-backed Home/editor/detail plus bounded cached offline read behavior and Recently Deleted utility.**
- [ ] **Step 4: Run My Recipes tests + typecheck + lint; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): build my recipes workspace`.**

### Task 11: Deterministic Cooking Mode engine, timers, and voice command parser

**Files:**
- Create: `lib/nutrition-v1/cooking-engine.ts`
- Test: `lib/nutrition-v1/cooking-engine.test.ts`
- Create: `lib/nutrition-v1/cooking-timers.ts`
- Test: `lib/nutrition-v1/cooking-timers.test.ts`
- Create: `lib/nutrition-v1/cooking-voice.ts`
- Test: `lib/nutrition-v1/cooking-voice.test.ts`

**Interfaces:**
- `deriveCookingTimeline(recipeFacts,sessionState)` returns Attention/Now/Running/UpNext from supplied facts only.
- Timer expiry is session truth, never proof of condition/doneness.
- Voice parser accepts deterministic commands `next|back|repeat|start timer|pause timer|resume|what's next` without ChatGPT.

- [ ] **Step 1: Write failing tests for parallel tracks, dependencies, linear fallback, condition waiting, timer reconstruction, Later≠Skip, and rejection of physical-state inference.**
- [ ] **Step 2: Write failing voice parser tests for supported commands and safe unknown-command behavior.**
- [ ] **Step 3: Run targeted tests; verify FAIL.**
- [ ] **Step 4: Implement pure engine/timer/voice functions; run tests; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add deterministic cooking engine`.**

### Task 12: Resumable/offline Cooking Session and focused Cooking Mode UI

**Files:**
- Create: `services/nutrition-v1/server/cooking-sessions.ts`
- Test: `services/nutrition-v1/server/cooking-sessions.test.ts`
- Create: `lib/nutrition-v1/cooking-local-store.ts`
- Test: `lib/nutrition-v1/cooking-local-store.test.ts`
- Create: `app/(private)/my-recipes/[recipeId]/cook/page.tsx`
- Create: `components/nutrition/cooking/cooking-mode.tsx`
- Create: `components/nutrition/cooking/cooking-resume.tsx`

**Interfaces:**
- Start materializes frozen Recipe version/action data locally.
- Resume + Start Over; Back ≠ End Cooking.
- Touch path: Back, Repeat, Done, conditional Later; Skip lower prominence.
- Microphone permission requested only on first user activation; touch remains complete.

- [ ] **Step 1: Write failing persistence tests for background/lock/termination recovery, multiple timers, offline queue, Resume/Start Over, explicit End Cooking.**
- [ ] **Step 2: Write failing UI contract tests for Done (not Done/Next), Repeat, Later, deterministic ATTENTION, screen-wake lifecycle, large text, RTL, completion≠consumption.**
- [ ] **Step 3: Run targeted tests; verify FAIL.**
- [ ] **Step 4: Implement local-first adapter/server sync/UI hierarchy Attention > Now > Running > Up Next; run tests; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): build resumable cooking mode`.**

### Task 13: Food Library server reader, user surface, and Add To handoffs

**Files:**
- Create: `services/nutrition-v1/server/food-library.ts`
- Test: `services/nutrition-v1/server/food-library.test.ts`
- Create: `app/api/nutrition/v1/foods/route.ts`
- Modify: `app/(private)/calories/food-hub/page.tsx`
- Create: `components/nutrition/food-library/food-library-page.tsx`
- Create: `components/nutrition/food-library/food-row.tsx`
- Create: `components/nutrition/food-library/food-detail.tsx`
- Create: `components/nutrition/food-library/food-filters.tsx`
- Modify after parity: `components/meals/food-browser.tsx`
- Test: `lib/product/nutrition-v1-food-library.test.ts`

**Interfaces:**
- Bounded cursor search; ranking exact personal > favorites/recent/frequent among relevant matches > locale-quality > broader catalog.
- Search/browse supports EN/DE/AR aliases, Categories + Cuisines, My Foods, live filters.
- Add To: Diary, Meal Plan, Saved Meal, Recipe.

- [ ] **Step 1: Write failing reader tests for exact ranking, multilingual alias, cursor bound ≤20, personal correction effective values, and nullable nutrition.**
- [ ] **Step 2: Write failing product tests for flat rows, positive-only shield-check, no Saved Meal masquerading as Food, live filters, Add To handoff, and no client whole-catalog slicing.**
- [ ] **Step 3: Run targeted tests; verify FAIL.**
- [ ] **Step 4: Implement route/server/UI and replace legacy Food Hub normal path; run tests + typecheck; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): build canonical food library`.**

### Task 14: Owner-only Food Catalog curation and ingestion boundary

**Files:**
- Create: `app/(private)/admin/food-catalog/page.tsx`
- Create: `components/nutrition/food-library/admin/food-catalog-admin.tsx`
- Create: `services/nutrition-v1/server/food-curation.ts`
- Test: `services/nutrition-v1/server/food-curation.test.ts`
- Create: `lib/product/nutrition-v1-food-admin.test.ts`

**Interfaces:**
- Owner can review candidates, normalize/publish, verify/unverify, merge with durable redirect, deprecate/restore, inspect provenance/license.
- Publish ≠ Verify. User-created Food never silently merges into shared catalog.

- [ ] **Step 1: Write failing authorization tests proving non-admin denial and owner-only mutations.**
- [ ] **Step 2: Write failing lifecycle tests for Publish≠Verify, merge redirect preserving Favorites/history, and provenance requirement.**
- [ ] **Step 3: Run targeted tests; verify FAIL.**
- [ ] **Step 4: Implement bounded admin surface/server commands; no multi-admin CMS or live external-provider dependency for normal search. Run tests; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): add food catalog curation`.**

### Task 15: Diary projection and unified Food Logging Session

**Files:**
- Create: `services/nutrition-v1/server/diary.ts`
- Test: `services/nutrition-v1/server/diary.test.ts`
- Create: `app/api/nutrition/v1/diary/route.ts`
- Create: `app/api/nutrition/v1/log/route.ts`
- Modify: `app/(private)/calories/page.tsx`
- Create: `components/nutrition/diary/diary-page.tsx`
- Create: `components/nutrition/diary/logging-session.tsx`
- Create: `components/nutrition/diary/plate-dock.tsx`
- Modify/retire after parity: `components/meals/eat-page.tsx`, `eat-add-food-surface.tsx`, `eat-food-log.tsx`, `eat-day-sections.tsx`, `services/database/eat-food-logging.ts`.

**Interfaces:**
- Date-scoped projection returns actual logs, effective target, hydration, planned context, partial-domain envelopes.
- `LogMealCommand { operationId,date,meal,items[] }` is owner-derived, idempotent, logical all-or-nothing.
- Plate accepts Food, Recipe serving, Saved Meal bundle and preserves source snapshots.

- [ ] **Step 1: Write failing server tests for actual-only remaining calories, historical target, Recipe version logging, Saved Meal frozen bundle, multi-item idempotency/atomicity, unknown nutrition, and plan linkage.**
- [ ] **Step 2: Write failing UI tests for search-first logger, Plate continuity across Search/Barcode/Quick Add/Saved Meals/Recipes, short-lived draft recovery, and `Other` compatibility.**
- [ ] **Step 3: Run targeted tests; verify FAIL.**
- [ ] **Step 4: Implement authenticated projection/transactional command/unified logger; remove legacy aggregate `finite(...)=0` Saved Meal path after compatibility parity. Run new + existing Eat tests; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): build canonical diary logging`.**

### Task 16: Week-authoritative Meal Plan, Shopping List, ChatGPT proposals, and offline conflicts

**Files:**
- Create: `services/nutrition-v1/server/meal-plan.ts`
- Test: `services/nutrition-v1/server/meal-plan.test.ts`
- Create: `lib/nutrition-v1/meal-plan-offline.ts`
- Test: `lib/nutrition-v1/meal-plan-offline.test.ts`
- Create: `app/api/nutrition/v1/meal-plan/week/route.ts`
- Modify: `app/(private)/my-meal-plan/page.tsx`
- Split `components/meals/my-meal-plan/my-meal-plan-page-client.tsx` into focused components under `components/nutrition/meal-plan/`.
- Modify/wrap: `components/meals/grocery-list-panel.tsx`

**Interfaces:**
- Week canonical; selected day workspace.
- Occurrence types Food/Recipe/SavedMeal/Placeholder with frozen snapshots.
- ChatGPT change request stores `base_revision`; stale proposal cannot apply to changed week; apply is one atomic revision.
- Offline queue uses mutation `operationId` + base revision; conflict is field/occurrence scoped, never last-write-wins whole week.

- [ ] **Step 1: Write failing tests for lazy week creation/revision, custom slots, Recipe version/Saved Meal snapshots, Placeholder rules, copy/repeat fresh IDs, plan→actual atomicity, Shopping derivation, stale AI proposal rejection, and offline conflict reconciliation.**
- [ ] **Step 2: Run targeted tests; verify FAIL.**
- [ ] **Step 3: Implement server projection/commands + offline queue + week-first UI/Add workspace/Shopping nested route; no `Day | Week | Shopping` peer tabs or method picker.**
- [ ] **Step 4: Run new tests plus `lib/product/my-meal-plan-redesign.test.ts`, `lib/product/my-meal-plan-post-merge-refinement.test.ts`, `lib/meals/meal-plan-navigation.test.ts`; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): rebuild meal plan around weekly intent`.**

### Task 17: Nutrition navigation, route compatibility, and i18n

**Files:**
- Modify: `components/layout/app-shell.tsx`
- Modify: `lib/navigation/mobile-nav.ts`
- Modify: `lib/navigation/mobile-nav.test.ts`
- Modify: `lib/i18n/translations.ts`
- Modify: `lib/i18n/types.ts`
- Modify: `app/(private)/calories/weekly-overview/page.tsx`
- Create: `lib/product/nutrition-v1-navigation.test.ts`

**Interfaces:**
- Navigation peers only Diary `/calories`, Meal Plan `/my-meal-plan`, Food Library `/calories/food-hub`, My Recipes `/my-recipes`.
- Legacy `/calories/weekly-overview` redirects to `/calories` and is not a Summary experience.

- [ ] **Step 1: Write failing nav tests asserting exactly four peer items and no `nav.nutritionSummary` link.**
- [ ] **Step 2: Run nav/product tests; verify FAIL against current sidebar.**
- [ ] **Step 3: Update nav/i18n/active-route logic and compatibility redirect; preserve mobile quick-log and Train navigation behavior.**
- [ ] **Step 4: Run navigation + i18n tests + typecheck; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): reconcile four-destination navigation`.**

### Task 18: Privacy export/deletion, Today/reporting, and MCP consumer integration

**Files:**
- Modify: `lib/privacy/data-export.ts`
- Modify: `lib/privacy/data-export-legacy.ts`
- Modify: `lib/privacy/account-deletion-worker.ts`
- Create: `supabase/migrations/20260825120400_nutrition_v1_privacy_purge_authority.sql`
- Create: `supabase/verification/nutrition-v1-privacy-purge.sql`
- Modify: `services/dashboard/today-projection-server.ts`
- Modify: `lib/dashboard/today-projection-contract.ts`
- Modify: `services/reports/reporting.ts`
- Modify: `lib/mcp/context-projections.ts`
- Modify: `lib/mcp/tool-executor-safe.ts`
- Test: `lib/privacy/data-export.test.ts`, account deletion worker tests, Today projection tests, MCP coverage tests.

**Interfaces:**
- Extend atomic `purge_account_application_data_atomic` in the new migration to delete every new owner Nutrition table in dependency-safe order before Auth deletion.
- Export includes Recipe versions/drafts, Saved Meals/items, Meal Plan weeks/occurrences, Cooking Sessions/timers, target periods, and consumer snapshot lineage.
- Today reads canonical Diary actuals/effective target and Meal Plan intention separately.
- Reporting may read actual Nutrition facts but cannot recreate a Nutrition Summary destination.

- [ ] **Step 1: Extend tests first: export includes new Nutrition sections; purge verification leaves zero owner rows; recipe cover objects are removed; MCP context is minimized; Today separates actual/planned.**
- [ ] **Step 2: Run privacy/Today/MCP targeted tests; verify FAIL.**
- [ ] **Step 3: Implement export + atomic purge migration + deletion-worker storage cleanup for `recipe-covers` + Today/reporting/MCP compatibility.**
- [ ] **Step 4: Run privacy deletion lifecycle verification, privacy tests, Today tests, MCP coverage, typecheck; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): integrate privacy today reporting and mcp`.**

### Task 19: Legacy-data compatibility and convergence proof

**Files:**
- Create: `services/nutrition-v1/compatibility/legacy-nutrition.ts`
- Test: `services/nutrition-v1/compatibility/legacy-nutrition.test.ts`
- Create: `supabase/verification/nutrition-v1-legacy-reconciliation.sql`
- Modify: `lib/architecture/canonical-convergence.test.ts`
- Modify only when required for compatibility: `services/meals/food-logging-speed.ts`

**Interfaces:**
- Historical `saved_recipes(saved_item_type meal|recipe|template)`, `custom_meals`, flat `user_meal_plan_items`, and `food_logs` remain readable/mappable without becoming product authority.
- Ambiguous legacy Recipe/Meal classification is surfaced as unresolved compatibility evidence, never guessed.

- [ ] **Step 1: Write fixture tests with legacy recipe, custom meal, completed plan item, food log; assert each remains visible under correct compatibility projection or explicit unresolved classification.**
- [ ] **Step 2: Run compatibility/convergence tests; verify FAIL.**
- [ ] **Step 3: Implement adapters/backfill verification; no destructive dedupe/drop/delete.**
- [ ] **Step 4: Run convergence + compatibility + privacy tests and `npm run migration:ledger:check`; verify PASS.**
- [ ] **Step 5: Commit `feat(nutrition): preserve legacy nutrition compatibility`.**

### Task 20: Rendered visual/accessibility QA and final verification

**Files:**
- Create: `scripts/run-nutrition-v1-qa.mjs`
- Test: `scripts/run-nutrition-v1-qa.test.mjs`
- Modify: `scripts/run-rendered-qa.mjs` only to register the bounded Nutrition suite if needed by existing harness composition.
- Add missing RTL/large-text/focus product tests under `lib/product/`.
- Update after all evidence: `docs/control/PLAIVRA_CURRENT_STATE.md`.

**Interfaces:**
- QA matrix covers mobile Diary/Meal Plan/Food Library/My Recipes/editor/detail/Cooking, desktop Home/detail/Cooking/Meal Plan, RTL mobile My Recipes + Cooking, large-text stress, empty/error/offline/autosave failure, Recently Deleted, Shopping, and all locked visual rejection criteria.

- [ ] **Step 1: Write failing QA harness test for route list, viewport matrix, RTL/large-text variants, console/runtime error capture, deterministic screenshot names.**
- [ ] **Step 2: Run `node --test scripts/run-nutrition-v1-qa.test.mjs`; verify FAIL.**
- [ ] **Step 3: Implement QA harness and correct only verified spec deviations; no redesign during QA.**
- [ ] **Step 4: Run exact local verification: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run test:scripts`, `npm run migration:ledger:check`, and `node scripts/run-nutrition-v1-qa.mjs`. All must exit 0.**
- [ ] **Step 5: Run repository canonical Quality workflow for the exact implementation head, then Exact Release/read-only release preflight according to current repository delivery rules; record exact run IDs and artifacts. No merge until those current authorities pass.**
- [ ] **Step 6: Re-run Nutrition migration verification against exact head; verify no legacy-table retirement, no pending/untracked schema discrepancy, and Production migration application is not performed until separately approved release step.**
- [ ] **Step 7: Update `PLAIVRA_CURRENT_STATE.md` with verified implementation evidence, commit `docs: record Nutrition V1 implementation evidence`, invoke `superpowers:verification-before-completion`, then stop for Product Owner merge approval.**

---

## Plan Self-Review Result

**Spec coverage:** Covered: canonical IA; Food authority/search/provenance/corrections/admin; effective targets; Diary/Plate/plan linkage/hydration compatibility; Meal Plan/Shopping/revisions/offline/ChatGPT proposals; Saved Meal contextual utility/deletion; Recipe drafts/versions/import/share/deletion; Cooking Mode deterministic engine/timers/voice/offline/resume/device behavior; external ChatGPT/MCP; privacy/deletion; legacy convergence; i18n/RTL/accessibility; rendered acceptance matrix.

**Placeholder scan:** No `TBD`, `TODO`, “implement later”, unresolved alternative, or unnamed required file remains in the plan.

**Type/interface consistency:** Recipe consumers consistently use `recipe_id` + `recipe_version_id` + resolved serving + frozen facts; Saved Meal consumers use `SavedMealBundleSnapshot`; target readers use persisted effective periods; Diary grouped logging is definitively `nutrition_log_groups` + `nutrition_log_group_items`; Meal Plan uses one week revision authority; source-deletion lineage is retained without cascade FK dependency.

## Execution Dependency Rules

1. Tasks 1–7 establish contracts/schema/auth before a page becomes canonical.
2. Task 8 Saved Meal and Task 9 Recipe authority precede Diary/Meal Plan consumer cutover.
3. Tasks 11–12 Cooking Mode depend on Recipe version and Cooking Session schema.
4. Tasks 13–14 establish Food Library runtime/curation before broad Add To reliance.
5. Task 15 Diary and Task 16 Meal Plan consume shared foundations; neither may ship against legacy aggregate Saved Meal logging.
6. Task 17 navigation cutover occurs only after all four destination routes work.
7. Task 18 privacy/MCP/Today integration is release-blocking.
8. Task 19 proves legacy continuity and explicitly does not retire legacy storage.
9. Task 20 is the only closure task and requires fresh evidence from all listed commands/workflows.

**Forbidden regressions:** no missing-as-zero, no silent frozen-history mutation, no Nutrition Summary, no Saved Meal peer destination, no Archive-first Recipe lifecycle, no nested Recipe/Saved Meal, no embedded generic Nutrition chat, no Plaivra-authored cooking/safety claims.
