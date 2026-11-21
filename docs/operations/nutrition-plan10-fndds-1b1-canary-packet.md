# Plaivra Plan 10 — FNDDS 1B1 representative canary decision packet (N060)

**State: DESIGN ONLY / G-09 BLOCKED.** This document has no source-record identifiers, batch/checksum, active-generation permission, Owner principal or release authority. It cannot itself authorize any data write, schema change, activation or promotion. The exact original FNDDS 2021–2023 archive (`FoodData_Central_survey_food_json_2024-10-31.zip`) and its bytes/SHA are still unverified. Plan 9 Production currently has **0** Food items, **0** catalog generations, **0** authorized governance principals and `NULL` current generation (read-only 2026-11-21 02:32 UTC).

## 1. Selection: postpone exact IDs until verified source bytes

After an exact FNDDS lock, native field dictionary and deterministic 1B0 manifest are verified, select a **small, bounded, representative, source-backed** set of actual FNDDS records with traceable source IDs. The matrix is a coverage target, **not a claim those examples exist in the unexamined archive**:

| Class | Proposed source evidence | Required decision / negative test |
| --- | --- | --- |
| Basic survey-reported single food | explicit original FNDDS ID, name, nutrient basis, portion weight | keep nutrient unknowns `null`, no fabricated 100g / quantity |
| Survey-reported mixed or composite dish | original composite identity and documented composition provenance | never silently convert to editable Plaivra Recipe or infer an ingredient graph |
| Multiple portions / household measures | raw portion identifiers, labels and **source-backed** gram weights | reject an ungrounded cup/bowl/volume or duplicate serving key |
| Sparse/missing nutrient data | actual source nutrient gaps and analytical metadata | no missing calorie to zero, no 4/4/9 fill |
| Potential Foundation overlap | same-index Foundation 1A1/1A2 identity index and distinct FNDDS source-record identity | `match` only by supported evidence; `possible_duplicate` quarantined, preserve existing canonical IDs |
| Conflicting duplicate-name or identity | source-backed identity, names, semantic/preparation evidence | distinct preparations/forms never merged by display name alone |
| Source-invalid / anomalous record | actual invalid basis, impossible portion, duplicate original key or malformed nutrient | reject/quarantine with stable reason codes; cannot be activated |

If any class cannot be sourced from verified archive bytes, mark it `not represented` with rationale rather than inventing a record, name, FDC ID or mandatory numerical coverage threshold.

## 2. 1B0 must produce a pinned, reviewed offline manifest

Use the existing `FoodCatalogDryRunManifestContent` contract in `lib/food-catalog/ingestion/contracts.ts` with `FoodCatalogSourceDescriptor` (`provider`, `dataset`, exact `sourceVersion`, `sourceReleaseDate`, `licenseName` and references, **original archive SHA256**, `importerVersion`, `configChecksumSha256`). Every candidate must retain `sourceRecordId`, `sourceRecordChecksumSha256`, source nutrition/serving and localized/identity evidence. Report `input`, `accepted`, `rejected`, `matched`, `created`, `possibleDuplicate`, `quarantined` with the actual manifest checksum and deterministic repeated-pass equality. Never treat approximate archive size or third-party hash as byte verification.

A **new** FNDDS source descriptor and namespace must not overwrite Plan 9 Foundation source lock or merge FNDDS IDs with Foundation IDs by `fdcId` alone. Candidate identity choices are `match`, `create`, `possible_duplicate`, `reject` under `decideCanonicalMatch` (`lib/food-catalog/ingestion/matching.ts`). Source index must be read **fresh** immediately before approved draft work to reject a stale Foundation/1B0 baseline.

## 3. Decision and operation sequence — NOT APPROVED

1. Verify independent Plan 9 1A1/1A2 healthy member-facing published generation and owner/governance recovery, or record a specifically reviewed G-09 sequencing exception; independently authorize this data source/adapter and the original locked bytes.
2. Review 1B0 offline canary manifest, quarantine and expected mutations; obtain human decision for each duplicate/invalid/ambiguous FNDDS source record. Record exact manifest checksum, review principal, policy and operation namespace.
3. **Separately authorize** an idempotent **database dry-run**, knowing that the actual `executeFoodCatalogDatabaseDryRun` in `services/food-catalog/server/ingestion-command-service.ts` **persists** batch/run/source/review evidence and is not a read-only transaction.
4. After reviewing persisted dry-run evidence, **separately authorize** `executeApprovedFoodCatalogDraftMutation` with `reviewState=approved` and the exact original manifest; do not bypass lease/idempotency, expected mutation counts or quarantine.
5. Independently review candidate Food lifecycle and `buildActivationManifest`; require a human approval of each activation and `sourceLegalAccepted`/blocking counts; call `createActivationSet` then `grantActivationSet` only in their approved phases.
6. Build/validate a complete immutable generation containing retained Plan 9 foods and approved new FNDDS rows; verify search documents and frozen historical consumer snapshot behavior. Do not activate a partial generation.
7. Independently authorize promotion with `promoteCatalogGeneration` and **exact** `generationId`, checksum, validation report ID/checksum, `expectedCurrentGenerationId` (including explicit `null` only for genuine bootstrap) and `ControlPlaneActorContext`. Compare-and-swap mismatch stops; no blind replay or overwrite.
8. Confirm actual current generation pointer, stable canonical IDs, source lineage, search in EN/DE/AR, Food→Diary/Meal Plan/Recipe/Saved Meal frozen history and rollback readiness using actual test data and approved QA accounts. Record audited completion event.

## 4. Acceptance / rollback fields (to fill from future actual evidence)

**Required but unavailable now:** source ZIP bytes and digest; extracted schema/record IDs; 1B0 pass-1 and pass-2 checksums; canonical match-index checksum/time; approved canary IDs; real nominated Owner principal and authority references; observed input/quarantine/match/create counts; reviewed manifest digest; dry-run run/batch IDs; activation-set/grant IDs; immutable generation/checksum/validation report; exact existing current-generation ID; promoted event ID; observed search/consumer acceptance; reviewer signature/time.

For rollback, retain previous generation and promotion event/validation report IDs. The actual `rollbackCatalogGeneration` contract requires `expectedCurrentGenerationId`, `targetGenerationId`, `targetGenerationChecksumSha256`, `targetPromotionEventId`, `targetValidationReportId`, `targetValidationReportChecksumSha256` and validated actor/operation ID. `revokeCatalogGeneration` is distinct and is not a substitute for rollback. No rollback operation is preauthorized by this packet.

**Gate disposition:** N060 source design prepared, **NO LIVE EXECUTION**. G-09, original ZIP verification, final Nutrition-only QA G-11 and separate operation approvals remain outstanding.
