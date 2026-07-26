# Plaivra AW-5 Active Workout UI Core Implementation Report

## Executive summary

AW-5 converges the plan-day and direct workout session routes on one shared controller and one compact, responsive execution shell. The UI now prioritizes the active set, reps, weight, contextual primary action, progress, pause/rest state, details access, and a bounded Mini Heat Map placeholder. The implementation preserves the AW-4 session store, clock, reducer, command, canonical-set, autosave, and terminal-session authorities.

No schema, migration, RLS, grant, `SECURITY DEFINER`, Production, Activity Catalog, compatibility-marker, deployment, AW-6, or AW-7 change was made.

## Branch, base, and pull request

- Actual starting `main` SHA: `2169527efc3c2cd4210fc358a58c6bce37f1788b`
- Base SHA: `2169527efc3c2cd4210fc358a58c6bce37f1788b`
- Branch: `feat/active-workout-aw5-ui-core`
- First coherent implementation commit: `18a716e2c4f991f989c1e700245fb5ca6d98d908`
- Pull request: [#90](https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/90)
- PR title: `feat(active-workout): implement AW-5 UI core`
- PR state during report finalization: Draft; the binding phase-close changes it to Ready only after this report-finalization head passes exact-head Phase A and scoped PR Quality.
- Final exact head SHA: the report-finalization commit containing this report. Its exact 40-character identity and all evidence created after it existed are recorded in PR #90's final phase-close evidence comment and the final executor handoff. A Git commit cannot literally contain its own SHA because the file contents determine that SHA.

PR #89 was verified closed and unmerged. Its stale remote branch was deleted; no stale local branch existed. `origin/main` was fetched and the AW-5 branch was created fresh from the base SHA above.

## Inspection record

### Must-read files inspected

- The complete binding AW-5 Markdown prompt.
- `AGENTS.md`.
- Both existing session-route implementations.
- AW-4 store public contracts, persistence adapter, shared clock, reducer transition, command ID, frozen prescription projection, set details/autosave contracts, Active Workout translation helper and locale objects, the named UI primitives, focused i18n/store tests, and package scripts.

### Search-only files inspected

- `scripts/run-train-layout-qa.mjs` only around the named Active Workout route, selector, input, keyboard, overflow, and rendered-evidence contracts.
- PR Quality, canonical Quality, and Exact Release workflows only around draft/ready behavior, head identity, artifacts, dispatch inputs, `comparison_base`, and `quality_run_id`.
- Targeted references to the two route components, AW-4 authorities, and preserved stable selectors.

### Conditional files opened and why

- `components/ui/button.tsx` and `components/ui/input.tsx`: confirm established control sizing and focus behavior.
- `app/globals.css`: confirm existing radius/color/focus token inventory without changing global tokens.
- `types/database-legacy.ts`: confirm the direct workout source shape needed by the shared controller.
- Existing source-contract tests that failed after the approved controller extraction: relocate their assertions to the shared controller/shell without weakening behavior.
- `services/database/workout-session-timeline.ts`: confirm the existing plan-day skip service contract used through `store.skipExercise`.
- `scripts/run-integration-tests.mjs`: diagnose the local Windows integration-runner boundary.
- `scripts/repository-evidence-hygiene.test.mjs`: add one exact-path exception because the binding prompt requires the AW-5 report to be committed; the broad report/evidence ban remains intact.

Unrelated modules, old AW prompts, historical reports, PR #89 code/diff, broad Graphify output, AW-6 through AW-10 implementation plans, Activity Catalog internals, and Heat Map calculation internals were not broadly read.

## Requirements matrix

| Requirement | Delivered evidence |
|---|---|
| One shared shell/controller | Both route wrappers pass a typed source to `ActiveWorkoutCoreSession`; it renders `ActiveWorkoutExecutionShell`. |
| AW-4 authority preserved | Controller uses `getActiveSessionStore`, `activeSessionClock`, `planSessionAfterSetCompletion`, `completeCanonicalSet`, and `store.completeSession`. |
| Compact task-first hierarchy | Compact header, active exercise/set editor, thin progress, set path, bounded side rail, and one sticky mobile primary action. |
| Plan-day behavior | Frozen prescription hydration, progression context, alternatives, replacement, skip, AI actions, and session review remain reachable. |
| Direct-session convergence | Direct start/resume uses the owner-validated direct service, then the same store/controller/shell; terminal completion navigates to workout history. |
| Canonical set completion | Input/effort validation precedes one canonical write and one AW-4 transition command; returned state drives rest/cursor. |
| Partial-failure safety | Pre-save failure restores values/cursor/rest; confirmed-save/sync failure acknowledges the log and forces authoritative hydration. |
| Pause/rest | Pause, resume, reset, rest presets, add 30, skip rest, and natural expiry use command/store authority. |
| Details/autosave | RPE, RIR, type, note, provenance, side/tempo fields, persisted hydration, close flush, and focus return remain preserved. |
| Preserved secondary paths | Guide, video, previous set, reopen, replacement, saved alternatives, Ask ChatGPT, workout AI, and review/finish remain reachable. |
| Mini Heat Map boundary | A labelled compact slot under approximately 72px uses a neutral body placeholder and no fake intensity data or second renderer. |
| Localization/RTL | EN/DE/AR message parity, localized progress, formatter-based numbers, bidi isolation, and Arabic RTL rendered evidence. |
| Accessibility | Explicit labels, error associations, `aria-current`, non-color completed state, 44px+ targets, focus-visible rings, responsive drawer focus return, reduced-motion-safe transitions. |
| Responsive QA | Required critical viewports are included in the executable overflow matrix; sticky/nav and drawer containment are asserted. |

## Routes changed

- `/workouts/session/day/[dayId]`
- `/workouts/session/[id]`

The route pages were not rearchitected. Their existing components became thin typed adapters into the shared AW-5 controller.

## Architecture delivered

### Components created

- `components/workouts/active-workout/active-workout-core-session.tsx`: shared runtime/controller integration.
- `components/workouts/active-workout/active-workout-execution-shell.tsx`: presentational task-first shell.
- `components/workouts/active-workout/active-workout-ui-model.ts`: pure progress, numeric validation, set-path, and incomplete-cursor projection.
- Focused model and source-contract tests.

### Components modified

- `workout-day-focus-session.tsx`: plan-day adapter.
- `workout-session-form.tsx`: direct-workout adapter.
- Active Workout message/surface/store and legacy source-location contracts.
- Rendered Train QA matrix and stable AW-5 selectors.

### Files deleted

None. The former duplicated component bodies were replaced in place by route adapters only after targeted reference tests proved their public component names remained reachable.

## Runtime behavior

### AW-4 authority preservation

There is no second store, clock interval, reducer, write queue, or direct Active Workout table write. Cursor selection remains prescription-item/set based. A stale `set_entry` cursor that points at an already persisted completed set is projected to the next incomplete canonical set; the existing cursor effect then reconciles through the official command authority and rolls back on failure.

### Canonical set completion and reconciliation

- Reps must be a positive whole number.
- Weight must be non-negative; zero is valid.
- Invalid RPE/RIR opens or retains the details path and blocks persistence.
- Successful completion calls `store.completeCanonicalSet` with canonical logs and one reducer-planned transition.
- Failed canonical persistence does not advance UI state.
- A confirmed canonical save followed by execution synchronization failure acknowledges the saved log, keeps truthful failure feedback, and forces store hydration without duplicating the write.

### Rest, pause, resume, and timer behavior

Pause/resume dispatches the official commands. While paused, the primary action becomes Resume and completion is disabled. Rest countdown derives from the authoritative execution state and shared clock. Rest presets, add 30 seconds, skip, natural expiry, and timer reset reuse existing commands; the revision/deadline key prevents duplicate expiry dispatch.

### Direct and plan-day behavior

Direct sessions use the owner-validated `getOrStartWorkoutSession` candidate and the same frozen prescription/store path as plan-day sessions. Direct final completion sends only valid pending logs so already persisted sets are not duplicated, then preserves history navigation. Plan-day-only progression targets, alternatives, replacement, and skip behavior remain bounded to the plan-day source.

### Advanced details and preserved secondary behavior

The responsive details drawer preserves persisted structured detail hydration and close-flush autosave. Existing provenance converts edited backfill data to manual/Plaivra while retaining the established editable source version and untouched side/tempo/adherence values. Guide/video, previous set, reopen, saved alternatives, replacement, Ask ChatGPT, workout AI, and review/finish remain reachable as secondary actions.

## Localization, bidi, accessibility, and responsive behavior

One new `ActiveWorkout.header.completedSetsProgress` message was added in EN, DE, and AR with shape parity. Visible counts and measurements use Active Workout formatters. Dynamic exercise/replacement names remain bidi isolated. Set-step state labels are localized rather than exposing enum values.

The shell keeps focus rings, labels, error associations, `aria-busy`, progressbar semantics, non-color completed-set checkmarks with screen-reader text, and 44px+ controls. The established responsive drawer handles containment, Escape, and focus return. The established mobile sticky layer is reused above the mobile navigation stack.

## Frontend skill usage and design-system inventory

The existing-product redesign flow from the frontend app builder was used with the prompt’s accepted design contract; no concept approval or Image Generation step was introduced. React best-practice review was applied after the shared-controller extraction, and rendered frontend testing/debugging was used for the local validation loop.

Existing Plaivra inventory used:

- semantic `background`, `card`, `muted`, `primary`, `border`, `ring`, success, warning, and destructive tokens;
- existing radius variables and soft border/shadow language;
- current Button/Input focus and size contracts;
- Lucide outline icons;
- established responsive Dialog drawer and MobileStickyActions;
- existing localization formatters and RTL direction;
- existing app/session layout boundaries.

No new global token system, theme, raster asset, or body renderer was added.

## Visual fidelity ledger

- Removed the oversized carousel, numeric percentage treatment, large primary muscle panel, repeated nested set cards, duplicate status/timer blocks, and competing primary actions.
- Preserved one dominant mobile action and a compact desktop side rail.
- Corrected the first rendered resume state from persisted completed set 1 to active incomplete set 2 while preserving explicit completed-set editing/reopen.
- Corrected blank-value validation so the disabled action has a concise localized hint without falsely labelling a zero-weight input invalid.
- Kept the Mini Heat Map placeholder compact and neutral.
- Kept long names, Arabic RTL, dark themes, drawer containment, keyboard viewport, sticky/nav separation, and required overflow viewports executable in QA.

## Rendered QA matrix

Local Playwright evidence was generated outside the repository and was not committed.

- `qa:rendered`: 126 observations, 0 failures, zoom overflow 0px.
- `qa:train`: 224 observations, 0 failures.
- Locales/themes: EN light, DE light, AR light RTL, EN dark, and AR/dark where supported by the existing matrix.
- Critical viewports: 320×568, 360×780, 390×844, 393×852, 430×932, 768×1024, 1024×768, 1280×800, and 1440×900.
- Details evidence verifies hydration, invalid/valid RPE/RIR, type traversal, 4000-code-point note limit, drawer containment, autosave provenance, and focus return.
- Browser/IAB method: the in-app Browser runtime was attempted first but failed during bootstrap with `failed to write kernel assets: The system cannot find the path specified`. The binding prompt explicitly permits Playwright fallback, so the repository Playwright matrices were used.
- Screenshot/evidence locations (local temporary only):
  - `%TEMP%\plaivra-aw5-train-qa-rerun`
  - `%TEMP%\plaivra-aw5-rendered-qa-final`

## Database, API, security, and privacy impact

- No schema change.
- No migration.
- No RLS change.
- No grant/revoke change.
- No `SECURITY DEFINER` change.
- No Production write.
- No Activity Catalog write.
- No compatibility marker write.
- No API route or MCP tool change.

Authentication, owner validation, canonical domain services, destructive terminal confirmation, set-detail provenance, and truthful failure states remain unchanged or explicitly preserved.

## Commands run and conclusions

Passed on the implementation tree:

- `git diff --check`
- `npm ci` (completed; npm reported nine pre-existing high-severity audit findings and no dependency change was made)
- `npm run test:active-workout:aw5`
- `npm run test:active-workout:aw4` (database-only tests skip without an explicit database in the direct Vitest invocation)
- `npm run test:active-workout:aw3b`
- `npm run test:i18n`
- `npm run test:scripts` (163/163)
- `npm run lint`
- `npm run typecheck`
- `npm run migration:ledger:check` (75 migrations; applied 63; pending/untracked/unresolved 0; reconciled and release-ready)
- `npm run test:unit` (209 files; 1361 tests)
- Direct non-database integration configuration (4 files passed, 8 database suites skipped; 26 passed, 46 skipped)
- `npm run build`
- `npm run qa:train` (224/224)
- `npm run qa:rendered` (126/126)

Local integration limitations:

- The canonical `npm run test:integration` wrapper reached the disposable Docker PostgreSQL path but Windows Node returned `spawnSync npx.cmd EINVAL`.
- A direct disposable-container fallback then proved the machine has no host `psql` executable, so SQL-backed suites could not run locally.
- No Production or remote database was used as a substitute. Canonical Linux CI database/integration evidence is required before completion.

## CI and phase-close evidence

The final report commit necessarily creates a new exact head. Therefore, evidence that does not exist until after this file is committed is recorded in PR #90's final phase-close evidence comment and the final executor handoff, rather than editing this report again and invalidating the evidence with another head.

Pre-finalization exact-head gate used to authorize this report commit:

- Head: `d6047e7b28a9297c42d64343586261880dea7d18`
- Phase A: run `30224192499`; `verify-diff` job `89851638923` passed.
- Scoped PR Quality: run `30224192491`; `scope` job `89851674472`, `integrity` job `89851690190`, `database` job `89851690191`, `ui-and-i18n` job `89851690194`, `ci-contracts` job `89851690197`, `build` job `89851690203`, `dependency-audit` job `89851690206`, `core` job `89851690210`, and `required-summary` job `89852654871` passed.
- The database job passed chronological migration replay, database lint, verification SQL, migration ledger, and SQL-backed integration tests on Linux.
- The UI job passed message contracts and the full rendered Train QA matrix on Linux.

Binding final-head evidence location:

- Final exact-head Phase A run ID/job: PR #90 final phase-close evidence comment.
- Final exact-head scoped PR Quality run ID/jobs: PR #90 final phase-close evidence comment.
- Canonical Quality run ID/jobs and artifact names, IDs, digests, expiry: PR #90 final phase-close evidence comment.
- Exact Release run ID/job and immutable artifact verification: PR #90 final phase-close evidence comment.
- Read-only release preflight: Exact Release summary and PR #90 final phase-close evidence comment.
- Reviews, review threads, and comments: verified again immediately before Ready transition and recorded in PR #90's final phase-close evidence comment.

No workflow is reported here as final-head passed before GitHub confirms it. Earlier-head evidence is not combined with final-head evidence.

## Known risks, limitations, and out-of-scope findings

- SQL-backed integration proof depends on CI because of the documented local Windows `npx.cmd`/host-`psql` limitation.
- The Mini Heat Map is intentionally a labelled placeholder; functional content belongs to AW-6.
- Final redesign of guide/video/history/replacement/AI/review surfaces belongs to AW-6/AW-7.
- Next development tooling overlays can appear in local screenshots; the QA contract separately verifies no framework error overlay.
- No AW-6, offline-queue, multi-device-conflict UX, history redesign, or global navigation redesign was started.

## Git and release boundary

The implementation and required report commits are pushed to PR #90. The PR is not merged, deployed, or promoted. Production, Activity Catalog, and compatibility-marker state were not mutated. AW-6 was not started.

Git status at report finalization: clean after committing and pushing this report-finalization change; the exact final status is reverified in the executor handoff.

Ready for independent Planner QA/QC.
