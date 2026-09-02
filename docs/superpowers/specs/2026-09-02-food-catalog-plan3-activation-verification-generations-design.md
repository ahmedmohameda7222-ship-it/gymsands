# Plaivra Food Catalog Plan 3 — Activation, Verification, Trust, and Catalog Generations Design

Status: **Planner-approved design; written-spec review pending**  
Date: **2026-09-02**  
Architecture class: **Architectural / long-term target design**  
Parent architecture: `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`  
Program roadmap: `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`  
Implementation authority: **Not granted by this document**  
Production mutation authority: **Not granted by this document**  
Production migration apply, activation execution, Catalog Generation promotion, Food population, provider ingestion, deployment, and Plan 4 remain separately authorized operations.

## 1. Purpose

Plan 3 introduces the missing authority that Plan 2 intentionally refused to invent: a deterministic, auditable answer to **which canonical Food facts are currently effective**.

Plan 1 created immutable/versioned Food facts. Plan 2 created strict server persistence boundaries and deliberately returned raw V2 fact arrays without choosing a current revision, current name, current serving, current verification state, or current canonical survivor from timestamp/order heuristics.

Plan 3 establishes:

- exact deterministic activation authority;
- assertion-based verification supersession/revocation authority;
- full immutable Catalog Generation composition;
- a single current-generation pointer;
- current-generation reads;
- flattened generation redirect projection;
- structured derived Trust Profile output;
- atomic promotion and rollback semantics;
- validation/blocking interfaces needed before Plan 4 quarantine exists.

The Plan 3 exit condition is:

> Draft facts may exist without becoming member-visible; activation is separate from visibility; generation promotion is a separate audited operation; current reads are generation-authoritative; and the current pointer can be rolled back to an explicitly selected previous healthy generation without destructive deletion or rewriting.

## 2. Authority and non-goals

This document refines the parent Food Catalog architecture only for Plan 3. If it conflicts with the parent architecture, the parent architecture wins unless an explicit later Planner decision supersedes it.

### 2.1 Plan 3 owns

Plan 3 owns the long-term authority for:

- activation eligibility;
- candidate generation composition;
- promoted generation composition;
- verification assertion chain rules;
- derived trust projection;
- current generation pointer semantics;
- generation promotion, revocation, and rollback event semantics;
- current effective Food reads over exact generation selections;
- generation-level canonical redirect projection.

### 2.2 Plan 3 does not own

Plan 3 does **not** implement or authorize:

- provider-specific ingestion adapters;
- USDA release parsing;
- Production Food population;
- quarantine/case-management implementation;
- release-diff execution machinery;
- search projection migration;
- Food Library V2 search cutover;
- full capability/RBAC control-plane architecture;
- correction-case workflows;
- backup/export/restore tooling;
- legacy-retirement migration;
- Production activation execution;
- Production generation promotion;
- member runtime V2 cutover;
- application deployment.

Those remain in later plans and/or separate explicit Production authorities.

## 3. Governing invariants

The following are hard requirements.

1. **Catalog Generation is the sole authority for what is currently effective.**
2. No current fact may be selected from `MAX(revision)`, latest timestamp, insertion order, maximum ID, arbitrary first row, importer preference, or guessed source priority.
3. Catalog Generation content is immutable after construction.
4. Generation composition references immutable canonical facts; it does not duplicate nutrition/name/serving values as a new truth store.
5. There is at most one current generation pointer for the catalog.
6. Successful ingestion does not imply activation.
7. Activation does not imply member visibility.
8. Activation does not imply Catalog Generation promotion.
9. Promotion is a separate privileged audited operation.
10. Rollback changes the current pointer; it does not destructively rewrite generations or canonical facts.
11. Unknown nutrition remains `NULL`; known source zero remains `0`.
12. No generic household or `ml ↔ g` conversion is introduced.
13. Verification is assertion-based, scoped, immutable, and superseding/revoking; mutable `is_verified` is not final authority.
14. Trust is derived and explainable; no opaque numeric score is introduced.
15. Redirects in a generation are flattened direct mappings to a current active survivor; chains are rejected.
16. Historical Diary/Recipe/Saved Meal/Meal Plan snapshots are never rewritten.
17. My Foods and personal state are not mutated by Plan 3.
18. Physical Plan 3 control-plane tables are server-only; anon/authenticated direct CRUD is denied.
19. Plan 3 implementation may add a forward schema migration, but merging code/migration does not authorize applying it to Production.
20. Plan 4 is not started by Plan 3.

