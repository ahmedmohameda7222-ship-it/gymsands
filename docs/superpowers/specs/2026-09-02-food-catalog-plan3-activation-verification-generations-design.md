# Plaivra Food Catalog Plan 3 — Activation, Verification, Trust, and Catalog Generations Design

Status: **Implementation complete on review branch; Planner QA/QC and canonical phase-close Quality pending**
Date: **2026-09-02**  
Architecture class: **Architectural / long-term target design**  
Parent architecture: `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`  
Program roadmap: `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`  
Implementation authority: **Not granted by this document**  
Production mutation authority: **Not granted by this document**

Production migration apply, Food population, provider ingestion, Production activation execution, Catalog Generation promotion, member runtime V2 cutover, deployment, Activity Catalog mutation, and Plan 4 remain separately authorized operations.

## 1. Purpose

Plan 3 introduces the authority that Plan 2 intentionally refused to guess: a deterministic, auditable answer to **which canonical Food facts are currently effective**.

Plan 1 created immutable/versioned Food facts. Plan 2 created strict Food Catalog server persistence boundaries and deliberately returned raw V2 fact arrays without choosing a current revision, name, serving, verification assertion, or canonical survivor from row ordering.

Plan 3 establishes:

- exact deterministic activation authority;
- linear assertion-based verification supersession/revocation authority;
- full immutable Catalog Generation composition;
- a single current-generation pointer;
- current-generation reads;
- flattened generation redirect projection;
- structured derived Trust Profile output;
- immutable validation evidence;
- atomic promotion and rollback semantics;
- concurrency and idempotency guarantees.

The Plan 3 exit condition is:

> Draft facts can exist without becoming member-visible; activation is separate from visibility; generation promotion is a separate audited operation; current reads are generation-authoritative; and the current pointer can be rolled back to an explicitly selected previous healthy generation without destructive deletion or rewriting.

## 2. Authority and non-goals

This document refines the parent Food Catalog architecture only for Plan 3. The parent architecture remains higher authority unless a later explicit Planner/user decision supersedes it.

### Plan 3 owns

Plan 3 owns the target architecture for:

- activation eligibility;
- candidate generation construction;
- promoted generation composition;
- verification assertion chain rules;
- derived trust projection;
- generation validation reports;
- current generation pointer semantics;
- promotion/revocation/rollback event semantics;
- current effective Food reads;
- generation-level canonical redirect projection.

### Plan 3 does not own

Plan 3 does not implement or authorize:

- provider-specific ingestion adapters;
- USDA parsing/import;
- Production Food population;
- quarantine/case-management implementation;
- release-diff operations;
- search projection migration;
- Food Library V2 search cutover;
- permanent capability/RBAC control-plane architecture;
- correction-case workflows;
- backup/export/restore tooling;
- legacy retirement;
- Production activation execution;
- Production generation promotion;
- member runtime V2 cutover;
- application deployment.

Those remain later-plan or separately approved operations.

## 3. Binding invariants

1. **Catalog Generation is the sole authority for what is currently effective.**
2. No current fact is selected from `MAX(revision)`, latest timestamp, insertion order, maximum ID, arbitrary first row, importer preference, or guessed source priority.
3. Generation composition is immutable after sealing.
4. Generations reference immutable canonical fact IDs; they do not duplicate nutrition/name/serving values into a second truth store.
5. There is exactly one singleton current-generation pointer, which may be `NULL` before catalog initialization.
6. Ingestion does not imply activation.
7. Activation does not imply visibility.
8. Activation does not imply generation promotion.
9. Promotion is a separate privileged audited operation.
10. Rollback changes the current pointer; it does not rewrite generation/fact history.
11. Verification is assertion-based and scoped; mutable `is_verified` is not authority.
12. Trust is derived and explainable; no opaque numeric trust score is introduced.
13. Unknown nutrition remains `NULL`; known source zero remains `0`.
14. No generic household or `ml ↔ g` conversion is introduced.
15. Generation redirects are direct/flattened to an active survivor; chains are invalid.
16. Historical consumer snapshots are never rewritten.
17. My Foods/personal state are not mutated by Plan 3.
18. Plan 3 physical control-plane tables are server-only with no anon/authenticated direct CRUD.
19. A Plan 3 implementation PR may add a new forward migration, but merge does not authorize Production apply.
20. Plan 4 is not started by Plan 3.

