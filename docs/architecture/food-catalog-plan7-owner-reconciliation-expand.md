# Food Catalog Plan 7 — Tasks 13–14 owner reconciliation / expand authority

Starting authority: `main@306384cf12e99381c80f026780bee3cc2e60e1ce`

This package is repository-only. It does not authorize or perform a Production migration, data mutation, deployment, destructive retirement, or Task 15+ work.

## Task 13 owner favorite reconciliation

Legacy `user_food_favorites.food_key` remains heterogeneous. The deterministic classifier in `lib/food-catalog/plan7-owner-reconciliation.ts` distinguishes:

- `catalog_food`: a UUID resolving only to `food_items.id`; disposition is `catalog_mappable` or `catalog_already_mapped` when the same owner already has `food_favorites(user_id, food_id)`.
- `my_food`: a UUID resolving only to an active same-owner `user_food_items.id`; disposition is `my_food_preserved`.
- `legacy_text`: a non-UUID `food_name|serving_size` key; disposition is `legacy_text_preserved`.
- `blocked`: malformed/unknown UUID, cross-owner My Food, deleted My Food, duplicate/collision, or ambiguous resolution.

No fuzzy matching, name-based Catalog guessing, nutrition-based My Food guessing, blanket conversion, row deletion, or new favorite model is introduced.

The current Product path in `services/meals/food-logging-speed.ts` remains dual-authority by source. The Food Browser passes explicit source authority: source-known Catalog Food favorites write `food_favorites`, while My Food/text/log-derived favorite semantics remain on `user_food_favorites`. A source-aware read snapshot keeps canonical Catalog IDs, retained legacy keys, and same-owner My Food collision facts distinct while `getFavoriteFoodKeysAsync(...)` continues to expose the combined compatibility list required by Eat/repeat ranking. Source is never inferred from UUID shape alone. For a Catalog Food, an exact retained legacy UUID is compatibility favorite authority only when a same-owner My Food collision check succeeds and proves no such My Food row exists; soft-deleted My Food rows still make cleanup unsafe. Catalog unfavorite always clears the canonical Catalog row, but exact legacy same-key cleanup occurs only when that state is proven unambiguous. Ambiguous or unresolved legacy state is preserved, so Catalog and My Food favorite state remain independently controllable. No background reconciliation deletes or converts owner rows. The retained `user_food_favorites` dependency is evidence for Task 16, not retirement authority.

Read-only evidence command:

```sh
PLAN7_DATABASE_URL='<read-only-or-local-database-url>' \
  node scripts/report-food-catalog-plan7-owner-reconciliation.mjs
```

Default output contains aggregate counts only:

```text
total
catalog_mappable
catalog_already_mapped
my_food_preserved
legacy_text_preserved
blocked
personal_corrections
```

Local/manual diagnostics may add stable hashed row identifiers with `--diagnostic`; owner IDs and raw favorite keys are not printed.

## Task 14 search and MCP authority

Migration: `20260924051500_food_catalog_plan7_owner_reconciliation_expand.sql`.

Dependencies are chronological and explicit: Plan 5 search projection (`20260906183000`), Plan 5 serving semantics correction (`20260907165500`), Plan 6 governance/Personal Override authority (`20260908100000`), Task 9 current Personal Override point-read authority (`20260919034630`), and the existing `chatgpt_connections` identity table.

The migration is expand-only. It creates a private search core with an explicit trusted owner ID, keeps the exact public `search_food_catalog_v2(...)` signature as the authenticated wrapper, and adds `search_food_catalog_v2_for_mcp_v1(connection_id, ...)` for service-role MCP callers. MCP owner identity is re-derived from an exact active, non-revoked `chatgpt_connections` row; neither public MCP bridge accepts `p_user_id`, and no JWT claim is forged.

Plan 6 Personal Override resolution is shared through a private explicit-owner point-read core. The browser RPC still derives `auth.uid()`; the MCP RPC derives the owner from `connection_id`. Private cores have no direct application-role EXECUTE grant. Service role retains no direct SELECT on Personal Override tables.

Search nutrition uses explicit expand-phase source precedence. An exact valid Plan 6 Personal Override pointer owns that owner/Food for Search V2; its pointed revision is resolved exactly, and active numeric supported nutrients use the exact current-generation selected `food_nutrition_revisions` basis. Missing keys and JSON null fall back to the canonical SearchDocument value; numeric zero remains zero. The existence of the Plan 6 pointer suppresses legacy authority even when the pointed revision is note-only, serving-only, null/missing-nutrient-only, or tombstoned, so those cases remain canonical with `usingPersonalValues = false`. Only when no Plan 6 pointer exists may an exact same-owner active `food_personal_corrections` row act as transitional Search V2 compatibility authority. That legacy path preserves its historical nullable nutrient and `basis_amount` / `basis_unit` normalization semantics. Neither source uses timestamp comparison or latest-row inference. Browser and MCP Search share this same private explicit-owner core.

## Production boundary and later retirement preflight — record only, do not execute here

Correct Plaivra Production project: `bkwezjxvapaeasfvlhvv`.

No Production query, migration apply, or mutation is authorized by this Tasks 13–14 correction pass. The Task 14 migration is now a true expand migration: a nonzero `food_personal_corrections` population is **not by itself an expand/apply blocker**, because exact active legacy rows remain Search V2 compatibility authority whenever that owner/Food has no Plan 6 pointer.

The zero/nonzero gate belongs to the later Task 16/17 contract/retirement preflight. At that future explicitly authorized live preflight, obtain a fresh read-only count:

```sql
begin read only;
select count(*)::bigint as food_personal_corrections
from public.food_personal_corrections;
rollback;
```

Retirement gate:

- If `food_personal_corrections = 0`, a verified no-op owner-data retirement migration may be acceptable after the required live cutover evidence.
- If `food_personal_corrections > 0`, **STOP retirement** and require an explicit reviewed owner-preserving semantic migration. Do not discard corrections.

The favorite reconciliation report is likewise evidence for later retirement. Task 13 repository merge does not require `blocked = 0`. Later retirement of `user_food_favorites` requires `blocked = 0` **and** an approved owner-preserving disposition for every remaining row.

Ordered repository-pending migrations after this change:

1. `20260915170011_food_catalog_governance_outbox_reconciliation_gate.sql`
2. `20260915170012_food_catalog_owner_correction_export.sql`
3. `20260917023000_food_catalog_ingestion_restore_reactivation_gate.sql`
4. `20260919034630_food_catalog_owner_override_read_authority.sql`
5. `20260924051500_food_catalog_plan7_owner_reconciliation_expand.sql`

Do not replay applied migrations. The machine ledger remains `productionMigrationCount = 63`, `productionRecordCount = 123`, `schemaVerifiedUntrackedCount = 0`, with `pendingCount = 5`, `unresolvedCount = 5`, and `historyRepair.state = pending`.

## Privacy and retirement boundary

No new persistent owner-data table is introduced by Tasks 13–14. `lib/privacy/data-export.ts` continues to export legacy `food_personal_corrections`, `food_favorites`, Plan 6 revision/pointer/operation payloads, and correction-report member payloads. Legacy owner rows are not deleted.

The dependency rescan is recorded in `docs/architecture/food-catalog-plan7-db-dependency-rescan.json`. It is evidence for Tasks 15–17 only and does not make any table, helper, policy, trigger, function, or root metadata field retirement-safe.
