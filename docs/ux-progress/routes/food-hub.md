# Route Audit: `/calories/food-hub`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 55 / 100  
**Flow decision:** Tune flow with manual-fallback framing, form-state hardening, and destructive-action protection

---

## Files inspected

- `app/(private)/calories/food-hub/page.tsx`
- `components/meals/food-browser.tsx`
- `components/meals/custom-nutrition-manager.tsx`
- `services/database/nutrition.ts`
- Related context from:
  - `docs/product/ai-first-tracker-model.md`
  - `docs/ux-progress/routes/calories.md`
  - `docs/ux-progress/routes/my-meal-plan.md`

---

## 1. Product role

`/calories/food-hub` is Plaivra's food library and custom nutrition management route. It lets users search foods, log library foods, save favorites, manage custom foods, build saved meals, and log saved meals.

The route should answer:

```txt
Can I find or create a food that Plaivra/ChatGPT did not already understand?
Can I safely edit custom foods and saved meals?
Can I log or plan a saved item with clear pending/saved/failure feedback?
Is this manual library route a fallback/correction tool, not the main food entry path?
Can I tell live library data from fallback/local food data?
```

This route is **not the primary AI-first nutrition entry path**. The primary product model for meals is still:

```txt
ChatGPT/photo/text meal import -> review/apply/correct -> Plaivra tracking overview
```

Food Hub is the manual fallback and power-user correction surface. Its job is to support precise corrections, custom foods, saved meals, and reusable items after AI/import or when the user wants full manual control.

The current route is powerful but too dense and too manual-forward. It combines a large food browser and full custom nutrition builder on one page. The main issues are weak manual-fallback framing, toast-heavy state feedback, no destructive confirmations for delete actions, insufficient per-action pending states, 40/44px controls, and no unsaved-draft protection in the custom food/meal builder.

---

## 2. AI-first vs manual-entry role

Food Hub should be framed as a manual fallback/edit route.

Expected hierarchy:

```txt
1. Manual fallback context
2. Search/log food library
3. Saved/custom meals
4. Custom food/meal builder
5. Edit/delete safety
6. Data source confidence and fallback states
```

Current hierarchy:

```txt
1. PageHeading
2. Food library tools card
3. Toggle custom builder
4. CustomNutritionManager if opened
5. FoodBrowser
```

The current order puts builder above browser when opened and exposes many manual operations without enough guardrails. It should make the manual purpose explicit and keep creation/editing in a controlled, stateful builder section.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Search known food | Clear loading, result count, true-empty vs failed/fallback state. |
| Log food manually | Per-food pending, duplicate protection, success/failure visible near item. |
| Add food to meal plan | Per-food pending and clear destination/date/meal type. |
| Favorite food | Optimistic favorite with rollback/failure state. |
| Create custom food | Inline validation, pending, saved, failed, dirty-state protection. |
| Edit custom food | Clearly show edit mode, dirty state, cancel/discard, save status. |
| Delete custom food | Confirmation or undo; no immediate destructive delete. |
| Create saved meal | Inline item validation, pending, saved, failed, and totals clarity. |
| Delete saved meal | Confirmation or undo; no immediate destructive delete. |
| Log saved meal | Per-meal pending, success/failure state, date/meal type clarity. |
| Data fallback | Explain when local/fallback food data is shown. |

---

## 4. Current workflow map

```txt
Enter /calories/food-hub
-> PageHeading
-> tools card with Create/Edit Custom Foods & Meals toggle
-> CustomNutritionManager optionally opens
-> FoodBrowser loads kitchens, custom meals, favorites
-> FoodBrowser loads food library for selected kitchen/subcategory/query
-> user can log food, add to plan, favorite, log saved meals, create/edit/delete custom foods and meals
```

Strong points:

- Food Hub exists as a dedicated advanced/manual route.
- It uses `Suspense` around URL search params.
- FoodBrowser has an error boundary.
- FoodBrowser supports food search, kitchen/subcategory filters, meal type, quantity, units, favorites, saved meals, and local fallback foods.
- FoodBrowser shows confidence/source badges for foods and unknown macros.
- CustomNutritionManager supports custom kitchens, custom subcategories, custom foods, custom meals, saved meal totals, and logging saved meals.
- Service layer validates custom food required fields and non-negative macros.
- Service layer has fallback Egyptian food data when global library calls fail or time out.

