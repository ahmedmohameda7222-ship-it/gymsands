# Plaivra AW-5 Active Workout UI Core Implementation Report

## Executive summary

AW-5 converges the plan-day and direct workout-session routes on one shared controller and one compact, responsive execution shell while preserving the AW-4 store, clock, reducer, commands, canonical-set persistence, autosave, and terminal-completion authority.

The rendered-QA blocker was recovered without modifying database contracts, Supabase Production, Activity Catalog, migrations, or compatibility state. The permanent correction harness now uses the canonical Train mock identity, has one owner, records structured evidence on every failure, and executes all required real interaction states.

A later exact-head canonical Quality passed mechanically but was rejected after manual PNG inspection because the completed summary was stacked above the still-interactive workout editor. PR #90 was returned to Draft. The owning completion bridge was corrected so the completed summary becomes a dedicated full-viewport terminal surface; the underlying editor is inert and hidden from assistive technology, focus moves to the completion surface, and a permanent source contract prevents regression.

No merge, deployment, Production write, Activity Catalog write, schema/migration change, compatibility-marker promotion, dependency addition, or AW-6 work occurred.

## Repository and release boundary

```text
Repository: ahmedmohameda7222-ship-it/gymsands
Branch: feat/active-workout-aw5-ui-core
Pull request: #90
Base: main
Comparison base: 2169527efc3c2cd4210fc358a58c6bce37f1788b
Planner-audited recovery start head: de649109a7111c43fd58bcb6f418767f713077f3
Pre-report terminal-surface correction head: d83e0a9b257c70f3d8c7b3d32af2657a398112f2
PR state while this report is committed: Draft, open, unmerged
```

This report commit necessarily creates a new exact head. Git cannot embed a commit's own SHA in the file whose bytes determine that SHA. Final report-head evidence is therefore recorded in the immutable PR phase-close comment after all exact-head gates exist.

## Delivered product architecture

### One shared controller and shell

Both reachable session routes use `ActiveWorkoutCoreSession` and `ActiveWorkoutExecutionShell`:

- `/workouts/session/day/[dayId]`
- `/workouts/session/[id]`

The route adapters preserve source-specific start/resume behavior but converge on one execution experience.

### AW-4 authority preserved

The implementation retains:

- `getActiveSessionStore`;
- `activeSessionClock`;
- the AW-4 reducer and command dispatcher;
- `completeCanonicalSet`;
- `store.completeSession`;
- frozen prescription and performed-log hydration;
- revision and controller-device semantics;
- authoritative rest, pause, resume, cursor, review, and completion transitions.

There is no second reducer, clock, execution-state store, write queue, or direct Active Workout table write in application runtime code.

### Task-first execution UI

The shared shell provides:

- compact close, session identity, timer, progress, Pause/Resume, and Mini Heat Map header;
- one dominant exercise heading;
- reps and weight editing;
- canonical set path;
- localized validation feedback;
- one dominant mobile sticky action;
- desktop side actions;
- real rest, paused, details, review, and completion states;
- EN, DE, and AR parity;
- RTL-safe logical placement;
- light and dark presentation;
- mobile keyboard-safe editing.

### Terminal completion

Completion still finalizes exclusively through `store.completeSession`.

After authoritative completion:

- the review closes;
- a full-viewport `data-aw5-completion-surface` replaces the execution experience visually;
- the underlying editor branches become `inert` and `aria-hidden`;
- focus moves to the terminal surface;
- the surface is labelled by the completed-workout heading;
- only the completed summary and its exit action remain interactive.

This is a presentation/accessibility correction only. It does not alter completion data or AW-4 authority.

## Rendered-QA blocker recovery

### Initial audited failure

The earlier blocker report recorded:

```text
Head: e50b06bd442f6e103c440513010e9bb6c2e06344
Phase A: 30251171882 — success
PR Quality: 30251170875 — later superseded/cancelled
```

The cancelled superseded run was not treated as a source failure.

Planner re-audit:

```text
Head: de649109a7111c43fd58bcb6f418767f713077f3
Phase A: 30253360396 — success
PR Quality: 30253360401 — failure
UI job: 89936272614
Failure artifact ID: 8648155593
Digest: sha256:b381cc5e727169e6ebd33c9080e6c777324b189b5e2bde6f9d7acf390dc2af1a
```

The artifact proved:

- global rendered QA: 126 observations, 0 failures;
- established Train base matrix: 224 observations, 0 failures;
- first correction scenario timed out waiting for `[data-aw5-execution-shell]`;
- the old harness threw before recording any correction observation or screenshot.

This was a correction-harness bootstrap/diagnostics defect, not a database, build, migration, global UI, or application-architecture failure.

### Dead `v2` removal and final ownership

The single command remains:

