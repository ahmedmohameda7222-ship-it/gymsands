# Nutrition V1 — Wide Reconciliation Design

**Date:** 2026-08-25
**Status:** Final reconciled Planner design, pending user written-spec review
**Branch:** `design/nutrition-wide-reconciliation-v1`
**Base:** `design/nutrition-my-recipes-v1`

## 1. Authority

This document reconciles the approved Diary, Meal Plan, Food Library, My Recipes, and shared Nutrition visual specs. Where a sibling spec conflicts with a cross-domain clause here, this reconciliation document supersedes that clause. Unchanged page-specific behavior remains authoritative in its page spec.

No runtime implementation is authorized by this document.

## 2. Canonical Nutrition IA

The previous five-destination IA is superseded.

```text
Nutrition
├── Diary
├── Meal Plan
│   └── Shopping List
├── Food Library
└── My Recipes
```

Rules:
- exactly four peer Nutrition destinations;
- Shopping List remains nested under Meal Plan;
- no Nutrition Summary destination;
- future Global Summary is a top-level cross-domain application destination and a separate design program;
- no duplicated top tab bar reproducing Nutrition navigation.

## 3. Domain ownership

```text
Diary        → actual intake
Meal Plan    → intended intake
Food Library → Food identities
My Recipes   → Recipe identities + Cooking Mode
Saved Meal   → shared contextual Nutrition utility
Shopping List→ nested Meal Plan utility
```

Food, Recipe, and Saved Meal remain distinct semantic types.

## 4. Saved Meal V1

Saved Meal is not a fifth Nutrition destination. It is a shared contextual utility with Create / Detail / Edit surfaces launched where useful, including Diary, Meal Plan, Food Detail, Recipe Detail, and post-cooking/composed-meal flows.

Minimum contract:

```text
Saved Meal
├── Name
└── Items[]
    ├── Food + resolved quantity/serving
    └── Recipe + frozen published recipe_version_id
```

Optional lightweight note is allowed. V1 excludes Saved Meal inside Saved Meal, folders, Collections, mandatory tags, social behavior, and a dedicated Saved Meal dashboard.

Editing a Saved Meal affects future use only. Every committed Diary or Meal Plan use stores a frozen resolved bundle snapshot. Later source edits never silently mutate committed uses.

Recipe children retain `recipe_id`, `recipe_version_id`, resolved serving, and consumer-required frozen nutrition/display facts.

## 5. Saved Meal deletion lifecycle

Saved Meal uses the same user-facing recovery model as Recipe deletion:

```text
ACTIVE
  ↓ Delete
RECENTLY DELETED
  ↓ 30 days
PERMANENTLY DELETED
```

Delete:
- removes the Saved Meal from normal discovery and new-use selection;
- moves it to Recently Deleted for 30 days;
- preserves the same Saved Meal identity during retention.

Restore within 30 days revives the same Saved Meal identity and contents.

`Delete Now` permanently removes the live Saved Meal source after explicit destructive confirmation.

Automatic permanent deletion occurs after 30 days if not restored.

Permanent Saved Meal deletion never cascades into committed Diary or Meal Plan history. Already-frozen consumer bundle snapshots remain displayable and semantically intact after the live source no longer exists.

Recently Deleted management is contextual/secondary and does not become a peer Nutrition destination.

## 6. Recipe deletion lifecycle — superseding Archive-first

My Recipes Archive-first is superseded.

Canonical lifecycle:

```text
ACTIVE / READY / eligible Draft
        ↓ Delete
RECENTLY DELETED
        ↓ 30 days
PERMANENTLY DELETED
```

Delete:
- removes the Recipe from normal discovery and new-use selection;
- prevents new Cooking Mode starts from that deleted source;
- moves it to Recently Deleted for 30 days;
- preserves identity and published version history during retention.

Restore within 30 days revives the same Recipe identity and version history.

`Delete Now` permanently removes the live Recipe source after explicit destructive confirmation.

Automatic permanent deletion occurs after 30 days if not restored.

Permanent deletion never rewrites or deletes previously committed frozen references in Diary, Meal Plan, Saved Meal, or later approved snapshot consumers. Historical consumers remain displayable from their frozen snapshots even when the live source no longer exists.