Main workflow issues:

- Page copy says “Search the food library, log foods, save favorites, and manage food actions,” which frames manual logging as equal/primary instead of fallback/correction.
- Custom builder toggle opens a very large editing surface inline, above the food browser.
- FoodHubFallback is plain text, not skeleton/ErrorState.
- FoodBrowser uses compact select classes `h-10` and `h-11`, below 48px.
- FoodBrowser Notice close is a text button, likely below 48px.
- FoodBrowser log/add-to-plan/favorite actions have no per-card pending state or duplicate-tap protection.
- `toggleFavoriteForKey` awaits persistence and has no rollback/error handling wrapper.
- Food search failure falls back locally and sets notice, but source confidence is not persistent enough to distinguish partial/fallback results.
- CustomNutritionManager load failure is toast-only.
- Save food uses one global `isSaving`; save meal does not use pending state.
- Add kitchen, add subcategory, save meal, delete food, delete meal, and log saved meal use toast-only feedback.
- Delete custom food and delete custom meal are immediate destructive actions with no confirmation or undo.
- Editing a food/meal has no clear dirty-state banner, cancel/discard action, or restored-draft protection.
- The custom builder has no local draft persistence despite long forms.
- Macro validation mainly happens after submit through service errors; there is little inline field-level validation.
- Multiple `size="sm"` and icon-only buttons appear in food/meal lists.
- Saved meal action row uses `size="sm"` for Add to day, Edit, Delete.
- Meal item remove button is icon-only and likely 40/44px.
- The builder mixes kitchen/subcategory management, food creation, meal creation, logging, editing, and deleting in one dense surface.

---

## 5. Recommended workflow map

```txt
Enter Food Hub
-> Manual fallback context card:
   -> Use ChatGPT/import first for normal logging
   -> Use Food Hub for corrections, saved foods, custom meals
-> Search/library browser:
   -> loading / loaded / fallback / failed / true-empty states
   -> per-item log/add/favorite pending and rollback
-> Custom builder section:
   -> collapsed by default
   -> Food tab / Saved meal tab or clear two-column mode
   -> dirty-state, inline validation, pending/success/failure
   -> confirm/undo deletes
-> Saved/custom items:
   -> clear edit mode and destination/date/meal type for logging
```

This is a **tune flow with manual-fallback framing, form-state hardening, and destructive-action protection** correction. The route should not be removed, but it should stop feeling like the main nutrition logging flow.

---

## 6. Flow decision label

**Tune flow with manual-fallback framing, form-state hardening, and destructive-action protection.**

Do not redesign the entire nutrition system. Keep Food Hub as the advanced manual route and strengthen state, safety, and hierarchy.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Use this hub for custom foods, saved meals, and manual corrections.”
- “For normal meal logging, start with ChatGPT/photo import on Calories.”
- “Showing fallback food data. Some live library foods may be unavailable.”
- “Saving custom food…”
- “Custom food saved.”
- “Save failed. Your draft is still here.”
- “Discard custom food changes?”
- “Delete this custom food? Past logs will not be removed.”
- “Delete this saved meal? Food logs already created from it will stay.”
- “Added to today as Breakfast/Lunch/Dinner/Snack.”
- “Added to meal plan.”

Avoid implying deleting a custom food deletes historical food logs unless the implementation truly does that.

---

## 8. UI structure

Recommended structure:

