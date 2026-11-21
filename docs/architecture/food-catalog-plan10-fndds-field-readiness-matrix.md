# Plan 10 FNDDS provider-specific field readiness matrix (N055)

**Not an adapter.** USDA's official general FoodData Central field dictionary has been read and a **dictionary-level FNDDS crosswalk** is recorded below. The actual FNDDS 2021–2023 ZIP bytes, member names, JSON shape and content-specific IDs/values are **NOT independently verified**. Gate G-09 remains closed: Plan 9 Production has no published generation and exact original FNDDS archive/source lock and approval are missing. The existing Plaivra canonical destination schema is verified from local contracts; no guessed numeric nutrient IDs, source record IDs or serving weights are asserted.

## Proven canonical adapter interface

From `lib/food-catalog/ingestion/adapter.ts`: `FoodCatalogSourceAdapter<TArtifact>` has `adapterId`, `adapterVersion`, `describeSource(artifact): FoodCatalogSourceDescriptor`, `toCandidates(artifact): readonly FoodCatalogCandidateInput[]`. Do not add a second Food database, bypass the provider-neutral port or mutate Production during parsing.

From `lib/food-catalog/ingestion/contracts.ts`:

| Canonical target | Exact expected type / accepted decision | Required original FNDDS evidence (upstream field **unverified**) |
| --- | --- | --- |
| Source descriptor | `provider`, `dataset`, `sourceVersion`, `sourceReleaseDate`, `licenseName`, `licenseReference`, `sourceReference`, **`sourceChecksumSha256`**, `importerVersion`, `configChecksumSha256` | locked ORIGINAL USDA FDC FNDDS 2024-10 ZIP bytes, CC0 official source, exact release + separately hashed reviewed adapter config |
| Identity | `sourceRecordId: string`, `sourceRecordChecksumSha256: string|null`, `identityEvidence` with semantic signature/preparation/state/form and optional structured key | stable original survey source row identity and documented code; do **not** promote Foundation NDB number or a common `fdcId` to shared canonical identity |
| Name | `canonicalName: string`; `names[]` with locale/script/role/value; `aliases[]` with locale/value | actual source name and documented role; no inferred German/Arabic name or unlicensed scraped translation; do not duplicate food roots per translation |
| Fat/energy/protein/carbs | `nutrition.calories`, `protein_g`, `carbs_g`, `fat_g`: finite nonnegative `number|null` | source nutrient mapping ID and exact unit, measured/derived meaning, raw provenance and unknown handling; **not** computed 4/4/9 energy or filled zeros |
| Secondary nutrients | `saturated_fat_g`, `fiber_g`, `sugars_g`, `sodium_mg`: `number|null` | independent source nutrient ID + correct grams/mg conversion only when unit is known; `null` when absent, censored or unverified |
| Nutrition basis | `basis_amount: number|null`, `basis_unit: "g"|"ml"|null` | exact source-reported quantity/basis; never infer density, household-to-gram conversions or 100g basis from a label |
| Serving | `servings[]`: `servingKey`, `amount: number|null`, `unit`, `gramWeight: number|null`, `milliliterVolume: number|null`, `label`, `sourceEvidence` | source's actual portion identity, amount/measure and gram-weight or supported volume; ungrounded household measures omitted/quarantined; distinct source portions never share a key |
| Taxonomy | `taxonomyEvidence[]` taxonomy, original code, allowed mapped taxonomy ID | documented FNDDS food category version; `mappedTaxonomyId:null` until reviewed controlled mapping, never assign arbitrary categories |
| Brand/GTIN | `brandName: string|null`, `gtins: string[]` | only genuine source-backed brand/GTIN plus separate redistribution/trademark rights; never create UPCs or interpret generic survey codes as GTIN |
| Market | `marketScopes[]` country/region code + relevance, `globallyRelevant:boolean` | separate country relevance approval; US-based USDA source alone is **not** evidence an item is marketed in US, DE, GB, EG, SA or AE |
| Audit raw | `sourceNutrition: unknown`, `sourceServing: unknown` | immutable raw source nutrient/portion and field dictionary samples with source-row checksum, null slots and duplicate anomalies retained for audit |

## Parser and normalization prerequisites

1. Obtain **original** FNDDS archive, exact ZIP bytes/digest, contents and official field dictionary; verify release 2024-10-31, member names, root JSON and record shapes. Log actual null-slot, duplicate ID and field missingness counts; **no fabricated counts here**.
2. Document every selected FNDDS nutrient **ID+name+unit+derivation**, explicit unknown reasons and source release changes, all based on observed original rows. Foundation configuration's nutrient ID arrays in `lib/food-catalog/ingestion/usda-foundation/index.ts` are **not** automatically portable to FNDDS.
3. Distinguish household portions and cooked/composite dishes, with positive source-backed portion weights; retain recipe/composite source relationships as provenance, not editable Plaivra Recipe dependencies. Preserve raw portion codes; don't infer milliliters from grams.
4. Normalize source identities/names/aliases with `lib/food-catalog/ingestion/normalize.ts`; validate `validateFoodCatalogCandidate` for `invalid_nutrition`, `invalid_basis`, `invalid_alias`, `invalid_serving`, `invalid_taxonomy_mapping`, GTIN checks and calorie/macro discrepancy **warning**. A warning is not automatic permission to invent corrected nutrition.
5. Match using `decideCanonicalMatch`, with separately locked Foundation/1A2 index, redirect roots and FNDDS source identity. Quarantine conflicts/possible duplicates. Emit deterministic `FoodCatalogDryRunManifestContent` expected counts, exact manifest SHA; repeat same candidate selection to prove two-pass equality before any database dry-run.

