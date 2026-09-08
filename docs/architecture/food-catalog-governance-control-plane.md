# Food Catalog Governance Control Plane — Plan 6

## Status and scope

This document describes the repository authority introduced by Food Catalog Intelligence Plan 6: Catalog Ops & Governance V2.

Plan 6 governs correction intake, evidence, review, canonical correction execution, identity resolution, lifecycle controls, personal overrides, audit/outbox delivery, observability, and governance principal/capability administration. It does not populate Foods, ingest provider datasets, activate Foods, create or promote Catalog Generations, move the current-generation pointer, rebuild or mutate Plan 5 SearchDocuments directly, deploy a release, or modify the Activity Catalog.

The Plan 6 schema change is the single forward migration `supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql`. While PR #173 is under implementation/review, that migration is repository-only and pending. It must not be applied to Production before merge and the standing post-merge migration authority.

## Cross-plan authority boundaries

Plan 6 composes with, and does not replace, the preceding Food Catalog authorities:

- **Plan 1 — canonical facts and immutable history.** Nutrition, serving, name, taxonomy, market, verification, and merge history remain append-oriented canonical facts. Plan 6 named commands add authority records rather than introducing a generic Food update surface.
- **Plan 2 — current-fact semantics.** Current authority is selected through explicit authority heads/revisions; Plan 6 does not infer current truth from `MAX(...)`, timestamps, or insertion order.
- **Plan 3 — generations and serving pointer.** Generation construction, promotion, redirects consumed by later generations, and `food_catalog_current_generation` remain Plan 3 authority. Plan 6 does not create/promote generations or move the pointer.
- **Plan 4 — ingestion.** Provider ingestion remains proposal-oriented and service controlled. Plan 6 Service principals can propose governance work but cannot self-escalate into approval/application authority.
- **Plan 5 — search projection.** SearchDocuments remain derived projection authority. Plan 6 does not write the Plan 5 search projection as part of canonical governance commands.

## Principals, roles, and capabilities

Governance identities are explicit rows in `food_catalog_governance_principals` with a `principal_type` of `human` or `service` and a role class of `owner`, `curator`, or `service`. Authorization is capability-based through `food_catalog_governance_capability_assignments`; role class is not a substitute for an active capability assignment.

Human principals are resolved from the authenticated user subject. Service principals are not trusted from a caller-supplied UUID. A service request must carry the trusted execution identity claim `plaivra_food_service_identity`; the database hashes that identity and resolves exactly one enabled Service principal whose stored `service_identity_sha256` matches. A caller-supplied principal identifier must match that resolved principal. This prevents one Service identity from executing as another Service principal.

The capability vocabulary includes governance principal administration, correction reporting/review/approval/application, evidence attachment, domain correction capabilities, duplicate resolution, lifecycle controls, bounded break-glass, personal override writes, ingestion proposal authority, and observability reads.

Canonical application is deliberately conjunctive: a principal must hold `food.correction.apply` **and** the domain capability for the named command, for example `food.nutrition.correct` for a nutrition correction. A domain capability alone cannot apply, and generic apply authority alone cannot cross a domain boundary.

Owner recovery is protected. Principal management and capability revocation reject changes that would leave no enabled human Owner with active `food.governance.manage_principals`. Adding a second recoverable Owner can make a later revocation safe; the final recovery path cannot be removed through the canonical APIs.

## Correction cases and state machine

The correction category vocabulary is:

- `wrong_nutrition`
- `missing_nutrition`
- `wrong_serving`
- `missing_serving`
- `wrong_name`
- `wrong_translation`
- `wrong_barcode`
- `wrong_taxonomy`
- `wrong_market_relevance`
- `duplicate_food`
- `wrong_variant`
- `outdated_product`
- `source_conflict`
- `other`

The lifecycle is `reported` → `under_review` → `approved` → `applied`, with `rejected` as the terminal negative decision. State revisions are compared-and-swapped. A transition cannot skip directly from a reported case to applied, and approved → applied occurs only inside the canonical apply command that successfully writes the new authority.

Member reports are bounded and produce correction/report records only; they do not mutate global canonical Food truth.

## Evidence policy and historical policy authority

Plan 6 stores immutable governance policy versions in `food_catalog_governance_policy_versions` and selects the current policy through the trusted singleton `food_catalog_governance_policy_pointer`. A correction case freezes the policy version in force when the case is created. New work cannot relabel itself with an arbitrary or stale caller-authored policy version after the current pointer moves.

The evidence vocabulary is exactly:

- `source_record`
- `product_label`
- `manufacturer`
- `barcode`
- `canonical`
- `curator_reason`

The Plan 6 V1 category matrix mirrors `lib/food-catalog/governance/evidence.ts`:

