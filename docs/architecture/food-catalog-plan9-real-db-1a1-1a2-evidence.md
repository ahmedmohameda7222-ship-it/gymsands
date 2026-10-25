# Plan 9: real original USDA 1A1 → complete 1A2 disposable DB integration evidence

**Status:** exact original-source integrated SQL/command-service proof **GREEN**; **disposable only**. No Main Production Food batch/dry run, ingestion, activation or generation was authorized by this test.

- PR: [#188](https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/188).
- Actual original-source test: [GitHub Actions run 38359339102](https://github.com/ahmedmohameda7222-ship-it/gymsands/actions/runs/38359339102), commit `1936ecca9417d94e70a64c0be5ac9e62903d3e6b`; workflow job `115169555788`, completed **success**.
- Test implementation: `scripts/food-catalog-plan9-real-db-e2e.ts` + disposable localhost:54322-only RPC transport + Vite TS runner, with chronological migrations and exact ZIP source-lock check on the GitHub Ubuntu runner. Command store is the existing Supabase RPC store connected to actual PostgreSQL RPCs; **not a mocked command store**. The test human is a disposable `auth.users` fixture, **not** a Production governance Owner.
- Source ZIP: SHA-256 `186e988ec542e913f51ef62b86a47758e8cdd0d1dc3889e7b055581f3c09c77a`; parsed exactly **363 original Foundation Foods**.
- 80-Food selection: `b3b4719102d936d1ddf9ffe9aacdb3a351514a0e54f95ea012431980647cf4bf`.
- 1A1 manifest: `10db18aaeae621b4618e868a4f47de9c02ab3ea876b407b7064f54cf31674a33`.
- 1A1 semantic identity: `6e57f559c0d31785df00f5ce61c1f2920e8854ecb372d76468e8dc0a852a8f06`.
- Actual fresh, **nonempty** 1A2 canonical-index processing full-release manifest SHA-256: `139013778103086d65a4046f23675689039a9d30d0ddf3c595c2f1e7370f0eaf`.
- Actual 1A2 semantic identity: `1e0e1437181c4475bc7cb26b0990a410323aaa2217e89388eaa609f213fdd84c`.
- 1A2 exact classification: **363 input, 353 accepted, 80 MATCH, 273 CREATE, 10 rejected, 0 quarantined, 0 possible duplicate**.

## Actual disposable dry-run and ingestion run IDs

| Phase | Disposable batch | Database-authoritative dry-run (completed) | Approved draft-ingestion (completed) |
| --- | --- | --- | --- |
| 1A1 | `030c230b-9e2d-463f-81bd-1865ca60f3bd` | Run `d84aa2ca-68e7-4cff-8e87-470199482fc9` / reconciliation `1602b86c-1f29-4061-9610-544f5c64d7f9` | Run `f480d33c-ec5a-43d2-b8c4-2e46b7bd4acb` / reconciliation `73523d7a-20b0-4860-9f44-4c6aa3fcf705` |
| 1A2 | `7887904a-d80f-4f4b-a760-cb6b29327834` | Run `da06d457-b0bf-473e-983b-da282f6aa2d3` / reconciliation `455f4677-e029-45b3-9c1e-e82ea5f9739d` | Run `08244773-8080-49a2-91a8-5cbd3e9a6bfa` / reconciliation `3e1657a3-077d-449c-b8f8-63249ceedc8d` |

Both dry runs required actual per-record staging, exact reconciliation and **completed** run status before the isolated real authenticated test-human review and approval RPC. The actual 1A1 and 1A2 approved draft-only executions completed through the existing command service and PostgreSQL store.

## Actual table counts and invariants

| Table or invariant | After 1A1 draft | After 1A2 draft |
| --- | ---: | ---: |
| `food_items` | 80 | **353** |
| `food_source_records` | 80 | **363** |
| `food_ingestion_batches` | 1 | 2 |
| `food_ingestion_runs` | 2 | 4 |
| `food_ingestion_manifest_records` | 80 | 443 |
| `food_ingestion_materialized_results` | 80 | 433 |
| `food_nutrition_revisions` | 80 | **353** |
| `food_names` | 80 | **353** |
| `food_serving_options` | 76 | **375** |
| `food_catalog_generations` | 0 | **0** |
| `food_catalog_search_documents` | 0 | **0** |
| Current Catalog Generation | NULL | **NULL** |

All `food_items` lifecycle statuses were confirmed **draft**; 1A1 contains exactly **10 nullable calories** nutrition revisions. All 80 previously imported sources remained bound to the same exact source row IDs and canonical PLAIVRA Food IDs in 1A2. No existing canary name, nutrition or serving fact duplicated on cross-batch MATCH. Exact operation replay in either phase did not add Foods or immutable facts. No generation promotion or search indexing occurred.

## RED root cause and minimal forward-only GREEN correction

The uncorrected real test [38358309988](https://github.com/ahmedmohameda7222-ship-it/gymsands/actions/runs/38358309988) produced: for the **same original 80 sources**, nutrition **80→160**, names **80→160**, servings **76→152** on 1A2 cross-batch MATCH, despite preserving canonical IDs. The Plan 4 persistence RPC's idempotency guard previously covered only `food_ingestion_materialized_results` **within the same batch**. It did not recognize a previously materialized immutable versioned source record **across batches**.

New repository migration `20261013060000_food_catalog_plan9_cross_batch_source_fact_idempotency.sql` (Git blob `ff074d50fa1df4ab250a61f68568e0a54dfb7441`) retains the existing RPC code while guarding repeat immutable source-fact writes when the exact source record + canonical Food ID already has an earlier materialized result. **New batch participation/materialization is still recorded.** The original applied Plan 4 and Plan 9 migration bytes were never edited.

After clean disposable replay and the GREEN full test, this **schema-only** migration was applied to Main Production once as generated `20261013070122_food_catalog_plan9_cross_batch_source_fact_idempotency`. Production now has 133 physical migrations; 0 Food rows/batches/runs/principals/grants/generations/search documents; current pointer NULL; compatibility marker `20260724232734` unchanged.

## Human review security evidence and residual finding

The E2E executed the actual `public.food_catalog_review_ingestion_batch_v1(jsonb)` as an authenticated disposable human with explicit `food.ingestion.review` grant. Test assertions rejected anonymous, service-role and ordinary-member/forged-actor calls; missing authenticated identity; tampered manifest checksum; reused operation-ID with changed review semantics. It verified exact review→approve transitions, CAS, review replay, database dry-run binding and completed reconciliation, and that draft ingestion followed valid approval. The approved Main schema RPC remains postgres-owned `SECURITY DEFINER` with empty search_path and EXECUTE `authenticated=true`, `anon=false`, `service_role=false`. The existing generic Supabase Security Advisor warning `authenticated_security_definer_function_executable` remains intentional **only within these tested safeguards**; it has not been falsely marked resolved.

## Authorization boundaries still CLOSED

No real human active governance Owner exists in Main Production. See `docs/architecture/food-catalog-plan9-initial-owner-recovery-decision.md` for the narrowly scoped, separate, audited approval package. The standalone disposable fixture is not and must never become an actual Production Owner. Each persisted Main Production 1A1 database dry run, exact human batch approval, draft ingestion, eligible activation, first-generation publication, and full 1A2 rollout still require separately verified exact authority.

**Result:** Real disposable E2E closed the known 80/353-source engineering persistence defect. **Not** actual Production Food Catalog acceptance, not merge approval, and not Plan 9 completion.