## 4. Current-effective authority

A promoted Catalog Generation is the only long-term authority for current effective catalog state.

The generation determines, through normalized references, the exact effective:

- canonical non-merged Food lifecycle state;
- nutrition revision;
- serving fact set;
- name/localization fact set;
- taxonomy assignment set;
- market assignment set;
- verification assertion selection;
- activation grant reference for active Foods;
- flattened merge redirect map;
- interpretation/policy versions.

Existing mutable compatibility fields on `food_items` remain transitional migration input only. Plan 3 current reads must not treat them as parallel current authority.

Draft facts remain outside the promoted generation and therefore outside normal member visibility.

The intended flow is:

```text
source/curation evidence
  → draft canonical facts
  → deterministic validation
  → immutable Activation Set / Grant
  → candidate generation
  → immutable generation validation report
  → explicit promotion
  → current-generation visibility
```

No step automatically authorizes the next.

## 5. Full immutable generation composition

Plan 3 uses **full immutable snapshots**, not runtime delta inheritance.

A candidate may be constructed from an explicitly selected base generation plus exact changes, but the resulting candidate is materialized as a complete self-contained composition. Runtime reads never walk a base/delta chain.

This model is chosen for deterministic audit, rollback, replay, debugging, DR interpretation, and later search-generation versioning.

### Fact references

Generation composition references canonical immutable fact IDs:

- one exact nutrition revision ID per Food when nutrition is part of the promoted composition;
- exact serving option IDs;
- exact name fact IDs;
- exact taxonomy assignment IDs;
- exact market assignment IDs;
- exact verification assertion IDs by scope.

Every selected fact must belong to the same Food represented by the generation entry.

### Generation identity

A generation has an opaque UUID identity. It may also have a human-readable ordinal for diagnostics, but that ordinal is never authority. `MAX(generation_number)` must never select current state.

A generation records at minimum:

- generation ID;
- optional base generation ID for construction provenance;
- composition schema version;
- generation policy version;
- activation/trust policy versions;
- generation-aware projection/search version metadata reserved for Plan 5;
- deterministic composition checksum;
- immutable creation/sealing metadata;
- authority/reference context.

### Composition checksum

The semantic checksum is calculated from canonical ordering/serialization of all authority-bearing composition and interpretation versions.

It includes at least:

- composition/policy versions;
- Food IDs and effective lifecycle states;
- selected nutrition, serving, name, taxonomy, market, and verification IDs;
- exact activation grant references;
- redirect pairs;
- relevant generation-aware projection version metadata.

Insertion timestamps and other non-semantic storage metadata must not alter the checksum.

## 6. Candidate generation construction

A candidate is built from:

1. an explicitly selected base generation, or `NULL` for bootstrap;
2. an exact change manifest;
3. explicit selected fact IDs/lifecycle results;
4. deterministic validation rules.

Candidate construction is not publication. It does not switch the pointer, activate Foods, make Foods visible, revoke a prior generation, deploy the app, or authorize Production mutation.

The candidate is immutable after sealing/checksum finalization. If implementation requires temporary staging rows, those rows are not promotable authority and must not be exposed as a generation until sealing succeeds.

## 7. Activation Sets and Grants

### Separation from promotion

Activation means a deterministic Food/member set passed activation gates and became **eligible** to appear as `active` in a later generation. Activation itself does not make the Food visible.

```text
draft ≠ activated
activated ≠ promoted
promoted current generation = visibility authority
```

### Activation Set

An Activation Set is an immutable manifest with:

- stable activation-set ID;
- manifest schema version;
- activation policy version;
- deterministic manifest checksum;
- authority reference;
- creation metadata;
- exact member set.

Each member records at least:

- canonical Food ID;
- expected precondition state, normally draft;
- exact evidence/validation reference or evidence checksum;
- approved source/legal/provenance result required by the activation policy;
- identity-resolution status;
- nutrition-basis validation status where nutrition exists;
- display-identity validation status;
- unresolved duplicate/blocking result;
- eligibility outcome;
- member checksum where useful.

