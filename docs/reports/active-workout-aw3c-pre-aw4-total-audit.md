# AW-3C Pre-AW-4 Total Audit

## Status

**CORRECTIONS COMPLETE — READY FOR FINAL REPORT-ONLY EXACT-HEAD VALIDATION**

This report records the independent total audit performed after the original AW-3C implementation and before any AW-4 work. The executable correction and reconciled ledger were validated on exact code/database head:

```text
11bfa9f47f603487d12022565ac9a0c818f1373b
```

This document is the only change after that validated head. The branch remains Draft, open, unmerged, and blocked from AW-4 until the normal exact-head workflows also pass on the report-only closure commit.

## Scope audited

The audit reviewed the complete AW-3C change set and its surrounding contracts:

- normalized prescription set and metric-target schema;
- migration ordering, replay, ledger classification, and Production identity;
- materialization, retry, resume, backfill, terminal, and direct-session paths;
- immutable-write enforcement, RLS, grants, private function ACLs, and trigger bindings;
- owner/session/snapshot composite paths and foreign-key index coverage;
- Active Workout hydration, frozen logging compatibility, direct-session payloads, and execution cursors;
- privacy export, pagination, and account-deletion coverage;
- unit, integration, script, i18n, telemetry, production build, and rendered browser QA;
- Production row integrity and Activity Catalog isolation;
- Supabase security and performance advisor results.

## Logical defects found and corrected

### 1. Multi-target immutable retry ordering

The original materializer preserved incoming target array order while its existing-graph projection sorted targets by metric identity. Because JSON arrays are order-sensitive, a valid multi-metric prescription could materialize successfully and then fail on resume or exact retry even though the semantic graph had not changed.

Correction:

- added private immutable helper `private.canonicalize_workout_session_prescription_graph(jsonb)`;
- canonicalized targets by `metric_key`, `metric_version`, and `side` before immutable graph comparison;
- preserved every target value and set field during canonicalization;
- revoked helper execution from `anon`, `authenticated`, and `service_role`;
- added permanent migration, verification SQL, and product-contract coverage.

### 2. Non-contiguous set order

The execution cursor uses ordinal set positions, but the original schema allowed an explicit graph such as set orders `1` and `3`. Existing Production data was already fully contiguous, but future non-contiguous prescriptions would create ambiguous execution behavior.

Correction:

- added a trusted-materializer insert guard requiring `set_order = existing_count + 1`;
- verified all existing snapshot items before application;
- added permanent verification that each item starts at `1`, ends at its set count, and has no gaps;
- preserved parent-cascade deletion behavior and immutable update/delete enforcement.

### 3. Explicit zero-rest direct prescription

The client payload used a truthiness check and omitted a valid `rest_seconds: 0` prescription.

Correction:

- direct workout payload construction now omits only `null`/`undefined` values;
- explicit zero rest is preserved;
- regression tests cover zero rest and absent optional values.

## Architectural decisions confirmed

- The original AW-3C migration remains immutable and was not edited or replayed.
- The correction is a forward-only migration.
- The frozen prescription graph remains the only post-start prescription authority.
- Direct Active Workout does not substitute mutable `workout.sets` when the frozen cursor graph is unavailable. Its one-set degraded fallback is intentionally non-authoritative; Production must hydrate the immutable cursor item.
- Existing raw `planned_prescription` and `planned_sets` evidence was not rewritten.
- The released compatibility marker was not promoted.
- No temporary workflow, encoded transport bundle, write-enabled diagnostic helper, or correction-only workflow remains in the PR.

## Correction migration identity

Repository file:

```text
supabase/migrations/20260725163000_active_workout_aw3c_audit_corrections.sql
```

Immutable repository evidence:

- evidence commit: `d9eb90d90e8be4b01e86733799bb28de3e068179`;
- Git blob: `630d0e15e591dc90c2519f4389cec17ece12b15a`;
- SHA-256: `06dc241e917965447015d34981b125077f0cf68426492cb08bad7ddd7fd1e7fd`;
- size: `12,404` bytes.

