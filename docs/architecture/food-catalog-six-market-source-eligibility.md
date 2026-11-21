# Food Catalog six-market launch depth — source and mapping decision register

**Status:** N062–N091 non-importing research/design only; **G-10 actual source/bulk reuse and Production operation approvals pending**. Market priority: **US, DE, GB, EG, SA, AE**, as approved in `docs/architecture/food-catalog-population-reconciliation.md`. Intended for the existing canonical Food Catalog, not a country-specific duplicate database.

## Common launch acceptance (N062–N066)

Each market needs a usable **Global Generic Core + country-relevant foods + legitimately sourced local branded/packaged foods**. Acceptance must be measured as *search/task success* (common dishes and ingredients, typical edible states and forms, valid trust/portion evidence, availability by source/right), not an invented universal food-count quota. Use replayable representative search-query sets in EN/DE/AR where appropriate; include local scripts, Arabic spelling/hamza variants, useful Arabizi aliases, German alternate spellings, brand/product/GTIN identity, and high-demand regional preparation terms.

Canonical identities are language- and market-neutral; the existing `lib/food-catalog/domain/markets.ts` supports country codes US/DE/GB/EG/SA/AE plus GLOBAL/EU/GCC, relevance primary/secondary, and reversible market assignments. A source's country is not proof of a Food's market availability. Use existing `FoodCatalogNameEvidence`, `FoodCatalogIdentityEvidence`, `FoodCatalogServingEvidence`, `FoodCatalogSourceDescriptor` and the audited assignment channel. Never infer country from user locale/IP/timezone. Solids normally per **100 g**; liquids normally per **100 ml** only with valid density/basis evidence; no unsupported gram/ml equality or serving conversions. Source-missing nutrients stay **NULL**; explicit source zero is distinct.

Before any market import: verify provider-owned distribution/reuse and attribution terms for the **exact version and field subset**, freeze original bytes/row count/digest, record source ID and license separately, screen external brand/GTIN rights, then deterministic offline QA → new index → exact DB dry run → human review → draft → eligible activation → generation CAS promotion. Every promotion/activation requires an independent G-10/G-11 approval; one market must not auto-promote another's output.

## Source matrix with current verified/provisional positions (2026-11-20)

| Market | Candidate evidence | Current reuse decision | Search / locality checks |
| --- | --- | --- | --- |
| **US** | USDA FDC Foundation lock 2026-04 and FNDDS proposed 2021–2023; https://fdc.nal.usda.gov/download-datasets/ ; USDA license https://fdc.nal.usda.gov/ | USDA datasets public domain/CC0; **exact 1A1/1A2/1B operations still unapproved**. Open Food Facts reserved **on-demand barcode fallback**, not wholesale normal-search bulk. | Generic commodity/raw/cooked differences, packaged formulation and UPC/GTIN, brand/release time, source identity and current-generation freshness. |
| **Germany / DE** | Max Rubner-Institut Bundeslebensmittelschlüssel **BLS 4.0**, 2025: https://blsdb.de/download | Official download states **CC BY 4.0** with Max Rubner-Institut attribution; record complete citation, original version, row/field rights. Mapping/production not approved. | German aliases and spellings, regional foods and preparation, composition differences versus USDA; country assignment requires independently sourced evidence. |
| **UK / GB** | Public Health England/DHSC **CoFID 2021** official dataset and old-food annex: https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid | GOV.UK page under **Open Government Licence v3.0 except where otherwise stated**. Verify third-party exceptions and field rights in the actual download before importing. | British naming variants, food-category forms/preparations, old-food stale data quarantine, package-specific barcode/provenance. |
| **Egypt / EG** | FAO INFOODS indexes Egyptian National Nutrition Institute **Food Composition Tables for Egypt (1996)**: https://www.fao.org/infoods/infoods/tables-and-databases/egypt/en/ | **NO confirmed open bulk reuse license or exact source bytes.** Research source/owner rights; curated entry must be legitimately sourced; no scrape, copyright assumption or auto nutrition estimates. | Egyptian home dishes, bread/ful/taameya/koshari context, Arabic normalization + transliteration, variants distinguished by preparation and trustworthy composition; no fabricated labels or portions. |
| **Saudi Arabia / SA** | Saudi Food and Drug Authority national Food Composition Tables/database announcement: https://www.sfda.gov.sa/en/news/19370 | Official public existence known; **no validated bulk license/API/data export terms**. Await source-owner agreement before any bulk adaptation. | Saudi-specific dishes and formulations, Gulf shared dishes assigned GCC once, local variants on composition evidence, AR/EN names. |
| **UAE / AE** | WHO-region EMFID research platform https://emfid.org/frontend/web/index.php ; UAE MoHAP national nutrition survey https://mohap.gov.ae/en/about-us/projects-and-initiatives/national-survey-for-health-and-nutrition-2024 ; Emirati food research https://doi.org/10.1371/journal.pone.0262150 | **NO verified reusable country-specific bulk Food Composition Table/source license** from those materials. Data appearing in a scientific article or web UI is not an ingestion license. Do not bulk import them. | Emirati/Lebanese/Gulf dish nuance, source-backed Arabic local terms, separate documented national packaged formulation, GCC common foods without duplicates. |

