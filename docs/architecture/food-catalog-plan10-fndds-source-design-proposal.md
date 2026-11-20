# Plan 10 / FNDDS 1B — proposed source-to-canonical contract (G-09 NOT APPROVED)

**Status:** evidence-backed design preparation only; no adapter implementation, schema mutation or FNDDS import authorized before healthy Plan 9 or an independently approved sequencing exception.

## Upstream authority and source choice

USDA FoodData Central lists the **FNDDS 2021–2023, October 2024 JSON release** as the download type `FoodData_Central_survey_food_json_2024-10-31.zip` at https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip . FNDDS differs materially from Foundation: FNDDS addresses survey-reported composite foods and portion weights, whereas Foundation primarily covers analytically observed individual commodity foods. Release and public-domain CC0 context: https://fdc.nal.usda.gov/download-datasets/ and https://fdc.nal.usda.gov/data-documentation/. **Archive bytes, exact SHA, JSON top-level structure, counts and field cardinality are not yet independently retrieved in this session.** Never copy an unverified third-party checksum, fabricate a row count or select a later release without a new source-lock decision.

The Plan 9 lock `USDA_FDC / FoundationFoods / 2026-04-30 / plan8-1a0-v2` remains immutable. Plan 10 must introduce a distinct source descriptor, importer version, config checksum and versioned source-row IDs. No schema rewrite or second Food Catalog.

## Proposed adapter contract against actual code

Reuse `lib/food-catalog/ingestion/adapter.ts`, `contracts.ts`, `engine.ts`, `matching.ts`, `validate.ts`, `manifest.ts`, `quarantine.ts`, `services/food-catalog/server/ingestion-command-service.ts` and the existing CAS-aware generation domain service. The generic normalized candidate requires:

- `FoodCatalogSourceDescriptor`: `provider=USDA_FDC`, `dataset=FNDDS`, version/release, official license/source references, exact ZIP SHA and importer/config checksum.
- Distinct immutable **FNDDS source-record ID**, preserving original FDC Food ID and survey food code where available. Cross-type `fdcId` or a shared name **must not** automatically imply the same canonical Food.
- `FoodCatalogNutrition`: nullable `calories`, protein, carbohydrates, fat, saturated fat, fiber, sugars, sodium; explicit source nutrient IDs and mapping version. Never invent energy from 4/4/9, zero from missing or basis-unit conversion from an ungrounded density.
- `FoodCatalogServingEvidence`: only positive source-backed amount plus gram weight or milliliter volume; keep display label and source portion identifier. No fabricated cups, plates, slices or recipe yields.
- Survey recipe/composite source relationships should be retained as **provenance**, not directly collapsed into a canonical ingredient/Recipe relationship without explicit verified semantics.
- `FoodCatalogIdentityEvidence` state, preparation, form, semantic signature, possible-duplicate status; `FoodCatalogNameEvidence` for source and curated aliases. Never manufacture country relevance from language or origin.
- `CanonicalDecision` `match/create/possible_duplicate/reject`; source evidence conflicts must be quarantined for human review. Preserve redirect lineage, exact source facts, historical frozen Diary/Meal Plan/Recipe snapshots and idempotency across 1A1→1A2→1B.

## Input mapping prerequisites (before coding)

Read actual official JSON member names/schema and archived field dictionary; define exact parser/JSON validation with bounded sizes, null slots, nutrient unit normalization, analytical vs calculated source metadata, duplicate source IDs, likely survey composite/portion anomalies, and unknown handling. **No field names or nutrient IDs are asserted without the downloaded original data and data dictionary.** Map only actual documented fields, record warnings/rejections; return deterministic manifest and checksum.

## Staged decision gates

- **1B0 (offline)**: official archive SHA+bytes locked, deterministic parser/selection, duplicate/missing-energy/portion edge stats, same-index two-pass byte parity, no Production write.
- **1B1**: representative FNDDS canary designed after Plan 9 generation is healthy; *separately authorized* DB dry run, human review, draft, eligibility, activation, generation promotion.
- **1B2**: re-read canonical index after 1B1, full-version reconciliation, same-source idempotency and preserved existing canonical IDs, with separate exact permission at each step.
- **Final Nutrition-only QA** must exercise RLS/owner boundaries, duplicate 1A1→1A2→1B cases, null nutrition and portions, CAS/concurrency, source immutability and member-facing generation search.

**G-09 unresolved:** approved Plan 9 prerequisite has not passed (Production Foods still 0). This document is not authority to implement N056–N059 or to execute N118–N120.