### Immutable activation events

Approval/execution/invalidation history is append-only. Exact event vocabulary is implementation-level, but the architecture requires immutable event history and exact grant references.

A generation entry for an active Food references an **exact immutable activation grant/event authority**, not merely an activation-set ID chosen by latest timestamp.

### Non-retroactivity clarification

Later activation invalidation/revocation evidence does **not** mutate the semantics of an already sealed/promoted generation retroactively. It prevents the old grant from being used in future candidate construction and requires a new generation, explicit rollback, or later emergency-withdrawal path to change current effective state.

This preserves the invariant that a generation is the sole current-effective authority.

Rollback to an older generation does not delete activation history.

## 8. Verification assertion chains

Plan 1 already stores immutable scoped assertions with Food ID, scope, `verified | revoked`, policy version, optional source record, predecessor assertion ID, reason code, and authority reference.

Plan 3 defines effective-state semantics and strengthens chain integrity.

For each `(food_id, assertion_scope)`:

- the first assertion has no predecessor;
- a successor may supersede only the current chain head for the same Food/scope;
- cross-Food supersession is invalid;
- cross-scope supersession is invalid;
- self-supersession is invalid;
- forked successors are invalid;
- cycles are invalid;
- prior assertions remain immutable.

Plan 1 already checks same Food/scope on insert. Plan 3 adds forward-only no-fork/current-head enforcement without editing historical migrations.

### Effective verification

Generation verification authority is **exact assertion selection**, not latest assertion discovery.

For every relevant scope, the generation explicitly references one assertion ID. The validator ensures it exists, belongs to the same Food/scope, and is chain-consistent.

A selected `revoked` assertion means that scope is not verified in that generation.

### Non-retroactivity clarification

A verification assertion created after a generation is sealed does not change that generation retroactively. A future generation may select the new assertion. Current verification changes only through generation promotion/rollback (or a future separately designed emergency control-plane operation that still preserves generation authority).

## 9. Trust Profile

Plan 3 introduces a pure derived `TrustProfile`; it is not a mutable truth row and does not use an opaque score.

The profile exposes at minimum:

- generation ID;
- canonical Food ID;
- effective lifecycle;
- identity verification state;
- nutrition verification state;
- serving verification state;
- barcode/localization verification when applicable;
- activation/source-evidence acceptance;
- generation validation/blocking state;
- completeness indicators separate from verification;
- final `verified` boolean;
- policy versions used.

### User-facing Verified rule

`verified === true` requires all of:

1. the Food is `active` in the current promoted generation;
2. effective identity scope is verified;
3. effective nutrition scope is verified;
4. the exact activation grant/source evidence selected by the generation is approved under the generation policy;
5. the exact promotion validation evidence contains no blocking condition for that composition.

Serving verification is **not** required for overall Verified. A Food can be verified while exposing only authoritative gram/ml serving behavior.

Completeness is separate. Missing optional nutrients remain `NULL`, not zero.

Plan 2's compatibility projector stays pure. The Plan 3 current-generation service derives Trust Profile and supplies only the derived compatibility trust boolean to that projector.

## 10. Blocking validation interface

Plan 3 requires a deterministic blocker interface without pulling Plan 4 quarantine/case management forward.

A validation finding contains at least:

- stable reason code;
- optional Food ID;
- severity;
- blocking flag;
- evidence/reference context;
- validator/policy version;
- deterministic details payload where needed.

Candidate validation produces an immutable report containing:

- validation report ID;
- exact generation ID;
- exact generation checksum;
- validator-set/policy version;
- deterministic report checksum;
- counts by severity/reason;
- exact findings;
- creation metadata.

A validation report is evidence about one exact generation checksum. It does not mutate the generation.

If policy/evidence changes materially, the appropriate outcome is a new candidate/generation or a new explicitly referenced validation report under an unchanged deterministic composition where policy permits; promotion never chooses a report by `latest` ordering.

Plan 4 may later attach quarantine cases/resolutions to the same reason codes without changing generation authority.

## 11. Current-generation read service

Plan 3 adds a server-only current read path over the Plan 2 raw persistence layer.

