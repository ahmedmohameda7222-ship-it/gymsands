# Food Catalog Population Reconciliation

Status: approved prior decisions consolidated for planning; no implementation or Production population is authorized by this file.

## Runtime
- Canonical Food Catalog stays in Plaivra Main Supabase for the current stage.
- External providers are ingestion, enrichment, barcode fallback, or research sources only.
- Normal text search must remain local and useful if an external provider is unavailable.
- Food Catalog is a logical service boundary so storage can move later without changing Food IDs or consumers.

## Approved sources
- USDA FoodData Central is the principal open source for broad generic-food coverage and is especially important for USA coverage.
- Open Food Facts is the initial on-demand barcode fallback when Plaivra has no local barcode match; it is not the normal text-search authority and is not bulk-copied wholesale into the canonical Plaivra catalog.
- GS1 may support product/barcode identity where useful; it is not the bulk nutrition database.
- V1 does not require a paid provider. Source reuse terms must be checked before each bulk ingestion, with provenance and attribution retained as required.

## Markets
Primary launch-depth markets, latest approved order:
1. USA
2. Germany
3. UK
4. Egypt
5. Saudi Arabia
6. UAE

Immediate expansion:
- Canada
- Australia
- Austria
- Switzerland
- Netherlands
- Kuwait
- Qatar

Then broad coverage across the rest of the EU and GCC.
Asia-specific packaged-food deep localization is outside V1.

The older Egypt/Germany/USA Tier-1 decision is preserved as a depth rule: USA may rely more on USDA, while Egypt and Germany require deeper local curation. The later six-market Primary list supersedes the older three-market rollout list.

## Market model
Each Primary market needs useful coverage across:
1. Global Generic Core
2. Regional/country-relevant foods
3. Local branded/packaged products where approved source data is available

Germany and Egypt must not be simple translations of a US catalog.
Saudi/UAE use an Arabic/Gulf Core plus country extensions; common Gulf foods are not duplicated merely because several countries use them.
Country/formulation variants are separate only when composition, formulation, preparation, physical form, brand/product identity, or nutrition meaning materially differs.

## Identity and localization
- Canonical Food identity is language-neutral.
- EN, DE, and AR are launch/search languages.
- Support Arabic normalization, German alternate spellings, useful curated Arabizi aliases, brands, and exact barcode identity.
- Do not duplicate a Food only because language, country relevance, alias, or source differs.

## Nutrition and servings
- Solids normally normalize to per 100 g where supported.
- Liquids normally normalize to per 100 ml where supported.
- Never infer 100 ml = 100 g without density evidence.
- Never invent piece/slice/bowl/plate/cup conversions.
- Core nutrition: kcal, protein, carbs, fat, saturated fat, fiber, sugars, sodium.
- Missing nutrition remains null; missing is never zero.

## Provenance, duplicates, lifecycle
Every shared catalog record retains source lineage and enough source metadata to audit where it came from.
Duplicate classification remains MATCHED / POSSIBLE_DUPLICATE / DISTINCT.
Merges are non-destructive, preserve redirects and lineage, and never rewrite frozen historical Diary/Meal Plan/Saved Meal/Recipe snapshots.
User-created Foods are never silently merged into the shared catalog.
Publish and Verify are separate decisions.

## Barcode order
1. exact local Plaivra barcode lookup;
2. approved external fallback if no local match;
3. external results are not silently promoted into canonical data;
4. persisted external data must pass source eligibility, provenance, validation, normalization, and duplicate/canonicalization rules.

## Population pipeline
Approved source -> source adapter -> normalization -> validation/anomaly checks -> duplicate reconciliation -> provenance preservation -> privileged canonical write -> search/barcode projection refresh -> QA.

Large datasets are not hardcoded in app source and are not giant hand-written seed migrations. Ingestion must be repeatable and replay-safe.

## Launch readiness
Population is not complete until all six Primary markets have useful representative coverage, multilingual search works, provenance is present, duplicate/replay behavior is controlled, serving/nutrition semantics are correct, local market intent ranks sensibly, and the ingestion process is repeatable and auditable.

No Production population is authorized until the specific ingestion batch is separately approved.
