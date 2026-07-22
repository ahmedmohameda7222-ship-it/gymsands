# PLAIVRA AW-3A Structured Performance Metrics — Implementation Report

## 1. Executive summary

AW-3A is implemented as the database/domain/service/privacy foundation for normalized performed workout metrics beneath the existing canonical hierarchy:

```text
workout_sessions
└── exercise_logs
    └── exercise_log_metric_values
```

The implementation adds a versioned global metric-definition registry, normalized performed metric values, atomic legacy/structured write compatibility, scalar `reps`/`weight_kg` projections, unilateral values, bounded source metadata, AW-2C timeline fingerprints/payloads, conservative historical backfill, owner-scoped reads, direct-write closure, typed TypeScript services, and privacy export coverage.

Explicitly not implemented: AW-3B set details, AW-3C prescription snapshots, Active Workout UI, RPE/RIR, tempo, drop stages, set-level `side_mode`, derived volume/PR/progression, device/import adapters, offline/multi-device behavior, notifications, PDF, Heat Map changes, or Activity Catalog changes.

## 2. Repository and delivery identity

- Repository: `ahmedmohameda7222-ship-it/gymsands`
- Actual base SHA: `4f33712cd2eac30e8a442d6fdbf4ec103a040e76`
- Base commit: `feat(workouts): add AW-2C durable timeline events`
- Branch: `feat/active-workout-aw3a-structured-metrics`
- Draft PR: `https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/84`
- Draft PR title: `feat(workouts): add AW-3A structured performance metrics`
- Validated implementation head before this report commit: `e74e31f390e3748bf9e5cdfd4d9ef44b518281b3`
- Final report-containing head: the immutable PR head that contains this file and is recorded by the final exact-head Phase A, Quality, Exact Release Quality artifacts, and Planner handoff. A Git commit cannot contain its own SHA without changing that SHA.
- PR state: open, Draft, not merged
- Deployment state: no deployment initiated

The branch was created from the authoritative remote `main`; no AW-2 branch was reused.

## 3. Migration identity and reconciliation

### Repository migration

- File: `supabase/migrations/20260722113000_active_workout_aw3a_structured_metrics.sql`
- Repository version: `20260722113000`
- Git blob: `3c93c484da42927d7e4b3e7c1f175c359853f424`
- Repository SQL SHA-256: `8c63947898b6aae92edb348acd9149dfc3f6089dd93558de2beb49f07c5be8b1`

### Production application

- Supabase project: `bkwezjxvapaeasfvlhvv` (`Plaivra Database`)
- Production version: `20260722161542`
- Production name: `active_workout_aw3a_structured_metrics`
- Applied SQL SHA-256: `8c63947898b6aae92edb348acd9149dfc3f6089dd93558de2beb49f07c5be8b1`
- Applied SQL character count: `43322`
- Production migration records with this name: exactly `1`
- Application count: exactly once
- Activity Catalog project `khlcctuefiuhunqymkbp`: not queried or mutated

### Ledger

`supabase/migration-ledger.json` contains one `applied_version_alias` entry binding immutable repository file `20260722113000_active_workout_aw3a_structured_metrics.sql` to Production version `20260722161542`, including the repository blob and identical repository/applied SHA-256. No repository migration was renamed, replayed, repaired, or edited after Production application.

### Compatibility marker

- Before AW-3A: schema version `2`, marker `20260722093115`
- After AW-3A: schema version `2`, marker `20260722093115`
- Marker promotion performed: no
- Later post-merge Release Closure target: `20260722161542`

## 4. Production baseline and post-state

### Counts preserved on existing roots

| Object | Before | After |
|---|---:|---:|
| `workout_sessions` | 10 | 10 |
| `exercise_logs` | 64 | 64 |
| `workout_session_timeline_events` | 83 | 83 |
| `workout_session_execution_states` | 1 | 1 |
| `workout_session_execution_commands` | 0 | 0 |
| `workout_session_muscle_snapshots` | 10 | 10 |
| `workout_session_muscle_snapshot_items` | 34 | 34 |
| `release_schema_compatibility` | 1 | 1 |

### Canonical post-state hashes

The migration captured and compared these deterministic root hashes in the same transaction; read-only Production verification reproduced them afterward:

| Object | SHA-256 |
|---|---|
| `workout_sessions` | `d2709c7e04fac0793b5fca4bfa557a18f46c944e6cd0b833506a11e5334d07dd` |
| `exercise_logs` | `55bc8fb1fba79c374cea8b70cb781d52346deeb79e2c310bee7aa8377575793a` |
| `workout_session_timeline_events` | `7e9ff3cbe523215e55facc2cbdbd9b1ebdbd201dd58c95e16f1e257ffc58f4ee` |
| `workout_session_execution_states` | `ea708d9ba7482ea1b7cdd5876fcf44cbd504c7288bb8bc72cd901e45b05221ab` |
| `workout_session_execution_commands` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `workout_session_muscle_snapshots` | `aa9690b8f917b75dcf044f32bbc05c68218ae30c74e97166d19caaee1f5c372b` |
| `workout_session_muscle_snapshot_items` | `b2cf96335207d3429654f4e56c8b68d605c987798d2a19f4dc7bf964a58c5a9b` |
| `release_schema_compatibility` | `d305b0e8beb198b0f7d19314a60104c3be4de10501b61522a2c38461f0309ac4` |

### New metric state

- Definitions: exactly 7 current v1 definitions
- Metric values: 75
- `repetitions`, `source=backfill`, `side=none`: 64
- `external_load_kg`, `source=backfill`, `side=none`: 11
- Other backfilled keys: 0
- Metric orphans: 0
- Open sessions without execution state: 0
- Terminal sessions with execution state: 0
- Timeline owner mismatches: 0

## 5. Database objects and security

### `public.workout_performance_metric_definitions`

Columns:

- `metric_key text not null`
- `metric_version smallint not null`
- `value_kind text not null`
- `canonical_unit text not null`
- `minimum_value numeric not null`
- `maximum_value numeric not null`
- `supports_side boolean not null`
- `sort_order smallint not null`
- `is_current boolean not null default true`
- `created_at timestamptz not null default clock_timestamp()`

Enforcement:

- primary key `(metric_key, metric_version)`
- lower-snake-case key, length 1–64
- positive version
- value kind limited to `integer|decimal`
- unit limited to `count|kg|seconds|meters`
- nonnegative minimum and ordered range
- positive sort order
- partial unique index: one current version per key
- all privileges revoked from `public`, `anon`, `authenticated`, and `service_role`, followed by SELECT only for `authenticated` and `service_role`

Seeded v1 definitions: `repetitions`, `external_load_kg`, `bodyweight_kg`, `assistance_load_kg`, `duration_seconds`, `distance_meters`, and `rounds`, with the approved ranges, units, side support, and sort order.

### `public.exercise_log_metric_values`

Columns:

- `id uuid primary key default gen_random_uuid()`
- `exercise_log_id uuid not null`
- `workout_session_id uuid not null`
- `user_id uuid not null`
- `metric_key text not null`
- `metric_version smallint not null default 1`
- `side text not null default 'none'`
- `value numeric(20,6) not null`
- `source text not null`
- `source_provider text null`
- `source_version text null`
- `captured_at timestamptz not null`
- `created_at timestamptz not null default clock_timestamp()`
- `updated_at timestamptz not null default clock_timestamp()`

Ownership and identity:

- unique parent identity `workout_sessions(id,user_id)`
- unique parent identity `exercise_logs(id,workout_session_id)`
- composite FK `(exercise_log_id,workout_session_id)` to `exercise_logs`, cascade delete
- composite FK `(workout_session_id,user_id)` to `workout_sessions`, cascade delete
- FK `user_id` to `profiles`, cascade delete
- FK `(metric_key,metric_version)` to definition registry, restrict delete
- unique `(exercise_log_id,metric_key,side)`

Indexes:

- unique metric/side identity
- `(workout_session_id,exercise_log_id,metric_key,side)`
- `(user_id,captured_at desc,id desc)`
- `(user_id,metric_key,captured_at desc,id desc)`

Security:

- RLS enabled
- authenticated owner/admin SELECT policy
- no authenticated INSERT/UPDATE/DELETE grant
- service role retains trusted server operations
- authenticated direct INSERT/UPDATE/DELETE revoked from `exercise_logs`
- broad `exercise_logs_own_all` policy removed and replaced by owner/admin SELECT only
- canonical public write authority remains `public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)`