```txt
1. Manual fallback explanation
2. Food browser/search/log section
3. Custom foods and saved meals builder
4. Saved item management
5. Loading/error/fallback states
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Page heading copy | Too manual-primary. | Reframe as fallback/correction hub. | P1 |
| Builder placement | Large builder opens above browser. | Add tabs/accordion and context; avoid overwhelming first view. | P1 |
| Suspense fallback | Plain text. | Add skeleton. | P2 |
| FoodBrowser load errors | Notice only/fallback unclear. | Add persistent degraded/fallback status. | P1 |
| CustomNutritionManager load errors | Toast-only. | Add inline ErrorState/retry. | P1 |
| Deletes | Immediate. | Confirm/undo for custom food and saved meal delete. | P1 |
| Forms | No dirty-state protection. | Add dirty/cancel/discard and inline validation. | P1 |
| Actions | Small/dense. | Resize to 48px, stack on mobile. | P1 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Create/Edit Custom Foods & Meals | Tools card | Good entry, but builder is too broad. | Keep; add context and structured builder. | P1 |
| Search input | FoodBrowser top | Good. | Keep. | P2 |
| Meal type/unit selects | Browser/builder | `h-10`/`h-11`, under target. | Resize to 48px. | P1 |
| Log food | Food cards | No per-item pending. | Add pending/disabled/success/failure. | P1 |
| Add to plan | Food cards | No per-item pending. | Add pending/disabled/success/failure. | P1 |
| Favorite | Food cards | No rollback/error handling. | Add optimistic rollback. | P1 |
| Add Kitchen/Subcategory | Builder | Toast-only, no pending. | Add pending/failure inline. | P2 |
| Save Custom Food | Builder | Uses global `isSaving`; no inline field errors. | Add state and validation. | P1 |
| Delete Custom Food | List icon | No confirm/undo. | Add confirm/undo. | P1 |
| Save Custom Meal | Builder | No pending state. | Add pending/failure. | P1 |
| Delete Saved Meal | `size=sm` | No confirm/undo. | Add confirm/undo and 48px. | P1 |
| Add to day | Saved meal card | `size=sm`, no pending. | 48px + pending. | P1 |
| Notice close | Inline notice | Small text target. | 48px close or standard dismiss. | P2 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Food Hub loading | Plain text fallback. | Low quality. | Skeleton. | P2 |
| Kitchen/custom/favorites load | Notice or toast. | Can look normal/empty. | Inline degraded state. | P1 |
| Food library fallback | Notice only. | Fallback state can disappear or be missed. | Persistent fallback banner/status. | P1 |
| Food log pending | None. | Duplicate tap risk. | Per-item pending. | P1 |
| Add to plan pending | None. | Duplicate tap risk. | Per-item pending. | P1 |
| Favorite pending/failure | Awaited and no catch in function. | State can fail confusingly. | Optimistic rollback/error. | P1 |
| Custom food save | Global pending only. | No inline field errors; broad lock. | Field validation + status. | P1 |
| Custom meal save | No pending. | Duplicate saves. | Pending/disabled/status. | P1 |
| Delete food/meal | Immediate toast. | Destructive, no recovery. | Confirm/undo. | P1 |
| Edit mode | Form populated silently. | User may not realize editing vs creating. | Edit banner + cancel/discard. | P1 |
| Unsaved draft | No guard. | User can close builder/route away and lose work. | Dirty-state guard/local draft optional. | P2 |

---

## 11. Motion and interaction design

Food Hub motion should be restrained because the route is dense.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Builder open/close | Instant conditional render. | Big layout jump. | Reduced-motion-safe reveal or route-stable section. | P2 |
| Log/add/favorite | Notice changes. | Not tied to item. | Per-item state feedback. | P1 |
| Delete | Immediate removal. | Abrupt destructive change. | Confirm/undo or soft removal state. | P1 |
| Save food/meal | Toast only. | Context lost. | Inline save status near form. | P1 |
| Search/filter | Re-render. | Acceptable. | Result status only; no heavy animation. | P3 |

No decorative animations. Use motion only to clarify builder open/close, save, delete, and per-item logging states.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Route overlaps with AI-first calories flow. | Manual-first framing can undermine product model. | Reframe copy and entry hierarchy. |
| Deleting custom foods/meals affects future reuse. | Destructive action requires confirmation/undo. | Add confirm dialogs or soft undo. |
| FoodBrowser is likely reused by Calories. | Changes may affect the main calorie route. | Keep shared changes safe and verify `/calories`. |
| Custom builder is large and stateful. | Draft loss is likely. | Add dirty-state/confirm before closing builder. |
| Service fallback is useful but can mislead. | Users need source confidence. | Surface fallback status clearly. |
| Macro input errors can corrupt tracking. | Nutrition data affects daily targets. | Inline validation and clear source confidence. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 7 | 15 | Powerful but framed too manual-primary for AI-first product. |
| Button size, placement, and hierarchy | 7 | 15 | Many 40/44px and `size=sm` controls. |
| Spacing consistency and visual rhythm | 7 | 10 | Dense builder, but generally organized. |
| Feedback, optimistic UI, loading, and errors | 5 | 15 | Toast-heavy, weak pending/rollback. |
| Motion and interaction quality | 5 | 15 | Large builder jumps and destructive removals lack feedback. |
| Mobile-first behavior and tap comfort | 7 | 10 | Usable but dense and small controls. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Correct as manual fallback, but deletion and source confidence need safety. |
| Premium/subscription readiness | 9 | 10 | Strong functionality, but state trust blocks premium feel. |
| **Total** | **55** | **100** | Advanced route with useful features, but too dense and weak on save/delete/fallback states. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Product-flow alignment | Food Hub copy makes manual logging feel primary. | Reframe as fallback/correction route. |
| 48px tap target baseline | `h-10`, `h-11`, `size=sm`, icon buttons. | Resize/stack controls. |
| High-risk action confirmation | Custom food/meal deletes are immediate. | Confirm/undo. |
| Loading/error state clarity | Toast-only and notice-only failures. | Inline ErrorState/degraded states. |
| Feedback loop completeness | Log/add/favorite/save actions lack per-item/form pending states. | Add action-local feedback and rollback. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Reframe Food Hub copy as manual fallback/correction, not primary food logging. | Codex/Kimi/Human | Open |
| P1 | Add inline load/degraded states for kitchens, custom meals, favorites, and food library fallback. | Codex/Kimi/Human | Open |
| P1 | Add per-item pending/duplicate protection for Log food, Add to plan, Log saved meal. | Codex/Kimi/Human | Open |
| P1 | Add optimistic favorite rollback and error handling. | Codex/Kimi/Human | Open |
| P1 | Add inline validation and save/failure state for custom food form. | Codex/Kimi/Human | Open |
| P1 | Add pending/failure state for custom meal save. | Codex/Kimi/Human | Open |
| P1 | Add confirmation/undo for deleting custom food and saved meal. | Codex/Kimi/Human | Open |
| P1 | Add visible edit mode + cancel/discard for custom food and custom meal editing. | Codex/Kimi/Human | Open |
| P1 | Resize selects/buttons/list actions to 48px and stack dense action rows on mobile. | Codex/Kimi/Human | Open |
| P2 | Replace FoodHubFallback plain text with skeleton. | Codex/Kimi/Human | Open |
| P2 | Add dirty-state guard before hiding builder with unsaved draft. | Codex/Kimi/Human | Open |
| P2 | Structure builder with tabs/sections to reduce density. | Codex/Kimi/Human | Open |
| P2 | Add direct link back to AI-first Calories import path. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/calories/food-hub` explains it is for custom foods, saved meals, and manual corrections.
- [ ] Normal food logging still points users toward AI/import on `/calories` for primary meal entry.
- [ ] Food Hub loading uses a skeleton, not plain text.
- [ ] Food library fallback/degraded state is visible.
- [ ] Kitchen/custom/favorite load failures are visible and retryable where feasible.
- [ ] Log food, Add to plan, Log saved meal have per-item pending and duplicate protection.
- [ ] Favorite failure rolls back or shows clear recovery.
- [ ] Custom food form shows inline validation and save failure while preserving draft.
- [ ] Custom meal save has pending/failure state and preserves draft.
- [ ] Delete custom food and delete saved meal require confirm/undo.
- [ ] Editing food/meal shows edit mode and supports cancel/discard.
- [ ] Main selects/buttons/icon actions meet 48px target on 390x844.
- [ ] Shared FoodBrowser changes do not regress `/calories`.
- [ ] No nutrition schema, AI import/apply behavior, auth, global theme, or unrelated routes are changed.

---

## 17. Codex prompt section

Use this route with nutrition data-integrity and manual-fallback framing review.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + nutrition data-integrity reviewer + AI-first product alignment reviewer
```

Implementation should not change nutrition database schema, AI import/apply behavior, auth behavior, global theme, or unrelated routes.

---

## 18. Implementation note

Do not remove Food Hub. It is useful as an advanced manual fallback. Preserve the current capability set:

```txt
Food search/browser -> log/add/favorite -> custom food builder -> custom meal builder -> saved meal logging
```

The highest-value correction is state and positioning:

```txt
Manual fallback context -> clear data confidence -> safe custom edits -> protected deletes -> 48px mobile controls
```
