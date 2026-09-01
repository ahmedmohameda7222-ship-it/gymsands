# Plaivra Food Catalog Intelligence Architecture Design

Status: **Planner-approved architecture; written-spec review pending**  
Date: **2026-09-01**  
Architecture class: **Architectural / long-term target design**  
Implementation authority: **Not granted by this document**  
Production mutation authority: **Separate explicit approval required per exact production batch, activation set, and catalog-generation promotion**

## 1. Purpose

This document is the single target architecture for Plaivra's canonical Food Catalog and its ingestion, reconciliation, search, localization, curation, release, operations, security, and recovery model.

The design intentionally treats the existing repository as migration input rather than architecture authority. Plaivra is still in development, so existing code, tables, and compatibility fields may be modified, replaced, migrated, or deleted when a cleaner long-term model exists.

The governing rule is:

> Design the Plaivra Food Catalog we want to own for years, then migrate the current development implementation toward it. Existing implementation does not constrain the target architecture.

This is a clean architectural rebuild-in-place, not a clean-repository rewrite. Existing sound boundaries, invariants, tests, and operational safety mechanisms are retained; weaker representations are replaced.

## 2. Authority and supersession

This specification supersedes conflicting Food Catalog architecture decisions in earlier documents, including conflicting parts of:

- `docs/architecture/food-catalog-data-population-launch-readiness-authority.md`
- earlier Batch 0 plans where they describe transitional schema as final authority
- current `food_items`-centric verification, naming, serving, taxonomy, market, and canonical nutrition representation

The following previously approved principles remain binding unless this document explicitly refines them:

- canonical Food identity is Plaivra-owned and source-independent;
- product consumers depend on the Food Catalog logical service boundary, not physical tables;
- historical Diary, Recipe, Saved Meal, Meal Plan, and other frozen nutrition snapshots are never rewritten by catalog corrections;
- new writes resolve the current canonical Food before freezing their own snapshot;
- My Foods and user-owned food state remain separate from the global canonical catalog;
- missing nutrition remains `NULL`, explicit source zero remains `0`, and unknown is never silently converted to zero;
- ingestion, canonical creation, activation, verification, and generation promotion are separate decisions;
- external providers do not become runtime authorities for already-canonical Plaivra Foods;
- no Production population occurs without separate exact approval.

## 3. Product objective

Plaivra shall not optimize the Food Catalog primarily for raw row count. It shall optimize for:

1. trustworthy canonical identity;
2. evidence-backed nutrition and servings;
3. low duplicate pollution;
4. strong search intent accuracy;
5. visible and explainable trust without opaque scoring;
6. market and language flexibility without identity duplication;
7. versioned correction and source evolution;
8. cheap initial infrastructure with replaceable scale boundaries;
9. operational replayability and safe failure containment;
10. provider-independent recovery and portability.

The competitive target is not merely feature parity with large nutrition apps. Plaivra should structurally avoid common catalog failure modes: duplicate clutter, conflicting user-created records, ambiguous regional variants, stale barcode identity, invented serving conversions, opaque corrections, and AI-generated nutrition guesses presented as facts.

## 4. Core architecture

The Food Catalog remains a logical domain/service. Physical storage may stay in Plaivra Main Supabase/Postgres at the current product stage.

```text
Plaivra consumers
  ├─ Food Library
  ├─ Diary / Eat
  ├─ Recipes
  ├─ Saved Meals
  ├─ Meal Plans
  ├─ MCP / AI interfaces
  └─ future barcode flows
           │
           ▼
      Food Catalog Contract
           │
   ┌───────┴────────┐
   │                │
Member Plane    Control Plane
   │                │
   └───────┬────────┘
           ▼
     Canonical Domain
           │
     Catalog Generation
           │
     Search Projection
           │
   PostgreSQL Search now
   replaceable later
```

Consumers must not depend on physical Food Catalog tables. A future dedicated Food Catalog database, search service, or cache may replace current infrastructure without changing canonical Food IDs or consumer contracts.

## 5. Canonical identity model

### 5.1 Stable identity

A canonical Food has a stable Plaivra-owned ID. Provider IDs, names, barcodes, taxonomy, market, and search labels are evidence or presentation facts, not the canonical primary key.

### 5.2 Canonical matching outcomes

Every ingestion candidate resolves to exactly one of:

- `MATCH`
- `CREATE`
- `POSSIBLE_DUPLICATE`
- `REJECT`

`MATCH` and canonical-to-canonical `MERGE` are different operations. A source record may match an existing canonical Food automatically under deterministic policy. Two existing Plaivra canonical Foods must never be automatically merged based only on similarity.

### 5.3 Matching hierarchy

Matching shall evaluate, in order:

1. exact immutable versioned source identity;
2. exact approved GTIN where applicable;
3. existing canonical merge redirect;
4. strong deterministic semantic identity;
5. high-confidence alias/state/preparation evidence;
6. `POSSIBLE_DUPLICATE` review;
7. distinct canonical creation.

