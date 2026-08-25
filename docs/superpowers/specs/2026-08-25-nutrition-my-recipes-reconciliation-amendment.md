# Nutrition My Recipes V1 — Reconciliation Amendment

**Date:** 2026-08-25  
**Status:** User-approved binding amendment  
**Applies to:** `2026-08-25-nutrition-my-recipes-design.md`  
**Parent authority:** `2026-08-25-nutrition-wide-reconciliation-design.md`

This amendment changes only the cross-domain clauses below. All other approved My Recipes behavior, including Cooking Mode, versioning, ChatGPT/MCP, responsive behavior, and visual acceptance criteria, remains governed by the original My Recipes spec.

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

## 2. Recipe deletion lifecycle supersedes Archive-first

The original Archive-first lifecycle is superseded.

Canonical deletion lifecycle:

```text
ACTIVE / READY / eligible Draft
        ↓ Delete
RECENTLY DELETED
        ↓ 30 days
PERMANENTLY DELETED
```

Rules:

- Delete removes the Recipe from normal My Recipes discovery and new-use selection.
- A deleted Recipe cannot start a new Cooking Mode session from the live source.
- During the 30-day retention window, the same Recipe identity and published version history remain restorable.
- Restore revives the same identity and version history.
- `Delete Now` permanently removes the live Recipe source after explicit destructive confirmation.
- Automatic permanent deletion occurs after 30 days when not restored.
- Permanent source deletion never mutates or removes frozen Diary, Meal Plan, Saved Meal, or other committed consumer snapshots.
- `Recently Deleted` is a secondary management utility, not a permanent primary My Recipes tab.

## 3. Published version contract remains unchanged

Ready Recipes still use immutable published versions plus one autosaved Working Draft. Editing creates the next version only after successful explicit `Save Recipe`.

Deletion lifecycle changes do not weaken version immutability.

Every committed Recipe consumer retains `recipe_id`, `recipe_version_id`, resolved serving/quantity, frozen nutrition, and sufficient frozen display facts.

## 4. Saved Meal authority

Saved Meal is a shared contextual Nutrition utility, not a My Recipes destination.

`Add to Saved Meal` hands the selected published Recipe version to the Saved Meal utility. The Saved Meal child freezes the published `recipe_version_id` and required resolved facts.

Saved Meal deletion follows the separately approved 30-day Recently Deleted model and does not affect Recipe identity/history.

## 5. Archive wording

Any original My Recipes clause that describes `ARCHIVED`, `Archive`, or `Restore` as the normal published-Recipe removal lifecycle is non-authoritative after this amendment.

`Restore` now refers to restoring a Recipe from Recently Deleted during its retention window.

## 6. Global Summary boundary

Original Nutrition Summary references are stale. Global Summary is a separate future top-level application design and is not a dependency of My Recipes completion.

## 7. Authority resolution

This amendment supersedes original My Recipes wording only where it:

- lists `Summary` as a Nutrition peer;
- uses Archive-first as the normal Recipe removal lifecycle;
- says Nutrition implementation planning must wait for a fifth Nutrition Summary destination.

All other approved My Recipes clauses remain intact.
