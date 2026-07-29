# Active Work Overlay — PR #90 / AW-5 UI Core

> Generated: `2026-07-29T15:37:00+02:00`  
> Repository: `ahmedmohameda7222-ship-it/gymsands`  
> Canonical base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`  
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`  
> Freshness: verify the manifest and Git diff before relying on this snapshot. Exact source, migrations, tests, and workflows remain executable truth.

## Identity

- PR: `#90`
- Branch: `feat/active-workout-aw5-ui-core`
- Base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`
- Audited head: `e4cfca2f909912fa3041cebaf5689944dc655339`
- State at snapshot: open, Ready for review, unmerged, mergeable
- Diff size: 47 commits, 42 files, +7,324 / -3,899

This file is non-canonical. Revalidate the exact head before any AW-5 task.

## Intended scope

AW-5 introduces the Active Workout UI Core over merged AW-4 authority:

- plan-day and direct-session compatibility;
- execution shell and runtime/UI models;
- mobile/desktop responsive behavior;
- rest, pause, timer, set entry and quick actions;
- details bridge;
- review/completion bridge;
- EN/DE/AR and RTL surface contracts;
- rendered Train QA fixtures/scripts.

It must not replace the AW-4 engine, store, clock, durable execution state, canonical set writer or frozen prescription authority.

## Main changed entry points

- `app/(private)/workouts/session/[id]/page.tsx`
- `components/workouts/active-workout/active-workout-core-session.tsx`
- `components/workouts/active-workout/active-workout-execution-shell.tsx`
- `components/workouts/active-workout/active-workout-runtime-model.ts`
- `components/workouts/active-workout/active-workout-ui-model.ts`
- `components/workouts/active-workout/active-workout-source-compatibility.ts`
- `components/workouts/active-workout/active-workout-details-bridge.tsx`
- `components/workouts/active-workout/active-workout-review-bridge.tsx`
- `components/layout/mobile-sticky-actions.tsx`
- `lib/i18n/active-workout.ts`
- `messages/en.json`, `messages/de.json`, `messages/ar.json`
- AW-5 rendered-QA scripts and fixtures.

## Current-head evidence recorded by Planner audit

Successful exact-head runs were observed for:

- Phase A: `30271289861`
- scoped PR Quality: `30271289836`
- canonical Quality: `30272234811`

Canonical Quality artifact:

- artifact ID `8655784721`
- size `40,162,418` bytes
- digest `sha256:0234e7a5efa41803382edae805769415360a56a6fde2b69479b712161b02e1aa`

There was no accepted current-head Exact Release, strict read-only preflight or current-head final phase-close comment at the audit point.

Passing automation did not eliminate the confirmed defects below.

## Confirmed correction register

### P2 — mobile sticky overlap

At 320×568 and contracted keyboard viewports, rest-preset controls overlap the fixed sticky CTA. Recorded geometry showed approximately 17.55 px overlap at 320×568 and approximately 26.55 px in keyboard scenarios.

### P2 — QA false negative

Rendered-QA geometry collected rest-preset boxes but enabled the overlap assertion only for selected options. Initial 320 and keyboard scenarios reported no failure despite recorded overlap.

### P2 — final screenshots were development-mode evidence

The canonical Quality build used production settings, but the rendered screenshots were generated from `npm run dev`, not the validated release build served by `next start`.

### P1 — ignored returned rejection path

The UI command dispatcher attaches handling to one promise chain but returns a second rejecting chain. Several callers discard it with `void`, risking an unhandled rejection even after rollback/reporting.

### P1 — Unicode exercise identity normalization

ASCII-only normalization removes Arabic/non-Latin letters and can collapse distinct names to the same empty/incorrect key. Existing coverage was ASCII-only.

### P2 — partial exercise completion summary

Summary logic counts an exercise complete when any set has `completedAt`; multi-set exercises completed only partially can be overcounted.

### P2 — incoherent completion fixture

The completion RPC fixture returns a completed copy without mutating the authoritative fixture root. The scenario uses page/local-storage overrides instead of proving coherent readback.

### P2 — duplicate mobile Add 30 action

The mobile rest surface exposes both in-flow and sticky `Add 30 sec` actions. One visible action per viewport is required.

### P2 — mobile terminal/review evidence gap

Completion/review evidence is desktop-only. Mobile 390/320 behavior, focus movement, tab containment, background inertness/`aria-hidden`, and hidden sticky controls require browser coverage.

### P1 — direct completion behavior gap

The direct-session completion path lacks executable success/failure behavior coverage, including redirect only after success, once-only completion and no premature cache/timer cleanup.

### P3 — React ref rule suppression

`react-hooks/refs` is disabled for the large controller while refs are written during render. Replace with a React-safe current-value helper and remove the scoped suppression; do not perform a broad refactor only for file size.

### P3 — source-string-heavy tests

The AW-5 contract test relies substantially on reading source and matching strings. Retain useful static contracts but add executable behavior tests for runtime defects.

## Fixed behavior to preserve

- duplicate heading correction;
- close/heat-map overlap correction;
- timer namespace separation;
- desktop completion surface no longer stacked over the editor;
- AW-4/database/Activity Catalog boundaries remain unchanged.

## Correction boundary

A future AW-5 correction must stay on the same branch/PR unless the Planner explicitly changes the plan. It must not:

- add migrations or mutate Supabase;
- modify Activity Catalog;
- replace AW-4 ownership;
- start AW-6/AW-7;
- merge or deploy;
- promote the compatibility marker.

After correction, refresh this overlay to the new exact head and evidence. After accepted merge, move only accepted facts into canonical context and remove this overlay.
