# Plaivra AW-3C Immutable Prescription Snapshots — Implementation Report

## Status

READY FOR INDEPENDENT PLANNER QA/QC

Implementation, exact pre-application validation, one-time Plaivra Production application, post-application verification, migration-ledger reconciliation, and final reconciled-head validation are complete. Draft PR `#86` targets `main`, remains open and unmerged, and contains only permanent AW-3C scope.

## Repository and release boundary

- Repository: `ahmedmohameda7222-ship-it/gymsands`
- Branch: `feat/active-workout-aw3c-prescription-snapshots`
- Draft PR: `#86`
- PR base: `main`
- Starting released `main`: `0420f5f1238f5beaafbf1b58fec81a4e810dc541`
- Exact pre-application evidence commit: `96fe292d57b2d22a21f9cfa402615b0fff60cdfa`
- Reconciled implementation head: `db8704fef79f572c31d62a12a81d2d480715e30b`
- Validated final-evidence head: `32e9e2fa122cb9b9b4525027b4c783bb90680b08`
- Production project: `bkwezjxvapaeasfvlhvv`
- Activity Catalog project: `khlcctuefiuhunqymkbp`
- Compatibility marker boundary: `20260724232734`
- PR remains Draft, open, and unmerged.
- AW-4A has not started.

## Implemented architecture

AW-3C adds an immutable normalized prescription graph beneath the existing workout-session snapshot-item authority:

```text
workout_session_muscle_snapshots
└── workout_session_muscle_snapshot_items
    └── workout_session_prescription_sets
        └── workout_session_prescription_metric_targets
```

Implemented guarantees:

- Existing snapshot root and metric registry are reused; no competing root or registry was created.
- Composite item/snapshot/session/user ownership paths are enforced with foreign keys and covering indexes.
- `workout_session_prescription_sets` and `workout_session_prescription_metric_targets` are immutable after trusted materialization.
- One private database materializer parses the bounded frozen JSON contract and validates registry identities, target shapes, aliases, range ordering, side support, and numeric bounds.
- Plan-based, direct, resume, terminal, and historical paths converge on the same graph authority.
- Existing frozen `planned_prescription` and `planned_sets` compatibility evidence remains unchanged.
- New application writes converge on `snake_case`; released `restSeconds` compatibility remains deliberately supported.
- Plan/direct Active Workout hydration, planned log compatibility fields, and ChatGPT workout context read from the frozen graph after session start.
- Privacy export pagination and trusted account-deletion proof include both AW-3C tables.

## Blocker corrections completed

- Removed the stale post-chain AW-3B marker assertion while preserving the historical AW-3B marker boundary inside chronological replay and source-contract tests.
- Kept the AW-3B 500-performed-log session-limit test valid under AW-3C by using 100 planned sets while still inserting 500 performed logs and rejecting the 501st.
- Replaced rendered mobile-focus validation's dynamic `Locator.first()` re-resolution with a stable same-element handle across viewport resize.
- Materialized the real repository tree and removed encoded transport bundles, placeholder SQL, temporary write-enabled materializers, correction workflows, and reconciliation helpers.
- Retargeted Draft PR `#86` to `main`.

## Exact migration identity

Repository migration:

```text
supabase/migrations/20260725013000_active_workout_aw3c_immutable_prescription_snapshots.sql
```

Immutable evidence:

- Pre-application evidence commit: `96fe292d57b2d22a21f9cfa402615b0fff60cdfa`
- Git blob: `35af298e904a4cdfdd336a033a91dfc63f827479`
- Repository SHA-256: `c7ee67e8184d4cf1afe6e7ce9c6ec4de90c5fd36bc9d31006b55e53f62b94031`
- Applied SQL SHA-256: `c7ee67e8184d4cf1afe6e7ce9c6ec4de90c5fd36bc9d31006b55e53f62b94031`
- Size: 60,266 bytes
- Lines: 1,146
- Exact-migration artifact: `aw3c-exact-migration-96fe292d`
- Artifact ID: `8619641912`
- Artifact digest: `sha256:87e9c2410f1b3b3b2d34efa65572d00dc980b781ba30bcaf6e65dbe77d832242`
- Artifact expiry: `2026-08-01`

Production identity:

- Generated version: `20260725130422`
- Generated name: `active_workout_aw3c_immutable_prescription_snapshots`
- Application identity time: `2026-07-25T13:04:22Z`
- Applied exactly once through Supabase `apply_migration` to Plaivra Production only.

## Pre-application validation

Successful exact-head checks on `96fe292d57b2d22a21f9cfa402615b0fff60cdfa`:

- Phase A Diff Validation: run `30157515602`
- Quality: run `30157515607`, successful rerun job `89678750880`
- Exact Release Quality Validation: run `30157515609`

Passed gates included full chronological migration replay, future-order proof, database lint, AW-2/AW-3 verification SQL, ledger validation, dependency audit, lint, typecheck, unit/integration/scripts/i18n/telemetry tests, production build, release metadata, and rendered browser QA.