### Hardened functions and trigger

- `private.validate_workout_performance_metric_value(...)`: trusted owner, `SECURITY DEFINER`, empty `search_path`, no app-role execute grant
- `private.validate_exercise_log_metric_value_row()`: validates log/session/user identity and definition/range/integer/side/source/capture-time rules
- `exercise_log_metric_values_validate`: before INSERT/UPDATE trigger
- `private.workout_performance_metric_snapshot(uuid)`: bounded deterministic timeline projection, private execution only
- `public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)`: same public signature, hardened security-definer wrapper integrating structured values and AW-2C events

## 6. Atomic write behavior

### Legacy compatibility mode

When `performance_metrics` is absent:

- existing scalar clients remain valid;
- non-null `reps` synchronizes `repetitions/none`;
- non-null `weight_kg` synchronizes `external_load_kg/none`;
- explicit scalar null removes only the unsided compatibility metric;
- unilateral and nonlegacy generic metrics remain untouched;
- source metadata defaults to manual at the browser boundary;
- MCP explicitly supplies `chatgpt/openai`;
- the AW-2C core remains the root-set upsert authority.

### Structured full-replacement mode

When `performance_metrics` is present:

- array shape and maximum 16 metrics are checked before mutation;
- duplicate `(metric_key,side)` and none/bilateral ambiguity are rejected;
- every definition/version/value/side/source/provider/version/capture timestamp is validated;
- represented metrics are deterministically upserted;
- omitted metrics are deleted;
- an empty array clears structured metrics;
- `repetitions` and `external_load_kg` at side `none|bilateral` project to scalar fields;
- left/right-only values do not invent scalar totals;
- missing scalar-compatible values project scalars to null;
- scalar/structured disagreement rolls back the entire call.

### Atomicity/idempotency/concurrency

The session row is locked before validation and mutation. Actor assertion, ownership/state validation, root-set upsert, structured metric synchronization, scalar compatibility, and AW-2C event comparison happen in one transaction. Exact retries preserve one set row, one metric row per key/side, and one timeline event identity. Completion deletion cascades metric children.

## 7. Timeline integration and privacy

No new event type was added. AW-3A continues to use only `set_completed` and `set_edited`.

- `performanceMetrics` is added to completed-set payloads.
- normalized metrics participate in the event fingerprint.
- metric additions/removals/value/side/version/source/provider/version/capture-time changes add `performanceMetrics` to `changedFields`.
- exact retry produces no duplicate event.
- notes remain represented only by `notesChanged`; note text is not emitted.
- payload excludes metric row IDs, raw notes, access/refresh tokens, credentials, user agents, IPs, controller/device identifiers, and fingerprints.
- migration backfill creates no timeline event and changes no historical timeline row.

## 8. Historical backfill

Locked pre-migration Production facts:

- `exercise_logs`: 64
- non-null `reps`: 64
- non-null `weight_kg`: 11
- expected rows: 75

Actual:

- 64 `repetitions/none` rows
- 11 `external_load_kg/none` rows
- total 75

Every row uses source `backfill`, null provider/version, and `captured_at = coalesce(completed_at,created_at)`. No bodyweight, assistance, duration, distance, rounds, left/right, RPE, RIR, tempo, drop-stage, note-parsed, plan-inferred, profile-inferred, or Activity-Catalog-inferred value was created. Existing root counts/hashes and timeline count/hash remained unchanged.

## 9. TypeScript and runtime convergence

### Types

`types/workout-performance.ts` defines bounded unions and typed contracts for metric keys, sides, sources, value kinds, definition rows, inputs, saved values, set results, and session results. `types/index.ts` exports the module. `types/database.ts` extends `ExerciseLog` with optional structured metric children while preserving scalar compatibility fields.

### Service

`services/database/workout-performance.ts` provides:

- immutable definition constants and parity guards;
- input normalization and early range/integer/source/provider checks;
- explicit camelCase-to-snake_case mapping;
- safe row mapping;
- current definition reads;
- owner-scoped deterministic session performance reads;
- owner-scoped exercise-log metric reads;
- UUID validation, bounded reads, deterministic ordering, and safe errors.

### Set writes

`services/database/workout-sessions.ts` serializes optional `performanceMetrics`, `metricSource`, `metricSourceProvider`, and `metricSourceVersion` while leaving old reps/weight callers unchanged.