| Category | Evidence required | Allowed evidence |
| --- | --- | --- |
| wrong_nutrition | yes | source_record, product_label, manufacturer |
| missing_nutrition | no | source_record, product_label, manufacturer, curator_reason |
| wrong_serving | yes | source_record, product_label, manufacturer |
| missing_serving | no | source_record, product_label, manufacturer, curator_reason |
| wrong_name | yes | source_record, product_label, manufacturer, canonical |
| wrong_translation | yes | source_record, product_label, manufacturer, canonical |
| wrong_barcode | yes | source_record, product_label, manufacturer, barcode |
| wrong_taxonomy | yes | source_record, canonical, curator_reason |
| wrong_market_relevance | yes | source_record, manufacturer, canonical, curator_reason |
| duplicate_food | yes | source_record, product_label, manufacturer, barcode, canonical |
| wrong_variant | yes | source_record, product_label, manufacturer, barcode |
| outdated_product | yes | source_record, manufacturer, canonical |
| source_conflict | yes | source_record, product_label, manufacturer, canonical |
| other | no | source_record, product_label, manufacturer, barcode, canonical, curator_reason |

Source-record evidence must belong to the same Food as the case. Non-source evidence must carry an inspectable bounded reference. Evidence payloads are validated recursively for depth/width/size and sensitive-key rejection rather than only checking the top level.

Decision evidence is frozen: evidence may be attached while a case is `reported` or `under_review`, but cannot be appended after `approved`, `applied`, or `rejected`.

## Operation envelope, checksums, CAS, and replay

Privileged commands use an explicit UUID `operation_id`. The database derives the trusted semantic checksum from command semantics and authoritative context rather than accepting a caller-authored checksum as truth.

An exact replay of the same operation ID and semantics returns the prior result without duplicating canonical history. Reusing an operation ID with changed semantics or changed authority is rejected. Advisory locking/transactional operation state makes the replay decision concurrency-safe.

Canonical fact mutation is additionally protected by explicit authority revision/head CAS. A stale expected authority revision fails closed and does not leave a false success audit/outbox record.

## Named canonical correction commands

Plan 6 exposes named, domain-bounded commands rather than a generic update API:

- `food_catalog_apply_nutrition_correction`
- `food_catalog_apply_serving_correction`
- `food_catalog_apply_name_correction`
- `food_catalog_apply_barcode_correction`
- `food_catalog_apply_taxonomy_correction`
- `food_catalog_apply_market_correction`
- `food_catalog_resolve_duplicate`
- `food_catalog_withdraw_food`
- `food_catalog_restore_food`

Nutrition corrections preserve unknown values as SQL `NULL`; a missing nutrient is not fabricated as zero. Nutrition basis does not fabricate serving authority.

Serving corrections use a stable serving-lineage identifier. Independent serving choices for the same Food therefore have independent authority heads and CAS histories rather than sharing an empty or ambiguous key. Historical serving facts remain immutable beside corrected facts.

Barcode correction history is immutable, while the command also changes the effective `food_barcodes` truth used by authoritative lookup. Assignment enforces the existing one-GTIN-to-one-Food uniqueness rule and GS1 Mod-10 validation for supported GTIN lengths. Removal clears the effective mapping without deleting the immutable correction event history.

## Personal overrides

Personal overrides are separate from global canonical Food facts. A current pointer and immutable revision history are scoped by authenticated user and Food. Updates use expected-current-revision CAS, and deletion writes a tombstone revision rather than rewriting canonical Food truth.

Personal override writes have their own owner-scoped operation ledger. Exact retries return the original revision; the same operation ID with changed semantics is rejected. Nutrition override JSON accepts only the supported nullable numeric nutrient keys and rejects negative/non-numeric/unknown fields. Serving labels and notes are bounded.

Direct application-role deletion of personal override history is denied. Physical deletion is reserved for the existing canonical account-deletion/privacy purge lifecycle so user-owned history can be removed when the account itself is canonically purged.

## Duplicate resolution and lifecycle

Duplicate resolution is non-destructive. The stable source Food row is retained, marked as merged, and points to the target Food. An immutable `food_merge_events` fact records source, target, policy, reason, evidence, and authority. Plan 3 may consume that redirect when constructing/promoting a later generation; Plan 6 does not mutate an already-published generation.

Withdraw and restore are explicit, CAS-protected, non-destructive lifecycle commands with reasons and optional replacement linkage. They preserve the same stable Food row and emit lifecycle/audit authority.

## Break-glass

Break-glass is an explicit Owner capability, not an arbitrary SQL escape hatch. It is restricted to the named recovery operations allowed by the Plan 6 contract, requires an operation ID and explicit reason, and is recorded in immutable audit evidence. It does not grant principal-management bypass, generation promotion, ingestion execution, current-pointer movement, or arbitrary canonical SQL.

## Immutable audit and transactional outbox