```text
read singleton current pointer
  → resolve requested Food through exact generation redirect map
  → load exact generation Food entry
  → load exact selected immutable fact IDs
  → hydrate canonical facts
  → validate same-Food integrity
  → derive TrustProfile from exact generation/promotion evidence
  → optionally use Plan 2 compatibility projector
```

The service must never fetch all revisions/names/servings and choose one by ordering.

Plan 2 raw bundles remain available for control-plane diagnostics. Current authority comes only from generation composition.

The safe Food Catalog server index may export domain-safe current-generation contracts/services, but raw Supabase adapters and generic privileged clients remain internal.

Member runtime cutover is deferred. Plan 3 can implement/test this service while current Nutrition/Food Library runtime stays on the legacy compatibility path until a later exact authority.

## 12. Lifecycle and flattened redirect representation

To avoid duplicated lifecycle authority inside one generation:

- promoted-generation Food composition rows represent **non-merged canonical identities** with effective lifecycle values such as `active`, `deprecated`, or `withdrawn`;
- `draft` Foods are outside promoted generation composition;
- `merged` source identities are represented by `food_catalog_generation_redirects`, not by a second ambiguous merged lifecycle row.

Each redirect is:

`source_food_id → active_survivor_food_id`

Rules:

- no self redirect;
- target must be an `active` non-merged generation member;
- target must not itself redirect;
- chains are invalid;
- one source has at most one redirect per generation.

If evidence historically contains `A→B` and then `B→D`, a new generation materializes `A→D` and `B→D`.

`food_items.merged_into_food_id` remains transitional compatibility/evidence while migration continues. Plan 3 does not extend the legacy Plan 2 resolver into arbitrary chain walking; generation redirects are the target current authority.

## 13. Promotion, revocation, and rollback

### Single current pointer

A singleton row contains the only mutable operational pointer to the current generation. It may be `NULL` before initialization.

Current must never be inferred from creation order or ordinal.

### Exact promotion command

Promotion requires explicit input including at minimum:

- candidate generation ID;
- expected current generation ID, including explicit `NULL` for bootstrap;
- expected candidate checksum;
- **exact validation report ID**;
- expected validation-report checksum where appropriate;
- operation/idempotency ID;
- authority/principal context;
- reason/approval reference.

Within one transaction, promotion:

1. locks/reads the singleton pointer;
2. verifies it equals the expected current generation;
3. verifies exact candidate ID/checksum;
4. verifies the explicitly supplied validation report belongs to that exact candidate/checksum and has zero blockers;
5. verifies activation, verification, lifecycle, same-Food, and redirect invariants;
6. appends a promotion event that records the exact validation report authority;
7. switches the pointer;
8. commits atomically.

Stale concurrent promotion fails. Last-write-wins is prohibited.

### Immutable generation events

Promotion/rollback/revocation history is append-only and records at least:

- operation ID;
- event type;
- from generation ID;
- to generation ID;
- generation checksum(s);
- exact validation report ID for a promotion when applicable;
- authority/principal context;
- policy version;
- reason/approval reference;
- timestamp.

### Rollback

Rollback explicitly names the target healthy generation. It must not choose `previous` through timestamp/ordinal heuristics.

Within one transaction it verifies the expected current pointer, validates the explicit target, appends the rollback/revocation event, changes the pointer, and commits.

No generation/fact/event is deleted or rewritten.

## 14. Concurrency and idempotency

Privileged mutating commands use unique operation IDs.

- Repeating the same operation ID with identical semantic input reconciles/returns the original result.
- Reusing an operation ID for different semantic input is rejected.

Promotion/rollback serialize on the singleton pointer with row locking and expected-current comparison.

A generation is promotable only after it is fully sealed/checksummed. Partial/staging state can never become current authority.

## 15. Control-plane boundary

Plan 3 privileged commands are internal, server-only command surfaces—not generic member/admin CRUD endpoints.

Commands carry audited context conceptually including:

- principal ID;
- principal type;
- authority reference;
- operation ID;
- reason code;
- policy versions.

Plan 3 does not invent permanent `role === admin` security. Plan 6 remains authority for capability-based control-plane permissions and break-glass policy.