```text
npm run qa:train
-> scripts/run-train-layout-qa.mjs
```

Permanent ownership:

```text
scripts/run-train-layout-qa.mjs
scripts/run-train-layout-qa-base.mjs
scripts/run-aw5-correction-layout-qa.mjs
scripts/aw5-correction-qa-shared.mjs
scripts/train-layout-qa-fixture.mjs
scripts/aw5-correction-qa-diagnostics.mjs
```

Completed actions:

- consolidated valid correction logic into `run-aw5-correction-layout-qa.mjs`;
- deleted `run-aw5-correction-layout-qa-v2.mjs`;
- preserved the broad base matrix;
- retained one `qa:train` entrypoint;
- strengthened `train-mock-fixture-contract.test.mjs`;
- created no `v3`, `fixed`, `new`, or parallel harness.

### Canonical fixture identity

The permanent harness reads `lib/fixtures/train-mock-contract.json` and uses:

- `userId`;
- `planIds.active`;
- `activeDayId`;
- `activeFirstExerciseId`;
- `activeFirstExerciseName`;
- `activeSessionId`;
- `activeExerciseLogId`.

Stable deterministic snapshot, item, and set IDs are used. The route, session root, snapshot, item, sets, logs, cursor, and mock execution service all converge on `activeSessionId` and `userId`. The harness does not implement a second execution reducer.

### Failure-safe evidence

Each scenario logs:

```text
[AW5-QA] START <scenario>
[AW5-QA] PASS <scenario> <duration-ms>
[AW5-QA] FAIL <scenario> <classification> <reason>
```

Failure evidence includes:

- URL and response status;
- document title;
- truncated body;
- visible headings;
- loading/error/toast/shell/set-state presence;
- page errors;
- console errors and warnings;
- failed requests;
- last 50 intercepted API/Supabase requests;
- screenshot;
- structured observation;
- partial JSON report.

Each context and Chromium close in `finally`. Delayed persistence is resolved before closure. Independent scenarios continue safely. The process exits nonzero only after evidence is written.

### Completion readback correction

At head `70513da83e6c85c69881c412c18a848b2c581a70`, 16 correction scenarios passed and only `plan-day-completed-summary-en-1440x900` failed.

Evidence:

```text
PR Quality: 30262567900
UI job: 89965702399
Artifact ID: 8651735202
Digest: sha256:26fac6dcf82d7dc94f5f5e6069c097ef492a4d2f8bf66531ea650423ede89b34
```

The completion RPC succeeded, but mock-auth root confirmation still returned the canonical session as `started`. The harness correction switched the Train mock scenario before Save & finish so the existing completed-root interceptor became authoritative. No selector, AW-4 store, application component, or database contract was changed for that issue.

Recovery head `e81267f88f121eb6c8e1b0530be6321717aa4430` passed:

```text
Phase A: 30266149098
Scoped PR Quality: 30266148975
scope: 89977187396
integrity: 89977215282
core: 89977215301
database: 89977215509
ui-and-i18n: 89977215257
ci-contracts: 89977215357
build: 89977215342
dependency-audit: 89977215431
required-summary: 89979559686
```

### Rejected canonical Quality and visual correction

Report head `5fca710a3b846f5517db89272ffba4691190f70d` passed exact Draft gates and canonical Quality:

```text
Phase A: 30267189078 — success
Scoped PR Quality: 30267188888 — success
Canonical Quality: 30267970504
Canonical verify job: 89983155160 — success
```

Canonical artifacts:

```text
quality-reports-30267970504
ID: 8654019485
Digest: sha256:e540d044f711d3fbe9d3f2394ef7d4baef522137d33c97610bab3a63d0df3c7d
Expires: 2026-08-26

database-validation-5fca710a3b846f5517db89272ffba4691190f70d
ID: 8654020130
Digest: sha256:f10f69ca743a1531f56848b79fcb39445fae584c31394ff1cc3637ab6de33347
Expires: 2026-08-26

i18n-rendered-evidence-5fca710a3b846f5517db89272ffba4691190f70d
ID: 8654017509
Digest: sha256:e3c1c327737d199ac49ce5ec004edee720d1d93ee13f8d8e053c07987e263491
Expires: 2026-08-10
```

The Quality run was technically green, but manual inspection of the actual `plan-day-completed-summary-en-1440x900.png` found a material product defect: the completed summary was stacked above the still-interactive workout shell, including Pause, inputs, and Finish.

Actions:

- rejected run `30267970504` as final visual sign-off evidence;
- did not dispatch Exact Release;
- converted PR #90 back to Draft;
- traced ownership to `ActiveWorkoutReviewBridge`;
- made completion a full-viewport terminal surface;
- added focus, inert, and assistive-technology isolation;
- added a permanent source contract.

