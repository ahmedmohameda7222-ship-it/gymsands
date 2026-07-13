# Plaivra public MCP catalog

**Catalog version:** `2026-07-2`  
**Public tools:** 34  
**Machine-readable manifest:** [`public-tool-catalog.json`](public-tool-catalog.json)

The launch catalog exposes user jobs, not database tables. The server keeps an explicit allowlist, filters it again by the connection’s current scopes, and rejects a hidden tool name as unknown even when historical storage remains available for privacy export.

## Launch jobs

| Domain | Public jobs |
| --- | --- |
| Connection/context | connection status; training planning; nutrition planning; daily execution; progress review; workout adjustment |
| Food execution | search foods; log/read/update/delete eaten food; create a custom food; create a saved meal |
| Meal planning | create/read a day or week; update/delete/complete a planned item; generate a shopping list |
| Hydration | add water; read water summary |
| Training | create/read/activate/delete a plan; start/log/complete/skip a workout |
| Progress/wellness | add weight; add body measurement; add sleep and recovery log |

Fine-grained plan-day, exercise, kitchen, grocery, habit, supplement, preference, progression-target, and alternative CRUD functions are internal primitives. They are not in `tools/list` and cannot be invoked through the public dispatcher. Daily Check-in read/write operations are retired from the active tool surface; historical records remain preserved.

## Contracts

- Every tool declares strict input properties and an `outputSchema`.
- The runtime minimizes `structuredContent`, then validates it against the tool output contract before returning it.
- Contract failures return `output_contract_violation`; database/provider details are logged server-side and not returned to the user.
- Success writes include stable affected-record IDs in their domain result, `affected_at`, `catalog_version`, and a user-safe `next_step_hint`.
- Errors use bounded snake-case codes and user-safe messages.
- Create/log/composite calls require a 16–200 character `idempotency_key`; Plaivra stores only hashes and a minimized response envelope in a service-role-only replay ledger.
- `update_food_log`, `update_meal_plan_item`, and reversible `activate_workout_plan` require `expected_updated_at` and return `version_conflict` on stale state.
- Irreversible deletions retain explicit `confirm:true`. Plan activation is reversible and is not classified as deletion.

## Deprecation policy

The manifest records broad-tool replacements and retired workflows. Removing or renaming a public tool requires a catalog-version change, documentation update, compatibility window when user impact exists, and regression-test update. Deprecated aliases are not silently left in the public catalog.

Internal executor code is not a compatibility promise. `tools/list`, the manifest, and the catalog tests are the launch contract.
