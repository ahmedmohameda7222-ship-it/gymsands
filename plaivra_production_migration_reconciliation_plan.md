# Plaivra Production Migration-History Reconciliation Plan

**Status:** Production reconciliation completed and verified; repository completion only
**Production project:** `bkwezjxvapaeasfvlhvv`
**Audited migration-file commit:** `10d49bd8f41fccb605b6015f92f8d0402a836128`
**SQL replay:** Prohibited
**Current recommendation:** `NO-GO` for release until the separate compatibility-marker and release gates are satisfied

## Purpose

This document preserves the approved reconciliation design and records its verified outcome. Production now contains all 32 repository migration identities. The seven previously history-untracked identities were repaired only after complete physical-equivalence verification, and the forward-only nutrition ACL correction was applied and recorded normally.

This repository completion does not authorize or perform any further production execution.

## Completion outcome

Verified production state:

- production migration count: `32`;
- pending migrations: `0`;
- schema-applied-untracked migrations: `0`;
- unresolved migrations: `0`;
- `historyRepair.state = reconciled`;
- compatibility marker unchanged at `20260711014500`;
- authenticated nutrition override privileges exactly `DELETE`, `INSERT`, `SELECT`, and `UPDATE`;
- `TRUNCATE`, `TRIGGER`, `REFERENCES`, and `MAINTAIN` absent.

## Identities in scope

The seven historical identities repaired as applied are:

1. `20260711213000_adaptive_onboarding_v2.sql`
2. `20260712173000_persistent_meal_plan_skip_status.sql`
3. `20260712195000_nutrition_target_date_overrides.sql`
4. `20260713153000_meal_plan_atomic_execution.sql`
5. `20260713160000_train_section_atomic_integrity.sql`
6. `20260713170000_finalize_train_schedule_delete_integrity.sql`
7. `20260714030000_harden_train_plan_rpc_execution.sql`

The forward correction applied and recorded normally is:

8. `20260715010000_restrict_nutrition_target_override_acl.sql`

None of these migrations may be replayed.

## Remaining release blockers

The migration-history reconciliation blockers are closed. Release readiness remains fail-closed because:

- the compatibility marker remains `20260711014500`, while repository metadata expects `20260715010000`;
- all required quality, environment, deployment, and smoke gates must still pass for the exact reviewed commit;
- the Vercel main-only deployment policy is integrated into PR #57 and validated by the current Quality workflow;
- independent quality-control approval and merge authorization remain outstanding.

## Eligibility rule used

Only `complete equivalent application` was eligible for metadata repair.

- Partial or divergent historical migrations required a reviewed forward correction.
- The nutrition migration became eligible only after the forward ACL correction was applied and its exact final CRUD ACL was verified.
- The seventh Train hardening migration required full signature, security mode, search-path, grant, actor-check, overload, and integrity verification.
- Every historical migration remained `applied_schema_untracked` until supported repair and independent verification were complete.

## Controlled production sequence retained for audit

The following sequence is retained as the approved execution record. It must not be rerun merely because it remains documented.

### 1. Release hold

A release-owner-approved Vercel hold was required to prevent new production builds and promotions while preserving the serving deployment. The provider configuration and hold evidence were captured outside this repository completion.

### 2. Backup and immutable identities

A current backup or PITR recovery point, the exact repository SHA, all eight migration SHA-256 digests, migration history, and the compatibility marker were required before database work.

### 3. Isolated forward migration staging

A normal repository migration push was prohibited while the seven historical identities were absent, because Supabase applies local migrations not found in remote history.

The disposable execution workdir contained only:

- the 24 files already represented in production migration history; and
- `20260715010000_restrict_nutrition_target_override_acl.sql`.

The seven history-untracked SQL files were excluded from that disposable workdir and remained unchanged in Git. The accepted dry-run proposed only version `20260715010000`, which was then applied and recorded normally.

Official semantics:

- `https://supabase.com/docs/reference/cli/supabase-db-push`
- `https://supabase.com/docs/reference/cli/supabase-migration-repair`
- `https://supabase.com/docs/guides/deployment/database-migrations`

### 4. Immediate ACL verification

The verified outcome was:

- version `20260715010000` recorded exactly once;
- authenticated privileges exactly `DELETE`, `INSERT`, `SELECT`, and `UPDATE`;
- `TRUNCATE`, `TRIGGER`, `REFERENCES`, and PostgreSQL 17 `MAINTAIN` absent;
- RLS, the four owner policies, service-role access, owner administration, and row integrity preserved;
- compatibility marker unchanged.

### 5. Full seven-migration equivalence verification

Catalog, definition, grant, overload, policy, constraint, trigger, index, and integrity checks established complete equivalent application for every historical identity.

### 6. Supported history repair

The official linked migration-repair operation recorded the following exact versions as applied, one at a time in chronological order, without running migration SQL:

```text
20260711213000
20260712173000
20260712195000
20260713153000
20260713160000
20260713170000
20260714030000
```

The final production migration-history count is 32: the original 24, the normally applied forward correction, and seven repaired historical identities.

### 7. Repository and release completion

This PR performs only the repository reconciliation update. A separate approved workflow must still:

1. preserve the compatibility marker until its own authorized forward operation;
2. run release preflight and all required quality gates;
3. confirm the Vercel main-only deployment policy integrated into PR #57 remains validated by the current Quality workflow;
4. deploy only the exact approved SHA;
5. verify provider commit metadata, version/health endpoints, and smoke evidence;
6. merge only after independent approval.

## Abort and rollback record

The approved sequence required aborting on production drift, object or identity mismatch, non-zero integrity counts, absent recovery or ownership evidence, an invalid dry-run, any replay risk, or premature compatibility advancement. Any failed forward correction required transaction verification and a new reviewed forward fix rather than rewriting applied SQL. Incorrect history identities could only be reverted through the supported migration-repair operation.

## Current decision

```text
MIGRATION RECONCILIATION: COMPLETE
APPLICATION RELEASE: NO-GO
```

No Supabase write, migration repair, migration replay, compatibility-marker update, deployment, promotion, or merge is performed by this repository completion task.
