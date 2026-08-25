# Nutrition Diary V1 — Reconciliation Amendment

**Date:** 2026-08-25  
**Status:** User-approved binding amendment  
**Applies to:** `2026-08-23-nutrition-diary-design.md`  
**Parent authority:** `2026-08-25-nutrition-wide-reconciliation-design.md`

This amendment changes only the cross-domain clauses below. All other approved Diary behavior remains governed by the original Diary spec.

## 1. Canonical Nutrition IA

The older five-destination IA is superseded. Nutrition has exactly four peer destinations:

```text
Nutrition
├── Diary
├── Meal Plan
│   └── Shopping List
├── Food Library
└── My Recipes
```

There is no Nutrition Summary destination. Future Global Summary is a separate top-level cross-domain application destination.

## 2. Recipe logging is no longer future/unresolved

Recipe is a canonical first-class reusable logging input.

A committed Recipe-serving Diary entry retains at minimum:

```text
recipe_id
recipe_version_id
resolved serving / quantity
frozen nutrition snapshot
consumer-required frozen display facts
```

Normal Recipe logging preserves the Recipe-serving semantic object; it does not explode the Recipe into unrelated Food rows merely to log it.

Later Recipe edits, deletion, or permanent source removal never mutate historical Diary truth.

## 3. Effective-dated Nutrition Targets

Diary uses the Nutrition Target effective for the selected date.

- today uses today's effective target;
- a historical date uses the target that was effective on that historical date;
- later target changes do not retroactively rewrite historical comparisons;
- missing targets never block logging;
- a Meal Plan week override affects planning for that week only and does not silently become Diary's global target authority.

## 4. Saved Meal handoff

Saved Meal is a shared contextual Nutrition utility, not a peer Nutrition destination.

When a Saved Meal is committed to Diary, Diary stores a frozen resolved bundle snapshot sufficient to preserve actual-intake history. Later Saved Meal edits/deletion never rewrite the committed Diary entry.

## 5. Authority resolution

If the original Diary spec says any of the following, this amendment supersedes it:

- Nutrition has a fifth `Summary` destination;
- Recipe is only a future domain awaiting design;
- historical Diary dates compare against today's target rather than an effective-dated target.

No other Diary design clause is changed by this amendment.
