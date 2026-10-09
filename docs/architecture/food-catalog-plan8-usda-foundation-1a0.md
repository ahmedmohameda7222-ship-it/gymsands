# Food Catalog Plan 8 — USDA Foundation 2026-04 — Offline 1A0

**Authority:** Food Catalog Plan 8 implementation specification, 2026-10-09. **Status: evidence generated only; not Production-approved.** This branch and Draft PR must not be merged until independent Plaivra Planner review.

## Exact source and licence

- Provider: `USDA_FDC`; dataset: `FoundationFoods`; release/version: `2026-04-30`.
- Official release page: https://fdc.nal.usda.gov/download-datasets/ — Foundation Foods 04/2026.
- Exact official JSON archive: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip
- ZIP: `FoodData_Central_foundation_food_json_2026-04-30.zip`, **469303 bytes**, SHA-256 **`186e988ec542e913f51ef62b86a47758e8cdd0d1dc3889e7b055581f3c09c77a`** (GitHub Actions first-party download proof run `37957166890`).
- One JSON member `FoodData_Central_foundation_food_json_2026-04-30.json`, 6721650 uncompressed bytes.
- Root `FoundationFoods`: **395 array slots; 363 Food objects with dataType=Foundation and 32 null non-record slots**. The null slots are counted but are not Foods; never silently treated as rejected Foods.
- Licence: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/.
- Lock: `data/food-catalog/source-locks/usda-foundation-2026-04.json`; importer `plan8-1a0-v1`; adapter config version `1`; config hash is verified at runtime using stable JSON.
- No raw ZIP or extracted USDA data is committed.

## Architecture and identity

The focused `lib/food-catalog/ingestion/usda-foundation/index.ts` adapter implements `FoodCatalogSourceAdapter` and emits the existing `FoodCatalogCandidateInput`. Normalization, validation, canonical matching, quarantine and deterministic ManifestContent SHA-256 are exclusively delegated to the existing Plan 4 ingestion engine. There is no second framework, Production DB client or migration.

Source record identity is the USDA Foundation numeric `fdcId` string scoped to provider/dataset/version. `fdcId` is **not** Plaivra Food ID. Each record includes a stable, deterministic source-record checksum generated from canonicalized raw JSON fields; exact original archive bytes are pinned by the top-level ZIP hash. Aliases, GTIN, brands and Plaivra canonical semantic signatures are not fabricated. The adapter may attach narrowly supported `raw/cooked/frozen/dried` state evidence only to fully matched comma-separated tokens. The engine preserves no name-only automatic match, and ambiguous canonical indexes quarantine.

## Nutrient mapping

100 g basis, no unit/density guessing.

| Plaivra field | USDA Foundation nutrient IDs | Unit | Policy |
| --- | --- | --- | --- |
| `calories` | 2048, then 2047 | kcal | Atwater Specific before General; **no legacy 1008 fallback** |
| `protein_g` | 1003 | g | Null if absent |
| `fat_g` | 1004 | g | Null if absent |
| `carbs_g` | 1005 | g | Null if absent |
| `fiber_g` | 1079 | g | Null if absent |
| `saturated_fat_g` | 1258 | g | total only; never reconstruct from fatty acids |
| `sugars_g` | 2000, then 1063 | g | declared total-sugar authorities; never reconstruct from individual sugars |
| `sodium_mg` | 1093 | mg | reject unexpected units |

Never average alternate authorities. Explicit measured zero remains zero; absent amount becomes null. Where a numeric zero is explicitly marked below detection/quantification/reporting limit in the available nutrient footnote/derivation evidence, represent its canonical value as null and retain full raw source nutrition. Foundation record nutrient field/LOQ details not recognized as explicit metadata remain a **Planner review limitation**; do not claim laboratory zero classification beyond the evidence. Report chosen nutrient IDs and below-limit count in QA.

## Portions and naming

Only same-`fdcId` USDA `foodPortions` with a distinct portion ID, positive finite amount, nonempty source `measureUnit.name`, and positive finite exact `gramWeight` become source serving evidence. Retain each raw portion and unresolved/ambiguous ID in `sourceServing`. No unsupported cups, pieces, slices, bowls, densities or ml/g equivalents are invented. Display fallback: 100 g.

The complete USDA description is preserved as the source name and candidate name without truncation or speculative formatting cleanup. Identity-bearing qualifiers must not be erased. No AI rewriting or fabricated Arabic variants.

## Taxonomy, market and match snapshot

Exact USDA `foodCategory.description` retained as source taxonomy evidence. Approved Plaivra taxonomy mappings are empty in this batch; unmapped values stay null and appear in QA. No taxonomy drives canonical identity.

USDA/USA origin is retained as source market provenance only. No automatic country-market assignment, no implicit GLOBAL relevance, no locale/timezone/IP inference.

Offline canonical match-index fixture:
`data/food-catalog/source-locks/plan8-1a0-empty-match-index.json`. On 2026-10-09 a **read-only** query against Plaivra Main Supabase Production observed zero rows in `food_items`, `food_source_records`, `food_barcodes`, `food_merge_events`, `food_names`, `food_ingestion_batches`, `food_ingestion_runs`, `food_catalog_generations`, and `food_catalog_search_documents`. Those observations justify the six empty index arrays for this 1A0 snapshot. The snapshot file's stable hash is included in QA. For a future batch with populated Production index, provide a separately reviewed read-only index export. Do not assume that an empty index remains current.

## Reproducible command / deterministic evidence

With repository dependencies installed via `npm ci`, use Node 24 and the existing Vite runner:

```bash
node scripts/food-catalog-plan8-1a0-runner.mjs \
  --zip /absolute/path/FoodData_Central_foundation_food_json_2026-04-30.zip \
  --index data/food-catalog/source-locks/plan8-1a0-empty-match-index.json \
  --output /tmp/plaivra-plan8-1a0-a
```

Run independently a second time with a different `--output`. The command refuses a changed ZIP hash/size, unexpected ZIP member/release, changed adapter config hash, malformed source root and duplicate Food IDs. Outputs: `manifest-content.json`, `qa.json`, `qa.md`, `checksums.json`. There are no timestamps, paths, or run IDs inside manifest content. The only writer is local `fs.writeFile` to the caller-designated offline output path. The dedicated workflow `.github/workflows/food-catalog-plan8-1a0.yml` downloads the source separately, runs full release twice, compares all resulting files and uploads CI review artifacts under `plan8-1a0-offline-evidence-<headSha>`.

## Explicit non-actions, limitations and exit gate

**Not performed:** Production Food writes, Production ingestion batches/runs, Food activation, Catalog Generation creation/promotion, current-generation pointer change, SearchDocuments population, schema compatibility promotion, Production DB migration, Activity Catalog change, FNDDS/Branded import, Plan 9, merge or deployment.

**Open for Planner inspection:** alternate total sugar authorities, absent/ambiguous nutrient LOQ fields, source portion insufficiency, USDA category mapping, conservative unresolved market scopes and source-only semantic identity. These policies intentionally prefer absent evidence to invented precision.

**Do not declare Plan 8 complete until:** exact-head focused tests, complete ingestion tests, lint, typecheck, full required unit suite, appropriate build/DB verification, two independent full-release SHA checks and all required CI pass on the exact final head. Record actual QA metrics/hashes and final run IDs from CI, never predict them. The PR remains Draft awaiting the Planner; Plan 9 remains untouched.