## Final reconciled-head validation

Successful exact-head checks on `32e9e2fa122cb9b9b4525027b4c783bb90680b08`:

- Phase A Diff Validation: run `30159698914`
- Quality: run `30159698916`, job `89683646037`
- Exact Release Quality Validation: run `30159698917`, job `89682894806`

Every Quality gate passed, including:

- Repository integrity
- Full chronological migration chain
- Database lint
- AW-2A/AW-2B/AW-2C/AW-3A/AW-3B/AW-3C database verification SQL
- Migration ledger and dependency audit
- ESLint and TypeScript
- Unit and integration tests
- Scripts, i18n, and telemetry tests
- Production environment contract
- Production build and built release metadata
- Rendered browser QA, including mobile/desktop, English/German/Arabic RTL, light/dark, long labels, and stable mobile keyboard focus
- Canonical Quality artifact creation and independent Exact Release verification
- Read-only Stage-1 release preflight

## Production before/after evidence

| Invariant | Before | After |
| --- | ---: | ---: |
| Physical migrations | 72 | 73 |
| Workout sessions | 10 | 10 |
| Exercise logs | 64 | 64 |
| Structured metric values | 75 | 75 |
| AW-3B set details | 15 | 15 |
| AW-3B segments | 0 | 0 |
| AW-3B segment metrics | 0 | 0 |
| Timeline events | 83 | 83 |
| Snapshot roots | 10 | 10 |
| Snapshot items | 34 | 34 |
| AW-3C prescription sets | absent | 86 |
| AW-3C metric targets | absent | 15 |

Frozen raw snapshot evidence remained unchanged. Compatibility marker before and after remained:

```text
20260724232734
```

Backfill distribution:

- 71 `custom` set rows from conservative legacy evidence.
- 15 `range` set rows.
- 15 `repetitions:range` target rows.
- Expected and actual counts matched: 86 sets / 15 targets.

## Integrity, security, and behavior evidence

Post-apply results:

- Set duplicates: 0
- Target duplicates: 0
- Set orphans: 0
- Target orphans: 0
- Set owner/session path mismatches: 0
- Target owner/session path mismatches: 0
- Set-table constraints/indexes: 13 / 7
- Target-table constraints/indexes: 7 / 5
- RLS enabled on both AW-3C tables
- Owner-select policies: 2
- `authenticated` table privileges: owner-filtered `SELECT` only
- Authenticated direct INSERT/UPDATE/DELETE: denied on both tables
- Required private materializer: present
- Private materializer executable by `anon`: false
- Private materializer executable by `authenticated`: false
- Direct set update/delete: blocked
- Direct target update/delete: blocked
- Exact retry across all 34 snapshot items: no-op; counts remained 86/15
- Owner-one RLS projection: 82 sets / 15 targets
- Owner-two RLS projection: 4 sets / 0 targets
- Unrelated authenticated user projection: 0 sets / 0 targets

## Privacy and retention

Permanent automated coverage proves:

- Deterministic ordered export of both AW-3C tables.
- Pagination beyond 5,000 rows.
- Cross-user export isolation.
- Trusted account deletion reports both AW-3C deletion counts and leaves zero owned rows.
- Physical retention follows the owning workout-session snapshot; no independent TTL or archive was added.

## Activity Catalog isolation

Activity Catalog project `khlcctuefiuhunqymkbp` has:

- AW-3C relations: 0
- AW-3C functions: 0
- Plaivra migration schema: absent
- AW-3C writes: 0

No migration, repair, or data mutation was applied to Activity Catalog.

## Advisor classification

- No AW-3C missing-policy, exposed-materializer, table-grant, or missing-FK-index regression.
- New required AW-3C indexes may initially appear unused immediately after creation; they are retained for ownership, FK, and export paths.
- Existing reviewed `SECURITY DEFINER`, RLS, leaked-password-protection, duplicate-index, and unrelated unindexed-FK notices are pre-existing and outside AW-3C scope.

## Migration-ledger reconciliation

- `historyRepair.state`: `reconciled`
- `pendingCount`: 0
- `unresolvedCount`: 0
- `schemaVerifiedUntrackedCount`: 0
- Physical Production records: 73
- Latest reconciled Production identity: `20260725130422`
- Audited repository ancestor: `96fe292d57b2d22a21f9cfa402615b0fff60cdfa`
- Ledger reconciliation commit: `db8704fef79f572c31d62a12a81d2d480715e30b`

The repository migration remains immutable and is represented by an `applied_version_alias`. It must not be renamed, edited, or replayed.

## Stop boundary

- Keep PR `#86` Draft and unmerged until explicit merge approval.
- Do not promote the compatibility marker during implementation QA/QC.
- Do not deploy manually.
- Do not start AW-4A before AW-3C merge and post-merge closure.

READY FOR INDEPENDENT PLANNER QA/QC