## Stop conditions

Original archive/dictionary absent; different ZIP release; FNDDS nutrient ID or source unit unverified; missing basis/portion proof; source record has contradictory identity; G-09 not explicitly approved; or human duplicate-review authority missing → **NO SOURCE ADAPTER IMPLEMENTATION / NO FNDDS INGESTION**. This document supplies validated *destination schema* only; upstream mapping and approval remain open.


## USDA official FDC field dictionary crosswalk — 2026-11-21

**Evidence source:** USDA FoodData Central's own [Download Field Descriptions / FNDDS crosswalk dictionary](https://fdc.nal.usda.gov/portal-data/external/dataDictionary), consulted directly on 2026-11-21 (PDF; its overall field definitions are documentary specifications, **not a schema validation of the 2024 ZIP JSON**). Separate [USDA Downloadable Data](https://fdc.nal.usda.gov/download-datasets/) lists Survey / FNDDS 2021–2023, release **10/2024**. The original `FoodData_Central_survey_food_json_2024-10-31.zip` was not downloaded/rehashed: exact compressed bytes, checksums, parsed members, IDs and row counts remain unknown.

| Official documented field/table | Verified documentation meaning | Source-specific adapter decision still requiring actual archive |
| --- | --- | --- |
| `food.fdc_id`, `food.data_type`, `food.description` | FDC cross-type food identity, data type and description | Preserve original FDC ID and release; reject any `data_type` not actually Survey/FNDDS. Do not conflate FDC ID with canonical Plaivra ID |
| `survey_fndds_food.fdc_id`, `food_code`, `wweia_category_number`, `start_date`, `end_date` | FNDDS has its own `food_code` and survey period/category metadata | Preserve FNDDS code **alongside** FDC ID, source release and dated period. The code is neither a Foundation NDB number nor a GTIN; no code values or uniqueness across historical cycles were inspected |
| `food_nutrient.fdc_id`, `nutrient_id`, `amount` joined to `nutrient.id`, `name`, `unit_name`, `nutrient_nbr` | `amount` documented per **100g food**, in the nutrient's declared unit | Map calories/macros/micronutrients **only** after actual source nutrient ID+unit lookup; distinguish kcal vs kJ, g vs mg. Missing/invalid amounts remain unknown `null`; no 4/4/9 substitute or invented numeric nutrient IDs |
| `food_portion.id`, `fdc_id`, `seq_num`, `portion_description`, `modifier`, `gram_weight` | For Survey/FNDDS, `portion_description` is household text, `modifier` is the portion code, and `gram_weight` is its measured/source-recorded mass. Crucially, the separate `amount` field is **NOT DEFINED for Survey/FNDDS** and `measure_unit_id=9999` is a placeholder, not a real household unit | Stable serving key must derive from source-backed portion identity, label/code and actual weight evidence. **Never map `food_portion.amount` to Survey serving quantity or `9999` to a real unit**, nor infer grams/milliliters from description alone. Unknown portion mass stays `null` or is quarantined according to approval |
| `wweia_food_category.wweia_food_category_code`, `wweia_food_category_description` | Survey-specific WWEIA taxonomy | Preserve original code and only map to approved Plaivra taxonomy after an explicit reviewed mapping table. Do not map broad text labels to canonical IDs heuristically |
| `input_food.fdc_id`, `fdc_id_of_input_food`, `seq_num`, `amount`, `sr_code`, `sr_description`, `unit`, `portion_code`, `portion_description`, `gram_weight`, `retention_code`, `survey_flag` | Ingredient/provenance relationships for composite Survey foods and source processing metadata | Preserve raw ingredient graph as **auditable source provenance**, not as a new editable Plaivra Recipe. Validate actual amounts/weights/retention data in original rows before any shopping or nutrition transformation |

**Negative adapter requirements from the dictionary:** (1) reject Foundation/SR nutrient ID assumptions for FNDDS until the archive's actual nutrient-ID dictionary is checked; (2) no survey `food_portion.amount` mapping; (3) no market-specific published eligibility or duplicate canonical identities merely from `food_code`/common names; (4) no unit/density inference; (5) preserve original FNDDS composite graph and date period as provenance. Distinguish source-missing numeric values from measured zero, and preserve historical frozen nutrition.

**Unresolved acceptance:** inspect/hash original USDA ZIP, confirm its exact 2024 JSON members and nesting, lock parser/config checksums, deterministic 1B0/1B1 dry-run, human source/legal/duplicate approvals and G-09 Plan 9 precedence. This crosswalk **reduces the documentary mapping gap only**. It authorizes no adapter rollout, database dry-run (which writes), QA PASS, promotion or Production write.
