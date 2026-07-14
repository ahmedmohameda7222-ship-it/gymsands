# Plaivra Production Migration-History Reconciliation Plan

**Status:** Corrected Phase A evidence only — owner approval required before any production write  
**Production project:** `bkwezjxvapaeasfvlhvv`  
**Repository base:** `54e9768d52011e1d1839c4f50f0a2bc578ca27db`  
**SQL replay:** Prohibited  
**Current recommendation:** `NO-GO`

## 1. Purpose

Production contains the physical effects of seven repository migrations that are absent from `supabase_migrations.schema_migrations`. One of the seven, the nutrition target override migration, has a material ACL divergence that requires a new forward-only correction before it can be eligible for history repair.

This plan does not authorize production execution.

## 2. Historical identities in scope

1. `20260711213000_adaptive_onboarding_v2.sql`
2. `20260712173000_persistent_meal_plan_skip_status.sql`
3. `20260712195000_nutrition_target_date_overrides.sql`
4. `20260713153000_meal_plan_atomic_execution.sql`
5. `20260713160000_train_section_atomic_integrity.sql`
6. `20260713170000_finalize_train_schedule_delete_integrity.sql`
7. `20260714030000_harden_train_plan_rpc_execution.sql`

The forward correction is a separate future migration:

8. `20260715010000_restrict_nutrition_target_override_acl.sql`

The forward correction is not a historical identity to repair. It must be applied and tracked normally through a controlled operation.

## 3. Current blockers

- Nutrition override ACL is over-broad for `authenticated`.
- Seven physical migration effects are absent from migration history.
- The forward ACL correction is not applied.
- Migration history remains pending.
- Backup/PITR evidence is not directly verified.
- Production operator, independent verifier, release-hold owner, and rollback owner are unnamed.
- No verified Vercel release hold is active.

## 4. Mandatory evidence package

Retain:

- exact production project reference and capture timestamp;
- exact repository commit SHA;
- SHA-256 for all seven historical files and the forward correction;
- complete migration history;
- compatibility marker;
- exact nutrition override ACL from `pg_class.relacl`/`aclexplode`;
- complete function definitions and grants;
- constraints, indexes, triggers, RLS, and policies;
- zero-count integrity evidence;
- backup/PITR evidence;
- named operator and independent verifier;
- verified release-hold evidence.

Do not retain secrets or user-authored row content.

## 5. Eligibility classifications

Only `complete equivalent application` is eligible for metadata repair.

- A partial or divergent historical migration requires a reviewed forward correction.
- The nutrition migration remains divergent until the forward ACL correction is applied and verified.
- The seventh Train hardening migration must be verified in full, not inferred from a subset.
- A migration remains `applied_schema_untracked` until repair is actually completed and independently verified.

## 6. Safe production sequence — design only

### 6.1 Release hold

Use a release-owner-approved Vercel hold that prevents new production builds/promotions while preserving the currently serving deployment. Capture the previous provider configuration and verify the hold is active before database work.

### 6.2 Backup and identities

1. Verify a current scheduled backup or PITR recovery point.
2. Record backup type, successful timestamp, recovery window, and evidence timestamp.
3. Revalidate the exact repository SHA.
4. Recalculate SHA-256 for all eight migration files.
5. Re-capture migration history and the compatibility marker.

### 6.3 Apply only the forward ACL correction

An ambiguous `supabase db push` is prohibited because it could attempt to replay the seven history-untracked migrations.

The approved operator must use a supported isolated mechanism that applies only the new forward migration while preserving normal migration tracking. The runbook must show the exact command and dry-run/list evidence proving that no earlier SQL will execute.

A safe staged design is:

1. after complete equivalence is independently approved, mark each of the seven physical historical identities applied with the supported metadata-only command;
2. verify all seven history identities exactly once and rerun the read-only preflight;
3. run `supabase db push --dry-run --linked` and require the output to list only `20260715010000_restrict_nutrition_target_override_acl.sql`;
4. run `supabase db push --linked` to apply and track only that forward correction;
5. verify the exact ACL and forward migration identity immediately.

The nutrition identity may be repaired before the ACL correction only when the reviewed evidence explicitly records the physical migration plus its known drift and the execution remains under one uninterrupted release hold. The forward correction must then be applied before compatibility-marker advancement or release. If the owner does not approve that staged model, do not proceed.

Direct inserts into `supabase_migrations.schema_migrations` are prohibited.

### 6.4 Immediate verification

After the forward fix:

- authenticated ACL must be exactly `DELETE, INSERT, SELECT, UPDATE`;
- `TRUNCATE`, `TRIGGER`, `REFERENCES`, and `MAINTAIN` must be absent;
- RLS, four policies, service-role access, owner administration, and row counts must remain intact;
- the forward migration identity must be recorded exactly once.

### 6.5 Seven-history repair

For each fully equivalent historical migration, use the supported metadata-only operation:

```bash
supabase migration repair <version> --status applied
```

This updates migration tracking only and does not execute SQL.

Repair one exact version at a time, verify after each step, and abort on any mismatch.

### 6.6 Post-repair repository and release sequence

1. Re-run the complete read-only preflight.
2. Verify eight relevant identities exactly once: seven repaired historical identities plus the normally applied forward correction.
3. Update `supabase/migration-ledger.json` in a separate reviewed commit.
4. Require zero pending and zero unresolved ledger entries.
5. Rebuild release metadata from the exact reviewed commit.
6. Update the compatibility marker only through a separately approved forward operation.
7. Run `npm run release:preflight`.
8. Deploy the exact approved SHA.
9. Verify provider commit metadata, `/api/version`, `/api/health`, anonymous smoke, authenticated populated smoke, and authenticated empty smoke.
10. Remove the release hold only after acceptance.

## 7. Abort conditions

Abort immediately if:

- production changes during evidence capture;
- a required object or identity differs;
- any extra nutrition ACL privilege remains;
- any Train actor/security/grant condition differs;
- any blocking integrity count is non-zero;
- backup evidence is missing or stale;
- operator/verifier ownership is unresolved;
- the release hold is absent;
- a command could replay existing migration SQL;
- the compatibility marker would advance before post-repair verification.

## 8. Rollback design

Before compatibility-marker advancement:

- keep the release hold active;
- stop further operations;
- revert only incorrectly inserted migration identities with `supabase migration repair <version> --status reverted`;
- verify the history table and compatibility marker;
- use the verified backup/PITR point only if metadata rollback is insufficient;
- prepare a new reviewed forward-fix plan for any physical divergence.

## 9. Current decision

```text
NO-GO
```

No production write, migration-history repair, compatibility-marker update, merge, or deployment is authorized by this plan.
