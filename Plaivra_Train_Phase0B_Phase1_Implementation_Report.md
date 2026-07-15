# Plaivra Train Phase 0B and Phase 1 Implementation Report

## Executive summary

This branch implements the approved Plaivra Train Phase 0B provider boundary and completes the approved Phase 1 responsive Train redesign. The verified baseline contained no Phase 0B Activity Catalog provider or internal API. Phase 1 already had a hardened atomic persistence foundation and several compliant Train states, but its builder, editor, catalog surfaces, history, session presentation, OpenAI branding, localization, and responsive acceptance coverage remained incomplete.

Phase 2 was not started. No production system was modified, no migration was created or applied, and no database, RPC, MCP, ChatGPT tool, scheduled/performed-session, workout-calculation, or route-architecture contract was changed.

## Repository identity

| Field | Value |
| --- | --- |
| Base branch | `main` |
| Base SHA | `1440c78e71c1bf8fe7e7352cd28f187031adccdf` |
| Prompt-era expected SHA | `1440c78e71c1bf8fe7e7352cd28f187031adccdf` (exact match) |
| Implementation branch | `codex/train-phase0b-phase1-approved-redesign` |
| Final commit SHA | Pending final commit |
| Draft PR | Pending Draft PR creation |
| External catalog repository commit inspected | `8b71e505dbfd829d783d54f39480676a7524cb6b` |
| External OpenAPI file SHA inspected | `da01ad986bc87aed175498ec5a454ba70031509a` |

## Inspection findings

### Actual Train route map

| Route | Baseline behavior | Phase 1 role |
| --- | --- | --- |
| `/my-workout` | Redirects to `/my-workout/plans` | Compatibility alias preserved |
| `/my-workout/plans` | Canonical Train overview | My Workout overview |
| `/my-workout/plans/builder` | Three-step manual builder | Create Plan wizard |
| `/my-workout/plans/[planId]` | Read-only plan detail | Plan Details |
| `/my-workout/plans/[planId]/edit` | Canonical full-plan editor | Edit Plan |
| `/my-workout/exercises/[exerciseId]` | Plan-exercise snapshot details | Compatibility detail route preserved |
| `/my-workout/day/[dayId]` | Redirects to canonical plan editor | Compatibility alias preserved |
| `/my-workout/day/[dayId]/add-exercise` | Redirects to canonical editor and picker | Compatibility alias preserved |
| `/today-workout` | Redirects to `/my-workout/plans` in configuration and route fallback | Compatibility alias preserved |
| `/workouts` | Exercise Library | Catalog browser |
| `/workouts/[id]` | Exercise details, history, favorites, custom video, alternatives | Catalog detail |
| `/workout-history` | Combined scheduled/performed history view | Workout History |
| `/workouts/session/day/[dayId]` | Plan-day focus session | Session execution shell |
| `/workouts/session/[id]` | Direct exercise session | Direct session shell |

### Actual component and service map

- Overview: `components/workouts/my-workout-plans.tsx`
- Builder: `components/workouts/workout-plan-builder.tsx`
- Plan detail: `components/workouts/workout-plan-detail.tsx`
- Plan editor: `components/workouts/workout-plan-editor.tsx`
- Picker: `components/workouts/exercise-picker-dialog.tsx`
- Library: `components/workouts/workout-browser.tsx`
- History: `components/workouts/workout-history.tsx`
- Session execution: `components/workouts/workout-day-focus-session.tsx`, `components/workouts/workout-session-form.tsx`, and `components/workouts/workout-session-screen.tsx`
- Shell and navigation: `components/layout/app-shell.tsx`, `components/layout/mobile-floating-nav.tsx`, and `lib/navigation/mobile-nav.ts`
- Train localization: `lib/i18n/train.ts`
- Atomic plan services: `services/database/workout-plans.ts` and `services/database/workout-plan-loader.ts`
- Performed/scheduled session service: `services/database/workout-sessions.ts`
- Baseline browser catalog path: `services/database/workout-library.ts`

### Baseline catalog path

