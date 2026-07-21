# PLAIVRA AW-2A — PERSISTED SESSION EXECUTION STATE

## IMPLEMENTATION REPORT

## Executive summary

AW-2A is complete on the dedicated Draft PR. The implementation adds exactly one one-to-one transient execution-state child beneath the canonical `workout_sessions -> exercise_logs` performed-workout model. The database now authoritatively persists the current execution lifecycle/view, stable snapshot-item cursor, set number, timestamp-based workout timer, timestamp-based rest timer, revision/version metadata, bootstrap source, and a random non-fingerprinting controller-device identifier.

The existing plan-day Active Workout, direct workout form, and minimized Active Workout indicator hydrate and persist through the typed database service without a visual redesign. `localStorage` remains only a validated same-session cache/compatibility bridge. No AW-2B command envelopes, idempotency records, event timeline, offline queue, metric-schema redesign, or draft weight/reps persistence was introduced.

The single forward migration was replayed from zero, linted, verified, integration-tested, and applied once to Plaivra Database only. Production retained the same 10 workout sessions; the one open session received one `legacy_backfill` execution-state row. No terminal session has execution state, ownership is consistent, and the release compatibility marker remains `20260717051011`.

## Repository identity

- Actual starting main SHA: `6f381b760eb711c3eef4bb515365d4c675648ed3`
- Reviewed main SHA: `6f381b760eb711c3eef4bb515365d4c675648ed3`
- Reviewed main commit: `Merge AW-1B active workout localization`
- Intervening main changes inspected: none; actual starting main matched the reviewed SHA.
- Branch: `feat/active-workout-aw2a-persisted-execution-state`
- Draft PR: `#80`
- Draft PR URL: `https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/80`
- Validated implementation head before report finalization: `56d17feadc6e2af668455bbe5ed1aa61230890ff`
- Final report/cleanup head: the commit containing this report and final cleanup; exact SHA is reported in the PR handoff because a Git commit cannot self-embed its own SHA.
- PR state at report finalization: open, Draft, unmerged.

## CI run IDs and exact statuses

Successful exact-head validation for implementation head `56d17feadc6e2af668455bbe5ed1aa61230890ff`:

- Phase A Diff Validation: run `29788570304` — `completed/success`
- Quality: run `29788570293` — `completed/success`
- AW-2A Full Validation: run `29788570296` — `completed/success`
- Full-validation artifact: `aw2a-full-validation-56d17feadc6e2af668455bbe5ed1aa61230890ff`
- Artifact ID: `8479552058`
- Artifact digest: `sha256:7858ba0de6735ead5bb19df42b4802a78a22c125aa16306ae376c1616182a76a`

The final report/cleanup-only head is revalidated by Phase A and Quality before handoff; its exact run IDs are included in the final PR handoff.

## Files created

- `lib/product/active-workout-aw2a-migration.test.ts`
- `lib/workouts/active-workout-device.test.ts`
- `lib/workouts/active-workout-device.ts`
- `lib/workouts/workout-session-execution.test.ts`
- `lib/workouts/workout-session-execution.ts`
- `services/database/workout-session-execution.integration.test.ts`
- `services/database/workout-session-execution.test.ts`
- `services/database/workout-session-execution.ts`
- `supabase/migrations/20260720213000_active_workout_aw2a_execution_state.sql`
- `supabase/verification/active-workout-aw2a-execution-state.sql`
- `supabase/verification/active-workout-aw2a-integration.sql`
- `plaivra_aw2a_persisted_execution_state_implementation_report.md`

## Files modified

- `.github/workflows/quality.yml`
- `README.md`
- `components/workouts/active-workout-indicator.tsx`
- `components/workouts/workout-day-focus-session.tsx`
- `components/workouts/workout-session-form.tsx`
- `docs/architecture/migration-ledger-reconciliation.md`
- `lib/active-workout.test.ts`
- `lib/active-workout.ts`
- `lib/privacy/data-export.test.ts`
- `lib/privacy/data-export.ts`
- `lib/product/muscle-intelligence-phase3-migration.test.ts`
- `supabase/migration-ledger.json`
- `types/database.ts`

Temporary AW-2A execution/diagnostic workflow scaffolding was removed before final handoff and is not part of the delivered repository contract.

## Migration identity

- Repository migration filename: `20260720213000_active_workout_aw2a_execution_state.sql`
- Repository migration version: `20260720213000`
- Migration name: `active_workout_aw2a_execution_state`
- Git blob SHA: `caa286b2ad287f042d2cf7691ec7774a9db7a50d`
- SHA-256 checksum: `c8f21655226d51a2157fa1b8c272edc5fac1f84f0a2214376a16e225a1f04f2e`
- Production migration record assigned by supported Supabase migration authority: `20260721000544_active_workout_aw2a_execution_state`
- Production record count for that migration: exactly `1`