Name similarity alone and nutrition similarity alone are never sufficient for canonical merge.

### 5.4 Semantic identity signature

Ingestion may compute a versioned semantic identity signature from identity-bearing facts such as:

- base concept;
- brand/formulation where applicable;
- preparation;
- physical state;
- cut/form;
- material qualifiers.

The signature is matching evidence, not the canonical ID. The signature algorithm may evolve without changing canonical Food IDs.

### 5.5 Material variants

Separate canonical Foods are required for material differences such as:

- raw vs cooked;
- materially distinct preparation method;
- meaningful cut/form differences;
- skin/bone state where nutritionally or semantically material;
- whole vs reduced-fat formulation;
- branded/formulation identity;
- prepared mixed dish vs base ingredient;
- other differences that materially alter what the user is selecting or the nutrition meaning.

Translation, spelling, transliteration, source provider, source release, and market relevance do not by themselves create new canonical Foods.

## 6. Merge and identity-reconciliation architecture

Confirmed canonical duplicates use a survivor plus immutable merge history. The losing canonical ID is not deleted.

Rules:

- merged identities redirect to a surviving canonical Food;
- canonical merge events are immutable and auditable;
- no self-merge;
- no cycles;
- a merge survivor must itself be a valid current canonical target;
- search exposes only the surviving active identity;
- historical snapshots are never rewritten;
- old references resolve to the current survivor for new writes;
- redirect chains must be flattened rather than allowed to accumulate.

Conceptually, if A, B, and C converge to D, resolution is maintained as `A → D`, `B → D`, `C → D`, not `A → B → C → D`.

Merge events preserve source and decision history, including reason codes and evidence. Future split/correction operations may supersede prior merge decisions, but the prior event remains in the audit trail.

## 7. Nutrition architecture

### 7.1 Nullable truth

Nutrition ingestion is source-fact normalization, not nutrition estimation.

- known numeric value remains numeric;
- known source zero remains zero;
- missing source nutrient remains `NULL`;
- no imputation to fill missing nutrients;
- no 4/4/9 recalculation used to replace official source energy;
- source disagreement creates evidence/anomaly signals, not silent rewriting.

### 7.2 Canonical basis

For current USDA core ingestion, canonical nutrition is normalized to per 100 g when the source provides a mass-based basis.

No ml-to-g conversion is permitted without explicit food-specific density evidence. No generic cup, tablespoon, slice, piece, or bowl assumptions are permitted.

### 7.3 USDA nutrient mapping

Batch 1 USDA mapping uses explicit release-aware nutrient identifiers. Initial authority includes:

- Protein: FDC 1003
- Total fat: FDC 1004
- Carbohydrate: FDC 1005
- Saturated fat: official total saturated fatty acids mapping for the exact dataset/release
- Fiber: FDC 1079
- Total sugars: exact release-specific official total-sugars mapping; individual sugars are not summed as a replacement
- Sodium: FDC 1093
- Energy: dataset-specific official authority

For Foundation Foods, prefer Atwater Specific energy when available, then Atwater General; legacy energy is only a bounded fallback where the approved release mapping explicitly permits it. For FNDDS, use the official released food-energy value under the exact release mapping. The importer must preserve the exact source nutrient identifier used.

A nutrient-mapping change changes the semantic configuration checksum and therefore creates a new semantic batch identity.

### 7.4 Independent nutrition revisions

Canonical nutrition must not be destructively overwritten. Target representation uses immutable nutrition revisions beneath the stable Food ID.

A new source release or approved correction may create a new nutrition revision. The current promoted catalog generation determines which revision is effective for new catalog reads and writes. Historical consumer snapshots remain frozen independently.

## 8. Serving and portion architecture

Serving options are independent from canonical per-100-g nutrition.

A serving option may exist only when the exact Food has trustworthy source-backed conversion evidence. No universal household conversion rules are permitted.

Target serving facts include:

- food ID;
- label;
- amount;
- unit/type;
- gram weight where known;
- source record/release provenance;
- source portion code where applicable;
- quality/evidence class;
- lifecycle;
- default designation where policy supports one.

Foundation portions may be used only when documented for the exact Foundation Food. FNDDS portion codes and gram weights may be used while preserving that some are dietary portion estimates rather than analytical density measurements.

Multiple conflicting source portions are not averaged. Deterministic source authority applies; unresolved material conflicts go to review/quarantine.

Default serving selection is not an importer guess. Foundation defaults to 100 g unless authoritative serving metadata says otherwise. FNDDS may use an official primary/common portion only when the source explicitly supports that interpretation; otherwise 100 g remains the fallback.

## 9. Naming, aliases, localization, and transliteration

### 9.1 Food ID is the identity authority

