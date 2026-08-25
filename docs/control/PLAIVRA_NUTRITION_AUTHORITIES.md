# Plaivra Nutrition Authorities

**Date:** 2026-08-25  
**Status:** User-approved canonical Nutrition design authority map

This file defines the active authority chain for Plaivra Nutrition V1. It exists so implementation does not accidentally follow stale wording that remains inside earlier approved page specs.

## 1. Canonical Nutrition IA

```text
Nutrition
├── Diary
├── Meal Plan
│   └── Shopping List
├── Food Library
└── My Recipes
```

- There is no Nutrition Summary destination.
- Future Global Summary is a top-level cross-domain application destination outside Nutrition.
- Saved Meal is a shared contextual Nutrition utility, not a peer destination.

## 2. Authority precedence

For Nutrition design questions, resolve authority in this order:

1. repository-wide product/control/security/data authorities;
2. `docs/superpowers/specs/2026-08-25-nutrition-wide-reconciliation-design.md`;
3. the relevant 2026-08-25 reconciliation amendment listed below;
4. the original approved page/native visual spec for all unchanged page-specific detail;
5. existing runtime/legacy implementation only as evidence or compatibility input, never as product-design authority.

A higher authority supersedes only conflicting clauses. Unchanged lower-level detail remains binding.

## 3. Active page authorities

### Diary

- Base: `docs/superpowers/specs/2026-08-23-nutrition-diary-design.md`
- Amendment: `docs/superpowers/specs/2026-08-25-nutrition-diary-reconciliation-amendment.md`

The amendment locks four-destination IA, first-class versioned Recipe logging, effective-dated Nutrition Targets, and Saved Meal frozen-consumer behavior.

### Meal Plan

- Base: `docs/superpowers/specs/2026-08-24-nutrition-meal-plan-design.md`
- Amendment: `docs/superpowers/specs/2026-08-25-nutrition-meal-plan-reconciliation-amendment.md`

The amendment locks four-destination IA, explicit `recipe_version_id`, Recipe 30-day deletion alignment, Saved Meal utility ownership, and removal of Nutrition Summary dependencies.

### Food Library

- Base: `docs/superpowers/specs/2026-08-24-nutrition-food-library-design.md`
- Amendment: `docs/superpowers/specs/2026-08-25-nutrition-food-library-reconciliation-amendment.md`

The amendment locks four-destination IA, Saved Meal as contextual utility, frozen-reference behavior, and Global Summary boundary.

### My Recipes

- Base: `docs/superpowers/specs/2026-08-25-nutrition-my-recipes-design.md`
- Amendment: `docs/superpowers/specs/2026-08-25-nutrition-my-recipes-reconciliation-amendment.md`

The amendment supersedes Archive-first with `Delete → Recently Deleted → 30 days → permanent deletion`, preserves immutable published versions/frozen consumers, and removes Nutrition Summary as a dependency.

### Native Visual Contract

- Base: `docs/superpowers/specs/2026-08-23-nutrition-native-visual-contract-design.md`
- Amendment: `docs/superpowers/specs/2026-08-25-nutrition-native-visual-contract-reconciliation-amendment.md`

The amendment scopes the shared visual contract to four Nutrition destinations, removes Summary-specific Nutrition authority, and defines ≥44×44 pt as a Plaivra Apple-touch product baseline rather than an Apple absolute minimum.

## 4. Shared domain locks

### Food

Food Library owns reusable Food identity and canonical/effective nutrition behavior.

### Recipe

My Recipes owns Recipe identity, immutable published Recipe versions, Working Drafts, Cooking Mode, and Recipe lifecycle.

Recipe deletion:

```text
Delete
→ Recently Deleted
→ 30 days
→ Restore OR Delete Now
→ Permanent deletion
```

Permanent source deletion never destroys already-frozen consumer history.

### Saved Meal

Saved Meal is a shared contextual utility supporting Create / Detail / Edit.

Allowed composition:

```text
Saved Meal
├── Food
└── Recipe + frozen published recipe_version_id
```

Saved Meal inside Saved Meal is excluded V1.

Saved Meal deletion uses the same 30-day Recently Deleted model as Recipe deletion. Committed Diary/Meal Plan frozen bundle snapshots survive permanent source deletion.

### Diary / Meal Plan

- Diary = actual intake truth.
- Meal Plan = intended intake truth.
- Planned food never becomes actual intake without explicit successful execution/logging.
- Editing one truth does not silently rewrite the other.

### Nutrition Targets

Diary and Meal Plan share one effective-dated Nutrition Target authority. Historical dates compare against the target effective for that date. Later target changes are not retroactive truth mutation.

### Missing nutrition

Across Nutrition: **missing is not zero**.

## 5. AI / MCP

Nutrition follows one pattern:

```text
Plaivra contextual prompt
→ external ChatGPT
→ user review
→ explicit user approval
→ authorized Plaivra MCP write when applicable
```

No embedded generic Nutrition chatbot. ChatGPT is not canonical nutrition fact authority.

## 6. Implementation gate

Nutrition implementation planning may begin only after the reconciliation branch passes the final contradiction/placeholder/scope audit and the Product & Technical Architect records the reconciled design state.

Implementation must consume the authority chain above rather than treating earlier stale Summary/Archive wording as active product truth.
