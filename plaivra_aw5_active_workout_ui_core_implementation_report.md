# Plaivra AW-5 Active Workout UI Core Implementation Report

## Executive summary

AW-5 converges the plan-day and direct workout-session routes on one shared controller and one compact, responsive execution shell. The user interface prioritizes the active exercise, active set, reps, weight, progress, pause/rest state, contextual primary action, details access, and a bounded Mini Heat Map placeholder while preserving the AW-4 store, clock, reducer, command, canonical-set, autosave, and terminal-completion authorities.

The rendered-QA blocker was recovered without changing application architecture, database contracts, Supabase state, or AW-4 execution ownership. The failure was traced to a drifted Playwright correction fixture and later to mock-auth terminal readback ownership. The permanent harness now uses the canonical Train mock identities, records structured diagnostics on every failure, executes all required interaction states, and has one clear owner.

No schema, migration, RLS, grant, `SECURITY DEFINER`, Production, Activity Catalog, compatibility-marker, deployment, AW-6, or AW-7 change was made.

## Repository identity and release boundary

- Repository: `ahmedmohameda7222-ship-it/gymsands`
- Branch: `feat/active-workout-aw5-ui-core`
- Pull request: `#90`
- Base branch: `main`
- Comparison base: `2169527efc3c2cd4210fc358a58c6bce37f1788b`
- First coherent AW-5 implementation commit: `18a716e2c4f991f989c1e700245fb5ca6d98d908`
- Planner-audited recovery start head: `de649109a7111c43fd58bcb6f418767f713077f3`
- Last code-only recovery head before this report commit: `e81267f88f121eb6c8e1b0530be6321717aa4430`
- PR state during implementation and report finalization: Draft, open, unmerged

This report commit necessarily creates a new exact head. Git cannot embed a commit's own SHA inside the file whose bytes determine that SHA. The final report-head SHA and all post-report Quality, Exact Release, preflight, and review identities are therefore recorded in the immutable final PR evidence comment and executor handoff.

## Delivered architecture

### Shared session ownership

Both reachable session routes use the same AW-5 controller and shell:

- `/workouts/session/day/[dayId]`
- `/workouts/session/[id]`

The route adapters preserve source-specific start/resume behavior and pass a typed source into `ActiveWorkoutCoreSession`, which renders `ActiveWorkoutExecutionShell`.

### Preserved AW-4 authority

The implementation retains:

- `getActiveSessionStore` as the session-store owner;
- `activeSessionClock` as the clock owner;
- the AW-4 reducer and command dispatcher;
- canonical set persistence through `completeCanonicalSet`;
- terminal session completion through `store.completeSession`;
- frozen prescription and performed-log hydration;
- revision and controller identity handling;
- recoverable and hard-error classification.

There is no second reducer, session clock, write queue, execution-state emulator, or direct Active Workout table write in application runtime code.

### Task-first execution UI

The execution shell provides:

- compact close, session identity, timer, progress, Pause/Resume, and Mini Heat Map header controls;
- one dominant exercise heading;
- reps and weight editing;
- a visible canonical set path;
- validation feedback without advancing the cursor;
- one dominant mobile sticky action;
- compact desktop side actions;
- authoritative rest, paused, review, and completion states;
- structured set-details access;
- EN, DE, and AR localization with RTL-safe logical placement;
- light and dark presentation;
- keyboard-safe mobile editing.

### Canonical set and completion behavior

- Reps must be a positive whole number.
- Weight must be non-negative; zero remains valid.
- Invalid effort/detail values block persistence.
- A successful set write uses one canonical persistence path and one AW-4 transition.
- A failed canonical write does not advance the cursor.
- Confirmed persistence followed by execution synchronization failure is acknowledged and reconciled without duplicating the write.
- Rest, pause, resume, reset, presets, Add 30, Skip Rest, and natural expiry remain command/store driven.
- Completion enters the real review surface and finalizes through `store.completeSession`.