### Open Food Facts restriction

OFF data are covered by the **ODbL**, individual database contents under the Database Contents License, and images generally under CC BY-SA (https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/). Plaivra's approved normal-search source of truth is its own reviewed canonical Catalog; OFF is on-demand fallback for an uncatalogued barcode. **Bulk copying OFF into a private canonical database is not implied by a public API**, requires independent license architecture and G-10 decision.

## Proposed non-destructive per-market source identity and alias mapping

1. Preserve original dataset/version/row identity, checksum, explicit nutritional basis and source license before canonical matching; check existing source record, semantic identity, barcode and redirects.
2. Normalize names **without mutating original**; store `en`, `de`, `ar`, script and normalized alias as different name facts, not separate Food items. Arabic normalization and Arabizi search aliases must be traceable, do not translate unknown facts into invented nutritional identities.
3. Keep local source citation separate from market assignment. Two regions may reference the same canonical Food; create separate canonical variants only for materially different formulation/preparation/form or nutritional meaning.
4. Mark exact barcode/brand identifiers independently; do not unify different pack sizes, import vendors, regional formulations, or manufacturer changes merely on shared name.
5. Require positive source-backed gram/volume/portion evidence, explicitly null optional nutrients, and report any invalid nutrient/sign/range as reject/quarantine. Preserve frozen member history on source re-ingestion and merges.

## G-10 evidence gaps and release gate

No market source archive has been downloaded, hashed, field-reviewed or ingested in this session. Final source-owner licensing decisions for EG/SA/AE and any branded dataset remain **unresolved**. No country-specific canary, manifest, batch, draft, activation, generation or live relevance proof exists. N067–N091 are **design/preparation only**, not complete production coverage. After G-10 authorization, prepare per-market exact source locks, deterministic mapping candidates, representative queries and approval runbooks, then execute each governed operation only after final Nutrition QA and exact human approvals.

## Additional primary-source evidence, November 20, 2026

These findings refine the **research and rights request**, not the legal approval or ingest status. No original national source database archive was acquired or bulk copied.

### SA — a direct source is publicly readable, but bulk redistribution remains unapproved

