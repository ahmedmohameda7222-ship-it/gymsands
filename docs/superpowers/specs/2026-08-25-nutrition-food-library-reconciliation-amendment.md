# Nutrition Food Library V1 — Reconciliation Amendment

**Date:** 2026-08-25  
**Status:** User-approved binding amendment  
**Applies to:** `2026-08-24-nutrition-food-library-design.md`  
**Parent authority:** `2026-08-25-nutrition-wide-reconciliation-design.md`

This amendment changes only the cross-domain clauses below. All other approved Food Library behavior remains governed by the original Food Library spec.

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

There is no Nutrition Summary destination. Future Global Summary is a separate top-level cross-domain product.

## 2. Saved Meal ownership

Food Library continues to own Foods only. Saved Meal is a shared contextual Nutrition utility, not a Food Library entity and not a peer Nutrition destination.

`Add to Saved Meal` is a handoff into the shared Saved Meal utility. Food Library must not absorb Saved Meal authoring/management into Food identity screens.

## 3. Frozen-reference behavior

A Food edit/correction must never silently rewrite:

- a published Recipe version;
- a committed Saved Meal bundle snapshot;
- committed Diary history;
- committed Meal Plan occurrences.

Future-use resolution follows each consumer domain's explicit version/snapshot rules.

## 4. Global Summary boundary

Original references to Nutrition Summary are stale. Food Library exposes canonical Food facts and search/discovery behavior; it does not own reporting or cross-domain Summary.

## 5. Authority resolution

This amendment supersedes original Food Library wording only where it:

- lists `Summary` as a Nutrition peer;
- describes Nutrition Summary as a pending sibling required before Nutrition reconciliation;
- leaves Saved Meal product ownership ambiguous.

No other Food Library design clause is changed.