Privileged Supabase credentials remain server-only and must never be exported to browser/mobile/member MCP/log/analytics surfaces.

## 16. Proposed additive schema

Plan 3 is expected to require a new forward migration. Historical Plan 1 migrations remain byte-immutable.

Exact names may be refined in the implementation plan if semantics stay identical.

### Activation authority

`food_catalog_activation_sets`
- immutable set identity;
- manifest/policy versions;
- manifest checksum;
- authority reference;
- creation metadata.

`food_catalog_activation_set_members`
- activation set ID;
- Food ID;
- expected precondition state;
- evidence/validation reference/checksum;
- source/legal/provenance acceptance result;
- identity/nutrition/display/blocking results;
- immutable eligibility result;
- uniqueness per activation set/Food.

`food_catalog_activation_events`
- append-only event log;
- unique operation ID;
- activation set/member authority as applicable;
- event type;
- authority/principal context;
- reason/reference;
- timestamp.

Generation entries must reference an exact immutable activation grant/event authority for active Foods.

### Generation authority

`food_catalog_generations`
- generation ID;
- optional base generation ID;
- optional human ordinal;
- composition schema version;
- policy versions;
- composition checksum;
- immutable sealed metadata.

`food_catalog_generation_foods`
- generation ID;
- Food ID;
- effective non-merged lifecycle (`active | deprecated | withdrawn`);
- exact selected nutrition revision ID where applicable;
- exact activation grant/member authority for active Foods;
- unique generation/Food;
- same-Food relational enforcement.

`food_catalog_generation_servings`
- generation ID;
- Food ID;
- exact serving option ID;
- same-Food FK.

`food_catalog_generation_names`
- generation ID;
- Food ID;
- exact name fact ID;
- explicit selection/presentation role only where required;
- same-Food FK.

`food_catalog_generation_taxonomy`
- generation ID;
- Food ID;
- exact taxonomy assignment ID;
- same-Food FK.

`food_catalog_generation_markets`
- generation ID;
- Food ID;
- exact market assignment ID;
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
- DB/domain validation rejects redirect targets and chains.

### Validation/audit/current pointer

`food_catalog_generation_validation_reports`
- report ID;
- generation ID;
- exact generation checksum;
- validator/policy version;
- report checksum;
- immutable summary metadata.

A normalized child findings table is preferred when it improves relational integrity/queryability. JSON is allowed only for supporting details, not core authority.

`food_catalog_generation_events`
- immutable promotion/rollback/revocation event log;
- unique operation ID;
- from/to generation IDs;
- exact validation report reference where relevant;
- authority/principal context;
- reason/reference;
- policy version;
- timestamp.

`food_catalog_current_generation`
- singleton row;
- nullable current generation ID;
- minimal operational metadata needed for CAS/audit;
- the only intentionally mutable Plan 3 catalog-authority row.

### Relational authority

Current fact composition is normalized and foreign-key-backed. JSON arrays must not become authoritative selected nutrition/name/serving/taxonomy/market/verification state.

JSON may hold immutable supporting manifests or diagnostics when core authority remains relational.

## 17. Immutability and database enforcement

Activation manifests/members, generations, generation composition, validation reports/findings, and audit events are immutable.

The singleton current pointer is the sole mutable Plan 3 authority row and may be changed only through the narrow promotion/rollback command path—not generic CRUD.

The forward migration strengthens verification supersession to reject forks/non-head supersession without modifying the already-applied Plan 1 migration.

Selected generation fact IDs must be DB-enforced to belong to the same Food wherever relational structure permits. Composite uniqueness/FKs are preferred over application-only casts.

## 18. RLS and privilege posture

Every new Plan 3 table enables RLS.

- `anon`: no direct CRUD;
- `authenticated`: no direct CRUD;
- privileged server/control plane: only explicit approved adapter/command paths.

Architecture boundary tests must prevent Plan 3 physical table access outside approved Food Catalog persistence/control-plane modules, migrations, and focused tests.

## 19. Bootstrap / empty catalog

Plan 3 does not create fake Generation 0.

If there is no separately promoted real generation, `current_generation_id` is `NULL`.

The current-generation service must return an explicit not-initialized/unavailable result; it must not silently fall back to latest generation, mutable root fields, or raw Plan 2 arrays.