The production authority generated its own migration-history version while applying the immutable repository SQL. The ledger maps the production identity to the reviewed local file; neither identity is rewritten or replayed.

## Production projects

- Production project modified: Plaivra Database `bkwezjxvapaeasfvlhvv`
- Activity Catalog project: `khlcctuefiuhunqymkbp`
- Activity Catalog unchanged confirmation: no migration, schema, data, function, policy, configuration, or application-client change was executed against Activity Catalog. No Activity Catalog repository path is in the PR diff.

## Production migration history

### Before

- Recorded migrations: `62`
- Latest record: `20260719223300_muscle_intelligence_phase4c1_trusted_log_cleanup`
- AW-2A table absent.

### After

- Recorded migrations: `63`
- AW-2A production record: `20260721000544_active_workout_aw2a_execution_state`
- AW-2A record count: `1`
- AW-2A table present.
- Release compatibility marker remains `20260717051011`.

## Production aggregate session counts before and after

Before migration:

```text
workout_sessions total = 10
started/open = 1
completed = 9
skipped = 0
execution-state rows = 0 / table absent
```

After migration:

```text
workout_sessions total = 10
started/open = 1
completed = 9
skipped = 0
execution-state rows = 1
legacy_backfill rows = 1
active rows = 0
paused rows = 0
review rows = 1
open sessions without state = 0
terminal sessions with state = 0
owner mismatches = 0
```

Actual legacy rows backfilled: `1`.

## Schema contract

`public.workout_session_execution_states` is a one-to-one child keyed by `workout_session_id`, with `ON DELETE CASCADE` to `workout_sessions`. It contains only the approved fields:

- root/owner identity;
- state version and database-managed revision;
- session state and view state;
- stable snapshot-item identity and item-order fallback;
- active set number;
- accumulated elapsed seconds and running anchor;
- timestamp-based rest tuple;
- random controller-device identifier;
- bootstrap source;
- created/updated timestamps.

No third performed-session root, arbitrary JSON state blob, command table, idempotency table, or timeline table was added.

## State and view semantics

- Session states: `active`, `paused`, `review`.
- View states: `set_entry`, `rest`, `exercise_complete`, `session_review`.
- Database integrity enforces `session_state = review` if and only if `view_state = session_review`.
- An execution-state row may exist only while the root `workout_sessions.status` is `started`.
- This execution lifecycle does not replace the canonical root status.

## Timer semantics

- Paused elapsed time is `session_elapsed_seconds`.
- Active/review elapsed time is the accumulated seconds plus whole seconds since `session_running_since`.
- No one-second ticking counter is persisted.
- Paused state requires a null running anchor; active/review requires a running anchor.
- Rest uses `rest_started_at`, bounded `rest_duration_seconds`, and exact `rest_ends_at` equality.
- Rest fields are all null outside the `rest` view.
- `workout_sessions.duration_minutes` remains the coarse compatibility/history projection.

## Cursor semantics

- `active_snapshot_item_id` references immutable session snapshot items.
- Database integrity verifies the item belongs to the same root session and owner.
- `active_item_order` must match the snapshot item when an item ID is present.
- `active_item_order` and `active_set_number` are one-based.
- Exercise names are never the primary cursor identity.
- Plan-day sessions bridge through snapshot source plan identities/order; direct sessions bridge through snapshot item/order.

## Bootstrap algorithm

The trusted idempotent initializer runs from the existing deferred snapshot lifecycle:

1. lock/read the started root session;
2. resolve its authoritative immutable snapshot;
3. scan ordered snapshot items and planned set numbers;
4. exclude authoritative completed `exercise_logs.completed_at` rows using stable source identities/order;
5. choose the first unfinished item/set;
6. select deterministic review state only when all planned work is complete;
7. use `duration_minutes * 60` as the accumulated floor;
8. use a safe current anchor for legacy backfill to avoid unexpectedly huge stale timers;
9. insert one row with `ON CONFLICT DO NOTHING`.

Existing open-session backfill is deterministic, idempotent, and uses `bootstrap_source = legacy_backfill`.

## Trigger lifecycle

- Integrity trigger: validates identity, owner, root status, cursor, state/view relation, timer tuples, immutability, and revision behavior.
- Deferred snapshot initializer: creates exactly one state row after the authoritative snapshot exists.
- Terminal cleanup trigger: deletes transient state when root status leaves `started`.
- Root deletion/cancel: FK cascade removes transient state.
- Performed sessions and `exercise_logs` remain intact after terminal cleanup.

## RLS and grants

- RLS enabled on `workout_session_execution_states`.
- `authenticated`: owner/admin-scoped `SELECT` and `UPDATE` only.
- `authenticated`: no direct `INSERT` or `DELETE`.
- `anon`/PUBLIC: no table access.
- `service_role`: intentional trusted maintenance/application CRUD.
- Policies use `auth.uid()` owner scope and the existing `private.is_admin()` convention.
- Cross-user read, update, and create isolation passed PostgreSQL integration verification.

