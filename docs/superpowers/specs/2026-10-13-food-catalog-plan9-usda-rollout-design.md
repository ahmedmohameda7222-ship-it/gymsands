# Food Catalog Plan 9 — USDA Foundation Production Rollout Design

**Authority:** Approved Plan 9 implementation assignment, 2026-10-13. **Status:** implementation; no Production Food data operation approved.

## Objective and immutable constraints

Publish the locked USDA Foundation `2026-04-30` release through the existing Plan 4 ingestion, Plan 3 activation, immutable generation and generation-aware search authorities. Preserve provider-independent canonical Food IDs, versioned FDC source records, USDA NDB semantic identity, exact source-backed nutrition, nulls and servings. The existing Food Catalog service remains the only consumer boundary. No Activity Catalog mutations, new provider, SQL bypass, geographic availability inference, or Plan 10.

Source archive: `FoodData_Central_foundation_food_json_2026-04-30.zip`, 469303 bytes, SHA-256 `186e988ec542e913f51ef62b86a47758e8cdd0d1dc3889e7b055581f3c09c77a`. Importer `plan8-1a0-v2`; do not remap nutrient authorities. 2048 -> 2047 -> null energy, no legacy 1008, no 4/4/9. Ten negative-carbohydrate rows remain rejected.

## Existing Production authority (read-only inspection 2026-10-13)

Main project `bkwezjxvapaeasfvlhvv`; main SHA `c07b9a2041e39d9e2e69d040d26e8875cb165aed`. The Food, source, batch, run, generation and search tables contain zero rows; current-generation pointer is NULL. Governance principals/capability assignments also contain zero rows. An authenticated human batch review/approval command does **not** exist; current Plan 4 ingestion functions are service-role-only. The current batch trigger requires a completed and successfully reconciled exact database dry run before review->approved. Existing direct service-role batch mutations are blocked. A missing governance bootstrap/active owner is not an excuse to impersonate a principal.

## 1A1 canary design

A deterministic, source-category-stratified **80 accepted Food** subset from the original 363 Foundation records:
- 60 with selected authoritative calories, protein/fat/carbohydrate, valid 100 g basis, stable NDB identity, no unresolved canonical conflict.
- 10 accepted Foods with no selected authoritative calories; preserve null.
- 10 other distinct accepted evidence-edge Foods with missing optional nutrients, missing/unusable source portions or unresolved NDB evidence; never manufacture replacements.

Within each cohort, sort source categories lexically; round-robin categories, sorting ties by numeric fdcId. Cohorts are disjoint. If the actual accepted corpus cannot fill any quota, fail closed with measured eligible counts. Keep source description/category, raw and normalized NDB, identity status, cohort and fdcId in offline selection QA. Selection checksum is independent of the 1A0 manifest checksum. Run the existing adapter and matching engine again on the selected *original source records* and on a freshly captured, exact read-only canonical index; never splice a full-release manifest. A re-run with changed source, index or config must produce different evidence.

For canary match-index, use the explicit dated Production snapshot committed under `data/food-catalog/source-locks/`; immediately recheck Production against the snapshot before any authorized DB dry run, invalidating evidence on drift. On 1A2, export a **new** index reflecting the real 1A1 result. Never reuse the empty canary index after Production ingestion.

## Review and Production authority

A narrow authenticated human review command must:
1. Authenticate `auth.uid()` and require an active governance principal with specific human review capability; service_role, anon and ordinary members are refused.
2. Lock the exact semantic batch; verify source, importer/config SHA, exact manifest SHA, batch semantic SHA and expected counts.
3. For approval, require a completed exact reconciled **database** dry-run (GitHub offline QA does not qualify), with same source/run/manifest/semantic binding.
4. Use existing governance operation/idempotency/audit infrastructure, CAS review-state transitions and append-only evidence. Never expose generic row-editing.
5. Require an established governance owner and recovery-safe principal bootstrap through the approved governance path; zero principals is an **actual blocker** until authorized recovery/bootstrap.
6. Prevent direct service_role/client review-state flips and immutable-evidence edits.

A schema migration is allowed by this Plan 9 assignment only after a complete repo migration, clean chronological replay, RLS/grant/trigger audit, adversarial tests and recovery checkpoint. Migration authorization **does not** authorize registering any Production batch/run.

## Operational sequence and separate gates

A. Verify exact live snapshot, source lock, 1A1 cohort and twice-replayed QA. Present batch registration/dry-run decision package, seek **exact approval**, then register/reconcile the DB dry run through the trusted command service.
B. Present exact 1A1 draft-ingestion package and seek approval; ingest only drafts with leases, idempotency and reconciliation, read back.
C. Evaluate conservative eligibility, obtain exact Activation Set/Grant approval, activate eligible subset. Create and validate immutable candidate generation and SearchDocuments; obtain separate exact promotion approval. First pointer transition is NULL -> generation with no previous healthy generation, so prove bootstrap recovery.
D. Verify actual member search/read/Diary/Recipes/Saved Meals/Meal Plans/MCP and no draft exposure.
E. Rebuild **full** 363-row 1A2 manifest against fresh canonical index; existing 1A1 rows must MATCH same Plaivra IDs, not CREATE duplicates. Expected 10 negative-carbohydrate rejects remain rejected. Recalculate all counts and checksums.
F. Independently approve 1A2 DB dry run and draft ingestion, then exact eligible activation and independently validated full-generation promotion. Preserve canary membership and ID continuity; recover via prior healthy generation if needed.
G. Independent security, concurrency, integration, build/CI, backup-restore and Production acceptance review.

No automatic activation of all accepted Foods. Missing calories and conflicting source evidence cannot be published as reliable nutrition. Do not fabricate taxonomy, market scopes, alias or source-serving conversions. An accepted draft, an activation grant and a searchable published Food are distinct states.

## Verification and truthful closure

Validation includes TDD, full-source twice-identical replay, provider-neutral regressions, migration replay, privilege/RLS tests, lease/retry/concurrency, activation/grant and generation/search contracts, nullable nutrition and consumer snapshot checks, production readbacks, exact-head CI and actual member-facing checks. Preserve all failed or partial evidence.

Closure disposition is only `PLAN9_COMPLETE_AND_VERIFIED`, `PLAN9_AWAITING_EXACT_PRODUCTION_APPROVAL` or `PLAN9_BLOCKED` and must identify actual SHA, PR, migration ledger, batch/run/reconciliation, generation pointer and search evidence; never infer operations from code or offline QA.