Legacy member runtime remains stable because Plan 3 does not cut it over under this authority.

## 20. Production authority

A Plan 3 implementation PR may include the additive forward migration plus code/tests.

Merging that PR does **not** authorize Production migration apply.

After independent QA/QC, Production schema apply requires separate exact approval identifying the exact migration/head.

Even after a separately approved schema apply, the following remain separately gated:

- Food population;
- provider ingestion;
- activation-set execution;
- generation promotion;
- member runtime V2 cutover;
- USDA canary;
- deployment;
- Activity Catalog mutation.

## 21. Service boundaries

The implementation plan should keep focused modules for:

1. Plan 3 domain contracts/validators;
2. generation/activation persistence ports and strict adapters;
3. activation validation/grant service;
4. full generation builder/checksum service;
5. generation validator + immutable report builder;
6. pure Trust Profile projector;
7. current-generation read/hydration service;
8. atomic promotion/rollback command service.

Raw Plan 3 Supabase adapters remain internal and are not broadly re-exported.

## 22. Error categories

Stable error classes/codes should distinguish at least:

- no current generation;
- generation not found;
- generation checksum mismatch;
- generation not sealed/valid;
- validation report mismatch;
- blocking findings;
- stale expected-current pointer;
- invalid activation grant;
- selected fact belongs to another Food;
- invalid verification chain/selection;
- redirect chain/non-active survivor;
- conflicting operation-ID reuse;
- unauthorized control-plane invocation.

Member-facing errors remain bounded/non-sensitive; control-plane diagnostics preserve exact reason/evidence references.

## 23. Observability now vs Plan 6

Plan 3 records enough immutable evidence to audit state transitions:

- activation set/grant/checksum;
- generation/checksum;
- validation report/checksum;
- promotion/rollback event IDs;
- from/to generation IDs;
- operation ID;
- policy versions;
- authority reference;
- blocker counts/reason codes.

Plan 6 later adds capability security, richer operational metrics, curation/correction workflows, and break-glass operations without changing this authority model.

## 24. Required QA / acceptance criteria

Plan 3 implementation is incomplete until all are proven.

### Generation authority

- no latest-row/max-revision/timestamp authority exists in generation-aware reads;
- full composition is immutable;
- checksum is deterministic under canonical ordering;
- semantic selection change changes checksum;
- non-semantic storage metadata does not.

### Same-Food integrity

- nutrition/serving/name/taxonomy/market/verification selections belong to the same Food;
- cross-Food selection is rejected at domain and DB boundaries where possible.

### Activation

- draft/ingestion alone cannot create a valid active generation member;
- active member requires an exact activation grant;
- a grant invalidated before candidate sealing cannot be used for new candidate construction;
- later invalidation does not retroactively mutate an already sealed/promoted generation;
- activation never switches current pointer.

### Verification

- same-Food/scope head supersession works;
- cross-Food/scope supersession fails;
- fork/non-head supersession fails;
- selected revoked assertion is not verified;
- later assertion does not retroactively alter an existing generation.

### Trust

- Verified formula matches Section 9 exactly;
- serving verification is not required for overall Verified;
- blocking promotion validation prevents Verified/current promotion;
- lifecycle other than active makes Verified false;
- missing optional nutrients remain `NULL`;
- completeness stays separate.

### Redirects/lifecycle

- merged sources are represented by redirects rather than duplicate merged lifecycle rows;
- direct old ID → active survivor works;
- self/chain/non-active target fails;
- A→B→D must flatten to A→D and B→D;
- historical snapshots remain unchanged.

### Promotion/concurrency

- exact expected-current pointer required;
- exact candidate checksum required;
- exact validation report ID required;
- stale concurrent promotion fails;
- blocker/report mismatch fails;
- missing activation authority fails;
- successful promotion appends audit and switches pointer in one transaction;
- idempotent retry semantics proven;
- conflicting operation-ID reuse rejected.

### Rollback

- exact target generation ID required;
- no target is inferred from ordinal/time;
- rollback atomically appends audit and changes pointer;
- no generation/fact/event is deleted.

### Bootstrap