## 4. Current-effective authority model

### 4.1 Sole authority

A promoted Catalog Generation is the only long-term authority for current effective catalog state.

The generation composition determines, for each included canonical Food, the exact effective:

- lifecycle/survivor state;
- nutrition revision;
- serving fact set;
- name/localization fact set;
- taxonomy assignment fact set;
- market assignment fact set;
- verification assertion selection;
- activation authority;
- flattened redirect state where relevant;
- policy/projection versions required to interpret that generation.

The existing mutable compatibility fields on `food_items` remain transitional implementation during migration. They are not allowed to become parallel current authority for Plan 3 current reads.

### 4.2 Draft invisibility

Draft facts can be stored and reviewed without appearing in the current generation. Therefore their existence does not make them member-visible.

The intended flow is:

```text
source/curation facts
  → draft canonical facts
  → deterministic validation
  → immutable Activation Set / Grant
  → candidate generation
  → generation validation
  → explicit promotion
  → current-generation visibility
```

No earlier step authorizes a later step automatically.

## 5. Full immutable generation composition

### 5.1 Chosen representation

Plan 3 uses **full immutable generation composition**, not runtime delta inheritance.

Each generation contains the exact effective composition for all Foods included in that generation. A generation may record its base generation as construction/audit metadata, but current reads never reconstruct authority by walking a base/delta chain.

This is chosen because it gives deterministic:

- auditability;
- rollback;
- replay;
- debugging;
- disaster-recovery interpretation;
- search-generation versioning later;
- exact-head QA.

### 5.2 No value duplication

Generation composition references existing immutable fact IDs. It does not copy nutrition values or localized name text into generation rows as a second canonical source of truth.

For example:

- a generation Food row references one exact nutrition revision ID;
- generation-serving rows reference exact serving option IDs;
- generation-name rows reference exact name fact IDs;
- generation-taxonomy rows reference exact assignment IDs;
- generation-market rows reference exact assignment IDs;
- generation-verification rows reference exact assertion IDs.

Every selected fact must belong to the same Food represented by the generation entry.

### 5.3 Generation identity

A generation uses a stable opaque UUID as identity.

It may also carry a human-readable monotonic ordinal/version for diagnostics and operator UX, but that ordinal is **never** current authority. Code must never select the current generation using `MAX(generation_number)`.

A generation records at minimum:

- `generation_id`;
- optional `base_generation_id` construction provenance;
- `composition_schema_version`;
- `generation_policy_version`;
- relevant trust/activation policy versions;
- search/projection version metadata reserved for Plan 5 integration;
- deterministic `composition_checksum`;
- immutable creation metadata;
- authority/reference context used to construct it.

## 6. Candidate generation construction

### 6.1 Explicit base plus exact changes

A candidate generation is constructed from:

1. an explicitly selected base generation, or `NULL` for the first/bootstrap candidate;
2. an exact change manifest;
3. explicitly selected fact IDs and lifecycle results;
4. deterministic validation rules.

Construction may use the base generation as input to make planning efficient, but the output is always a full immutable snapshot.

### 6.2 Candidate creation is not publication

Creating a candidate generation does not:

- switch the current pointer;
- activate Foods;
- modify `food_items` lifecycle authority;
- make Foods member-visible;
- revoke any prior generation;
- deploy the app;
- mutate Production unless separately authorized.

### 6.3 Composition checksum

Generation content must have a deterministic semantic checksum calculated over a canonical ordering and canonical serialization of all authority-bearing composition elements and interpretation versions.

The checksum must change when any effective selection or interpretation authority changes.

At minimum the checksum includes:

- generation composition schema version;
- policy versions;
- Food IDs and effective lifecycle states;
- selected nutrition revision IDs;
- selected serving option IDs;
- selected name fact IDs;
- selected taxonomy assignment IDs;
- selected market assignment IDs;
- selected verification assertion IDs/scopes;
- activation authority references;
- redirect pairs;
- relevant projection/search version metadata.

Metadata that is not semantically part of the current catalog, such as database row insertion timestamps, must not accidentally change the checksum.

## 7. Activation Set / Grant authority

### 7.1 Separation from generation promotion

Plan 3 models activation as immutable evidence that a deterministic set of Foods passed activation gates and became **eligible** to appear as active in a candidate generation.

Activation by itself does not make a Food visible.

The binding sequence is:

```text
ingestion/draft
  ≠ activation
activation
  ≠ generation promotion
promotion
  = current member-visible authority
```

### 7.2 Activation Set structure

An Activation Set is an immutable manifest with a stable ID and deterministic checksum.

It records at minimum:

- `activation_set_id`;
- activation policy version;
- manifest schema version;
- deterministic manifest checksum;
- authority reference;
- creation metadata;
- exact member set.

Each activation member records at minimum:

- canonical `food_id`;
- expected precondition lifecycle/state, normally draft;
- exact evidence/validation reference or member evidence checksum;
- source/legal/provenance acceptance result required by the activation policy;
- identity-resolution status;
- nutrition-basis validation status where nutrition exists;
- display-identity validation status;
- unresolved-duplicate/blocking result;
- target eligibility for active composition;
- member checksum if used by the implementation.

### 7.3 Immutable activation events

Execution/approval/result history is represented through immutable activation events rather than mutating the activation manifest into arbitrary states.

Events may represent concepts such as:

- created;
- approved;
- execution-accepted;
- execution-rejected;
- revoked/invalidated when later evidence requires it.

The exact event vocabulary belongs in the implementation plan, but the core requirement is immutable event history plus deterministic current eligibility derivation.

### 7.4 Generation activation precondition

A Food may appear as `active` in a generation only if the generation entry references valid activation authority for that Food under the generation's activation policy.

A generation must not infer activation eligibility from:

- root lifecycle fields alone;
- provider status;
- ingestion success;
- lack of errors;
- verification status alone.

### 7.5 Rollback does not erase activation evidence

Moving the current pointer to a previous healthy generation does not delete or rewrite activation evidence. Activation authority and publication authority remain separate historical facts.

## 8. Verification assertion chains

### 8.1 Existing model retained and strengthened

Plan 1 already stores scoped immutable verification assertions with:

- Food ID;
- scope;
- `verified | revoked` state;
- policy version;
- optional source record;
- optional superseded assertion ID;
- reason code;
- authority reference.

Plan 3 defines the missing effective-state semantics.

### 8.2 Linear same-Food/same-scope chains

For each `(food_id, assertion_scope)`, assertions form a linear immutable chain.

Rules:

- an initial assertion has no predecessor;
- a subsequent assertion may supersede only the current chain head of the same Food and same scope;
- cross-Food supersession is invalid;
- cross-scope supersession is invalid;
- self-supersession is invalid;
- forked successors from the same predecessor are invalid;
- cycles are invalid;
- previously written assertion rows are immutable.

Plan 1 already enforces same-Food/same-scope supersession on insert. Plan 3 must add the missing no-fork/current-head invariant at the database/service boundary without rewriting historical Plan 1 migrations.

### 8.3 Current verification is generation-selected

The effective verification state for a promoted Food is not `latest assertion by time`.

A generation explicitly selects the effective assertion ID for each relevant verification scope.

If the selected assertion state is `revoked`, that scope is not verified in that generation.

The generation validator must ensure selected assertions:

- exist;
- belong to the same Food;
- match the declared scope;
- satisfy chain consistency;
- are interpretable under the generation policy.

## 9. Trust Profile

### 9.1 Explainable structured output

Plan 3 introduces a pure derived `TrustProfile`. It is not an independently mutable truth object and does not use an opaque numeric score.

A Trust Profile should expose enough structured state to explain the user-facing result, including at minimum:

- generation ID;
- canonical Food ID;
- effective lifecycle;
- identity verification state;
- nutrition verification state;
- serving verification state;
- barcode/localization verification when applicable;
- activation/source-evidence acceptance state;
- blocking-condition state;
- completeness indicators separate from verification;
- final `verified` boolean;
- policy version(s) used for derivation.

### 9.2 User-facing Verified rule

The minimum rule for `verified === true` is:

1. Food is `active` in the current promoted generation;
2. effective identity scope is verified;
3. effective nutrition scope is verified;
4. the Food has approved activation/source evidence under the active policy;
5. no unresolved blocking condition applies to that effective composition.

Serving verification is **not** required for the final Verified label. A Food may be verified while exposing only grams/ml or otherwise limited authoritative serving options.

### 9.3 Completeness is separate

Completeness must not be conflated with correctness or trust.

Examples:

- a Food may have accurate verified nutrition with some optional nutrients `NULL`;
- a Food may be verified but have no household serving;
- a Food may have localization incomplete while identity/nutrition trust remains valid.

