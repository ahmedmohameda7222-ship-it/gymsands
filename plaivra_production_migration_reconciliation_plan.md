# Plaivra Production Migration-History Reconciliation Plan

**Status:** Owner approval required before execution  
**Production project:** `bkwezjxvapaeasfvlhvv`  
**Operation type:** Forward-only migration-history metadata repair  
**SQL replay:** Prohibited

## 1. Purpose

Production contains the recorded schema effects of six repository migrations that are absent from `supabase_migrations.schema_migrations`. This plan establishes the evidence and approval sequence required to reconcile migration history without replaying DDL, modifying user data, rewriting an applied migration, or falsely advancing the release compatibility marker.

This document is not authorization to perform the repair.

## 2. Migrations in scope

1. `20260711213000_adaptive_onboarding_v2.sql`
2. `20260712173000_persistent_meal_plan_skip_status.sql`
3. `20260712195000_nutrition_target_date_overrides.sql`
4. `20260713153000_meal_plan_atomic_execution.sql`
5. `20260713160000_train_section_atomic_integrity.sql`
6. `20260713170000_finalize_train_schedule_delete_integrity.sql`

No other migration, schema object, index, grant, policy, trigger, or row repair is included.

## 3. Mandatory evidence package

Capture all evidence read-only and retain it with the exact repository SHA used for comparison:

- production project reference and capture timestamp;
- exact repository commit SHA;
- SHA-256 digest of each migration file;
- current rows from `supabase_migrations.schema_migrations`;
- current `release_schema_compatibility` row;
- output from `supabase/verification/production-release-migration-preflight.sql`;
- `pg_get_functiondef` for every function/RPC in scope;
- table/column definitions from `pg_catalog` and `information_schema`;
- constraint definitions from `pg_get_constraintdef`;
- index definitions from `pg_get_indexdef`;
- trigger definitions from `pg_get_triggerdef`;
- RLS enabled state and policy definitions;
- table/function grants and anonymous-denial evidence;
- row-level integrity findings requested by the migration-specific preflight;
- proof that no migration is partially applied.

Do not include credentials, access tokens, user-authored content, or unnecessary row data in the retained evidence.

## 4. Migration-specific proof

### 4.1 Adaptive onboarding v2

Verify:

- all columns added to `onboarding_answers`;
- all columns added to `user_nutrition_preference_profiles`;
- all columns added to `user_fitness_constraints`;
- `onboarding_answers_setup_stage_check` definition;
- `onboarding_answers_sport_details_object_check` definition;
- exact `complete_adaptive_onboarding_v2(jsonb,jsonb,jsonb,jsonb)` definition;
- function language, volatility, security mode, and hardened `search_path`;
- authenticated/service-role execution only and anonymous denial.

Abort if any column, constraint, function clause, grant, or ownership rule differs materially from the repository migration.

### 4.2 Persistent meal-plan skip status

Verify:

- allowed `user_meal_plan_items.status` values;
- skipped-state timestamp/integrity constraint;
- terminal-state transition function and trigger;
- no rows violate the intended terminal-state constraints.

Abort if production contains incompatible state values or a different terminal-transition contract.

### 4.3 Nutrition target date overrides

Verify:

- table `user_nutrition_target_date_overrides` and every column/default;
- unique owner/date constraint and expected index;
- RLS enabled;
- four owner policies for select/insert/update/delete;
- authenticated CRUD, service-role access, and anonymous denial;
- updated-at trigger;
- exact `apply_nutrition_target_changes(date,text,text,integer,numeric,numeric,numeric,integer,text)` definition and grants.

Abort on any policy, grant, function, uniqueness, or ownership mismatch.

### 4.4 Meal-plan atomic execution

Verify:

- all three browser-used atomic meal-plan RPC definitions;
- `auth.uid()` ownership checks for every source and resulting row;
- hardened `SECURITY DEFINER` search paths;
- exact role grants and anonymous denial;
- uniqueness indexes and execution-state constraints;
- terminal-transition trigger behavior;
- zero duplicate execution identities;
- recorded legacy repair outcome without exposing meal names or user identifiers.

Abort if cross-user access is possible, any RPC definition differs, or partial duplicate/repair state remains.

### 4.5 Train section atomic integrity

Verify:

- expected Train RPC set and signatures;
- ownership checks and reference assertions;
- archived day/exercise columns;
- active-plan uniqueness/constraint behavior;
- history/reference-preservation triggers;
- required indexes;
- hardened search paths and role grants;
- zero blocking integrity findings.