A single mutable `food_name` string is not the long-term canonical identity authority. Names are localized, versioned presentation/search facts associated with the stable Food ID.

Target name facts include:

- language tag;
- role such as preferred display, source name, synonym, search alias, or transliteration;
- text and normalized text;
- origin;
- provenance where source-derived;
- lifecycle/status.

### 9.2 Standards

Language identifiers use BCP-47-compatible language tags and CLDR-compatible locale semantics. The schema must not hard-code only `en`, `de`, and `ar`.

Regional language tags are used only when a real linguistic distinction is needed; base-language names should not be duplicated without reason.

### 9.3 USDA naming

The exact USDA description is preserved immutably as source evidence and may remain searchable. Automatic Batch 1 display cleanup is limited to semantically safe deterministic formatting cleanup. The importer must not remove preparation, cut, fat level, raw/cooked state, skin/bone state, or other identity-bearing qualifiers.

If safe simplification is not possible, the source description may remain the temporary display name.

### 9.4 No automatic authority from AI

LLMs may later propose localized names, synonyms, or transliterations, but generated text is not authoritative catalog data until it passes the approved curation policy.

### 9.5 Arabizi

Arabizi is modeled as Arabic-context Latin-script search/transliteration aliases, not as a separate language or locale. Approved examples may coexist as aliases while Arabic remains the language context.

## 10. Taxonomy architecture

Food classification is a stable Plaivra-owned multidimensional taxonomy registry. Provider classifications are versioned mapping evidence only. Canonical identity never depends on taxonomy assignment.

The target model uses controlled namespaces/nodes/assignments rather than one overloaded category string.

Initial dimensions are intentionally limited to:

1. primary food group;
2. ingredient family / subtype;
3. preparation state;
4. physical/form state;
5. cut/form where relevant.

Cuisine remains a separate controlled classification. Market relevance and nutrition-derived labels such as High Protein or Low Carb are not taxonomy identity dimensions.

Initial primary food-group registry should support stable nodes equivalent to:

- protein foods;
- dairy;
- grains;
- vegetables;
- fruits;
- legumes;
- nuts and seeds;
- fats and oils;
- beverages;
- mixed dishes;
- snacks;
- desserts;
- condiments;
- other.

Taxonomy nodes use stable Plaivra IDs/codes and lifecycle. Used nodes are deprecated/replaced through redirects rather than deleted or repurposed.

Existing category strings may be migration/compatibility projections during transition only. They are not final domain authority.

## 11. Market architecture

Language, market, source, and canonical Food identity are independent concepts.

Target market representation uses a Plaivra-owned Market Scope Registry with stable IDs, controlled scope kinds, and standard external codes where applicable. Examples include `GLOBAL`, `US`, `DE`, `EG`, `GB`, `SA`, `AE`, `EU`, and `GCC`.

Region membership is represented separately, e.g. `DE → EU`, `SA → GCC`, `AE → GCC`.

Food-to-market relevance is a controlled assignment, not country-specific boolean columns. Global Foods should use a global scope rather than creating one row for every country.

Market relevance generally affects ranking rather than hiding valid global results. Hard market filtering occurs only when the product explicitly requests it.

User market authority must be explicit. Plaivra must not infer canonical market context from language, locale, IP, timezone, GPS, or device location without separately approved product authority. If the user has not selected a market, neutral/global behavior applies.

Market context never changes the nutrition truth of the same canonical Food. If regional formulations differ materially, they are distinct canonical variants.

## 12. Trust, verification, activation, and lifecycle

### 12.1 Independent concepts

The architecture separates:

- source-ingestion state;
- canonical Food lifecycle;
- verification assertions;
- data completeness;
- source freshness;
- user-facing trust presentation.

### 12.2 Canonical lifecycle

Canonical Food lifecycle uses stable states equivalent to:

- `draft`
- `active`
- `deprecated`
- `withdrawn`
- `merged`

Normal member search exposes active canonical survivors only. Draft is review-only. Deprecated is normally hidden/replacement-preferred. Withdrawn is unavailable for new discovery. Merged resolves to its survivor.

### 12.3 Activation

Successful ingestion does not activate Foods. Production ingestion creates source/canonical draft state. Activation occurs only after post-ingestion QA through an exact, deterministic activation set/manifest.

Activation hard gates include:

- approved source/legal class;
- complete source/release provenance;
- approved immutable ingestion manifest;
- structural validation;
- resolved canonical identity;
- zero unresolved possible duplicates inside the activation set;
- valid nutrition basis where nutrition exists;
- valid display identity;
- no blocking anomaly;
- compatible lifecycle state.

### 12.4 Verification assertions

A single mutable `is_verified` boolean is not target authority. Verification is modeled as immutable/superseding assertions by scope.

Initial scopes:

- identity;
- nutrition;
- serving;
- barcode when branded/package identity is introduced.