Phase 0B was absent. The client-only `services/database/workout-library.ts` directly queried `workouts`, `exercise_videos`, and `exercises`, blended successful results with local samples, returned the first sample for some missing identifiers, and added invented prescription/default metadata. The affected global-catalog consumers were the Exercise Library, exercise picker, exercise details, and direct-session loader. User-owned favorites, custom exercises, custom media, and workout history remained separate Plaivra data and were preserved.

### Current RPC and persistence authority

The following exact canonical RPC signatures were verified and intentionally left unchanged:

- `activate_workout_plan_atomic(uuid, uuid, date, timestamptz)`
- `archive_workout_plan_atomic(uuid, uuid, text, date)`
- `create_workout_plan_atomic(uuid, jsonb, boolean, date)`
- `delete_workout_plan_atomic(uuid, uuid, boolean, date)`
- `save_workout_plan_atomic(uuid, uuid, jsonb, date, timestamptz)`
- `save_workout_plan_day_atomic(uuid, uuid, jsonb, date, timestamptz, boolean)`

The baseline migrations enforce actor checks, restricted grants, hardened `SECURITY DEFINER` search paths, explicit user-local scheduling dates, and atomic rollback semantics. `user_workout_sessions` remains the schedule-instance model; `workout_sessions` and `exercise_logs` remain the performed-session/set model. This implementation did not alter that separation.

### Prompt discrepancies

- The repository has no generated Supabase `Database`/RPC type map; `types/database.ts` is a hand-maintained domain type file and Supabase clients are currently unparameterized.
- The live Activity Catalog OpenAPI returns `ActivityAlternative[]` from the alternatives endpoint, not full `TrainingActivity[]`. The live contract governed the implementation; no full activity was fabricated.
- The existing rendered QA did not cover `320x568`, exact `360x800`, or every Train route required by the prompt. A focused Train QA command and matrix were therefore required.

## Phase 0B implementation

Phase 0B was absent at baseline and was implemented as a server-mediated provider boundary:

- `lib/activity-catalog/` defines the canonical OpenAPI-aligned activity, taxonomy, filter, pagination, alternative, source, and stable-error types. Runtime parsers reject malformed required fields, invalid UUIDs/slugs/dates/enums, unsupported object properties where the OpenAPI forbids them, and responses above the bounded size.
- `services/activity-catalog/server/provider.ts` defines the provider contract. `http-provider.ts` performs bounded, no-store server-to-server requests and sends the catalog bearer key only to authenticated upstream endpoints. `legacy-provider.ts` adapts the existing global Plaivra catalog through the member-scoped Supabase client. `selector.ts` implements `legacy`, `external`, and `external_with_legacy_fallback`.
- Fallback is fail-closed. It is allowed only for an actual network rejection, bounded timeout, upstream `429`, upstream `5xx`, or an external identifier `404` that is demonstrably present in the legacy catalog. `401`, `403`, malformed local input, invalid upstream JSON, unexpected implementation exceptions, and successful empty external search results do not fall back or blend.
- Six explicit internal GET routes were added under `app/api/activity-catalog/`: sports, sport session template, filters, activity search, activity detail, and alternatives. Every route rate-limits, requires an authenticated active eligible member, allowlists and bounds local input, returns stable safe errors, and sends `private, no-store` responses. There is no catch-all proxy.
- `services/activity-catalog/client.ts` is the browser boundary. `services/database/workout-library.ts` now obtains global catalog data only through that internal API. Direct browser reads of `workouts`, `exercise_videos`, and `exercises` were removed.
- `lib/activity-catalog/adapter.ts` is the single canonical-to-legacy UI adapter. It preserves real IDs, slugs, localized names, activity type, muscles, equipment, difficulty, movement pattern, instructions, description, version, metric schema, and source metadata. It leaves sets, reps, rest, load, force type, and unavailable media unset rather than inventing them.
- Exercise Library, picker, exercise detail, direct-session loading, and alternatives now use the internal provider path. User-owned custom exercises, favorites, custom media, and workout history stay in Plaivra and were not sent to the external service.
- `.env.example`, `lib/integrations/env.ts`, and the production environment validator now define server-only mode/base/key configuration. Strict production validation pins the verified canonical `https://catalog-api.plaivra.com` origin and requires a sufficiently bounded key for external modes. No `NEXT_PUBLIC_` catalog secret exists.
- No database migration was created or applied.