Recently Deleted is a secondary My Recipes management utility, not a permanent primary tab.

## 7. Recipe version contract

Every committed Recipe use is version-specific and stores at minimum:

```text
recipe_id
recipe_version_id
resolved serving / quantity
frozen nutrition snapshot
consumer-required frozen display data
```

Meal Plan occurrences and Saved Meal Recipe children must explicitly retain `recipe_version_id`.

Diary Recipe-serving logs must retain the published version used at logging time.

New use resolves the latest current published Recipe version unless explicitly acting on an older frozen version. Existing committed uses never silently float to a newer version.

## 8. Diary Recipe reconciliation

Diary's older wording that Recipes are a future/unresolved domain is obsolete.

Recipes are first-class reusable logging inputs. Normal Recipe logging stores a Recipe-serving object rather than exploding it into unrelated Food rows. The committed Diary entry preserves Recipe identity/version, resolved serving, frozen nutrition, and sufficient frozen display facts.

Later Recipe edits or deletion never mutate historical Diary truth.

## 9. Meal Plan Recipe reconciliation

A planned Recipe occurrence retains:

```text
recipe_id
recipe_version_id
resolved serving count
frozen nutrition snapshot
frozen ingredient quantities required for Shopping derivation
```

A later Recipe publish/delete never silently mutates the occurrence.

Meal Plan's existing Recently Deleted 30-day Recipe model is retained and is now aligned with My Recipes.

## 10. Effective-dated Nutrition Targets

Diary and Meal Plan share one effective-dated target authority.

Conceptually:

```text
Nutrition Target
├── effective_from
├── calories
├── protein
├── carbs
├── fat
└── water where applicable
```

Rules:
- Diary uses the target effective for the selected date;
- historical Diary dates use the historical effective target, not today's target;
- Meal Plan uses the target effective for the planned date/week;
- a week override may supersede the global target for that week only;
- later target changes do not rewrite historical comparisons;
- missing targets never block logging or planning.

## 11. Planned versus actual

The invariant remains:

```text
Meal Plan = intention
Diary     = reality
```

Planned items never count as consumed intake before explicit successful execution/logging. Plan-to-actual commands preserve linkage and atomic consistency. Editing a past plan does not rewrite Diary history, and editing actual history does not silently rewrite the original plan.

## 12. Frozen snapshot invariant

Reusable sources may change or disappear; committed history does not silently change with them.

This applies to Food-resolved values, Recipe versions, Saved Meal bundles, planned occurrences, and actual intake entries.

Consumers freeze only the resolved facts/lineage needed to remain semantically correct and displayable; do not duplicate entire source records unnecessarily.

## 13. Missing nutrition

Across Nutrition:

> **Missing is not zero.**

Incomplete values remain incomplete in Foods, Recipe ingredients/totals, Saved Meals, Diary, Meal Plan, target comparisons, discovery filters, and computed nutrition labels.

High Protein / Low Carb qualify only when the underlying nutrition basis is sufficiently complete and the approved factual threshold is met.

## 14. Food reference behavior

Food Library remains Food authority. A Food correction/edit must never silently rewrite a published Recipe version or committed Saved Meal/Diary/Meal Plan snapshot.

Live reusable objects may resolve future-use values only according to their own explicit domain/version rules.

## 15. AI / MCP invariant

Nutrition uses one AI boundary:

```text
Plaivra context + structured prompt
→ external ChatGPT
→ user reviews
→ explicit user approval
→ authorized Plaivra MCP write when applicable
```

No embedded generic Nutrition chatbot. ChatGPT is not canonical nutrition fact authority and cannot silently mutate domain truth. Plaivra never reports write success before canonical persistence confirms it.

## 16. Nesting boundary

Allowed:

```text
Saved Meal
├── Food
└── Recipe
```

Excluded V1:

```text
Recipe → Recipe
Saved Meal → Saved Meal
```

## 17. Shopping List

Shopping List remains derived from Meal Plan intent plus protected explicit Shopping state. Recipe/Saved Meal contributions use the frozen ingredient snapshots attached to the committed planned occurrence. Later source edits/deletion do not silently rewrite committed historical plan state.