The compatibility surface was split deliberately:

- `services/database/workout-sessions-legacy-implementation.ts` retains the existing legacy read/history/completion implementation.
- `services/database/workout-sessions-legacy.ts` is the public compatibility wrapper and overrides the reachable set-save function so it always calls `upsert_workout_set_logs_atomic`.

No reachable browser set-write fallback performs direct `exercise_logs` INSERT/UPDATE/DELETE/UPSERT.

### MCP

The existing MCP implementation is retained in `lib/mcp/tool-executor-implementation.ts`. `lib/mcp/tool-executor.ts` is the public boundary that preserves all existing tools and intercepts only `upsert_workout_set_logs_atomic`, adding:

```text
metric_source = chatgpt
metric_source_provider = openai
```

It does not expand the public MCP input schema with arbitrary structured metrics. Existing mocks and RPC arity are preserved.

### Personal Records

Personal Record logic remains on scalar `reps` and `weight_kg`; formulas were not changed.

## 10. Privacy export and deletion

`lib/privacy/data-export.ts` includes owner-scoped `exercise_log_metric_values` under:

```text
workouts.performance_metric_values
```

Exported fields are limited to:

- `id`
- `exercise_log_id`
- `workout_session_id`
- `metric_key`
- `metric_version`
- `side`
- `value`
- `source`
- `source_provider`
- `source_version`
- `captured_at`
- `created_at`
- `updated_at`

Global definitions are not exported as user data. Metric values cascade through canonical session/profile deletion; Production verification found zero orphans.

## 11. Changed files and purpose

- `types/workout-performance.ts` — bounded AW-3A domain contracts.
- `types/index.ts` — public type export.
- `types/database.ts` — optional metric child projection on performed logs.
- `services/database/workout-performance.ts` — guards, normalization, mapping, owner-scoped reads.
- `services/database/workout-performance.test.ts` — definition/range/integer/source/mapping/read tests.
- `services/database/workout-performance.integration.test.ts` — write-surface, replacement, completion, MCP boundary contracts.
- `services/database/workout-sessions.ts` — structured payload serialization and canonical RPC use.
- `services/database/workout-sessions-legacy.ts` — public compatibility wrapper with canonical RPC-only set saving.
- `services/database/workout-sessions-legacy-implementation.ts` — retained legacy read/history/completion implementation behind the wrapper.
- `lib/mcp/tool-executor.ts` — explicit ChatGPT/OpenAI set-metric source boundary.
- `lib/mcp/tool-executor-implementation.ts` — retained existing MCP implementation behind the boundary.
- `lib/mcp/workout-performance-source.test.ts` — behavioral MCP source metadata proof.
- `lib/mcp/catalog-versioning.test.ts` — follows the permanent executor split.
- `lib/architecture/canonical-convergence.test.ts` — follows the permanent executor split.
- `lib/privacy/data-export.ts` — user-owned metric export.
- `lib/product/active-workout-aw3a-migration.test.ts` — migration/schema/security/source/runtime contract.
- `lib/product/train-phase1-approved-semantics.test.ts` — follows permanent compatibility implementation paths.
- `scripts/replay-local-migration-chain.mjs` — exact AW-2C compatibility bridge for clean chronological replay; no migration skipped.
- `scripts/promote-release-schema-compatibility.test.mjs` — historical AW-2A fixture excludes later AW-2B/C/AW-3A ledger records.
- `package.json` — focused `test:active-workout:aw3a` command.
- `supabase/migrations/20260722113000_active_workout_aw3a_structured_metrics.sql` — sole AW-3A forward migration.
- `supabase/verification/active-workout-aw3a-structured-metrics.sql` — rollback-safe schema/security/backfill verification.
- `supabase/verification/active-workout-aw3a-integration.sql` — rollback-safe legacy/generic/unilateral/replacement/invalid/timeline/cascade integration verification.
- `supabase/migration-ledger.json` — actual Production alias and hashes.
- `plaivra_aw3a_structured_metrics_implementation_report.md` — Planner QA/QC handoff.

## 12. Quality failure root cause and corrections