Every successful privileged governance operation completes its canonical mutation, immutable audit row, and outbox event in the same transaction. Audit captures the principal, principal type, capability, command, target, old/new authority, correction case, policy, reason, trusted semantic checksum, and break-glass context where applicable.

Outbox event identity is deterministic from the governance operation. Delivery is lease-based: a claim receives a lease token/epoch/expiry and claim owner. Expired work can be reclaimed after worker death; a stale worker cannot finish a newer claim. Failed work becomes retryable according to `available_at`; delivered work is terminal and cannot be redelivered.

## Observability

Governance metrics expose bounded operational counts for open/aging/applied/rejected cases, failed commands, CAS conflicts, exact replays, authorization denials, duplicate resolutions, withdrawals/restores, break-glass executions, and outbox backlog/failures. Metrics do not expose raw evidence payloads or personal data.

## Database and service authority

Plan 6 retires broad direct canonical DML from application roles. `anon`, `authenticated`, and `service_role` do not receive direct INSERT/UPDATE/DELETE/TRUNCATE authority over the canonical Food/fact tables governed by the control plane. The legacy `food_items_admin_all` direct-access policy is removed, and the former Nutrition V1 food-curation direct-write exception is retired.

Named privileged mutations execute through `SECURITY DEFINER` functions with explicit capability checks and constrained search paths. Private helper functions are not executable by application roles. Existing Plan 3/Plan 4 privileged RPC authority remains available where required; Plan 6 does not grant new direct access to generation, pointer, or derived-search tables.

## Verification authority

Repository verification includes:

- TypeScript unit/adversarial contracts for principals, cases, evidence, workflow transitions, command envelopes, named commands, personal overrides, identity/lifecycle/break-glass, audit, outbox, observability, and boundary retirement.
- `supabase/verification/food-catalog-governance-control-plane.sql` for the complete rollback-only Plan 6 authority and cross-plan invariants.
- `supabase/verification/food-catalog-governance-control-plane-rereview.sql` for the independent re-review adversarial cases: service impersonation, dual capabilities, exhaustive evidence matrix, evidence freezing, outbox leases, serving lineages, policy versioning, final-Owner recovery, effective barcodes/GS1 validation, personal-override replay/bounds, and recursive evidence privacy validation.
- chronological migration replay, database lint, migration ledger validation, integration tests, and the repository's normal exact-head CI gates.

All verifier fixtures are rollback-only and must leave no Catalog data behind.

## Post-merge Production migration sequence

Plan 6 Production mutation is intentionally excluded from this implementation PR before merge. After independent Planner approval and merge, the standing migration authority should be followed in this order:

1. fetch and verify the exact merged `main` and frozen Plan 6 migration blob;
2. re-read Production migration history and confirm the Plan 6 migration has not already been applied under another physical version/name;
3. re-read Production Food/source/ingestion/generation/search/pointer state and compatibility marker;
4. apply the exact reviewed Plan 6 migration **once** under the standing migration authority;
5. read back the physical migration row and Plan 6 schema/ACL/RPC authority;
6. verify that no Food population, provider ingestion, Food activation, generation creation/promotion, current-pointer movement, SearchDocument population, compatibility-marker movement, or Activity Catalog mutation occurred as a side effect;
7. reconcile the repository migration ledger in a separate post-apply repository change if the program authority requires that reconciliation.

The implementation chat does not merge PR #173 and does not perform the pre-merge Production migration apply.


## Deeper authority re-review hardening

### Name fact lineages

Name facts are genuinely multi-valued. `food_catalog_name_fact_lineages` and `food_catalog_name_fact_revisions` give each independent Name fact a stable lineage and predecessor chain. The governance head key for `name_fact` is the lineage UUID, never `language_tag:name_role`, so multiple synonyms, aliases, or transliterations with the same language and role remain independently correctable while old Name facts stay immutable history. Plan 3 generation membership remains fact-ID based and can continue selecting multiple Name facts.

### Exact semantic predecessor validation

Initial governance-head seeding validates the predecessor against the exact semantic key. Name uses lineage identity; serving uses serving lineage; barcode uses exact GTIN; taxonomy uses exact `node_code`; market uses exact `scope_code`. Same-Food membership alone is not predecessor authority, so audit `old_authority_id` and CAS initialization cannot be seeded from an unrelated keyed fact.

### Outbox Service-principal authority

Governance outbox delivery is an explicit opt-in Service capability: `food.outbox.deliver`. Claim and finish resolve the non-forgeable `plaivra_food_service_identity` execution claim through the existing Service-principal hash binding, require that capability, and bind the active lease to the resolved principal. Generic `service_role`, an unrelated Service principal, or caller-authored worker text is not delivery authority. Lease expiry/reclaim, stale-token rejection, `available_at`, retry scheduling, and terminal delivery semantics remain local Postgres control-plane behavior with no paid queue dependency.