## Rendered-QA blocker recovery

### Initial blocker evidence

The earlier blocker report stopped at:

- head `e50b06bd442f6e103c440513010e9bb6c2e06344`;
- Phase A run `30251171882` — success;
- PR Quality run `30251170875` — later superseded/cancelled by a newer push.

The cancelled superseded run was not treated as a source failure.

The Planner re-audited head:

- `de649109a7111c43fd58bcb6f418767f713077f3`;
- Phase A run `30253360396` — success;
- PR Quality run `30253360401` — failure;
- failed job `ui-and-i18n`, job `89936272614`;
- failure artifact `pr-quality-ui-failure-30253360401`, artifact ID `8648155593`;
- artifact digest `sha256:b381cc5e727169e6ebd33c9080e6c777324b189b5e2bde6f9d7acf390dc2af1a`.

The exact failure evidence proved:

- global rendered QA: 126 observations, 0 failures;
- established Train base matrix: 224 observations, 0 failures;
- first correction scenario: `plan-day-set-entry-en-320x568`;
- failure: 30-second timeout waiting for `[data-aw5-execution-shell]`;
- no correction observation or correction screenshot survived because the old harness threw directly from `openSession()`.

This was a correction-harness bootstrap and diagnostics defect, not a database, build, migration, application architecture, or global rendered-QA failure.

### Dead-code ownership correction

The permanent command remains:

```text
npm run qa:train
-> scripts/run-train-layout-qa.mjs
```

The final ownership structure is:

```text
scripts/run-train-layout-qa.mjs
scripts/run-train-layout-qa-base.mjs
scripts/run-aw5-correction-layout-qa.mjs
scripts/aw5-correction-qa-shared.mjs
scripts/train-layout-qa-fixture.mjs
scripts/aw5-correction-qa-diagnostics.mjs
```

Actions completed:

- consolidated the valid correction logic under `run-aw5-correction-layout-qa.mjs`;
- deleted `run-aw5-correction-layout-qa-v2.mjs`;
- retained the broad established matrix in `run-train-layout-qa-base.mjs`;
- retained `run-train-layout-qa.mjs` as the single entrypoint;
- strengthened `train-mock-fixture-contract.test.mjs` to prove one correction owner, canonical identities, failure diagnostics, required states, cleanup, and nonzero failure exit after evidence is written.

No `v3`, `fixed`, `final`, `new`, or parallel replacement harness remains.

### Canonical fixture identity

The permanent correction harness reads `lib/fixtures/train-mock-contract.json` and uses:

- `userId`;
- `planIds.active`;
- `activeDayId`;
- `activeFirstExerciseId`;
- `activeFirstExerciseName`;
- `activeSessionId`;
- `activeExerciseLogId`.

Stable snapshot, item, and set IDs are used. The harness no longer generates a new canonical session ID per browser context. Route, session root, snapshot, item, prescription sets, performed logs, and the mock execution service converge on `activeSessionId` and `userId`.

The harness does not implement a second execution reducer and does not fake a mock-auth execution RPC that application code does not call. Mock execution continues through the real reducer owned by `services/database/workout-session-execution.ts`.

### Failure-safe diagnostics

Every scenario now logs:

```text
[AW5-QA] START <scenario>
[AW5-QA] PASS <scenario> <duration-ms>
[AW5-QA] FAIL <scenario> <classification> <reason>
```

A failure records, before context closure:

- current URL and HTTP status;
- document title;
- safely truncated body text;
- visible `h1`/`h2` text;
- loading, error, toast, execution-shell, and active-set presence;
- page errors;
- console errors and warnings;
- failed requests;
- the last 50 intercepted API/Supabase requests;
- a failure screenshot;
- a structured observation and partial JSON report.

Every context closes in `finally`; Chromium closes in a top-level `finally`; delayed canonical persistence is released or awaited before closure; independent scenarios continue safely; the process fails only after evidence is written.