Unknown nutrient values remain `NULL`, never converted to zero to improve completeness.

### 9.4 Compatibility projection

Plan 2's compatibility projector accepts externally supplied trust input. Plan 3 current-generation service derives the authoritative Trust Profile and passes only the resulting compatibility boolean/projection into the legacy compatibility shape.

The compatibility projector must remain pure and must not independently query assertions or guess trust.

## 10. Blocking validation boundary

### 10.1 Plan 3 does not pull Plan 4 quarantine forward

Plan 3 needs a deterministic way to prevent unsafe activation/promotion before Plan 4's full quarantine/case-management system exists.

Therefore Plan 3 defines a stable validation interface, not a quarantine workflow.

A validation finding contains at minimum:

- stable reason code;
- optional Food ID;
- severity;
- blocking boolean;
- evidence/reference context;
- validator/policy version;
- deterministic details payload where needed.

### 10.2 Immutable validation report

Candidate generation validation produces an immutable report with:

- generation ID;
- generation checksum;
- validator set/policy version;
- deterministic report checksum;
- counts by severity/reason;
- exact blocking findings;
- created metadata.

Promotion requires zero unresolved blocking findings under the exact candidate checksum being promoted.

Plan 4 may later attach quarantine cases/resolutions to the same reason codes and evidence interfaces without changing Plan 3 generation authority.

## 11. Current-generation read service

### 11.1 Purpose

Plan 3 adds a server-only current read path over Plan 2's raw domain storage.

The logical flow is:

```text
read current-generation pointer
  → resolve requested Food through generation redirect map
  → load exact generation Food entry
  → load exact selected immutable fact IDs
  → hydrate canonical facts
  → validate same-Food consistency
  → derive TrustProfile
  → optionally project through Plan 2 compatibility projector
```

### 11.2 No scanning for authority

The current read service must never fetch all revisions/names/servings and then choose a current fact by ordering.

It may use Plan 2 raw store capabilities for control-plane diagnostics, but member/current authority comes from explicit generation composition rows.

### 11.3 Public boundary

The safe Food Catalog server index may expose domain-safe current-generation contracts/services, but it must not export raw Supabase control-plane adapters or a generic privileged client.

### 11.4 Member runtime cutover is deferred

Plan 3 may fully implement and test the current-generation service while normal member Nutrition/Food Library runtime remains on the legacy compatibility adapter until a later explicit cutover authority.

This is important because Production currently has no populated global Food Catalog and no promoted generation.

## 12. Flattened redirect projection

### 12.1 Generation redirect authority

Each generation contains a direct redirect projection for merged canonical IDs:

`old_food_id → active_survivor_food_id`

Generation redirect projection is the current-effective identity authority for generation-aware reads.

### 12.2 No chains

Redirect chains are invalid.

If historical merge evidence implies:

```text
A → B
B → D
```

the new generation must materialize:

```text
A → D
B → D
```

The survivor must be an active canonical member of the same generation and must not itself redirect.

### 12.3 Transitional root redirect fields

`food_items.merged_into_food_id` and Plan 2's one-hop resolver remain compatibility/migration input while consumers migrate.

Plan 3 does not extend that legacy resolver into arbitrary chain walking. The generation projection is the target current authority.

## 13. Promotion, revocation, and rollback

### 13.1 Single current pointer

A singleton catalog-current row contains the only mutable operational pointer to the current promoted generation.

The pointer may be `NULL` before the catalog is initialized.

No code may infer current state from generation creation order or generation ordinal.

### 13.2 Atomic promotion

Promotion is an atomic privileged command with optimistic concurrency / compare-and-swap semantics.

The command must provide at minimum:

- candidate generation ID;
- expected current generation ID, including explicit `NULL` for bootstrap;
- expected candidate checksum;
- operation/idempotency ID;
- authority/principal context;
- reason/approval reference.

Within one database transaction, promotion must:

1. lock/read the singleton current pointer;
2. verify it matches `expected_current_generation_id`;
3. verify candidate identity/checksum;
4. verify immutable validation report belongs to the same candidate checksum and has zero blockers;
5. verify generation composition/activation/verification/redirect invariants;
6. append a promotion event;
7. switch the singleton current pointer to the candidate;
8. commit atomically.

A stale concurrent promotion must fail. Last-write-wins is not acceptable.

### 13.3 Immutable generation events

Promotion/revocation/rollback history is append-only.

