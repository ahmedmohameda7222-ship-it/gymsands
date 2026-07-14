# Plaivra Production Migration-History Reconciliation Plan

**Status:** Corrected Phase A evidence only — owner approval required before any production write  
**Production project:** `bkwezjxvapaeasfvlhvv`  
**Repository base:** `54e9768d52011e1d1839c4f50f0a2bc578ca27db`  
**SQL replay:** Prohibited  
**Current recommendation:** `NO-GO`

## Purpose

Production contains the physical effects of seven repository migrations that are absent from `supabase_migrations.schema_migrations`. The nutrition target override migration also has a material ACL divergence that requires a new forward-only correction before that historical identity can become eligible for history repair.

This plan is design-only and does not authorize production execution.

## Identities in scope

The seven physically applied, history-untracked migrations are:

1. `20260711213000_adaptive_onboarding_v2.sql`
2. `20260712173000_persistent_meal_plan_skip_status.sql`
3. `20260712195000_nutrition_target_date_overrides.sql`
4. `20260713153000_meal_plan_atomic_execution.sql`
5. `20260713160000_train_section_atomic_integrity.sql`
6. `20260713170000_finalize_train_schedule_delete_integrity.sql`
7. `20260714030000_harden_train_plan_rpc_execution.sql`

The separate pending forward correction is:

8. `20260715010000_restrict_nutrition_target_override_acl.sql`

The forward correction is not a historical identity to repair. It must be applied and recorded normally through a separately approved controlled operation.

## Current blockers

- The production nutrition override ACL is over-broad for `authenticated`.
- Seven physical migration effects are absent from migration history.
- The forward ACL correction is not applied.
- Migration reconciliation remains pending.
- Current backup/PITR evidence is unavailable through the connected tooling.
- Production operator, independent verifier, release-hold owner, and rollback owner are unnamed.
- No verified Vercel release hold is active.

## Eligibility rule

Only `complete equivalent application` is eligible for metadata repair.

- Partial or divergent historical migrations require a reviewed forward correction.
- The nutrition migration remains divergent until the forward ACL correction is applied and its exact final CRUD ACL is verified.
- The seventh Train hardening migration requires full signature, security mode, search-path, grant, actor-check, overload, and integrity verification.
- Every historical migration remains `applied_schema_untracked` until supported repair and independent verification are complete.

## Safe future production sequence

### 1. Release hold

Use a release-owner-approved Vercel hold that prevents new production builds and promotions while preserving the currently serving deployment. Capture the prior provider configuration and verify the hold before database work.

### 2. Backup and immutable identities

Verify a successful scheduled backup or PITR recovery point, record its timestamp and recovery window, revalidate the exact repository SHA, recalculate all eight migration SHA-256 digests, and re-capture migration history plus the compatibility marker.

### 3. Isolated forward migration staging

A normal repository migration push is prohibited while the seven historical identities remain absent, because Supabase applies local migrations not found in remote history.

Create a disposable Supabase execution workdir from the exact reviewed SHA. Its migration directory must contain only:

- the 24 files already represented in production migration history; and
- `20260715010000_restrict_nutrition_target_override_acl.sql`.

The seven history-untracked SQL files must not be present in the disposable execution workdir. They remain unchanged in Git.

Use the supported linked migration-list operation and the linked database-push dry-run operation. The captured dry-run is acceptable only when all 24 remote identities match and the sole proposed migration is version `20260715010000`. The all-migrations option must not be used. The operator and independent verifier must both approve the captured output.

Only then may the linked database-push operation apply and normally record the single forward correction.

Official semantics:

- `https://supabase.com/docs/reference/cli/supabase-db-push`
- `https://supabase.com/docs/reference/cli/supabase-migration-repair`
- `https://supabase.com/docs/guides/deployment/database-migrations`

### 4. Immediate ACL verification

After the isolated forward correction:

- version `20260715010000` is recorded exactly once;
- authenticated privileges are exactly `DELETE`, `INSERT`, `SELECT`, and `UPDATE`;
- `TRUNCATE`, `TRIGGER`, `REFERENCES`, and PostgreSQL 17 `MAINTAIN` are absent;
- RLS, the four owner policies, service-role access, owner administration, and row counts remain intact;
- no unrelated object changes;
- the compatibility marker remains unchanged.

Discard the disposable workdir after evidence capture. Do not commit its staged migration subset.

### 5. Full seven-migration equivalence verification

Re-run all catalog, definition, grant, overload, policy, constraint, trigger, index, and integrity checks. Every historical migration must independently qualify as a complete equivalent application.

### 6. Supported history repair

For each eligible historical identity, use the official linked migration-repair operation with status `applied`, one exact version at a time in chronological order:

```text
20260711213000
20260712173000
20260712195000
20260713153000
20260713160000
20260713170000
20260714030000
```

The documented operation changes migration tracking without running migration SQL. Verify the history table after each identity. The expected final production history count is 32: the original 24, the normally applied forward correction, and seven repaired historical identities.

### 7. Repository and release completion

After all database verification:

1. rerun the read-only production preflight;
2. verify all eight relevant identities exactly once;
3. update the repository ledger in a separate reviewed commit;
4. require zero pending and zero unresolved entries;
5. update the compatibility marker only through a separately approved forward operation;
6. run release preflight;
7. deploy only the exact approved SHA;
8. verify provider commit metadata, version/health endpoints, and required smoke evidence;
9. remove the release hold only after acceptance.

## Abort conditions

Abort if production changes during evidence collection; any object, signature, grant, ACL, overload, or identity differs; any integrity count is non-zero; backup or named ownership evidence is missing; the release hold is absent; the dry-run proposes anything except `20260715010000`; any operation could replay existing SQL; or compatibility would advance before verification.

## Rollback design

Keep the release hold active. If the forward correction fails, verify transaction rollback and do not repair history. If it succeeds but later verification fails, use a separately reviewed forward corrective migration rather than rewriting applied SQL. Revert only incorrectly inserted historical identities through the supported migration-repair operation with status `reverted`. Use the verified backup/PITR point only if metadata rollback is insufficient.

## Required named ownership

| Responsibility | Name |
|---|---|
| Production operator | Not supplied |
| Independent verifier | Not supplied |
| Release-hold owner | Not supplied |
| Rollback owner | Not supplied |

## Current decision

```text
NO-GO
```

No production write, migration-history repair, compatibility-marker update, merge, or deployment is authorized by this plan.