## 18. Global Summary boundary

Future Global Summary may aggregate cross-domain application data, but it is outside Nutrition V1.

Nutrition implementation must not create a Nutrition Summary route, fifth Nutrition navigation item, or cross-domain reporting feature disguised as Nutrition.

## 19. Shared visual contract amendment

The Nutrition Native Visual Contract now applies to four peer destinations only:
- Diary;
- Meal Plan;
- Food Library;
- My Recipes.

Summary-specific Nutrition references are stale and must be mechanically removed/superseded before implementation planning.

Touch wording is reconciled to:

> Plaivra uses **≥44×44 pt effective touch targets as its product baseline on Apple touch surfaces**, with larger task-specific controls where appropriate. System-owned controls retain native geometry and behavior.

Do not state 44×44 as an Apple absolute minimum for every control.

Android keeps an approximately 48 dp product/platform-aligned touch baseline where appropriate.

## 20. Responsive / state consistency

Across all four Nutrition destinations:
- semantics remain identical across mobile/tablet/desktop/RTL;
- larger screens improve breathing room/efficiency, not feature density;
- critical actions are never hover-only;
- Dynamic Type grows content instead of clipping important meaning;
- color is never the only carrier of meaning;
- failures remain local when usable domain content exists.

Cooking Mode retains its separately approved offline/session resilience.

## 21. Legacy compatibility

Legacy custom-meal/saved-recipe/mixed nutrition models are compatibility evidence, not canonical product semantics.

Implementation planning must map existing data explicitly to Food, Recipe, Saved Meal, Diary actual usage, and Meal Plan intended usage.

No legacy model retirement without verified coverage, migration strategy, rollback/forward-fix strategy, and Product & Technical Architect approval.

## 22. Reconciliation acceptance criteria

Nutrition V1 is reconciled only if all are true:

### IA
- exactly four peer Nutrition destinations;
- Shopping List nested under Meal Plan;
- Global Summary outside Nutrition;
- Saved Meal contextual, not peer navigation.

### Ownership
- Food Library owns Food;
- My Recipes owns Recipe;
- Saved Meal has explicit shared utility ownership;
- Diary owns actual intake;
- Meal Plan owns intended intake.

### Recipe lifecycle
- Archive-first removed;
- Delete → Recently Deleted → 30 days → permanent deletion is canonical;
- Restore preserves identity/version history;
- Delete Now is explicitly destructive;
- permanent deletion never corrupts frozen consumers.

### Versioning/history
- Recipe consumers retain `recipe_version_id`;
- Diary/Meal Plan/Saved Meal retain required frozen resolved snapshots;
- source mutation/deletion never silently mutates committed history.

### Targets
- one effective-dated target authority;
- historical comparisons use historical effective target;
- target changes are not retroactive truth mutation.

### Saved Meal
- Food + published Recipe-version children only;
- no nested Saved Meal;
- editing changes future use only;
- committed use freezes a resolved bundle snapshot;
- Delete → Recently Deleted → 30 days → permanent deletion is canonical;
- Restore preserves the same Saved Meal identity;
- Delete Now is explicitly destructive;
- permanent deletion never corrupts frozen Diary/Meal Plan consumers.

### Visual/system
- shared contract scopes to four destinations;
- stale Summary references removed/superseded;
- 44×44 described as Plaivra baseline, not Apple absolute minimum.

### AI
- external ChatGPT + explicit approval + authorized MCP remains the pattern;
- ChatGPT does not become nutrition authority.

## 23. Post-approval mechanical reconciliation

After user written-spec approval:
1. update Diary stale IA/future-Recipe/target wording;
2. update Meal Plan IA, explicit Recipe version identity, and Summary wording;
3. update Food Library IA/Summary wording;
4. update My Recipes IA and deletion lifecycle/Archive/Summary wording;
5. update Native Visual Contract from five destinations to four and correct touch-target wording;
6. update repository control/decision authorities;
7. run a fresh contradiction/placeholder/scope scan;
8. present final reconciliation evidence;
9. only then invoke `superpowers:writing-plans` for the comprehensive Nutrition implementation plan.