- schema supports zero Foods and `NULL` current pointer;
- no fake generation inserted by migration;
- current service handles `NULL` explicitly;
- legacy member runtime remains unchanged.

### Security

- RLS on every new Plan 3 table;
- anon/authenticated direct CRUD revoked;
- physical table access restricted to approved internal modules;
- no generic service-role client exported;
- no member/browser privileged generation mutations.

### Migration/repository safety

- only forward migration(s), never rewrite Plan 1 migrations;
- Plan 1 migration blobs remain unchanged;
- migration transactional verifier/rollback fixtures exist;
- compatibility marker not promoted by Plan 3 implementation;
- Production migration not applied without separate exact approval.

### Scope ledger at implementation handoff

Unless separately authorized later:

- Production Food population: **NO**
- provider ingestion: **NO**
- Production activation execution: **NO**
- Production generation promotion: **NO**
- member runtime V2 cutover: **NO**
- Activity Catalog mutation: **NO**
- application deployment: **NO**
- Plan 4 started: **NO**
- implementation PR merged: **NO** until Planner QA/QC approval.

## 25. Implementation sequencing constraints

Recommended internal dependency order:

1. domain contracts and pure validators;
2. additive schema migration + transactional verifier;
3. strict generation/activation persistence ports/adapters;
4. verification-chain hardening;
5. activation-set/grant service;
6. full generation builder + canonical checksum;
7. generation validator + immutable report/findings;
8. Trust Profile projector;
9. current-generation read/hydration service;
10. promotion/rollback CAS command path;
11. boundary/security tests;
12. roadmap/continuity reconciliation + exact-head verification.

Every task uses TDD with explicit RED/GREEN evidence under the approved execution mode.

## 26. Relationship to later plans

### Plan 4

Plan 4 builds deterministic provider ingestion, quarantine/resolution, release-diff operations, run leases, and execution reconciliation on top of Plan 3. It may create drafts and produce blocker evidence, but does not replace activation/generation/promotion authority.

### Plan 5

Plan 5 search documents are generation-aware derived state. Plan 3 reserves generation/projection identity but does not implement search migration.

### Plan 6

Plan 6 adds durable capability-based privileged authorization, curation/correction cases, full observability, emergency withdrawal, and break-glass behavior. Plan 3 preserves authority/principal/audit fields so Plan 6 strengthens authorization without redefining generation semantics.

### Plan 7+

Plan 7 adds provider-neutral export/restore and legacy retirement. Plans 8–10 then execute USDA dry-run/canary/promotion stages under separate exact approvals.

## 27. Recovery semantics

Plan 3 rollback protects against a logically bad promoted generation. It is not database disaster recovery.

The model preserves:

- immutable source/canonical facts;
- immutable activation evidence;
- immutable verification assertions;
- immutable generation composition;
- immutable validation reports;
- immutable promotion/rollback history;
- explicit current pointer state.

Plan 7 later verifies portable restore/export/search rebuild.

## 28. Planner gate

Implementation has been executed on review branch `feat/food-catalog-generation-authority-v3` in Draft PR #165 under the separately approved formal implementation plan. The recorded implementation base is `96dbe4c42f908737e5701df83d8f47356dea6096`.

Task 1–11 implementation evidence at `03a498e4ef6cce1f5460479a6a381795a5c8b067` passed exact-head PR Quality `33679147523`, including lint, typecheck, full unit suite, build, chronological migration replay, DB lint, registered Plan 3 verification SQL, migration ledger, database integration tests, Workout History integration tests, scope/integrity, and required-summary.

Task 12 reconciles status-only documentation and requires a fresh exact-head PR Quality on the final review head. Merge remains blocked until independent Planner QA/QC explicitly approves that exact final head and canonical `.github/workflows/quality.yml` passes after Ready-for-review transition.

The Plan 3 migration `supabase/migrations/20260902150000_food_catalog_generation_authority.sql` remains repository-only pending and unapplied. Production migration apply, Food population, provider ingestion, Production activation execution, Catalog Generation promotion, member runtime V2 cutover, deployment, Activity Catalog mutation, and Plan 4 remain **NO**.

No Production mutation is authorized by this design/spec, implementation completion, review, or merge approval.
