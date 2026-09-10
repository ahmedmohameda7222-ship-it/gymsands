# Food Catalog Plan 7 Portability Runbook

## Scope

This runbook covers Plan 7 Workstream 1 only: logical export, artifact validation, disposable restore, restore assertions, protected `FULL_DR` segments, deterministic search rebuild, and non-sensitive CI evidence.

It does **not** authorize Production writes, deployment, population, current-generation promotion, consumer cutover, legacy retirement, or any Workstream 2 action. A green Workstream 1 result is portability evidence only.

## Certification target

The disposable certification target is PostgreSQL 17.x and must prove:

- PostgreSQL major 17;
- `pgcrypto`, `pg_trgm`, and `uuid-ossp`;
- the exact Git migration/schema identity expected by the artifact workflow;
- a compatible `auth`/RLS role harness for `anon`, `authenticated`, and `service_role` assertions;
- explicit disposable-target identity; Plaivra Production is not a valid target.

Exported DDL is never schema authority. Construct the target from reviewed Git migrations/schema authority before loading portable data.

## Export

Authoritative export uses one PostgreSQL `REPEATABLE READ READ ONLY` transaction. Source observations, relation rows, current-generation pointer evidence, compatibility evidence, and migration observations are captured inside the same snapshot. Relation rows are ordered by stable keys; OFFSET pagination is not authority.

The artifact manifest is written last. Segment semantic hashes and the snapshot-boundary digest are deterministic. `capturedAt` is cryptographically bound into snapshot evidence. SQL `NULL` is represented as JSON `null`, distinct from literal text `"null"`.

## Artifact validity versus recovery eligibility

Artifact validity is structural and semantic. It checks supported contract/profile versions, mandatory segments, ownership, snapshot binding, segment and manifest hashes, stable identities, schema/profile declarations, transient exclusions, and secret scanning. Artifact age alone does not invalidate the artifact.

Recovery eligibility is evaluated separately with an explicit caller policy such as `maxArtifactAge` and `evaluationTime`. The same structurally valid artifact may be eligible under one RPO and rejected under a stricter RPO.

## Disposable restore order

1. Prove disposable target identity and PostgreSQL 17.x capabilities.
2. Prove exact Git migration/schema identity and RLS/auth compatibility.
3. Validate the artifact before target trust.
4. Validate migration-created/preseeded reference and singleton rows; never blindly insert/upsert them.
5. Restore exact stable Food roots and current physical compatibility values.
6. For the current non-deferrable `food_items` / `food_source_records` cycle, temporarily neutralize only `food_items.verified_source_record_id` to `NULL`.
7. Restore source records and exact canonical authority/history.
8. Reconstruct the exported `verified_source_record_id` and validate the composite FK/value exactly.
9. Apply each registry load mode explicitly: exact restore, transient-neutralized restore, transitional reconstruction, preseed validation, or derived rebuild.
10. Neutralize active lease/claim fields exactly to `NULL`; do not resume source-environment work.
11. Perform pre-pointer verification.
12. Restore current-generation pointer fields last, only after validating the migration-created singleton identity.
13. Keep the restore untrusted until the assertion engine completes.

Retries are idempotent by stable identity and immutable segment evidence. A conflicting non-identical stable ID is a hard failure.

## Restore assertion engine

A trusted restore requires all mandatory assertions with no `UNKNOWN`, missing, duplicate, or failed mandatory result. The three comparison classes are:

- byte/hash equality;
- exact identity/value equality, including typed numeric/timestamp/bigint representations without coercion;
- semantic equality, including graph, owner, security, and rebuilt-search behavior.

Mandatory evidence covers artifact/transport/stored hashes, typed identities, provenance, nutrition/name/serving lineages, taxonomy/market/barcode state, verification/activation, generation composition, current pointer, merge graph, governance/personal overrides, frozen consumer references, RLS/ACL/identity, migration/schema fingerprint, and transient neutralization.

`CORE_PORTABLE` may become structurally trusted and restore-verified but can never claim final `drReady`. Final fixture-level DR readiness requires `FULL_DR` protected-fixture verification.

## Protected FULL_DR segments

Protected owner/security segments use AES-256-GCM with an external key-provider interface. Key material is never stored in Git, manifest fields, artifact metadata, logs, or CI evidence.

- AES-256 key material is exactly 32 bytes.
- Every encryption uses a fresh random 12-byte nonce.
- Reuse of the same nonce under the same key identifier is rejected.
- Plaintext semantic SHA-256 is deterministic for the same logical segment.
- Ciphertext/transport SHA-256 is expected to change with fresh nonces.
- The semantic root must not depend on randomized nonce/ciphertext bytes.
- Decryption verifies transport integrity and GCM authentication before returning plaintext.
- CI uses ephemeral test keys only.

Service credentials/secrets are not portable. Human identity binding and service rebind remain external gates. Restored governance history does not reactivate operational authority. `food.outbox.deliver` remains unavailable until replay reconciliation is separately approved.

Plan 6 owner privacy export includes owner-scoped `food_personal_override_revisions`, `food_personal_overrides`, and `food_personal_override_operations`. Every query is explicitly filtered by authenticated `user_id` and deterministically ordered/paginated.

## Deterministic search rebuild

Search restore verification uses only the canonical current boundaries:

1. confirm `public.food_catalog_current_generation.current_generation_id` equals the exact restored generation;
2. call `public.rebuild_food_catalog_search_projection_v2(uuid,text,text)` for that generation/projection;
3. call `public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)` for the golden query matrix.

Do not use legacy `search_nutrition_food_library(...)` as restore authority. Do not call provider networks.

If no explicit global serving-display authority exists, restored global search serving labels must remain `NULL`.

The deterministic fixture covers populated and zero-row states with fixed identities/timestamps and includes exact/alias/prefix/contains, locale/script, direct/parent/GLOBAL market, category/current-cuisine behavior, nullable numerics, presets, favorites, recent, My Food, cursor continuation/context mismatch, redirect, stale-generation isolation, and zero-row queries.

Before search trust, fail closed on artifact corruption, precision loss, torn export, wrong-owner binding, nonce reuse, or preseed mismatch.

## CI evidence

The Workstream 1 workflow checks out the exact PR head and uses a PostgreSQL 17 service only for disposable QA. Deterministic search fixture evidence is generated for both `CORE_PORTABLE` and `FULL_DR` and contains only non-sensitive hashes, counts, profile, exact-head identity, canonical function identities, and boolean certification results. Raw protected plaintext and encryption keys are never published.

Evidence must state:

- exact Git head SHA;
- fixture SHA-256 and golden-result SHA-256;
- profile and golden case count;
- populated/zero-row verification;
- whether deterministic protected fixture verification was present;
- whether provider network use occurred (must be false);
- `drReady` status;
- `productionMutationPerformed: false`;
- `retirementAuthorized: false`.

## Workstream 1 completion gate

Completion requires exact-head GREEN evidence for Tasks 1–8, including `CORE_PORTABLE` and deterministic protected-fixture `FULL_DR` evidence, plus review of this runbook and the PR diff.

That completion still does **not** authorize Workstream 2. Consumer cutover or legacy retirement begins only after separate planner authorization. The PR remains unmerged until normal review/merge authority approves it.
