# Nutrition V1 consumer integration — static audit and final-QA scope (N092–N099)

**Snapshot:** 2026-11-20, `feat/nutrition-microtasks-2026-11-20`; **verification type:** source inspection ONLY, no automated test run, render, performance profile or Production member exercise. Findings are not signoff.

## 1. Existing delivery surfaces (N092–N094)

The current product already has a Nutrition V1 API/UI/service layer. Do not build a second Nutrition system or reopen non-Nutrition feature design:

| Surface | Source authority |
| --- | --- |
| Food Catalog / My Foods list and search | `app/api/nutrition/v1/foods/route.ts`; `services/nutrition-v1/server/food-library.ts`; `components/nutrition/food-library/food-library-page.tsx` |
| Source-aware Food selection and personal override | `app/api/nutrition/v1/foods/[foodId]/selection/route.ts`; `services/nutrition-v1/server/food-handoff.ts` |
| Barcode fallback | `app/api/food/open-food-facts/route.ts`; `services/nutrition-v1/server/barcode-lookup.ts` |
| Diary, food log, hydration and weekly view | `app/api/nutrition/v1/diary/route.ts`; `app/api/nutrition/v1/log/route.ts`; `services/nutrition-v1/server/diary.ts`; `components/nutrition/diary/diary-page.tsx` |
| Meal Plan and add-to-plan handoff | `app/api/nutrition/v1/meal-plan/week/route.ts`; `services/nutrition-v1/server/meal-plan.ts`; `components/nutrition/meal-plan/meal-plan-page.tsx`; `lib/nutrition-v1/add-to-handoff.ts` |
| Saved Meals | `app/api/nutrition/v1/saved-meals/**`; `services/nutrition-v1/server/saved-meal-write-authority.ts` |
| Recipe drafts, immutable published versions, cook/resume | `app/api/nutrition/v1/recipes/**`; `services/nutrition-v1/server/recipe-workspace.ts`; `recipe-versioning.ts`; `components/nutrition/cooking/**` |
| MCP authorized Food execution | `lib/mcp/nutrition-v1-food-execution.ts`; `lib/mcp/auth.ts`; `lib/mcp/public-surface.ts` |
| Account data deletion/export | `lib/privacy/account-deletion-worker.ts`; `lib/privacy/data-export.ts`; `lib/privacy/data-export-archive.ts` |

## 2. Static flow observations (not runtime proof)

- The Food list API obtains an eligible authenticated user context, accepts `q,locale/language,scope,market,cursor,limit`, and passes the authenticated `user.id` to the domain list service. Food-library UI carries `nextCursor`, sends typed list requests, has online/offline events and a load-more button. It must be re-verified with real, promoted generation data and empty global Catalog.
- Food-to-consumer selection uses `resolveFoodHandoffWithAuthorities`; source-backed serving choices are distinguished from owner Personal Overrides and from generation serving identities. Reject ambiguous or stale selection; preserve per-generation trust/historical snapshot.
- Meal Plan uses an operation ID and base revision when mutating week/occurrence data; offline queue `lib/nutrition-v1/meal-plan-offline.ts` implements `replayMealPlanMutationExactFirst`, conflict and needs-attention states. Verify stale revision, one-operation replay, multiple tabs and low-connectivity conflict.
- `services/nutrition-v1/server/diary.ts` checks a required `operationId` for logs; `lib/nutrition-v1/water-log-retry.ts` reuses intents only for matching owner/date/amount. Verify real backend idempotency and member isolation, not just client-side operation IDs.
- Recipe queries constrain `user_id` and deleted-state in `services/nutrition-v1/server/recipe-workspace.ts`; `lib/nutrition-v1/recipe-versioning.ts` separates drafts/readiness/version increments. Validate frozen published version and no retroactive history alteration after edit/delete/restore/cooking.
- The barcode route rate-limits requests and returns suggestion-only results when no authoritative catalog/serving binding exists. Do not silently write Open Food Facts details as a trusted canonical Food.
- `components/nutrition/food-library/food-library-copy.ts` has EN/DE/AR strings. `components/nutrition/meal-plan/meal-plan-page.tsx` uses translation `language/dir/locale`. RTL, accessibility, long names and German/Arabic search normalization **require rendered QA**.
- The MCP Food execution path maps current global canonical Food and My Food separately and explicitly refuses ambiguous authoritative serving choices. It currently initializes some MCP Food searching with `locale: "en"`; verify search behavior in DE/AR and intentional language fallback before changing it.
- The privacy deletion worker calls `food_catalog_begin_account_deletion`, disables Auth, handles stored recipe cover paths and other account data. Verify export/deletion coverage, ownership and service-role confines against an isolated disposable environment before any rollout.

## 3. Final Nutrition-only acceptance matrix (N095–N099 → N100–N114)

1. **Food Catalog data:** exact original USDA SHA and source count, 1A1 60/10/10, fresh index, 1A2 80 MATCH + 273 CREATE / 10 rejection historical expectation; source ID idempotency, NULL energy, valid quantity, quarantine and no duplicate source fact. Validate counts against *actual* output, not presumed constants.
2. **Governance:** real Owner bootstrap in separately approved channel; ordinary member/anon/service_role denied review/draft; reconciliation and CAS; last-owner protection, no unauthorized direct row DML.
3. **Generations:** activation eligibility, immutable generation, current pointer CAS, search projection, prior healthy rollback and no leak from draft/quarantine.
4. **Food selection and logging:** global↔My Food, personal overrides, barcode fallback, source-supported serving, wrong-owner denial, expired generation selection, frozen Diary facts and log replay.
5. **Meal Plan/Saved Meals/Recipes:** revision concurrency and offline conflict, shopping projection, recipe draft/publish/restore/purge, ingredient source lineage and cooking timer resume.
6. **Privacy and MCP:** owner scope, OAuth connector scope and revocation, explicit destructive confirmation, export/delete completeness, no arbitrary SQL/admin public tools.
7. **Locale/accessibility:** EN/DE/AR and RTL, keyboard focus and screen reader labels, numeric/bidi formatting, narrow mobile layouts and long names.
8. **Operations:** complete forward-only migration replay in disposable database, no drift of applied migrations, source/release manifests, exact reviewed SHA/provenance, non-mock build and Production smoke after authorized deploy.

**Scope freeze for QA is provisional:** full Plan 9 Foundation publication, G-09 FNDDS adapter and G-10 six-market source approval/implementation are not complete. Accordingly N100's formal start gate, N109 first suite run and N114 release acceptance **cannot yet be attested**. No QA results are fabricated or described as passing.