Each event records at least:

- operation ID;
- event type;
- from generation ID;
- to generation ID when relevant;
- generation checksum(s) needed for audit;
- authority/principal context;
- policy version;
- reason/approval reference;
- timestamp.

### 13.4 Rollback

Rollback explicitly selects a known previous healthy generation; it does not mean "previous ordinal" or "latest before current" unless that exact ID is supplied and validated.

Rollback is atomic:

1. verify current expected generation;
2. verify target rollback generation is immutable and structurally valid;
3. append rollback/revocation event;
4. switch current pointer;
5. commit.

No generation/fact/event is deleted.

## 14. Concurrency and idempotency

### 14.1 Candidate construction

Generation construction must either complete as one coherent immutable composition or fail without leaving a partially authoritative generation.

If implementation needs a staged internal construction state, staged rows must not be eligible for promotion until a final sealed/checksummed generation record exists. The implementation plan must prefer transactional construction where practical.

### 14.2 Operation IDs

Privileged mutating commands use unique operation IDs for safe retries.

Repeating an already-completed operation ID with identical semantic input returns/reconciles the same result. Reusing the operation ID for different semantic input is rejected.

### 14.3 Current pointer serialization

Promotion/rollback commands serialize on the singleton pointer using a row lock and explicit expected-current comparison. There must never be two current generation rows/pointers.

## 15. Control-plane boundary

### 15.1 Server-only command surface

Plan 3 privileged operations are implemented as internal server-only commands/services.

They are not exposed directly as generic member/admin CRUD endpoints.

### 15.2 Authority context

Commands carry explicit audited authority context, conceptually including:

- `principalId`;
- `principalType`;
- `authorityReference`;
- `operationId`;
- `reasonCode`;
- policy version(s).

This gives Plan 3 durable audit semantics without prematurely implementing Plan 6's final capability security model.

### 15.3 Plan 6 remains authority for capabilities

Plan 3 must not invent a new permanent `role === admin` authorization scheme.

Plan 6 will implement capability-based curation/verification/activation/generation-promotion authority and stronger break-glass policy.

Until then, Plan 3 commands remain internal, server-only, and inaccessible from member surfaces.

### 15.4 Credentials

Privileged Supabase credentials remain server-only. No generic service-role client may be exported to browser code, mobile clients, member MCP tokens, logs, analytics, or broad product utilities.

## 16. Proposed forward schema

Plan 3 is expected to require one additive forward migration. Historical Plan 1 migrations remain byte-immutable.

The exact implementation plan may refine names while preserving this architecture, but the target physical model is:

### 16.1 Activation authority

`food_catalog_activation_sets`

- immutable set identity;
- manifest schema/policy versions;
- manifest checksum;
- authority reference;
- creation metadata.

`food_catalog_activation_set_members`

- activation set ID;
- Food ID;
- expected precondition state;
- evidence/validation reference or checksum;
- activation eligibility result fields required by policy;
- uniqueness per activation set/Food;
- same-Food evidence constraints where references exist.

`food_catalog_activation_events`

- immutable event log;
- operation ID unique;
- activation set ID;
- event type;
- authority/principal context;
- reason/reference;
- created timestamp.

### 16.2 Generation authority

`food_catalog_generations`

- generation ID;
- optional base generation ID;
- optional human ordinal;
- composition schema version;
- policy versions;
- composition checksum;
- immutable sealed creation metadata.

`food_catalog_generation_foods`

- generation ID;
- Food ID;
- effective lifecycle;
- selected nutrition revision ID where required;
- activation set/member authority for active Foods;
- per-Food interpretation/checksum metadata if needed;
- unique generation/Food;
- composite/same-Food foreign-key enforcement.

`food_catalog_generation_servings`

- generation ID;
- Food ID;
- serving option ID;
- deterministic role/order metadata only where product semantics require it;
- same-Food FK.

`food_catalog_generation_names`

- generation ID;
- Food ID;
- name fact ID;
- explicit selection/presentation role where needed;
- same-Food FK.

`food_catalog_generation_taxonomy`

- generation ID;
- Food ID;
- taxonomy assignment ID;
- same-Food FK.

`food_catalog_generation_markets`

- generation ID;
- Food ID;
- market assignment ID;
- same-Food FK.

`food_catalog_generation_verification`

- generation ID;
- Food ID;
- verification scope;
- exact assertion ID;
- unique generation/Food/scope;
- same-Food/scope enforcement.

