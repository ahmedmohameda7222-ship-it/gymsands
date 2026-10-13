# Plan 9 / USDA Foundation Batch 1A1 — Readiness Evidence and Production Gate

**Captured:** 2026-10-13. **Disposition:** `PLAN9_AWAITING_EXACT_PRODUCTION_APPROVAL`, with a separate **human Owner/principal bootstrap blocker**. Draft PR #188, base `main@c07b9a2041e39d9e2e69d040d26e8875cb165aed`. This document is an evidence register, **not** permission to run Production data commands.

## Exact source, bounded canary, offline proof

- Provider/dataset/release: USDA FDC / FoundationFoods / **2026-04-30** (April 2026).
- Official ZIP `FoodData_Central_foundation_food_json_2026-04-30.zip`: **469303 bytes**, SHA-256 `186e988ec542e913f51ef62b86a47758e8cdd0d1dc3889e7b055581f3c09c77a`.
- Verified full Foundation input: 363 real source Foods, 32 JSON null slots; full-release Plan 8 policy rejects 10 negative-carbohydrate rows. Source lock importer `plan8-1a0-v2`, config SHA-256 `3fee7e87bd808b014fedf68c0dd51fef6677a1a6ffe974c39921cf916d401d5b`.
- Source-category-stratified canary: 60 authoritative-energy/full-macro/stable NDB, 10 missing selected energy, 10 other genuine source-evidence edge cases; 80 distinct original FDC IDs. All 80 accepted/CREATE on the dated empty-catalog read-only snapshot; zero rejected, matched or quarantined. No synthetic row or invented 1008 calories, 4/4/9 fallback, serving conversion, category/market assignment, or global-market inference.
- Exact empty-index checksum SHA-256 `6f4bf1b25ce1d6b934a09a5e179c994fd8e5d06754a28754ce9918f1de43583b`.
- Canary selection SHA-256 `b3b4719102d936d1ddf9ffe9aacdb3a351514a0e54f95ea012431980647cf4bf`.
- ManifestContent SHA-256 `10db18aaeae621b4618e868a4f47de9c02ab3ea876b407b7064f54cf31674a33`.
- Semantic identity SHA-256 `6e57f559c0d31785df00f5ce61c1f2920e8854ecb372d76468e8dc0a852a8f06`.
- Invariant QA: 70/80 authoritative selected calories, 10 missing/NULL; exact energy nutrient IDs 2048: 67, 2047: 3, 1008: 0. All 80 source protein/fat/carbohydrate present; 43 source fiber null, 40 saturated-fat null, 61 sugars null. 80 distinct usable USDA NDB identities. 69 Foods with portions, 76 source-backed retained portions, no source-portion fabrication or source-loq invention.
- Original archive was independently replayed twice; manifest, cohort selection, QA and checksums byte-identical. Verified GitHub offline workflow success on `036036efcd578862b384ae049a7a826f77495dd9`, run `38343247789` and follow-up exact-head CI runs. **Offline CI is not a Production DB dry run.** Stored canary selection and QA are auditable via the GitHub workflow artifact.

## Exact Production schema-only actions already performed

Project **Plaivra Main `bkwezjxvapaeasfvlhvv`**, PostgreSQL 17.6.1.127; Activity Catalog untouched.

1. First forward migration: repository `20261013040000_food_catalog_plan9_batch_review_authority.sql` (Git blob `b52377cfa44049ab6bff0776b056ea6edb4cc66b`) **applied** in Production under generated identity `20261013034307_food_catalog_plan9_batch_review_authority`.
2. Security review found PL/pgSQL SQL-NULL decision validation gap. Red regression proved missing forward migration; new verification proves omitted `decision`/`expectedMutations` cannot mutate a reviewed batch. Original applied migration remains immutable.
3. Corrective forward-only migration: repository `20261013050000_food_catalog_plan9_review_decision_hardening.sql` (Git blob `11977f6a052ca67fef9b83164bd46b38fe597521`) **applied** as `20261013040648_food_catalog_plan9_review_decision_hardening`. Complete disposable chronological migration replay and rollback-only review RPC SQL verification passed at run `38344452605`. That run failed later only because the new pending migration was not yet in the docs ledger; that documentation has since been reconciled.
4. Production migration count: **132 physical records**, latest `20261013040648`. Repository ledger exact-file `applied` count remains **63**; both Plan 9 migrations are `applied_version_alias`. This distinction is intentional.
5. Live permission and logic readback: `public.food_catalog_review_ingestion_batch_v1(jsonb)`, `SECURITY DEFINER`, owner `postgres`, `authenticated` EXECUTE=true; `anon` and `service_role` EXECUTE=false. `v_action is null`, `v_expected_state is null`, and `v_source is null or v_counts is null` guards active. Existing governance operation idempotency, exact batch/dry-run reconciliation, immutable audit, row lock and CAS remain intact.
6. Security advisor notes intentional `authenticated_security_definer_function_executable` warning. It is not a public edit path: `auth.uid()` must resolve to an active human governance principal with `food.ingestion.review`; service_role/anon denied. Reverify after any future schema change.
7. Live canonical Foods, source records, batch/run, human governance principals/capabilities/audits, generations and search documents all **zero**. Current Catalog Generation pointer remains **NULL**. Released schema compatibility marker was **not** promoted. This is schema-only evidence; no Product deployment or Production Food data write was performed.

## Required separate gates (still CLOSED)

1. **Governance recovery:** The principal table has zero rows; ordinary `food_catalog_manage_governance_principal` requires an active Owner and cannot bootstrap from zero. Recover a real active human Owner through a separately approved, audited maintenance procedure. Never impersonate a principal, invent a user ID or seed a privilege by arbitrary SQL.
2. **1A1 persistent batch/database dry-run:** Re-read Main canonical Food/source/semantic/name/barcode index and current generation at the moment of operation. Invalidate these checksums and rebuild evidence if the snapshot drifted. Obtain explicit authorization for the **exact** registered batch and reconciled DB dry run, separately from schema migration authority.
3. **1A1 draft ingestion:** Human reviewer validates actual DB dry-run reconciliation and exact ManifestContent/semantic/source, then performs CAS review/approve under the newly hardened authenticated-human RPC. Obtain separately approved Production draft ingestion. The service command persists **draft-only**; no automatic activation.
4. **1A1 eligibility and initial generation:** Independent conservative trust/nutrition/source eligibility review, exact Activation Set/Grant approval, and separate initial `NULL -> generation` promotion approval after generation/SearchDocument QA and recovery proof. Zero-energy Foods must not be promoted as reliable nutrition.
5. **1A2:** After first canary is healthy, recapture nonempty canonical index; rerun full 363 Foundation source through the same adapter/matching engine. Preserve 1A1 Plaivra Food IDs through MATCH rather than CREATE; ten invalid-carbohydrate source rejects remain. Obtain distinct DB dry-run, draft ingestion, eligible activation and full generation promotion authorizations.
6. **Closure:** Verify real member search, Diary/Recipes/Saved Meals/Meal Plans/MCP, leases/retries/rollbacks, immutable audit, portability restore, exact-head CI, and independent Planner review before final `PLAN9_COMPLETE_AND_VERIFIED`.

**No action in this evidence register grants any of these data-operation authorities. Do not merge draft PR #188 or deploy Product without a separate explicit release decision.**