Production application:

- project: `bkwezjxvapaeasfvlhvv`;
- generated version: `20260725145636`;
- generated name: `active_workout_aw3c_audit_corrections`;
- applied exactly once through Supabase `apply_migration`;
- Activity Catalog was not modified.

## Production before/after proof

| Invariant | Before | After |
| --- | ---: | ---: |
| Physical migration records | 73 | 74 |
| Audit-correction records | 0 | 1 |
| Prescription sets | 86 | 86 |
| Metric targets | 15 | 15 |
| Set duplicates | 0 | 0 |
| Target duplicates | 0 | 0 |
| Non-contiguous items | 0 | 0 |
| Owner/session/path mismatches | 0 | 0 |
| Compatibility marker | `20260724232734` | `20260724232734` |

The migration compared immutable row hashes before and after application. Exact retry across all existing snapshot items remained a no-op.

## Database behavior proof

Independent transactional Production checks proved:

- target array reordering compares equal after canonicalization;
- changing a target value still compares different;
- direct set updates remain blocked;
- direct target deletes remain blocked;
- scoped insertion with a set-order gap is rejected;
- behavior tests roll back and leave counts at `86 / 15`;
- all four AW-3C foreign keys have covering indexes;
- all AW-3C constraints are validated;
- required materializer, validation, and immutability triggers are enabled.

## Security proof

- RLS is enabled on both AW-3C tables.
- Each table has one owner-filtered `authenticated` SELECT policy.
- `authenticated` has SELECT only; INSERT, UPDATE, and DELETE are denied.
- `anon` has no table SELECT access.
- Every AW-3C private authority uses an empty fixed `search_path`.
- The canonicalizer, materializer, validators, immutability triggers, and pre-wrapper authorities are not executable by `anon` or `authenticated`.
- No unexpected public materializer or canonicalizer exists.
- Supabase advisors report no AW-3C missing-policy, exposed-private-function, duplicate-index, multiple-policy, or unindexed-foreign-key regression.
- Newly created required indexes may remain reported as unused immediately after creation; they are retained for FK, ownership, session-read, and export paths.

Pre-existing project-wide advisor notices outside AW-3C remain unchanged, including intentional public authenticated RPC authorities, unrelated RLS-with-no-policy tables, leaked-password protection configuration, older unindexed foreign keys, older duplicate indexes, and unrelated multiple permissive policies.

## Activity Catalog isolation

Project `khlcctuefiuhunqymkbp` remains isolated:

- AW-3C prescription relations: `0`;
- AW-3C/prescription functions: `0`;
- Plaivra migration schema: absent;
- correction writes: `0`.

## Exact validation on executable audit head

Exact head:

```text
11bfa9f47f603487d12022565ac9a0c818f1373b
```

Successful runs:

- Phase A Diff Validation: `30162785093`;
- Full Quality: `30162785101`, job `89690704575`;
- Exact Release Quality Validation: `30162785097`, job `89690704586`.

Passed gates included repository integrity, chronological migration replay, database lint, all AW-2/AW-3 verification SQL, migration ledger, dependency audit, ESLint, TypeScript, complete unit/integration/script/i18n/telemetry suites, production environment contract, production build, built release metadata, rendered mobile/desktop and multilingual QA, canonical artifact verification, and read-only Stage-1 release preflight.

## Ledger state

- Production physical records: `74`;
- repository migration classifications: `74`;
- exact-applied entries: `63`;
- applied-version aliases: `11`;
- pending: `0`;
- unresolved: `0`;
- schema-verified untracked: `0`;
- reconciliation state: `reconciled`.

## Stop boundary

- Keep PR `#86` Draft, open, and unmerged until explicit merge approval.
- Do not promote the compatibility marker during this audit.
- Do not deploy manually.
- Do not start AW-4 before AW-3C merge and post-merge closure.