### Follow-up completion readback failure

After bootstrap recovery, exact head `70513da83e6c85c69881c412c18a848b2c581a70` produced:

- Phase A success;
- all non-UI PR Quality lanes successful;
- 16 successful AW-5 correction scenarios;
- one failed scenario: `plan-day-completed-summary-en-1440x900`.

PR Quality run `30262567900`, UI job `89965702399`, produced artifact:

- name `pr-quality-ui-failure-30262567900`;
- artifact ID `8651735202`;
- digest `sha256:26fac6dcf82d7dc94f5f5e6069c097ef492a4d2f8bf66531ea650423ede89b34`.

The structured evidence showed:

- the completion RPC returned HTTP 200;
- no page error, unexpected console error, or failed request occurred;
- the review remained open because terminal root confirmation still read the canonical mock session as `started`;
- a page-level Supabase root override could not own the first read because mock auth resolves `getOpenWorkoutSessionWithStatus()` from `getMockTrainActivity()` before falling through to Supabase.

The correction stayed in the harness. Before clicking the real Save & finish action, the scenario switches the Train mock scenario from active to rest, so the open-session mock no longer returns a started root and the existing completed-root interceptor becomes the authoritative terminal readback. No selector, AW-4 store, execution service, persistence adapter, application component, or database contract was changed.

### Successful recovery gate

Code-only recovery head:

```text
e81267f88f121eb6c8e1b0530be6321717aa4430
```

Exact-head results:

- Phase A run `30266149098` — success;
- scoped PR Quality run `30266148975` — success;
- `scope` job `89977187396` — success;
- `integrity` job `89977215282` — success;
- `core` job `89977215301` — success;
- `database` job `89977215509` — success;
- `ui-and-i18n` job `89977215257` — success;
- `ci-contracts` job `89977215357` — success;
- `build` job `89977215342` — success;
- `dependency-audit` job `89977215431` — success;
- `required-summary` job `89979559686` — success.

The UI lane passed:

- global rendered QA: 126/126;
- established Train base matrix: 224/224;
- all required AW-5 correction states, including completed summary.

## Required correction scenarios

The permanent correction harness executes:

```text
plan-day-set-entry-en-320x568
plan-day-set-entry-en-390x844
direct-set-entry-en-390x844
direct-set-entry-en-1440x900
plan-day-set-entry-de-390x844
plan-day-set-entry-ar-390x844
plan-day-set-entry-dark-en-1440x900
plan-day-validation-error-en-390x844
plan-day-busy-en-390x844
plan-day-rest-en-390x844
plan-day-paused-en-390x844
plan-day-details-ar-390x844
plan-day-details-dark-en-1440x900
plan-day-session-review-en-1440x900
plan-day-completed-summary-en-1440x900
plan-day-keyboard-reps-en-390x844
plan-day-keyboard-weight-en-390x844
```

The broad Train viewport and regression matrix remains in addition to this correction subset.

## Geometry and product assertions

The rendered contracts verify:

- no close-control overlap with Mini Heat Map, title, metadata, or Pause/Resume;
- correct logical-start close placement in LTR and RTL;
- no sticky-action overlap with reps, weight, details, set path, rest presets, or validation feedback;
- usable set path and primary action at 320×568;
- no unnecessary mobile-navigation gap;
- one localized generic direct-session label and one dominant exercise heading;
- no route-level loaded PageHeading duplication;
- focused reps and weight can be scrolled above the sticky action;
- no horizontal overflow;
- no clipped translated control;
- no framework error overlay or unexpected browser diagnostic.

## Manual PNG inspection

Actual PNGs from the exact predecessor application tree were manually inspected after the structured 16-scenario run. The only subsequent source change was the terminal mock-readback line in the harness; no application-rendered component or style changed.

Inspected states included:

- 320×568 and 390×844 plan-day set entry;
- 390×844 and 1440×900 direct set entry;
- German and Arabic presentation;
- dark desktop presentation;
- validation error;
- canonical busy state;
- authoritative rest and paused states;
- Arabic and dark details drawers;
- session review;
- reps and weight keyboard viewports;
- the failed completion readback screenshot used for root-cause diagnosis.

Findings:

- header controls were separated and readable;
- the sticky action remained visible without intersecting editor content;
- the 320×568 layout remained task-usable;
- direct session hierarchy contained one dominant exercise title;
- Arabic logical placement and RTL set order were correct;
- dark surfaces retained usable contrast and hierarchy;
- validation, busy, rest, pause, details, review, and keyboard states were professionally composed;
- no material professional UI defect requiring application-code correction was found;
- no framework error overlay or development issue badge appeared in the inspected correction PNGs.

Canonical Quality for the final report head uploads the complete successful quality-reports artifact. Those exact final-head PNGs are downloaded and inspected before Exact Release; their artifact identities and any final finding are recorded in the final PR evidence comment.

## Validation summary

Passed during implementation and recovery:

- `git diff --check`;
- `node --test scripts/train-mock-fixture-contract.test.mjs`;
- `npm run test:scripts`;
- `npm run test:active-workout:aw5`;
- `npm run test:i18n`;
- lint;
- typecheck;
- unit tests;
- production environment validation;
- production build;
- chronological migration replay;
- database lint;
- database verification SQL;
- migration ledger validation;
- SQL-backed integration tests;
- dependency audit;
- global rendered QA 126/126;
- established Train rendered QA 224/224;
- permanent AW-5 correction scenario suite.

The exact final report head receives a new Phase A and scoped PR Quality run. No earlier-head result is combined with a later head.

## Database, security, privacy, and deployment impact

- No schema change.
- No migration was created, edited, applied, or replayed against Production.
- No RLS or database privilege change.
- No Supabase Production write.
- No Activity Catalog read/write operation for implementation.
- No compatibility-marker change.
- No deployment initiated by the implementation chat.
- No merge.
- No AW-6 work.
- No dependency addition.
- No global CSP rewrite.
- No expansion of the targeted lint exception.

The automated Netlify pull-request preview remains platform-generated preview infrastructure, not an implementation-initiated Production deployment.

## Review and phase-close procedure

After this report commit:

1. verify PR #90 remains Draft and mergeable;
2. obtain exact-report-head Phase A success;
3. obtain exact-report-head scoped PR Quality success;
4. audit comments, reviews, and unresolved threads;
5. mark PR #90 Ready for review only after those Draft gates pass;
6. obtain one new canonical Quality for the exact report head;
7. download and manually inspect its successful rendered evidence and full quality-reports artifact;
8. run Exact Release using that immutable Quality artifact;
9. run strict read-only release preflight;
10. record exact runs, jobs, artifact IDs, digests, expiry, review state, and boundaries in the final PR evidence comment;
11. stop without merge or deployment for independent Planner QA/QC.

## Final evidence location and self-reference rule

The exact report commit SHA cannot be embedded in this report without producing another commit and invalidating the evidence. The following are recorded in PR #90's final immutable phase-close evidence comment and executor handoff after they exist:

- exact final head and comparison base;
- final Phase A run/job;
- final scoped PR Quality run/jobs;
- canonical Quality run/job;
- canonical Quality artifact names, IDs, digests, and expiry;
- exact final rendered PNG inspection result;
- Exact Release run/job and consumed Quality artifact;
- read-only preflight run/job and artifact;
- comment, review, thread, and mergeability audit;
- confirmation of no merge, deployment, Production write, Activity Catalog write, migration, compatibility-marker promotion, or AW-6 action;
- final statement: `Ready for independent Planner QA/QC.`

Until those post-commit gates are terminal on this report head, this document does not claim they passed.
