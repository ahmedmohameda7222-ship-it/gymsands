# Plan 9 initial Production human Governance Owner — recovery decision package

**Status:** NOT AUTHORIZED. Documentation only; no grants or Production user mutation.
**Scope:** Main Supabase project `bkwezjxvapaeasfvlhvv`. Remains under PR #188; no merge, Plan 10, Product deployment or Food ingestion permission.

## Verified facts (read-only; 2026-10-13)
- `auth.users`: 12; active and non-disabled `account_access_states`: 12.
- Active users with `profiles.role='admin'`: **0**.
- Governance principals: **0**; live capability grants: **0**.
- Plan 6 migration used one-time eligible legacy admin selection. This selection can no longer seed a legitimate Owner automatically; replaying an applied migration is forbidden.
- `public.food_catalog_manage_governance_principal` requires an existing authorized Owner actor. It cannot bootstrap the first Owner when no governance principal exists.
- Plan 9 review RPC remains executable by `authenticated` only, SECURITY DEFINER owned by postgres, empty search_path. No privilege is inferred from database-administrator access.
- Security Advisor finding `authenticated_security_definer_function_executable` is intentional only if tested principal + capability + reconciled-batch guards remain effective. See [Supabase linter 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Human identity establishment — mandatory prior decision

A project Owner or authorized account administrator must identify the **specific actual human** intended to hold initial governance authority through an authorized, authenticated administrative workflow. Verify an actual Supabase Auth UUID, active non-disabled account, and human control of that identity. Do **not** select an arbitrary one of the 12 Auth users, infer Ownership from database access, use a generated UUID, request credentials in chat, or reuse a disposable fixture.

Record separately, in approved audit/change-control evidence:
1. Exact intended Auth UUID and verified identity provenance in a secured approval channel.
2. Named approving human, timestamp, change-ticket and explicit **initial governance Owner grant** authorization.
3. Precondition readbacks: zero active Owner principals; zero existing principals; target active Auth user and access state.
4. Authorized execution channel, executor, incident/recovery scope, checkpoint and rollback/compensating response.

## Narrow one-time recovery proposal — not a migration and NOT executable without approval

Prefer an existing trusted owner-recovery path if one can legitimately establish the **first** human Owner without impersonation. If none exists, independently review a privileged, manual **single-target transactional recovery** performed by a verified database operator *only after exact approval*:

- Begin a transaction; obtain `private.food_catalog_governance_lock_recovery_set()` to serialize ownership changes.
- Assert the recorded Auth UUID exists and is active/non-disabled, and that the principal table and Owner grants still match the reviewed zero-Owner baseline.
- Insert **one** `human`/`owner` principal bound to that exact Auth UUID. Provision only `food.governance.manage_principals` and the separately approved `food.ingestion.review` capability, with an audit reason linking the exact authorization reference.
- Use the existing append-only governance audit/operation mechanism or a deliberately reviewed immutable recovery event to record actor, subject, reason, scope and result in the same transaction. If the required audit cannot be produced, abort; do not insert an unaudited principal.
- Assert at least one live active human Owner remains; commit only after verifying grants and exact subject binding.
- From the authenticated **real** Owner session, verify principal/capability recognition and that another ordinary member, anon and service_role cannot review a batch.
- Retain the protected last-Owner recovery invariant and validate future principal management uses the existing governed RPC, not a permanent administrative bypass.

No unchecked repeatable bootstrap function, no universal editor, no grant to a made-up account, and no automatic application of an Owner DML command in a schema migration. An authorized recovery command must be narrowly scoped and separately reviewed before use.

## Exact remaining gate

**Manual prerequisite:** identify and securely verify one intended real human Supabase Auth identity, supply explicit first-Owner privileged-grant approval, and obtain independent approval for the narrowly scoped recovery/audit mechanism. Until then, no Owner is created and the real 1A1 Production persisted dry run, approval, ingestion, activation and generation promotion remain blocked.

This document is a **recovery proposal**, not proof that Owner recovery is complete or authorized.