Localization verification may be added later without schema redesign.

Each assertion records policy version, evidence, source/provenance where applicable, authority principal, timestamp, reason, and supersession/revocation history.

### 12.5 User-facing trust

User-facing labels are derived projections from underlying facts. Plaivra must not use an opaque numeric trust score such as 87/100.

A user-facing `Verified` projection requires at minimum:

- active lifecycle;
- verified canonical identity;
- verified nutrition;
- approved active source evidence;
- no unresolved blocking anomaly.

Serving completeness is independent; a Food may be verified while having only gram-based serving options.

Completeness and accuracy are different concepts. A Food may be accurate but incomplete.

## 13. Source and legal policy

### 13.1 Core rule

Plaivra Core Food Catalog population uses only zero-cost, commercially reusable sources with no material downstream licensing obligation by default. Public-domain/CC0-equivalent sources are preferred.

Attribution, share-alike, restrictive, unclear, or paid sources require separate Planner legal-compliance approval and are never required core dependencies.

This architecture minimizes legal exposure but does not claim that software can guarantee absolute zero legal risk.

### 13.2 Batch 1 Core

Batch 1 Core uses USDA FoodData Central only:

- Batch 1A: USDA Foundation Foods, April 2026 exact approved release;
- Batch 1B: USDA FNDDS 2021–2023, October 2024 exact approved release.

Branded Foods are deferred to a later branded/package phase because of scale, churn, barcode, brand, and formulation complexity. Experimental Foods are excluded from the general canonical seed. SR Legacy remains a possible future gap-fill source only if benchmark evidence demonstrates a real need.

### 13.3 Deferred sources

- BLS 4.0 is deferred optional enrichment because CC BY creates an attribution obligation.
- CoFID 2021 is deferred optional enrichment because OGL creates attribution obligations and may contain third-party-rights caveats.
- Open Food Facts is not authorized as a wholesale/core catalog dependency under the current architecture because of ODbL/share-alike implications. It may remain an external fallback only under separately approved persistence/licensing rules.
- paid, restrictive, unclear, or scraped proprietary sources are prohibited as Core dependencies.

Product logos, packaging artwork, copyrighted descriptions, and photos are not imported merely because underlying factual nutrition data may be reusable.

## 14. Source releases and catalog evolution

Every source release is an immutable source epoch with exact provider, dataset, release/version, artifact checksum, importer version, and configuration checksum.

Later releases do not overwrite prior source snapshots.

A release-diff engine classifies source changes into categories equivalent to:

- unchanged;
- metadata changed;
- nutrition changed;
- serving changed;
- identity changed;
- new;
- removed;
- ambiguous.

Unchanged source records should not create meaningless canonical revisions. Material changes create candidate domain revisions and must pass validation and approval before promotion.

Source removal does not automatically delete or withdraw the canonical Food. Upstream merges or splits are evidence, not automatic Plaivra merge/split authority.

Large or unexpected changes are review blockers until explained.

## 15. Catalog generations

Plaivra uses logical Catalog Generations to compose current promoted domain facts without turning the Food root row into one giant mutable blob.

A generation identifies the promoted composition of, at minimum:

- current canonical Food survivors/lifecycle;
- effective nutrition revisions;
- effective serving facts;
- naming/localization state;
- taxonomy assignments;
- market assignments;
- verification/trust policy state;
- search configuration/projection version.

Generation promotion is a separate privileged operation after QA. A failed generation may be revoked and the current pointer returned to the previous healthy generation without destructive deletion of source/history/revisions.

## 16. Ingestion architecture

Required flow:

```text
approved source artifact
  → source adapter
  → immutable source identity/snapshot
  → normalization
  → structural validation
  → accepted / quarantine / reject
  → canonical reconciliation
  → deterministic dry-run manifest
  → review / approval
  → privileged Production execution as drafts
  → reconciliation
  → post-ingestion QA
  → activation set
  → catalog-generation candidate
  → generation benchmark
  → explicit promotion
```

Direct `CSV → INSERT canonical Food` is prohibited.

## 17. Batch and run authority

The existing conceptual split between semantic batch identity and execution attempts remains permanent.

A semantic batch is defined by exact source artifact/release, importer version, deterministic configuration, deterministic candidate outcomes, and manifest-content checksum.

Execution retries create new run attempts, not new semantic batches.

Production execution requires database-enforced equality with the exact approved manifest checksum. Reviewed semantic batch authority is immutable.

The target run model additionally supports:

- service/machine principal identity;
- heartbeat/lease;
- prevention of concurrent uncontrolled Production attempts;
- expected vs observed reconciliation;
- structured failure codes;
- quarantine counts;
- terminal immutable audit states.

## 18. Quarantine and failure recovery

Quarantine is a first-class state for uncertain-but-potentially-valid candidates and is different from structural reject.

Controlled quarantine reasons include categories equivalent to:

- possible duplicate;
- identity conflict;
- nutrition anomaly;
- serving conflict;
- source-release break;
- mapping ambiguity;
- barcode conflict.

Quarantine records preserve source identity, batch, reason, evidence, candidate matches, review status, and immutable resolution history.

No candidate is silently skipped. Every skipped/rejected/quarantined row is counted and traceable.

Operational failure follows:

```text
FAIL → CONTAIN → RECORD → DIAGNOSE → NEW ATTEMPT OR NEW SEMANTIC BATCH
```

Rollback is an authority/lifecycle/generation change, not destructive deletion of historical evidence.

## 19. Search architecture

### 19.1 Canonical truth vs read projection

Canonical tables are not shaped around every search query. Search uses a rebuildable derived projection/document model.

```text
Canonical Domain
  → SearchDocument projection
  → SearchBackend adapter
  → objective ranking
  → user personalization overlay
  → Food Library results
```

Search documents are derived and rebuildable. They are never nutrition or identity authority.

### 19.2 PostgreSQL first

Initial backend remains PostgreSQL using appropriate exact matching, prefix behavior, FTS, `pg_trgm`, and numeric indexes. No paid search service is required.

A future dedicated search backend may replace PostgreSQL only when measured latency, relevance, workload isolation, or scale justifies it. Consumers continue calling the same Food Catalog search contract.

### 19.3 Language documents

Search projections may be language-context-specific, e.g. EN, DE, AR documents for the same Food when approved localized facts exist. This does not clone canonical Food identity by market or language.

### 19.4 Ranking stages

Search follows staged ranking:

1. eligibility/lifecycle;
2. text and identity relevance;
3. trust/quality;
4. explicit market relevance;
5. context;
6. user personalization.

Trust never overrides a material semantic mismatch. Market generally boosts rather than hides valid global results.

### 19.5 Personalization

Favorites, recency, frequency, and time-of-day behavior are user overlays, not global catalog truth. Global search indexes are not duplicated per user.

My Foods remain user-owned and are composed with global results through the Food Library service while preserving ownership isolation.

### 19.6 Filters and labels

Numeric nutrition filters are deterministic predicates over normalized nutrition semantics. High Protein and Low Carb are versioned policy-derived labels, not AI judgments and not hard-coded permanently into catalog facts.

Current implementation thresholds are transitional unless separately approved as product policy.

### 19.7 Pagination and hydration

Target search pagination is cursor/keyset based and should bind to query/ranking context and catalog generation where practical. Deep OFFSET pagination is not the long-term model.

Search results must avoid N+1 hydration. Card-level fields may be carried in the projection; full servings/provenance/history load only when needed.

## 20. User feedback, correction, and curation

User feedback is evidence, never global catalog authority.

A user report opens or joins a first-class correction case. Reports do not mutate canonical facts.

Controlled issue categories include wrong nutrition, missing nutrient, wrong/missing serving, duplicate Food, wrong variant, wrong name/translation, wrong taxonomy, wrong market, wrong barcode, outdated product, source conflict, and other.

Multiple reports for the same issue may cluster into one correction case. Report volume changes priority, not truth.

Correction decisions are evidence-driven and risk-classified. Approved changes route through the domain that owns the fact:

- nutrition issue → nutrition revision;
- serving issue → serving revision/fact change;
- name/translation → naming event/revision;
- duplicate → identity reconciliation/merge event;
- taxonomy → taxonomy assignment change;
- market → market assignment change;
- verification → assertion supersession/revocation.

Accepted corrections should create regression coverage where the issue is testable.

### 20.1 Personal values

User personal nutrition changes remain user-owned overlays and never contaminate global canonical nutrition. A personal override remains linked to the canonical Food when identity is unchanged. A materially different item is a My Food instead.

### 20.2 AI role

AI may classify reports, cluster duplicates, extract candidate package facts, summarize evidence, or propose corrections. AI does not approve global truth.

## 21. Security and control-plane authority

The member/product plane and privileged control plane are separate command surfaces.

Member operations include search, read, logging handoff, favorites, My Foods, personal overrides, and issue reporting.

Privileged operations include ingestion, batch approval, activation, verification assertions, canonical merge, withdrawal, correction approval, taxonomy curation, generation promotion, rollback/revocation, and break-glass recovery.

A generic `role === admin` check is not the target model. Authority is capability-based. Example capability classes include curation, verification, duplicate resolution, batch approval, ingestion execution, activation, generation promotion, withdrawal, and break-glass.

Human decision and machine execution are separate. A machine executor may execute the exact approved semantic action/checksum but may not choose arbitrary source content or silently modify an approved manifest.

Privileged service credentials remain server-only and are never exposed to browser, mobile client, member MCP token, logs, or analytics. Member-facing code must not gain a generic privileged database client.