Abort if any legacy overload remains when the migration requires its removal, or any blocking integrity finding is non-zero.

### 4.6 Final Train schedule/delete integrity

Verify:

- explicit-local-date signatures for activate/create/save/archive/delete operations;
- absence of the superseded overloads;
- schedule-safe delete/archive behavior;
- authenticated/service-role grants and anonymous denial;
- hardened search paths;
- zero reference, duplication, schedule-history, active-plan, and orphan conflicts.

Abort on a signature mismatch, legacy overload, or non-zero blocking finding.

## 5. Partial-application detection

For each migration, classify the production state as exactly one of:

- **complete equivalent application** — every required effect matches;
- **partial application** — some but not all effects exist;
- **divergent application** — objects exist but definitions differ;
- **not applied** — required effects are absent.

Only `complete equivalent application` is eligible for history repair. A partial or divergent state requires a separately reviewed forward-fix migration. Never use migration-history insertion to conceal incomplete schema state.

## 6. Owner approval checkpoint

Before any history repair, the owner and independent quality-control reviewer must approve an evidence bundle containing:

- the exact production capture;
- the exact repository SHA and migration hashes;
- a migration-by-migration equivalence table;
- all preflight results;
- explicit confirmation that no SQL replay will occur;
- backup/restore evidence for migration metadata;
- the proposed metadata statements generated by the supported Supabase workflow;
- abort and rollback procedures.

Approval must name all six versions individually. Blanket approval is insufficient.

## 7. Forward-only history repair procedure

Use only the currently supported Supabase migration-history repair mechanism approved for the project. The operator must:

1. place production in a controlled release hold;
2. capture a fresh read-only evidence snapshot;
3. confirm the six migration file hashes have not changed;
4. confirm the preflight still reports complete equivalent application;
5. back up the migration-history rows and compatibility marker;
6. mark each exact migration version as applied through the supported history-repair operation, without executing migration SQL;
7. verify that each history identity appears exactly once with the intended version/name;
8. rerun the full read-only preflight;
9. update `supabase/migration-ledger.json` in a new reviewed repository change from `applied_schema_untracked` to the verified applied identities;
10. rerun the ledger checker and full migration rehearsal;
11. only then update the database compatibility marker to the reviewed expected migration version;
12. deploy no application until the reconciled repository commit passes release preflight.

The exact metadata command/API invocation must be copied from current Supabase documentation at execution time and included in the owner-approved runbook. Do not improvise direct inserts into internal migration tables.

## 8. Abort conditions

Abort immediately when:

- any object definition differs from repository SQL;
- any required object is missing;
- any unexpected legacy overload remains;
- any ownership/grant/policy test fails;
- any blocking integrity query returns rows;
- the production project reference is not exact;
- the repository SHA or migration hash changes after review;
- a backup cannot be verified;
- the supported repair mechanism is unavailable or ambiguous;
- an operator proposes replaying SQL;
- the compatibility marker would be advanced before post-repair verification.

## 9. Rollback and recovery

History repair changes metadata only. If verification fails before compatibility-marker advancement:

- keep the release hold active;
- stop further repair operations;
- restore the migration-history metadata from the captured backup using an independently reviewed procedure;
- retain all evidence and incident logs;
- do not change schema objects or user data;
- prepare a forward-fix plan for any discovered divergence.

After the compatibility marker is advanced, rollback must restore a code/schema-compatible release pair. Do not roll back code to an artifact that expects a different migration identity.

## 10. Post-repair verification

Required checks:

- six history identities present exactly once;
- no duplicate migration versions/names;
- repository ledger counts and states match production history;
- read-only preflight has zero blockers;
- full local migration chain succeeds from an empty database;
- database lint at error level passes;
- `/api/version` reports matching schema and migration markers;
- `migrationLedgerReconciled=true`;
- `schemaAppliedUntrackedCount=0`;
- `releaseReady=true` only after all artifact and browser gates also pass;
- authenticated populated and empty synthetic smoke passes against the reviewed deployment.

## 11. Compatibility-marker sequence

1. Repair and verify migration history.
2. Update and merge the machine-readable repository ledger through normal review.
3. Build release metadata from that exact commit.
4. Rehearse migrations and preflight.
5. Update the production compatibility marker through an approved forward-only operation.
6. Verify `/api/version` against the marker.
7. Deploy the exact reviewed commit.
8. Run authenticated release smoke.

The marker must never be used to claim physical-schema proof by itself.