Pre-report correction head:

```text
d83e0a9b257c70f3d8c7b3d32af2657a398112f2
Phase A: 30269831363 — success
Scoped PR Quality: 30269831835 — success
scope: 89989337664
ui-and-i18n: 89989369860
core: 89989369890
ci-contracts: 89989369901
database: 89989369908
dependency-audit: 89989369911
integrity: 89989369922
build: 89989369936
required-summary: 89991880074
```

The scoped UI lane, including global 126/126, base Train 224/224, and all correction scenarios, completed in roughly ten minutes and remained comfortably below the 35-minute target.

## Required rendered scenarios

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

The broad Train base viewport/regression matrix remains in addition to this subset.

## Geometry and interaction assertions

The rendered contracts verify:

- no close overlap with Mini Heat Map, title, metadata, or Pause/Resume;
- logical-start close placement in LTR and RTL;
- no sticky overlap with reps, weight, details, set path, rest presets, or validation feedback;
- usable set path and CTA at 320×568;
- no unnecessary mobile-navigation gap;
- one generic direct-session label and one dominant exercise heading;
- no loaded route-level PageHeading duplication;
- focused reps and weight above the sticky action;
- no horizontal overflow;
- no clipped translated control;
- no framework error overlay or unexpected browser warning;
- invalid reps do not advance the cursor;
- busy uses delayed canonical persistence;
- rest and paused states come from real commands;
- review and completion use real interactions;
- completed summary is a dedicated terminal surface.

## Manual PNG inspection

Actual rendered PNGs were manually inspected for:

- mobile and desktop set entry;
- direct route mobile and desktop;
- German and Arabic;
- RTL;
- dark mode;
- validation;
- busy;
- rest;
- pause;
- details;
- review;
- keyboard reps and weight;
- completion.

Findings before the terminal correction:

- headers, sticky actions, 320×568 usability, direct hierarchy, RTL, dark contrast, validation, busy, rest, pause, details, review, and keyboard states were professionally composed;
- no framework error overlay or development issue badge appeared;
- the completion screenshot exposed the stacked-editor defect described above.

The prior canonical artifact is intentionally superseded. A new canonical Quality for the final report head is required, and its actual PNGs must be manually inspected again before Exact Release.

## Validation summary

Passed on the recovery/correction tree:

- repository integrity and `git diff --check`;
- script contracts;
- AW-5 unit/source contracts;
- AW-4 and prior Active Workout regressions;
- i18n contracts;
- lint;
- typecheck;
- full unit parity;
- integration tests;
- chronological migration replay;
- database lint and verification SQL;
- migration ledger;
- production environment contract;
- production build;
- dependency audit;
- global rendered QA 126/126;
- established Train rendered QA 224/224;
- permanent AW-5 correction scenarios.

The final report commit receives new exact-head Phase A and scoped PR Quality. Earlier-head evidence is never combined with final-head evidence.

## Database, security, privacy, and deployment impact

- No schema change.
- No migration created, edited, or applied.
- No RLS or privilege change.
- No Supabase Production write.
- No Activity Catalog write.
- No compatibility-marker change.
- No implementation-initiated deployment.
- No merge.
- No AW-6.
- No dependency addition.
- No global CSP rewrite.
- No expansion of the targeted lint exception.

The automated Netlify PR preview is platform-generated preview infrastructure, not an implementation-initiated Production deployment.

## Final phase-close procedure

After this report commit:

1. verify PR #90 remains Draft and mergeable;
2. obtain exact-head Phase A success;
3. obtain exact-head scoped PR Quality success;
4. audit comments, reviews, and unresolved threads;
5. mark PR #90 Ready only after Draft gates pass;
6. obtain one new canonical Quality for the exact final head;
7. download and manually inspect the full successful rendered artifact;
8. reject and correct any remaining material defect;
9. run Exact Release using that immutable Quality artifact;
10. run strict read-only release preflight;
11. record exact identities and boundaries in the immutable PR evidence comment;
12. stop unmerged and undeployed for independent Planner QA/QC.

## Final evidence location

Because the final report commit SHA cannot be self-embedded, the final PR evidence comment records:

- exact final head and comparison base;
- final Phase A run/job;
- final scoped PR Quality run/jobs;
- canonical Quality run/job;
- canonical artifact names, IDs, digests, and expiry;
- exact PNG inspection result;
- Exact Release run/job and consumed Quality artifact;
- read-only preflight run/job and artifact;
- comments/reviews/threads/mergeability audit;
- confirmation of no merge, deployment, Production write, Activity Catalog write, migration, compatibility promotion, or AW-6;
- final statement: `Ready for independent Planner QA/QC.`

This report does not claim those post-commit gates passed before they exist.