## Function security review

The four AW-2A private functions are owned by `postgres`, are `SECURITY DEFINER`, and have `search_path = ''`:

- `private.enforce_workout_session_execution_state()`
- `private.initialize_workout_session_execution_state(uuid,text,timestamptz)`
- `private.initialize_workout_session_execution_state_from_snapshot()`
- `private.cleanup_workout_session_execution_state()`

Trigger functions are not executable by PUBLIC, anon, authenticated, or service role. The narrow initializer is executable only by service role in addition to its trusted owner.

## Revision behavior

- New rows start at revision `0`.
- Callers cannot force, replace, or decrease revision.
- Effective updates set `revision = old.revision + 1` and refresh `updated_at`.
- True no-op updates preserve both revision and `updated_at`.
- Expected-revision CAS, command envelopes, operation IDs, and deduplication are intentionally deferred to AW-2B.

## Device-ID privacy review

- Local key: `plaivra.active-workout.device.v1`.
- Uses `crypto.randomUUID()` when available.
- Uses cryptographically random bytes only as fallback.
- Existing values are validated; malformed values are regenerated.
- The value is random metadata only and is never derived from browser, OS, screen, hardware, IP, user agent, advertising identifier, or another fingerprinting input.
- Maximum database length is 128 characters; the approved UUID shape is enforced.
- It is not displayed in the UI.

## Current UI bridge

Without changing card/button/copy/translation/Heat Map structure:

- plan-day Active Workout loads the authoritative execution state after canonical session start/resume, resolves the stable cursor, hydrates workout/rest timers, and mirrors the server row into the local cache;
- plan-day cursor, rest start/change/clear, timer reset, session review, and device metadata persist through narrow service operations;
- direct workout form hydrates/persists timer, rest timer, meaningful cursor, and device identifier;
- minimized indicator loads server execution state and persists pause/resume with correct timestamp accumulation;
- pause/resume optimistic cache changes roll back on failure;
- completion/cancellation remain in existing canonical session services, with database cleanup triggers removing state.

Components do not import the Supabase client for the new table.

## Local-storage compatibility behavior

Authority order after a session exists:

```text
database execution state
> validated same-user/same-session cache
> safe session/log-derived fallback
```

`lib/active-workout.ts` now validates parsed cache data rather than blindly casting JSON and mirrors approved server fields. Existing local timestamps may be imported once only for the same user/session when the row is an initial `legacy_backfill`, the cache is valid/plausible, and import cannot reduce accumulated server time. Successful import changes bootstrap source to `client_cache_import`. Broad local-storage removal is intentionally deferred.

## Direct-session limitations

Direct-session draft reps, weight, and notes remain local/unpersisted until AW-3 introduces structured generic metric/set persistence. AW-2A persists only execution lifecycle, timer, rest, cursor, revision/version, and device metadata.

## Metric and draft-data limitations

AW-2A does not persist or redesign:

- draft weight/reps;
- RPE/RIR structured fields;
- generic metric schemas;
- set-detail JSON;
- prescription models beyond immutable snapshots;
- command/idempotency/timeline records;
- offline queues or conflict state;
- derived metrics or Heat Map calculations.

## Privacy export decision

Evidence-based decision: include the active execution state in Plaivra data export while it exists because the current privacy architecture exports user-owned active workout/session data and this row is user-owned transient application data. Export tests verify the explicit typed projection. Terminal cleanup means completed/skipped history contains no execution-state row.

## Account-deletion verification

PostgreSQL integration verification created an execution-state row through the authoritative direct-session start path, then executed the existing trusted account purge lifecycle. The root session and execution-state row were removed, and the profile was deleted. FK choices and lifecycle triggers do not block account deletion.

## Tests added or updated

Coverage includes:

- append-only migration/source contract;
- exact schema/column/RLS/trigger boundaries;
- prohibition of third session roots, command IDs, and timeline tables;
- pure active/paused elapsed calculations;
- timer reset and invalid-date fallback;
- rest countdown and expiration;
- stable cursor mapping for plan-day/direct sessions;
- random device-ID validation/regeneration and no fingerprinting inputs;
- service owner/session scoping, explicit failure behavior, patch allowlist, revision return, pause/resume/reset/rest/import behavior;
- legacy cache acceptance/rejection and cross-user/session rejection;
- PostgreSQL initialization, idempotency, deterministic unfinished cursor, review initialization, RLS isolation, invalid state/timer/cursor/revision rejection, terminal cleanup, root cascade, history preservation, and trusted account deletion;
- privacy export inclusion;
- existing migration-contract expectations updated without weakening terminal immutability.

