# ADR 0003: Saved nutrition content

**Status:** Accepted for staged convergence  
**Date:** 2026-07-10

## Decision

`saved_recipes` and `saved_recipe_ingredients` are the target saved-content model. A saved header gains an explicit item type (`meal`, `recipe`, or `template`), category, favorite state, and immutable source identifiers. `custom_meals`/`custom_meal_items` are the only production generation with data and must be backfilled before any cutover. `meals`/`meal_food_items` are frozen compatibility tables.

## Evidence

The read-only production capture found three `custom_meals` and twelve `custom_meal_items`, with zero rows in both `meals`/`meal_food_items` and `saved_recipes`/`saved_recipe_ingredients`. The pending migration source-links and backfills those legacy rows. The direct quick-log service and public MCP saved-meal writer now target saved recipes; export retains every generation during verification.

## Staged data flow

1. Add nullable source IDs and saved-item fields to the target tables.
2. Backfill headers and ingredients transactionally without changing or deleting source rows.
3. Verify total and per-user header/item counts, macros, quantities, names, ownership, and source-link uniqueness.
4. Switch the direct UI and MCP domain service to the target writer with idempotency.
5. Dual-read and deduplicate by source ID for at most two verified releases.
6. Stop old reads only after export, deletion, RLS, account isolation, meal-plan reuse, and food logging regression tests pass.

## Ownership and privacy

Headers are owned by `user_id`; ingredient ownership must match the header and be enforced by RLS and application validation. Public tools use the nutrition domain service and never arbitrary table access.

## Rollback

Disable the new writer/read feature flag and return to the compatibility writer. Backfilled target rows remain linked and may be forward-fixed. Source rows are never silently removed.