Critical invariants are enforced at the database/domain boundary in addition to application checks.

High-risk operations use prepare → review → approve → execute semantics.

All privileged actions generate immutable structured audit context including principal, capability, target, reason/evidence, policy version, and before/after references.

Machine actors are explicit service principals with least privilege rather than fake human admin users.

Code merge, deployment, migration deployment, ingestion implementation, ingestion completion, activation QA, and Production mutation are distinct authorities. None automatically authorizes the next.

## 22. Batch 1 rollout strategy

Batch 1 uses progressive source promotion.

### 22.1 Foundation

- `1A0`: full USDA Foundation release dry-run offline;
- `1A1`: deterministic representative Production canary, approximately 50–100 Foods, ingested as drafts;
- canary QA and activation subset;
- `1A2`: full Foundation ingestion/promotion only after canary gates pass and exact separate Production approval is granted.

The canary must intentionally cover multiple food groups, complete/incomplete nutrition, raw/cooked variants, similar names, multiple/no household portions, and anomaly edge cases. It is not a random sample.

### 22.2 FNDDS

After Foundation is healthy:

- `1B0`: full FNDDS release dry-run offline;
- `1B1`: deterministic representative Production canary, approximately 150–250 records;
- `1B2`: full FNDDS ingestion/promotion only after canary gates pass and exact separate Production approval is granted.

FNDDS QA must emphasize mixed dishes, composite foods, portion weights, preparation variants, and reconciliation against existing Foundation canonical identities.

There is no artificial row-count launch target.

## 23. QA and launch readiness

Launch readiness is hard-gated and benchmark-versioned. There is no single weighted launch score where strength in one dimension can compensate for failure in another.

A generation is release-ready only when every required dimension passes.

### 23.1 Hard integrity gates

For activated data:

- 100% valid canonical IDs;
- 100% required provenance;
- 100% explicit nutrition basis where nutrition exists;
- zero negative nutrition;
- zero silent `NULL → 0` conversion;
- zero invented serving conversions;
- zero unresolved source identity conflicts;
- zero invalid lifecycle/revision relationships;
- deterministic replay of identical source/importer/config;
- idempotent re-execution without duplicate canonical/source/serving/alias state.

### 23.2 Identity gates

- zero known false merges in the benchmark/review set;
- zero unresolved `POSSIBLE_DUPLICATE` cases inside the activation set;
- zero active duplicate canonical pollution in critical benchmark results;
- no name-only or nutrition-only merge behavior.

### 23.3 Nutrition fidelity

Representative comparison to raw authoritative USDA data must preserve exact semantics after approved normalization. Unknown remains null and known zero remains zero.

Nutrition completeness is measured diagnostically per nutrient but does not replace accuracy requirements.

### 23.4 Serving fidelity

Every activated non-gram serving conversion is source-backed, traceable, and deterministically scales current nutrition. Invented household conversions are a hard failure.

### 23.5 Search benchmark

Maintain a versioned Golden Query Set. Batch 1 begins with English common-food intent and grows with approved localization/market support.

Initial launch target:

- at least 95% Top-1 intent correctness for benchmark queries with a clear expected canonical answer;
- at least 99% Top-3 coverage;
- zero duplicated canonical identity in active top results;
- zero critical qualifier violations in the critical benchmark set;
- no material search-latency regression against the measured baseline.

### 23.6 End-to-end handoff

Representative active Foods must pass Food Library → Food selection → serving selection → Diary/Eat → Saved Meal → Recipe → Meal Plan → MCP handoffs with correct canonical ID, current effective facts, nullable semantics, serving scaling, and frozen snapshots.

### 23.7 Historical and ownership safety

Population, activation, and generation promotion must prove:

- zero historical snapshot rewrites;
- zero user My Food mutations;
- zero personal override mutations;
- zero unauthorized user-state changes.

### 23.8 Security gates

Any privilege escalation, member access to privileged mutation, leaked service authority, or uncontrolled direct global catalog write is a release blocker.

## 24. Operational observability

Food Catalog operations maintain distinct layers for:

- immutable semantic/audit events;
- diagnostic logs;
- metrics;
- traces where needed.

Metrics include ingestion counts/distributions, canonical-match outcomes, quarantine rate, nutrient completeness, serving coverage/conflicts, benchmark correctness, handoff success, run failures, reconciliation mismatch, and generation rollback count.

Distribution anomalies are release signals. A dramatic unexplained create/match/quarantine shift may block a release even when individual rows validate.

Operational severity should distinguish data/security corruption, release-integrity failure, quality degradation, and informational signals.

Manual recurring recovery must be represented as privileged domain commands, not ordinary SQL improvisation. SQL break-glass is emergency-only, audited, reconciled, and temporary.

## 25. Cost, performance, and scale

Plaivra optimizes for zero mandatory extra paid infrastructure dependency, not for a guarantee that infrastructure remains free at arbitrary scale.