The supplied `aw3a-quality-failure.zip` showed the first real root cause in Quality run `29934198890`: the chronological replay helper excluded the immutable AW-2C migration, then attempted AW-3A against a database without the required AW-2C marker/timeline/functions. AW-3A correctly failed closed. The permanent replay helper was corrected to replay AW-2C and model the repository-vs-Production marker alias without editing or skipping applied SQL.

Subsequent in-scope failures were corrected on the same branch/PR:

1. PostgreSQL literal type mismatch for the private smallint validator call.
2. RLS verification variable typed as bigint instead of boolean.
3. Production migration alias absent from the ledger before reconciliation.
4. Unsupported dotAll regular-expression flags under the repository TypeScript target.
5. Accidental package-version drift restored to the lockfile-compatible Radix version.
6. Source-contract tests updated for the permanent compatibility/MCP wrapper split.
7. MCP wrapper preserved absent-RPC mocks and two-argument RPC calls.
8. Release-promotion historical test fixture excluded the new later AW-3A ledger record.

No gate was weakened, removed, converted to a warning, or bypassed.

## 13. Validation evidence

The validated implementation head `e74e31f390e3748bf9e5cdfd4d9ef44b518281b3` passed:

- Phase A Diff Validation run `29940437000` — success.
- Quality run `29940436821` — success.
- Exact Release Quality Validation run `29940438771` — success.

Quality gates passed:

- exact checkout/repository integrity;
- clean full chronological migration chain;
- database lint;
- database preflight plus permanent verification SQL, including AW-2A/B/C and AW-3A;
- migration ledger check;
- dependency audit;
- ESLint;
- TypeScript typecheck;
- full unit failure parity;
- integration tests;
- script and i18n tests;
- telemetry tests;
- production environment contract;
- production build;
- built release metadata verification;
- rendered browser QA;
- canonical evidence assembly and verification.

Focused AW-3A tests are registered under `npm run test:active-workout:aw3a` and are also exercised by the full unit suite.

Quality artifacts for the validated implementation head:

- `quality-reports-29940436821`: artifact `8538329026`, digest `sha256:75ab1a98be4340e95ded455b77e0d193009cbcf43157489142b4886ed8f57cd8`.
- `database-validation-e74e31f390e3748bf9e5cdfd4d9ef44b518281b3`: artifact `8538329659`, digest `sha256:e3d7c709fd45bc3492c67fef6f893dbab58e9b770fcb43cf5abfee2111e876fb`.
- `i18n-rendered-evidence-e74e31f390e3748bf9e5cdfd4d9ef44b518281b3`: artifact `8538327288`, digest `sha256:376ebba87ab081a36c9156306e50c611f3be9fea5abc2cefbab660eb852c8287`.
- `stage1-exact-release-validation-e74e31f390e3748bf9e5cdfd4d9ef44b518281b3`: artifact `8538362397`, digest `sha256:bc6060a6ac560b4a5f4fe3fddc3f5dc2657ad559fae2868f3c130bba5a48b065`.

The report commit triggers a new exact-head Phase A, Quality, and Exact Release Quality set. Those final report-containing run/artifact identities are authoritative in the final handoff.

## 14. Activity Catalog isolation

Confirmed:

- no query to `khlcctuefiuhunqymkbp`;
- no mutation to `khlcctuefiuhunqymkbp`;
- no Activity Catalog repository/API change;
- no inference from Activity Catalog taxonomy or names.

## 15. Explicit stop-boundary confirmations

- Merge performed: no.
- Deployment performed: no.
- Compatibility marker promoted: no.
- Applied AW-2A/B/C migration edited, renamed, replayed, or repaired: no.
- Applied AW-3A migration edited after Production application: no.
- Second/correction Production migration created or applied: no.
- Temporary workflow created: no.
- Temporary inspection file retained in the PR: no.
- Required CI gate weakened or skipped: no.
- AW-3B implemented: no.
- AW-3C implemented: no.
- Active Workout UI changed: no.
- Derived metrics implemented: no.

## 16. Remaining issues and next action

Remaining issues: `none`.

Exact next release action: independent Planner QA/QC of Draft PR #84 on the final exact head and its final exact-head artifacts. Do not merge until Planner approval. After a separately authorized merge, execute AW-3A Release Closure to verify merged `main`, deployment/readiness, and promote the compatibility marker from `20260722093115` to the reconciled Production target `20260722161542`. Do not begin AW-3B before that closure is independently authorized.