`food_catalog_generation_redirects`

- generation ID;
- source Food ID;
- target active survivor Food ID;
- unique generation/source;
- no self redirect;
- validator/DB guard rejects target redirects/chains.

### 16.3 Validation/audit/current pointer

`food_catalog_generation_validation_reports`

- immutable report identity;
- generation ID;
- exact generation checksum;
- validator/policy version;
- report checksum;
- summary counts/details needed for audit;
- created metadata.

Blocking findings may be normalized into a child table if that gives stronger relational integrity and queryability. A JSON details payload is acceptable only as supporting evidence, not as replacement for core authority fields.

`food_catalog_generation_events`

- immutable promotion/rollback/revocation event log;
- unique operation ID;
- from/to generations;
- authority/principal context;
- reason/reference;
- policy version;
- timestamps.

`food_catalog_current_generation`

- singleton row;
- nullable `current_generation_id`;
- minimal operational metadata needed for concurrency/audit;
- this pointer is the only intentionally mutable Plan 3 catalog-authority row.

### 16.4 Relational authority over JSON

Current fact composition must be normalized and foreign-key-backed. JSON arrays must not become the authoritative representation of selected nutrition/name/serving/taxonomy/market/verification facts.

JSON may be used for immutable supporting manifests, evidence details, or validation diagnostics when relational columns/FKs still carry core authority.

## 17. Immutability and database enforcement

### 17.1 Immutable tables

All Plan 3 activation manifests, activation members, generations, generation composition rows, validation reports/findings, and audit events are immutable after insertion/sealing.

They use the existing private immutable-row rejection pattern or a Plan 3 equivalent.

### 17.2 Mutable exception

`food_catalog_current_generation` is the sole intentionally mutable current-authority row.

Its mutation is not available through generic table CRUD. It is changed only through narrowly scoped server/database promotion/rollback commands that enforce compare-and-swap and audit insertion.

### 17.3 Verification-chain hardening

The Plan 3 migration adds forward-only constraints/guards so verification supersession cannot fork or supersede a non-current predecessor for the same Food/scope.

Existing applied Plan 1 migration files are not edited.

### 17.4 Same-Food integrity

Selected generation fact IDs must be database-enforced to belong to the generation Food wherever relational structure permits.

The migration/implementation plan should add composite uniqueness/FKs on canonical fact tables where needed rather than depending only on application casts.

## 18. RLS and privileges

Every new Plan 3 table enables RLS.

Default member posture:

- `anon`: no direct CRUD;
- `authenticated`: no direct CRUD;
- privileged server/control-plane execution: explicit narrowly scoped access.

Member/product code reads current catalog only through Food Catalog server contracts, not direct generation tables.

The implementation must update architecture-boundary tests so direct references to Plan 3 physical tables are allowed only inside approved Food Catalog persistence/control-plane modules and migration/tests.

## 19. Bootstrap / no-current-generation behavior

### 19.1 No fake Generation 0

Plan 3 migration does not create an artificial promoted generation merely to avoid `NULL`.

The singleton current pointer starts with `current_generation_id = NULL` if no real catalog generation has been separately promoted.

### 19.2 Current service behavior

When no current generation exists, the generation-aware current read service returns an explicit typed/unambiguous unavailable/not-initialized result or error. It must not silently fall back to `latest generation`, root fields, or raw Plan 2 arrays.

### 19.3 Legacy runtime continuity

Normal member runtime may remain on the existing legacy compatibility path until a later exact cutover authority. Plan 3 therefore does not break the development app simply because the new current-generation pointer is `NULL`.

## 20. Production and migration authority

### 20.1 Repository implementation

A Plan 3 implementation PR may contain an additive forward migration and all required domain/service/tests.

### 20.2 No automatic Production apply

Merging that PR does **not** authorize applying the migration to Production.

After implementation is independently QA/QC approved, Production schema apply requires a separate exact Planner/user authorization identifying the exact migration/head.

### 20.3 Production schema apply still does not authorize data operations

Even after a separately approved Production schema migration, the following remain `NO` until separately authorized:

- Food population;
- provider ingestion;
- activation-set execution;
- Catalog Generation promotion;
- member runtime V2 cutover;
- USDA canary;
- application deployment;
- Activity Catalog mutation.

## 21. Required services and contracts

The implementation plan should create focused modules rather than one monolithic generation service.

Expected logical units include:

1. **Plan 3 domain contracts/validators**
   - activation set/member contracts;
   - generation contracts;
   - validation findings/report contracts;
   - Trust Profile contracts;
   - promotion/rollback authority context.

2. **Generation persistence ports/adapters**
   - read current pointer;
   - read exact generation composition;
   - append activation/generation/validation/event artifacts;
   - controlled pointer transition.

3. **Activation validator/service**
   - deterministic activation-member validation;
   - activation grant eligibility derivation;
   - no visibility side effects.

4. **Generation builder**
   - explicit base/change input;
   - full immutable composition output;
   - deterministic checksum.

5. **Generation validator**
   - same-Food selections;
   - activation authority;
   - verification selection;
   - redirects;
   - blocking findings.

6. **Trust projector**
   - pure function from effective generated selections/activation/validation state to `TrustProfile`.

7. **Current-generation read service**
   - current pointer read;
   - generation redirect resolution;
   - exact fact hydration;
   - Trust Profile;
   - compatibility projection integration.

8. **Promotion/rollback command service**
   - compare-and-swap pointer;
   - exact validation/checksum preconditions;
   - append-only event audit;
   - idempotency.

Raw Plan 3 Supabase adapters remain internal and must not be re-exported from the broad product surface.

## 22. Error handling

Errors must distinguish operational categories without leaking privileged internals to member surfaces.

Plan 3 should have stable failure classes/codes for at least:

- no current generation;
- generation not found;
- generation checksum mismatch;
- generation not fully sealed/valid;
- blocking validation findings;
- stale expected-current pointer;
- invalid activation authority;
- selected fact belongs to another Food;
- invalid verification chain/selection;
- redirect chain/non-active survivor;
- duplicate/reused operation ID with conflicting payload;
- unauthorized control-plane invocation at the command boundary.

Member-compatible errors remain bounded and non-sensitive. Control-plane diagnostics preserve exact reason/evidence references.

## 23. Observability required now vs later

Plan 3 records enough immutable events/metadata to audit generation state transitions.

It does not build the full Plan 6 observability platform.

Minimum Plan 3 evidence includes:

- activation set/checksum;
- generation/checksum;
- validation report/checksum;
- promotion/rollback event IDs;
- from/to generation IDs;
- operation ID;
- policy versions;
- authority reference;
- deterministic blocker counts/reason codes.

Plan 6 may later aggregate metrics/dashboards without changing this authority model.

## 24. Testing and QA acceptance criteria

Plan 3 implementation is not complete until all of the following are proven.

### 24.1 Generation authority

- current facts are selected only through generation composition;
- no latest-row/max-revision/timestamp heuristic exists in generation-aware current reads;
- full generation composition is immutable;
- generation checksum is deterministic across canonical ordering;
- semantic composition change changes checksum;
- non-semantic insertion metadata does not change checksum.

### 24.2 Same-Food integrity

- selected nutrition revision belongs to the generation Food;
- selected serving belongs to the generation Food;
- selected name belongs to the generation Food;
- taxonomy/market assignment selections belong to the generation Food;
- selected verification assertion belongs to the same Food/scope;
- cross-Food selections are rejected at both domain and database boundaries where possible.

### 24.3 Activation

- ingestion/draft alone cannot make a Food active in a valid generation;
- active generation member requires exact activation authority;
- invalid/revoked activation authority blocks validation/promotion;
- activation does not mutate current-generation pointer;
- activation alone does not create member visibility.

### 24.4 Verification

- same-Food/same-scope supersession is allowed;
- cross-Food/scope supersession is rejected;
- forked assertion chain is rejected;
- superseding a non-current predecessor is rejected;
- selected revoked assertion does not project that scope as verified;
- generation never derives verification by timestamp order.

### 24.5 Trust

- Verified formula exactly follows the approved minimum gates;
- serving verification is not required for overall Verified;
- blocking condition makes Verified false;
- lifecycle other than active makes Verified false;
- missing optional nutrients remain `NULL` and do not become zero;
- completeness is reported separately from trust.

### 24.6 Redirects

- direct old-ID → active survivor works;
- self redirect is rejected;
- target that redirects again is rejected;
- target not active in same generation is rejected;
- A→B and B→D cannot survive as a chain; candidate must materialize A→D and B→D;
- historical snapshots remain unchanged.

### 24.7 Promotion/concurrency