Initial architecture:

- Main Plaivra Postgres/Supabase physical storage;
- canonical Food logical domain boundary;
- rebuildable PostgreSQL search projection;
- no separate search vendor;
- no distributed cache requirement;
- no second Food Catalog database without measured need.

Scale decisions are measurement-driven rather than triggered by an arbitrary Food row count.

A dedicated search backend becomes eligible when indexed Postgres optimization cannot satisfy measured latency/relevance needs, search workload harms transactional workload, independent scaling is economically justified, or required multilingual/fuzzy relevance becomes materially awkward.

A dedicated physical Food Catalog database becomes eligible only when measured operational isolation, storage/search scale, or availability requirements justify it.

Canonical IDs and consumer contracts never change because of infrastructure separation.

Search and cache keys should be generation-aware so new generation promotion naturally invalidates stale derived state.

## 26. Disaster recovery and portability

Supabase-managed backups are a useful safety layer but are not Plaivra's only recovery authority.

Recovery truth consists of:

1. Git-versioned schema/migrations/code/policies/configuration;
2. exact immutable source artifacts and checksums where legally retainable;
3. portable logical database backups;
4. Plaivra-owned immutable canonical/history/audit state;
5. rebuildable derived search/cache/projection state.

Source artifacts alone cannot reconstruct Plaivra canonical decisions and stable IDs. The Plaivra canonical/history state itself must be backed up.

Logical backups must be portable, checksummed, encrypted when they contain user data, and retained independently enough to survive loss of the primary provider.

A backup is not trusted until restore-tested in isolation.

Restore verification includes canonical ID equality, generation state, merge redirects, revision integrity, source lineage, user ownership, frozen snapshot safety, rebuilt search, golden-query benchmark, and security/RLS verification.

Storage objects such as future correction evidence images or source artifacts require their own backup policy because database backups alone are not assumed to restore object bytes.

The Food Catalog must support a future provider-neutral domain export format separate from `pg_dump`, preserving stable Plaivra IDs, current/versioned facts, provenance, redirects, lifecycle, verification, and generation history.

The portability exit test is:

> Can Plaivra rebuild the Food Catalog on a compatible vanilla Postgres target using Git plus approved backup/export artifacts while preserving every canonical Plaivra Food ID and consumer reference?

If not, the architecture has unacceptable hidden provider lock-in.

## 27. Target domain entities

Exact SQL names are implementation details, but the target domain must provide responsibilities equivalent to the following.

### Keep/extend foundations

- ingestion batches;
- ingestion runs;
- versioned source records/snapshots;
- batch/source participation;
- barcode/GTIN claims;
- user favorites;
- user personal Food overrides;
- My Foods.

### New/replacement canonical model

- canonical Food identity root;
- nutrition revisions;
- serving facts/revisions;
- localized name/alias registry;
- taxonomy namespaces;
- taxonomy nodes;
- taxonomy assignments;
- Market Scope Registry;
- market-scope memberships;
- Food-market assignments;
- verification assertions;
- canonical merge events/redirect projection;
- activation sets;
- catalog generations and promotion/revocation events;
- quarantine cases/resolutions;
- correction cases/reports/evidence/events;
- search documents/projections;
- operational audit events;
- benchmark definitions/results;
- source-artifact/backup/export manifests as appropriate.

## 28. Current-repository reconciliation

### 28.1 Keep

Retain the architectural intent of:

- Food Catalog logical service boundary;
- stable Plaivra IDs;
- nullable nutrition semantics;
- historical frozen snapshots;
- My Foods isolation;
- personal correction/override concept;
- favorites;
- versioned source identity;
- immutable source snapshot after reviewed participation;
- semantic batch vs execution-run split;
- database-enforced Production manifest checksum;
- deterministic manifest hashing/canonical serialization;
- GTIN separate from canonical Food ID;
- PostgreSQL-first search/infrastructure.

### 28.2 Modify/extend

Extend rather than discard:

- ingestion batch model;
- ingestion run model;
- source record model;
- barcode model;
- personal correction model, preferably clarified as personal override semantics;
- market-relevance concept, replacing simple country/region rows with a stable registry/membership model.

### 28.3 Replace/migrate

Current `food_items` must cease being a flat authority for name, serving, canonical nutrition, category, cuisine, verification, market-global state, and merge history.

The following existing concepts become migration/compatibility projections only until consumers move to the target model:

- mutable nutrition columns on the root Food row;
- single `serving_size` authority;
- single `food_name` authority;
- fixed-locale `food_aliases` schema;
- `category` and `cuisine` as free-form canonical authorities;
- `is_verified`, `verified_at`, and `verified_source_record_id`;
- `is_market_global`;
- merge-chain walking;
- generic admin curation commands that directly update canonical rows;
- hard-coded nutrition-preset thresholds inside search implementation;
- name-only duplicate helper behavior;
- direct admin/quality reads from physical global catalog tables when equivalent domain read models exist.