## Commands run and exact results

The exact-head AW-2A Full Validation workflow executed the required commands:

- `npm ci` — passed for starting main and AW-2A head.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run test:i18n` — passed.
- full unit suite — returned non-zero on both starting main and AW-2A head due the same four pre-existing failure identities; AW-2A introduced no new failure identity.
- `npm run test:integration` — passed.
- `npm run test:scripts` — passed.
- `npm audit --omit=dev --audit-level=moderate` — passed.
- `npm run build` — passed.
- `npm run qa:train` — passed.
- `git diff --check` — passed.
- `supabase db start` — passed.
- `supabase db reset --local --no-seed` — passed; complete migration chain replayed from zero.
- `supabase db lint --local --schema public --level error --fail-on error` — passed.
- `supabase/verification/active-workout-aw2a-execution-state.sql` — passed.
- PostgreSQL AW-2A integration test — passed.
- existing Train security verification — passed.
- database preflight-control test — passed.
- production release migration preflight — passed.
- `npm run migration:ledger:check` — passed before production apply with the AW-2A migration represented as the single reviewed pending migration.
- release manifest generation — passed.

## Starting-main failure parity

Starting main and AW-2A head each had exactly four unit-test failure identities:

1. `Muscle Intelligence Phase 1 migration contract > executes the disposable Phase 1 verification in the authoritative Quality database preflight`
2. `approved Train Phase 1 UI contracts > keeps picker selection, duplicates, keyboard selection, focus return, request grouping, cancellation, and explicit pagination`
3. `approved Train Phase 1 UI contracts > localizes detail, history filters, direct-session failures, and the active workout controller`
4. `Train Phase 2A architecture contract > enforces privacy, ownership, JSON shape, and verification in the authoritative quality gate`

Starting main assertions: `1205`; failures: `4`.
AW-2A head assertions: `1232`; failures: `4`.
New AW-2A failure identities: `0`.

## Local database results

- Local migration-chain replay: passed.
- Local DB lint at error level: passed.
- Permanent AW-2A verification SQL: passed.
- PostgreSQL integration verification: passed.
- Existing Train security/preflight verification: passed.

## Production-safe verification result

Production read-only verification confirmed:

- migration recorded once;
- table present;
- 1 open root session and 1 execution-state row;
- 1 actual `legacy_backfill` row;
- 0 open sessions without state;
- 0 terminal sessions with state;
- 0 owner mismatches;
- RLS enabled;
- exactly two owner/admin-scoped authenticated policies;
- authenticated grants limited to SELECT/UPDATE;
- anon/PUBLIC receive no table grant;
- trusted functions owned by `postgres`, `SECURITY DEFINER`, and hardened with empty search paths;
- required integrity, deferred initializer, and terminal cleanup triggers present;
- compatibility marker unchanged at `20260717051011`.

## Database/Supabase changes

Only Plaivra Database `bkwezjxvapaeasfvlhvv` was changed, through one supported migration application. No production sessions, logs, plans, snapshots, or user workout content were deleted or rewritten. The migration only created the new transient table, supporting index, private functions, triggers, policies/grants, and one deterministic backfill row for the existing open session.

## Explicit boundary confirmations

- No Activity Catalog change.
- No release compatibility-marker change.
- No Active Workout UI redesign.
- No copy or translation redesign.
- No Heat Map change.
- No draft metric persistence.
- No third performed-session model.
- No AW-2B command/idempotency work.
- No AW-2C, AW-3, AW-4, AW-5, or AW-9 scope started.
- No merge.
- No manual web deployment.

## Risks

- The production migration authority recorded a generated history version (`20260721000544`) rather than the repository filename timestamp (`20260720213000`). Both immutable identities are explicitly mapped in the migration ledger and report.
- Existing full-unit debt remains unchanged at four known failure identities. Quality and the AW-2A parity gate prove no new identity.
- Concurrent command-level conflict resolution is intentionally not present until AW-2B/AW-9.

## Limitations

- Direct-session uncompleted reps, weight, and notes remain local.
- Local timestamp/cache keys remain compatibility mirrors.
- Revision is stored and database-managed but no expected-revision CAS is implemented.
- Controller device ID is metadata only; no lease, heartbeat, takeover, or secondary-device mode exists.

## Out-of-scope findings

No in-scope blocker remains. The four known starting-main unit-test failures are pre-existing and unchanged. No unrelated migration-history repair was performed.

## Final git status

- All delivered source, migration, verification, tests, application bridge, ledger, documentation, and this report are committed on the AW-2A branch.
- Temporary AW-2A workflow scaffolding is removed before final handoff.
- Draft PR remains open and unmerged.

## No merge/deployment confirmation

PR #80 was not merged. No manual application deployment was initiated. The only production operation was the explicitly authorized Plaivra Database migration. AW-2B was not started.
