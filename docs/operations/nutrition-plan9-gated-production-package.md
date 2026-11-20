# Nutrition closure — Plan 9 pre-operation authority package (read-only)

**Captured:** 2026-11-20; **scope:** Plaivra Main Supabase `bkwezjxvapaeasfvlhvv`; **status:** PREPARATION ONLY / `PLAN9_AWAITING_EXACT_PRODUCTION_APPROVAL`.

## N021–N022 immutable schema and governance authority

- Repository `main` `de7c7ccea943e9b793a2a65b34f2a06a6f33be49`, migration ledger `supabase/migration-ledger.json`: `historyRepair.state=reconciled`, `pendingCount=0`, `unresolvedCount=0`; history records **133** at 2026-11-20 readback; latest physical `20261013070122_food_catalog_plan9_cross_batch_source_fact_idempotency`. Do not replay or alter any applied migration.
- Verified live function grants: `public.food_catalog_manage_governance_principal(uuid,text,text,text,text[],text,text)` and `public.food_catalog_review_ingestion_batch_v1(jsonb)` are `SECURITY DEFINER`, `search_path=""`, authenticated execute=true, anon/service_role=false. Recovery-set lock is `private.food_catalog_governance_lock_recovery_set()`, not exposed to anon/authenticated/service_role.
- Read-only Main readback `2026-11-20 17:48:06.149222+00`: 12 Auth users; 12 active account-access rows; **zero governance principals and grants**. Existing `food_catalog_manage_governance_principal` requires a real prior Owner and cannot bootstrap the first. Historical decision authority: `docs/architecture/food-catalog-plan9-initial-owner-recovery-decision.md`.

## N023–N025 nominated human / transaction-only recovery — authorization pending

The authorized organization Owner must nominate **one actually authenticated, active, non-disabled human Supabase Auth UUID** over a protected identity channel. Never infer this UUID from a user list, create a fictitious identity, copy UUIDs into this repository, impersonate a person or grant SQL `service_role` operational review authority.

Approval packet to collect **outside this repository**: human subject and verified control of Auth session; approver identity; exact time/change ticket; explicit one-time first-Owner bootstrap authorization; independent SQL/security review; execution identity; acknowledged restore and audit strategy. Recheck zero existing Owner/grants and current Auth/access state under an agreed transactional recovery. Use `private.food_catalog_governance_lock_recovery_set()` and the existing immutable governance operation/audit authority. Grant the minimal Owner management capability and separately authorized batch review capability only to the exact target; assert postconditions and last-Owner invariant within transaction. **Abort if immutable audit cannot be persisted.** Never put a repeatable bootstrap SQL function or unconstrained administrative bypass in Production.

**No DML or privileged operation was executed.** This package is intentionally not an executable SQL script because the subject, privileged channel and exact signed command have not been authorized. N025 independent approval and N026/N027 actual recovery remain blocked.

## N028 fresh Food Catalog source/match-index readback

At `2026-11-20 17:48:06.149222+00`, Main read-only counts all **0**: `food_items`, `food_source_records`, `food_barcodes`, `food_merge_events`, `food_names`, `food_ingestion_batches`, `food_ingestion_runs`, `food_catalog_generations`, `food_catalog_search_documents`, `food_catalog_name_fact_revisions`, governance principals and grants. `food_catalog_current_generation.current_generation_id=NULL`.

This independently supports an empty candidate-index **at that observation only**. The historical match-index file `data/food-catalog/source-locks/plan9-1a1-match-index-2026-10-13.json` is not a current read lock. Re-capture every canonical identity, alias, barcode, redirect, generation pointer and actual counts immediately before each separately approved persistent command.

## N029–N032 locked 1A1 (not authorized for persistent execution)

| Property | Exact locked identity |
| --- | --- |
| Provider/data type | USDA FoodData Central / FoundationFoods |
| Release | `2026-04-30` (do not silently switch to a newer release) |
| Archive | `FoodData_Central_foundation_food_json_2026-04-30.zip` |
| Official location | https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip |
| ZIP expected bytes | `469303` |
| ZIP SHA-256 | `186e988ec542e913f51ef62b86a47758e8cdd0d1dc3889e7b055581f3c09c77a` |
| Adapter/config | `plan8-1a0-v2` / `3fee7e87bd808b014fedf68c0dd51fef6677a1a6ffe974c39921cf916d401d5b` |
| Historical canary | 60 strong macro+energy / 10 null energy / 10 edge = 80 original USDA Foods |
| Selection SHA-256 | `b3b4719102d936d1ddf9ffe9aacdb3a351514a0e54f95ea012431980647cf4bf` |
| Manifest content SHA-256 | `10db18aaeae621b4618e868a4f47de9c02ab3ea876b407b7064f54cf31674a33` |
| Semantic batch SHA-256 | `6e57f559c0d31785df00f5ce61c1f2920e8854ecb372d76468e8dc0a852a8f06` |

Source lock file: `data/food-catalog/source-locks/usda-foundation-2026-04.json`. Existing offline implementation: `scripts/food-catalog-plan9-1a1-runner.mjs` → Vite SSR `scripts/food-catalog-plan9-1a1.ts` → `lib/food-catalog/ingestion/usda-foundation/canary.ts` → Plan 4 `buildFoodCatalogDryRun`. Existing store `services/food-catalog/server/supabase-ingestion-command-store.ts` invokes guarded `food_catalog_ingestion_*_v2` RPCs; the human-only review RPC is distinct.

Historical evidence expects `80 input, 80 accepted, 80 create, 0 rejected/matched/quarantined` against the original empty index. Actual source archive **could not be downloaded/rehash-verified in this session**; historical digest is source-lock authority, not a new live proof. Historical original source full 363 contains ten negative-carbohydrate rejects; after authorized canary, full 1A2 **must** use a fresh nonempty canonical index and independent match/audit. USDA publishes Foundation and FNDDS releases via https://fdc.nal.usda.gov/download-datasets/ and confirms public-domain/CC0 terms via https://fdc.nal.usda.gov/.

### Per-operation stop/go handoff

1. Re-download and verify exact archived bytes, original JSON member and two deterministic replays in the **new Nutrition-only** offline QA lane; freeze replay artifact and current canonical-index readback.
2. Separately authorize first legitimate human Owner recovery (G-04), then prove human-only review and last-owner controls.
3. Independently request **persisted 1A1 database dry-run** authorization with exact new batch/source/index/review/evidence parameters (G-05); do not confuse offline QA with DB dry run.
4. After completed reconciled persistent dry run, request separate human review, exact **draft-only** ingestion, and independently scoped **activation** and **generation CAS promotion** (G-06 / G-07).
5. Recompute **1A2** against the new nonempty index, review all 363 original rows, preserve source/fact idempotency and stable 80 IDs, then request exact 1A2 dry run, review, draft, activation and promotion separately (G-08).
6. Verify member search, Nutrition consumers, immutable prior generation, rollback, null values and Production no-Activity-Catalog cross-write.

**Release gate:** this isolated branch's legacy test/Quality workflows were deliberately removed; no new Nutrition-only QA has run. No new Production migration, data operation, Owner grant, version-marker change, deploy, PR merge or release approval occurs on this package.