### 28.4 Delete after migration

Once no approved consumer depends on transitional representations, remove obsolete columns/functions/compatibility logic rather than carrying permanent development-era debt.

Applied historical migrations are never rewritten. Target changes are introduced through new migrations and migration verification.

## 29. Source/batch naming after supersession

The canonical naming for this architecture is:

- **Batch 0** — existing schema/ingestion readiness foundation; zero Food population;
- **Batch 1A** — USDA Foundation Core;
- **Batch 1B** — USDA FNDDS Core;
- future Germany/UK/Egypt/GCC/branded work — separately approved enrichment/population tracks.

BLS and CoFID are no longer Batch 1 Core dependencies.

## 30. Consumer contract

Exact function names remain implementation details, but the Food Catalog service must own responsibilities equivalent to:

- search with locale, market, filters, cursor, and user context;
- get one canonical Food under current generation;
- resolve old/merged identity to current canonical survivor;
- resolve current effective facts for Nutrition handoff;
- expose derived trust/read presentation without leaking physical tables;
- lookup canonical local barcode identity;
- compose global results with owner-scoped My Foods/personalization;
- accept member issue reports;
- expose separate privileged control-plane operations for ingestion, review, verification, correction, activation, promotion, and recovery.

Product routes, UI, and MCP member operations must not query or mutate global canonical tables directly.

## 31. Non-goals for this architecture/design phase

This specification does not authorize:

- runtime implementation;
- Production migrations;
- Food population;
- activation;
- generation promotion;
- a new Supabase project;
- a paid provider dependency;
- a paid search vendor;
- wholesale Open Food Facts ingestion;
- branded-food ingestion;
- full Germany/UK/Egypt/GCC population;
- Food Library visual redesign implementation;
- Train-domain work;
- broader MCP-completeness work unrelated to this Food Catalog target architecture.

## 32. Implementation planning requirements

The implementation plan must be phased and must not attempt a blind big-bang rewrite of the entire Plaivra repository.

The plan must preserve unrelated stable domains and transition Food Catalog domain-by-domain behind its service boundary.

The plan must explicitly include:

1. target schema and migration strategy while global Food Catalog remains empty;
2. target domain types and persistence boundary;
3. canonical identity/merge model;
4. nutrition revisions and servings;
5. naming/localization/taxonomy/market model;
6. verification/activation/generation model;
7. ingestion contract upgrade plus quarantine/recovery;
8. search projection/backend and consumer migration;
9. control-plane/correction/security model;
10. benchmark/QA/release tooling;
11. retirement of obsolete transitional columns/functions;
12. Batch 1A Foundation adapter/dry-run/canary as a later separately approved data operation;
13. Batch 1B FNDDS only after Foundation readiness.

No implementation plan may treat existing flat `food_items` representations as binding merely because they already exist.

## 33. Architecture acceptance criteria

This design is considered faithfully implemented only when all of the following are true:

1. canonical Food ID is stable and provider/language/market independent;
2. mutable root-row nutrition is no longer canonical authority;
3. source versions and source facts are immutable/replayable;
4. serving conversions are exact-food evidence-backed only;
5. localized names and aliases are standards-based and provenance-aware;
6. taxonomy is multidimensional and independent of identity;
7. market is registry-based and independent of language;
8. verification is assertion-based rather than one mutable boolean authority;
9. activation and generation promotion remain separate from ingestion;
10. canonical merge history is immutable and redirect chains are flattened;
11. deterministic batch/run/checksum protections remain enforced;
12. quarantine and correction decisions are first-class and auditable;
13. search is a rebuildable projection behind a replaceable backend adapter;
14. personalization does not contaminate global canonical truth;
15. member and privileged control planes are separated with capability-based authority;
16. historical snapshots and user-owned data remain unchanged by catalog corrections;
17. the benchmark hard gates are executable and block unsafe promotion;
18. provider-independent backup/export/restore preserves all Plaivra canonical IDs;
19. obsolete transitional authorities are removed after consumer migration;
20. no Production population or promotion occurs without separate exact user/Planner approval.

## 34. Final decision

Plaivra will build the Food Catalog as a **Trust-First Food Intelligence Catalog** using:

- stable canonical identity;
- independent versioned domain facts;
- conservative identity reconciliation;
- evidence-backed nutrition and serving data;
- standards-based localization;
- multidimensional taxonomy;
- independent market relevance;
- assertion-based trust;
- deterministic ingestion and activation;
- generation-based release control;
- rebuildable portable search;
- evidence-driven curation;
- capability-based privileged control;
- hard-gated QA;
- provider-independent disaster recovery.

The architecture intentionally favors long-term correctness, explainability, flexibility, and low future migration cost over preserving development-era implementation shortcuts.
