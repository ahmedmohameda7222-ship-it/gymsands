# AW-3B structured set details implementation report

## Scope

AW-3B completes structured workout-set details without expanding into AW-3C. The permanent implementation covers owner-bound persistence and hydration, deterministic reads, trusted provenance, retry-safe timeline evidence, autosave acknowledgement safety, structured-field validation, privacy-export pagination, and EN/DE/AR presentation boundaries.

## Repository state

The branch contains the permanent AW-3B implementation. Temporary patch chunks, diagnostic logs, finalizer scripts, temporary workflows, workspace-export files, and the superseded `20260724003000` migration candidate have been removed. The permanent Phase A workflow is restored from `main`.

The committed forward-only correction is:

```text
supabase/migrations/20260724023000_active_workout_aw3b_post_apply_logic_corrections.sql
```

It remains pending until permanent exact-head CI, migration replay, database lint, and verification SQL succeed.

## Applied Production authority

The immutable final-hardening migration was applied exactly once:

```text
Repository migration: 20260724013000_active_workout_aw3b_final_logic_hardening.sql
Generated Production identity: 20260724002022_active_workout_aw3b_final_logic_hardening
Evidence commit: dc7d6597bc0aa1d2537a37f2a2e0188ee7f1dfe0
Repository Git blob: 095d7bd4edbe87bc8fd296d1d3879b47499448b9
Repository SHA-256: d5955f5eeccba56cd337385dc818efa9af8b979b7eea18b79d467d726a775d3e
```

It must not be modified, renamed, replayed, or replaced.

## Compatibility and isolation

```text
Compatibility marker: 20260722161542
Plaivra Production project: bkwezjxvapaeasfvlhvv
Activity Catalog project: khlcctuefiuhunqymkbp
```

The compatibility marker remains unchanged. The Activity Catalog is outside AW-3B and must not be modified.

## Durable rendered autosave verification

The Active Workout rendered-QA fixture now uses `lib/fixtures/train-mock-contract.json` as the single source of truth for the active plan, day, exercise, session, and persisted-log identities. The persisted set-detail fixture is therefore bound to the same stable exercise identity rendered by the mock Train plan instead of maintaining a second hard-coded identity set.

The Active Workout surface exposes non-visual persisted/completed/detail state attributes for deterministic QA preconditions. Train QA verifies hydration of the completed persisted Set 1, RPE, RIR, set type, and note before asserting autosave. A targeted autosave smoke scenario runs before the expensive rendered matrix so future identity or hydration drift fails early.

Invalid draft RPE/RIR values remain visible and accessible to the user but are excluded from non-persistence workout context serialization. Strict parsing is retained for actual persistence, so the rendered validation flow cannot crash while invalid draft values are being corrected and invalid values still cannot reach the atomic save RPC.

The remaining autosave failure was traced to lifecycle ownership under React Strict Mode. The development-only effect cleanup cancelled the coordinator while leaving its ref non-null, so the simulated remount reused a permanently cancelled coordinator and every later flush became a no-op. The permanent repair creates a new coordinator for every mounted lifecycle, cancels only that owned instance, clears the ref only when it still points to that instance, and creates a distinct live coordinator on remount. A mount-cleanup-remount regression test proves that the replacement coordinator remains live.

The lifecycle repair is validated under the repository-required Node 24 runtime through the permanent AW-3B unit suite, TypeScript validation, and exact-head rendered autosave smoke before Production migration authorization.

Permanent script and unit tests reject a return to duplicated hard-coded fixture identities, an autosave assertion without a proven hydration precondition, or reuse of a cancelled coordinator after a Strict Mode remount.

## Validated repository gates

The clean implementation has passed the AW-3B targeted suite, i18n suite, script suite, migration-ledger validation, TypeScript typecheck, ESLint, diff-format validation, and clean-worktree validation. Permanent CI must be bound to the current exact branch head before the pending migration is applied.

## Remaining release-closure work

1. Complete permanent exact-head Phase A, Quality, and Exact Release Quality validation.
2. Capture pre-application Production and Activity Catalog evidence.
3. Apply `20260724023000_active_workout_aw3b_post_apply_logic_corrections.sql` exactly once to Plaivra Production only.
4. Verify migration history, function definitions and ACLs, ownership integrity, timeline idempotency, structured-detail counts, data preservation, compatibility-marker stability, and Activity Catalog isolation.
5. Reconcile the migration ledger and this report to the generated Production migration identity.
6. Run final exact-head CI and leave PR #85 Draft.

The PR must not be merged, marked ready, or used to start AW-3C during this closure.
