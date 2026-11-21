# Plan 10 FNDDS provider-specific field readiness matrix (N055)

**Not an adapter; upstream source field names/IDs are NOT verified.** Gate G-09 currently closed because Plan 9 Production has no published generation and original FNDDS 2021–2023 ZIP bytes/dictionary have not been obtained. This document maps only the **verified existing Plaivra canonical fields** to evidence the future approved source adapter must prove. No guessed upstream JSON shape, USDA survey food code, nutrient ID or unit mapping is asserted here.

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