## Phase 1 implementation by route

Pending final route-by-route consolidation after implementation.

## Files changed

Pending final diff table.

## Database and API boundaries

| Boundary | Impact |
| --- | --- |
| Database schema | None |
| Supabase migrations | None |
| Applied migration history | Unchanged |
| Canonical Train RPCs | Unchanged |
| MCP tools | None |
| ChatGPT tool schemas | None |
| External Activity Catalog API | Read-only consumer; no external repository change |
| Internal API | Six explicit authenticated Activity Catalog GET routes added |
| Environment contract | Server-only catalog mode, base URL, and bearer key added |
| Production configuration | Not modified |

## Validation

Pending final command table. Baseline evidence before implementation:

| Command | Exit status | Exact result | Notes |
| --- | ---: | --- | --- |
| Focused Train unit baseline | 0 | 12 files, 76 tests passed | RPC, migration, security, UI, i18n, stale-request, archived-plan, and session-priority coverage |
| Focused Train integration baseline | 0 | 1 file, 16 tests skipped | `DATABASE_URL`, `psql`, and Supabase CLI unavailable locally |
| `npm.cmd run migration:ledger:check` | 0 | 32 applied, 0 pending, 0 unresolved; release ready | No implementation migration authorized |
| Focused migration/premerge script baseline | 0 | 16 tests passed | Baseline only |

## Responsive QA matrix

Pending rendered run and artifact paths.

Required viewports retained in the focused Train harness:

- `320x568`
- `360x800`
- `390x844`
- `430x932`
- `768x1024`
- `1024x768`
- `1280x800`
- `1440x900`

## Accessibility review

Pending final keyboard, focus, dialog, picker focus-return, reorder, zoom/reflow, non-color state, reduced-motion, and RTL evidence.

## Security and privacy review

An independent security review found no critical or high-severity vulnerability. Its initial fail-closed findings were resolved: OpenAPI slug limits are enforced locally; alternatives require a proven legacy identifier before `404` fallback; unexpected implementation exceptions do not fall back; runtime URLs require HTTPS except loopback development; and strict production validation pins the canonical catalog origin. Tests now exercise real fetch rejection, actual abort timeout, malformed and duplicate parameters, safe route-level unknown-error output, and genuine-legacy alternatives gating.

The implementation never forwards Plaivra access tokens, user identity, profile fields, plans, history, notes, restrictions, goals, or private context to the external catalog. The catalog bearer key is server-only and is absent from browser bundles, route responses, logs, screenshots, committed files, and report evidence. Legacy reads use the authenticated member-scoped Supabase client and existing RLS-protected global rows; no service-role catalog access was added.

The prescribed Claude Flow security scan was attempted but could not execute because its npm path failed with `npm error Invalid Version:`. The substitute evidence is a manual trust-boundary review, focused secret scan, dependency audit, environment tests, runtime/fallback tests, and route-authentication tests. Final command results are recorded below after the complete gate.

## CI

Pending Draft PR workflow names, run IDs, links, and final conclusions.

## Risks and limitations

- Local database integration tests cannot execute without a disposable `DATABASE_URL`; hosted Quality remains the required complete database-chain proof.
- The repository rate limiter is process-local and trusts the current forwarded-IP convention. It is consistent with existing external-provider routes but is not a globally durable quota.
- Production external-provider behavior requires deployment-side server-only configuration and a real bearer key; this task does not modify deployment settings or secrets.

## Out-of-scope findings

- No Phase 2 multi-week, sport-selection, session-phase, sport-metric, or activity-editing model was added.
- No unrelated application domain was redesigned.
- Dependency/security findings unrelated to the approved Train scope are recorded only if discovered by the final security scan.

## Git state

Pending final branch, SHA, clean/dirty, untracked-file, and Draft PR state.

## Rollback and follow-up

The implementation is rollbackable by reverting the focused Phase 0B provider/API commits and the focused Phase 1 UI commits. No database rollback is required because no migration or production database change is included. Deployment environment configuration for external catalog mode remains a separately controlled operational step.