- promotion requires exact expected-current pointer;
- stale concurrent promotion fails;
- candidate checksum mismatch fails;
- candidate with blocking findings fails;
- candidate without required activation authority fails;
- successful promotion appends audit event and switches pointer in one transaction;
- repeated identical operation ID is idempotent/reconcilable;
- conflicting reuse of an operation ID is rejected.

### 24.8 Rollback

- rollback requires explicit target generation ID;
- rollback does not infer a target from max/ordinal/time;
- rollback appends audit event and atomically changes pointer;
- no generation/fact/event is deleted;
- previous/current generation composition remains byte/semantic immutable.

### 24.9 Bootstrap

- Plan 3 schema can exist with zero Foods and `NULL` current generation;
- no fake generation is inserted by migration;
- current-generation service handles `NULL` pointer explicitly;
- legacy member runtime remains stable because Plan 3 does not cut it over.

### 24.10 Security/boundary

- RLS is enabled on every new Plan 3 table;
- anon/authenticated direct CRUD is revoked;
- physical Plan 3 table access is restricted to approved persistence/control-plane modules;
- no generic service-role client is exported;
- no member/browser surface gains privileged generation mutation capability.

### 24.11 Migration/repository safety

- only a new forward migration is created;
- Plan 1 migration blobs remain unchanged;
- migration is transactional and has local verification/rollback fixtures;
- migration ledger is reconciled only under the repository's approved migration workflow;
- compatibility marker is not promoted by Plan 3 implementation;
- Production migration is not applied without separate exact approval.

### 24.12 Scope

At final implementation handoff, all must be true unless separately authorized later:

- Production Food population: **NO**
- provider ingestion: **NO**
- Production activation execution: **NO**
- Production Catalog Generation promotion: **NO**
- member runtime V2 cutover: **NO**
- Activity Catalog mutation: **NO**
- application deployment: **NO**
- Plan 4 started: **NO**
- implementation PR merged: **NO** until Planner QA/QC approval.

## 25. Implementation sequencing constraints

The implementation plan must preserve dependency order.

Recommended internal sequence:

1. domain contracts and pure validators;
2. migration/schema + migration verifier;
3. generation/activation persistence ports and strict adapters;
4. verification-chain hardening;
5. activation-set service;
6. full generation builder/checksum;
7. generation validator/blocking report;
8. Trust Profile projector;
9. current-generation read/hydration service;
10. promotion/rollback CAS command path;
11. boundary/security tests;
12. roadmap/continuity reconciliation and exact-head verification.

Every task uses TDD with explicit RED/GREEN evidence under the available execution mode.

## 26. Relationship to Plan 4

Plan 4 builds deterministic provider ingestion, quarantine/resolution, release-diff operations, run leases, and execution reconciliation **on top of** Plan 3 authority.

Plan 4 may create draft facts and feed validation/quarantine evidence, but it must not replace:

- activation authority;
- generation composition authority;
- promotion authority;
- current pointer authority;
- Trust Profile derivation authority.

The Plan 3 validation finding/reason-code interface is intentionally stable so Plan 4 quarantine can attach cases to blockers without redesigning generation logic.

## 27. Relationship to Plan 5

Plan 5 search documents/projections are generation-aware derived state.

A search document identifies its source generation/projection version. Generation promotion later invalidates/rebuilds derived search state deterministically.

Plan 3 does not implement the search projection itself.

## 28. Relationship to Plan 6

Plan 6 replaces temporary/internal command authorization with the durable capability-based privileged control plane and adds correction/curation cases, observability, emergency withdrawal, and break-glass recovery.

Plan 3's authority/principal/audit fields are designed so Plan 6 can strengthen who may execute commands without changing what generation/activation events mean.

## 29. Recovery semantics

Plan 3 rollback protects against a bad promoted generation at the logical catalog layer.

It is not a substitute for database disaster recovery.

The model preserves:

- immutable source/canonical facts;
- immutable generation compositions;
- immutable validation reports;
- immutable promotion/rollback history;
- explicit current pointer state.

Plan 7 later adds provider-neutral export/restore verification and search rebuild verification.

## 30. Planner implementation gate

This design is approved at the architecture level, but implementation remains blocked until:

1. this written specification is reviewed/approved by the user/Planner;
2. a formal implementation plan is created using the Superpowers `writing-plans` workflow;
3. that plan is explicitly approved;
4. implementation starts from the then-current authoritative `main` under the approved execution workflow.

No Production mutation is authorized by approval of this design/spec.