- SFDA announced an official bilingual national Saudi Food Composition Tables book in June 2026; its announcement states 130 Saudi dishes were prepared/analyzed, with 49 macro- and micronutrients. Source: https://sfda.gov.sa/en/news/19089 .
- FAO's national FCDB directory independently lists Saudi Food Composition Tables (2025), free access to a **static PDF**, and searchable SFDA website https://fd.sfda.gov.sa/ . Source: https://www.fao.org/food-composition/tables-and-databases/detail/saudi-arabia--2025%29-saudi-food-composition-tables/en .
- Exact public PDF location: https://www.sfda.gov.sa/sites/default/files/2026-04/SFCT-E.pdf (English); Arabic counterpart https://www.sfda.gov.sa/sites/default/files/2026-04/SFCT-A.pdf . **These were not downloaded or data-extracted**. Access to a publication and the SFDA generic open-data policy do NOT establish machine-readable feed rights, commercial bulk republication rights, or permission to copy the printed composition table into Plaivra's permanent private canonical Catalog.
- Next owner decision: request a dataset-specific written license/reuse and attribution confirmation from SFDA, approved digital extract or API, permitted commercial/private search indexing, exact-version source bytes and provenance. No N084–N087 canary/publish until legal and exact G-10 approval.

### EG — FAO confirms print-only rather than downloadable bulk source

- FAO Food Composition directory describes the Egyptian National Nutrition Institute's Food Composition Tables for Egypt (1996) as **print-only**; related bibliographic citation is NNI 2006. Source: https://www.fao.org/food-composition/tables-and-databases/detail/%28egypt--1996%29-food-composition-tables-for-egypt/en . A FAO bibliographic listing is not a downloadable licensed database.
- Next owner decision: obtain NNI permission, an authoritative current-version digital export and commercial reuse/redistribution terms; otherwise restrict EG coverage to legitimately source-backed global and separately verified local facts, NOT scans or unlicensed book transcription.

### AE — research is a discovery lead, not a licensed Food Catalog

- A 2026 Abu Dhabi Food Intake24 research report describes a platform that uses USDA FDC and references 23 traditional Emirati composite dishes, 75 Kuwaiti dishes and 104 Emirati-household recipes in its research design. Source: https://www.frontiersin.org/journals/nutrition/articles/10.3389/fnut.2026.1866000/full . These counts are *research-reported inputs*, not a supplied, validated or licensed Plaivra import table; the article license is not automatically a license for underlying third-party nutrient data.
- UAE Ministry of Health and Prevention publishes an open-data catalog/policy, but no specific licensed Emirati Food Composition Table archive was identified in that catalog. Sources: https://mohap.gov.ae/en/open-data/mohap-open-data and https://mohap.gov.ae/en/open-data/open-data-policy .
- Next owner decision: contact responsible original source/data owners (e.g., Food Intake24 researchers / regional INFOODS collaborators), obtain dataset-level rights and exact provenance, evaluate recipe/food evidence separately; do not derive single-food nutrient facts by treating household recipe estimates as measured food analyses.

**Net disposition:** SA public *reading access* is independently established; EG print-only limitation is clearer; AE research/data-owner contacts are potential paths. Commercial bulk reproduction permissions and exact source bytes remain **unverified for EG, SA and AE**. G-10 remains CLOSED for all such imports and promotions.

## N062 six-market direct Production gap census — 2026-11-21

- Queried production `information_schema.columns` (read-only) to independently confirm the **actual** canonical market schema: `public.food_market_assignments` has `scope_code`, `food_id`, `assignment_action`, `relevance_level`, `source_record_id`; `food_names` has `food_id`, `language_tag`, `name_role`, `name_text`, `normalized_text`; `food_catalog_search_documents` has `market_scope_codes text[]`, `language_tag`, `generation_id`. Avoid false market-column names or adding a duplicate country schema.
- Production **SELECT-only** six-market count at **2026-11-21 02:36:45.545922 UTC**: each `US, DE, GB, EG, SA, AE` has exactly **0** market assignment rows, **0** distinct assigned Foods, **0** `assign` actions, and **0** search document rows containing the market in `market_scope_codes`. This agrees with the separate Plan 9 production census: 0 global Foods, 0 generations and current pointer NULL.
- **Grounded consequence:** no market-specific search coverage can currently be claimed; any country query/alias matrix is merely a future benchmark. Rights for licensed providers and brands, source archives/locks, canary cohorts and owner promotions remain distinct G-10/G-11 gates. No direct insert, fake market tags, synthetic Food counts or schema changes occurred.
