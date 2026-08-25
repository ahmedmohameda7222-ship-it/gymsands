# Nutrition Meal Plan V1 — Reconciliation Amendment

**Date:** 2026-08-25  
**Status:** User-approved binding amendment  
**Applies to:** `2026-08-24-nutrition-meal-plan-design.md`  
**Parent authority:** `2026-08-25-nutrition-wide-reconciliation-design.md`

This amendment changes only the cross-domain clauses below. All other approved Meal Plan behavior remains governed by the original Meal Plan spec.

## 1. Canonical Nutrition IA

Nutrition has exactly four peer destinations:

```text
Nutrition
├── Diary
├── Meal Plan
│   └── Shopping List
├── Food Library
└── My Recipes
```

There is no Nutrition Summary destination. Future Global Summary is outside Nutrition.

## 2. Planned Recipe version identity

Every committed planned Recipe occurrence is version-specific and retains:

```text
recipe_id
recipe_version_id
resolved serving count
frozen nutrition snapshot
frozen ingredient quantities required for Shopping derivation
```

Existing planned occurrences never silently float to a later published Recipe version.

## 3. Recipe deletion lifecycle alignment

The Meal Plan 30-day deletion model is canonical and is now the shared My Recipes lifecycle:

```text
Delete Recipe
→ Recently Deleted
→ 30 days
→ Restore OR Delete Now
→ Permanent deletion
```

During retention, the same Recipe identity and version history remain restorable. Permanent live-source removal never deletes or mutates already-frozen Meal Plan occurrences.

## 4. Saved Meal authority

Saved Meal is a shared contextual Nutrition utility, not a peer destination.

A planned Saved Meal occurrence freezes the resolved bundle required for nutrition, display, execution, and Shopping derivation. Later Saved Meal edits/deletion do not silently mutate the committed plan occurrence.

## 5. Nutrition Targets

Meal Plan retains the approved effective-dated Nutrition Target authority. Remove wording that depends on a future Nutrition Summary page; future Global Summary is a separate consumer of domain facts and is not part of Meal Plan authority.

## 6. Authority resolution

This amendment supersedes original Meal Plan wording only where it:

- lists `Summary` as a Nutrition peer;
- omits `recipe_version_id` from a committed planned Recipe occurrence;
- describes Summary as a future Nutrition sibling requirement.

No other Meal Plan design clause is changed.
