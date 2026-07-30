# Plaivra Active Workout AW-6 implementation report

## 1. Executive summary

AW-6A, AW-6B, and AW-6C were implemented as one uninterrupted delivery on the shared AW-5 Active Workout core. The implementation adds one current-session Muscle Load request owner, real compact and full Heat Maps, one responsive Details surface, contextual actions, EN/DE/AR copy, RTL behavior, deterministic tests, and an eight-scenario production-server rendered-QA artifact.

The scope did not change the database, migrations, Supabase Production, Activity Catalog, compatibility marker, deployment configuration, or AW-7.

## 2. Actual starting main SHA

`ffd538c46b963c3a11cd4e311920f394811feb8e`

The branch was created after fetching and fast-forwarding local `main` to the latest remote `origin/main`.

## 3. Expected versus actual base discrepancy

There was no discrepancy. The prompt's expected base and the verified remote `main` SHA were both `ffd538c46b963c3a11cd4e311920f394811feb8e`.

## 4. Branch

`feat/active-workout-aw6-details-actions-heatmaps`

## 5. Final head SHA

The corrected implementation and successful rendered-evidence head is `a9dc153c7bfb4714c28bf582c8cc8ab4f70cf0c5`.

This report is committed afterward as the report-only closure commit. A Git commit cannot truthfully embed its own resulting SHA; the exact final PR head and its report-only exact-head checks are therefore recorded by live PR metadata and the completion handoff.

## 6. PR number, URL, Draft/Ready state

- PR: #92
- URL: <https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/92>
- State at correction-report creation: open, Draft, unmerged
- Corrected implementation-head Phase A Diff Validation: run `30570570485`, passed.
- Corrected implementation-head PR Quality: run `30570570280`, passed, including `ui-and-i18n` and `required-summary`.

## 7. One-pass confirmation for AW-6A/AW-6B/AW-6C

AW-6A, AW-6B, and AW-6C were completed in one branch and one Draft PR without an intermediate delivery, approval gate, separate report, or later-phase start.

## 8. Existing authorities preserved

- The AW-5 shared `ActiveWorkoutCoreSession` remains the plan-day/direct composition authority.
- The AW-4 active-session store, clock, serialized command dispatcher, timer, persistence adapter, canonical set completion path, rest state, and primary action remain singular.
- Existing replacement, skip, previous-set, guide/video, and AI surfaces are reused.
- No second session store, reducer, timer, command queue, persistence path, or primary action was introduced.

The bounded conditional inspection record was:

- `components/ui/dialog.tsx` to preserve the existing responsive drawer, close control, focus lifecycle, and RTL convention.
- `components/train/muscle-heat-map/muscle-body.tsx` to confirm front/back anatomical orientation and keyboard target ownership.
- `lib/i18n/active-workout-formatters.ts` to preserve existing locale formatting.
- Existing focused Heat Map and Active Workout identity tests to follow current deterministic test conventions.
- Existing AI action components to reuse their approved surface without dialog stacking.
- `scripts/run-aw5-correction-layout-qa.mjs` because exact-head CI showed its responsive trigger and rest-preset selectors needed to target the visible instance.
- `scripts/aw5-correction-qa-diagnostics.mjs` because the exact 320-pixel overlap assertion identified the obscured feedback geometry.
- `components/layout/mobile-sticky-actions.tsx` to verify the established session spacer and sticky safe-area contract before preserving it unchanged.
- `scripts/run-train-layout-qa-base.mjs` because the successful rendered scenarios were still classified as failures by a DOM-wide Details-trigger count instead of the approved visible-trigger count.

No Graphify, agents, historical implementation reports, unrelated modules, or later-phase material were used.

## 9. Controller architecture

`useActiveWorkoutMuscleLoad` owns the active-session Muscle Analysis request, cached successful value, refresh state, completeness, error state, retry, abort handling, and stale-generation protection. It accepts only `sessionId` and `refreshRevision` as request-driving inputs.

The controller projects V1 broad compatibility through the existing Muscle Intelligence compatibility code and exposes the approved ready, refreshing, empty, partial, unavailable, and error semantics.

## 10. Request ownership and refresh behavior

The shared controller is instantiated once in `ActiveWorkoutCoreSession` and passed to the header/rail mini map and Details full map. The existing standalone session panel also consumes the shared hook rather than owning a duplicate fetch implementation.

Refresh revision advances after acknowledged canonical set completion, the canonical-saved/sync-failed outcome, successful restart/reopen persistence, successful replacement, and successful skip. Initial session identity hydration also establishes the first request. Local reps, weight, RPE, RIR, type, and note draft edits do not advance the revision. Failed mutations do not advance it.

Cached successful data remains rendered while a refresh is in flight and after a refresh failure. An initial failure without cache exposes retry without blocking workout logging.

## 11. Mini Heat Map implementation

The placeholder is replaced by `ActiveWorkoutMiniHeatMap`, a compact real front/back `MuscleHeatMap` rendering without labels, legend, or state card. It remains within the small header/rail footprint, has an accessible current-session status label, exposes partial/error state through a compact status indicator, and opens Details directly at Muscle Load.

Front/back anatomy is not mirrored for RTL.

## 12. Full Heat Map implementation

The Details Muscle Load section uses the same controller value and one `MuscleHeatMap` instance. Mobile uses a front/back segmented control; practical tablet/desktop widths show both views. The implementation avoids hidden duplicate full-map renders.

Interactive targets support keyboard focus, Enter/Space activation, selection state, target name, heat level, and broad-only detail copy. Partial, unavailable, empty, updating, cached-error, and initial-error behavior use the approved state model.

## 13. Details information architecture

The single responsive Details surface is ordered:

1. Exercise overview
2. Current set
3. Muscle Load
4. Adjust today, plan-day only
5. Assistance

Only the body scrolls. The title, description, and close control remain fixed. Opening requests scroll and focus the requested section or guide/video group.

## 14. Quick-action rules

One pure action model defines the six contextual actions and a separate projection chooses mobile or desktop presentation.

- Mobile exposes Previous set, Guide/video when factual or Set details otherwise, plus More.
- Desktop exposes up to six available contextual actions in the rail.
- Busy, paused, completed-set, terminal, plan-day/direct, guide availability, and AI permission states determine visibility or disabled state.
- Pause, Finish, rest controls, and the primary CTA are not duplicated.

## 15. Plan-day behavior

Plan-day sessions retain replacement and skip actions. Adjust today explains that the saved plan remains unchanged, requires an approved reason, opens the existing replacement picker only after Details closes, and refreshes Muscle Load only after acknowledged success.

## 16. Direct-session behavior

Direct sessions use the same Active Workout core, Details, mini map, full map, current-set fields, previous-set action, factual guide/video action, and approved AI surface. Replacement, skip, and Adjust today are absent.

Rendered scenario 8 verifies that no plan-day replacement controls are present.

## 17. Replacement and picker behavior

The existing replacement picker remains the mutation surface. Details closes before the picker is opened on the following task, so the dialogs do not stack. Cancel and failure do not advance Muscle Load revision; acknowledged replacement does.

## 18. Previous-set behavior

Previous set continues to reuse the existing Active Workout previous-performance values and draft update path. It is disabled when mutation state, pause state, terminal state, or current-set completion makes application inappropriate. Applying draft values does not refresh Muscle Load.

## 19. Guide/video behavior

Guide/video appears only when the current Activity Catalog projection factually supplies instructions, a guide URL, or a video URL. Safe existing guide/video links are reused. When absent, mobile promotes Set details instead.

## 20. AI behavior

Ask Plaivra remains permission-gated and reuses the existing approved workout AI action panel and request dialog. The new `onBeforeOpen` hook closes Details before the existing AI surface opens. No new AI execution workflow, approval queue, diagnosis, or prescription behavior was added.

## 21. Mobile behavior

At 320 and 390 pixel widths, the header retains the real mini map and compact action set, the primary CTA remains visible, and Details renders as a bottom drawer with a fixed close control and independently scrolling body. There is no horizontal overflow, sticky overlap, or clipped control in the required captures.

## 22. Tablet behavior

At 768×1024, Details preserves current-set editing and renders both body views where practical. The final artifact verifies exactly two body SVG views and correct focus return.

## 23. Desktop behavior

At 1440×900, the execution column remains primary and the right rail contains the real mini map, status, one primary CTA, and contextual actions. Details is a 440-pixel side surface, anchored right in LTR and left in RTL. The desktop map exposes both body views and interactive target details without a duplicate full map.

## 24. EN/DE/AR and RTL

All new member-facing copy is present in English, German, and Arabic with matching message structure. Arabic rendered QA confirms `dir="rtl"`, correct drawer controls, and correct text flow. Anatomy preserves front/back orientation and is not CSS-mirrored.

## 25. Accessibility and focus behavior

- The mini map is a keyboard-focusable button with visible focus treatment and screen-reader status.
- Details assigns dialog title and description and keeps the close control available.
- Requested sections receive programmatic focus without adding extra tab stops to ordinary flow.
- Heat Map targets expose button semantics, labels, pressed state, keyboard activation, and live target detail updates.
- Closing Details returns focus to the initiating control; all five Details scenarios in the final artifact pass this assertion.

## 26. Loading/refreshing/empty/partial/unavailable/error states

- Loading: compact non-blocking map placeholder.
- Refreshing with cache: cached anatomy remains visible with updating status.
- Ready: current saved-set Muscle Load is rendered.
- Partial: cached/rendered anatomy remains visible with partial disclosure.
- Empty: no saved completed Muscle Load is explained without blocking logging.
- Unavailable: the API's unavailable result is explained without inventing data.
- Initial error: retry is available and logging remains usable.
- Refresh error with cache: the last successful map remains visible with an explicit retry disclosure.

## 27. Files created

- `components/workouts/active-workout/active-workout-actions.test.tsx`
- `components/workouts/active-workout/active-workout-actions.ts`
- `components/workouts/active-workout/active-workout-mini-heat-map.tsx`
- `components/workouts/active-workout/active-workout-muscle-load-controller.test.tsx`
- `components/workouts/active-workout/active-workout-muscle-load-controller.ts`
- `components/workouts/active-workout/active-workout-muscle-load-section.tsx`
- `lib/product/active-workout-aw6-details-actions-heatmaps.test.ts`
- `scripts/run-aw6-layout-qa.mjs`
- `plaivra_aw6_details_actions_heatmaps_implementation_report.md`

## 28. Files changed

- `components/ai/ai-action-request-dialog.tsx`
- `components/ai/workout-ai-action-panel.tsx`
- `components/train/muscle-heat-map/muscle-heat-map.test.tsx`
- `components/train/muscle-heat-map/muscle-heat-map.tsx`
- `components/workouts/active-workout/active-workout-core-session.identity.test.tsx`
- `components/workouts/active-workout/active-workout-core-session.tsx`
- `components/workouts/active-workout/active-workout-details-bridge.tsx`
- `components/workouts/active-workout/active-workout-execution-shell.tsx`
- `components/workouts/session-muscle-load-panel.tsx`
- `lib/product/muscle-intelligence-phase4c2.test.ts`
- `messages/ar.json`
- `messages/de.json`
- `messages/en.json`
- `package.json`
- `scripts/repository-evidence-hygiene.test.mjs`
- `scripts/run-aw5-correction-layout-qa.mjs`
- `scripts/run-train-layout-qa-base.mjs`
- `scripts/train-layout-qa-fixture.mjs`

## 29. Files deleted

None.

## 30. Tests added or changed

- Added controller tests for null identity, one request per revision, stale response rejection, cache retention, refresh failure, initial error, V1 projection, retry, and state resolution.
- Added quick-action tests for plan-day/direct, guide absence, busy state, mobile priority, and desktop projection.
- Added AW-6 product contract tests for shared ownership, section order, opening destinations, revision events, direct boundaries, translations, and focused rendered-QA metadata.
- Added exact correction contracts for both responsive Details declarations, one visible trigger per breakpoint, current-set destination/focus ownership, visible rest-preset targeting, scoped busy feedback, and the base Train runner's visible-trigger count.
- Updated core identity, Heat Map, Phase 4C2, i18n, and existing AW-5 contracts to preserve shared-core and regression boundaries.
- Advanced the repository evidence-hygiene contract to require the AW-6 report while preserving the direct AW-5 predecessor handoff.

## 31. Every validation command and factual result

- `git fetch origin --prune` and `git pull --ff-only origin main`: remote `main` verified at the expected SHA.
- `git diff --check`: passed before the implementation commit.
- `node --check scripts/run-aw6-layout-qa.mjs`: passed.
- `node --test scripts/train-mock-fixture-contract.test.mjs scripts/repository-evidence-hygiene.test.mjs`: 15/15 passed during implementation.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:active-workout:aw6`: 9 files, 56/56 tests passed.
- `npm run test:active-workout:aw5`: 4 files, 24/24 tests passed.
- `npm run test:muscle-intelligence:phase4a`: 6 files, 38/38 tests passed.
- `npm run test:muscle-intelligence:phase3`: 3 files, 20/20 tests passed.
- `npm run test:i18n`: 4 files, 29/29 tests passed.
- `npm run test:scripts`: 171/171 tests passed.
- `npm run test`: 213 files passed and 8 skipped; 1,391 tests passed and 46 skipped.
- `NEXT_PUBLIC_USE_MOCK_AUTH=false npm run build`: passed; optimized production build generated 92 pages.
- `NEXT_PUBLIC_USE_MOCK_AUTH=true NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA=true npm run build`: passed; optimized production QA build generated 92 pages.
- `npm run start -H 127.0.0.1 -p 3000`: production server became ready.
- `npm run qa:active-workout:aw6`: all 8/8 final scenarios passed.
- Final `node --test scripts/repository-evidence-hygiene.test.mjs scripts/train-mock-fixture-contract.test.mjs`: 15/15 passed after advancing the required current-phase report from AW-5 to AW-6.
- Exact-head correction focused loop, run after each correction: `git diff --check`, `npm run lint`, `npm run typecheck`, and `npm run test:active-workout:aw6`; final local result was 9 files and 57/57 tests passed.
- Corrected implementation head `a9dc153c7bfb4714c28bf582c8cc8ab4f70cf0c5`: Phase A Diff Validation run `30570570485` passed.
- Corrected implementation head `a9dc153c7bfb4714c28bf582c8cc8ab4f70cf0c5`: PR Quality run `30570570280` passed all jobs, including `core`, `build`, `database`, `ui-and-i18n`, and `required-summary`.

No gate was weakened, bypassed, converted to a warning, or claimed without a successful result.

## 32. Production build result

The required non-mock build passed with `NEXT_PUBLIC_USE_MOCK_AUTH=false`. Next.js 16.2.11 compiled successfully, completed TypeScript, and generated all 92 pages.

The separate mock-auth QA build also passed and was served with `next start`; the final artifact records production server mode and the exact build/start metadata.

## 33. Rendered-QA matrix

| Scenario | Result |
| --- | --- |
| 320×568 mobile EN, active set, real mini map, CTA | Pass |
| 390×844 mobile AR RTL, Details at Muscle Load | Pass |
| 390×844 mobile EN, partial Heat Map | Pass |
| 390×844 mobile EN, cached refresh-error disclosure | Pass |
| 768×1024 tablet, Current set and both body views | Pass |
| 1440×900 desktop light, execution/rail/actions | Pass |
| 1440×900 desktop dark, interactive target details | Pass |
| 390×844 direct session, no plan-day actions | Pass |

Every scenario reports zero horizontal overflow, zero sticky overlap, zero clipped controls, zero page errors, and no unexpected console or network failure. Every opened Details scenario reports successful focus return.

## 34. Screenshot paths/artifact name

Machine-readable artifact:

`quality-reports/active-workout-aw6/aw6-layout-qa-results.json`

Screenshots:

- `quality-reports/active-workout-aw6/01-mobile-en-active-mini-map-320x568.png`
- `quality-reports/active-workout-aw6/02-mobile-ar-rtl-muscle-load-390x844.png`
- `quality-reports/active-workout-aw6/03-mobile-en-partial-muscle-load-390x844.png`
- `quality-reports/active-workout-aw6/04-mobile-en-cached-refresh-error-390x844.png`
- `quality-reports/active-workout-aw6/05-tablet-en-current-set-768x1024.png`
- `quality-reports/active-workout-aw6/06-desktop-en-light-rail-actions-1440x900.png`
- `quality-reports/active-workout-aw6/07-desktop-en-dark-interactive-map-1440x900.png`
- `quality-reports/active-workout-aw6/08-mobile-en-direct-no-plan-actions-390x844.png`

The artifact records implementation head `717b7478165111f10e4992487581414c4b933238`. Screenshots and machine evidence are local ignored QA evidence and are intentionally not committed.

The successful exact-head GitHub artifact is:

`pr-quality-rendered-evidence-a9dc153c7bfb4714c28bf582c8cc8ab4f70cf0c5`

The required desktop correction screenshot inside that artifact is:

`train-qa-evidence/active-workout-set-details-dark-en-1440x900.png`

Its source observation is:

`active-default-success-dark-en-1440x900-workouts-session-day-10000000-0000-4000-8000-000000000011-set-details.png`

The successful Train manifest records 224 observations, 0 failures, and `passed: true`.

## 35. Manual visual findings and corrections

All eight PNGs were manually inspected after the coherent implementation:

- the 320-pixel header remains compact, the real mini anatomy is present, and the CTA is fully visible;
- Arabic uses RTL text and control placement while anatomy remains anatomically oriented;
- partial and cached-error disclosures do not replace the last successful map;
- the tablet current-set fields remain usable and the full map renders exactly two views;
- the desktop rail remains balanced and does not duplicate execution controls;
- the dark side surface shows interactive target details with one full map;
- the direct session contains no plan-day adjustment surface.

The focused correction loop hardened screenshot retry after a transient Chromium capture failure, uniquely targeted the localized close control, exercised tablet focus return at the initiating breakpoint, classified the one deliberately injected HTTP 503 as expected evidence, and used keyboard activation for the semantic SVG target. The final complete run passed without material visual defects.

The first report-hygiene check correctly rejected a new root report while its allowlist still named AW-5 as the current phase. The policy was narrowly advanced to require this exact AW-6 report and preserve only the direct AW-5 predecessor; its focused rerun passed.

The in-app Browser pre-check could not inject the deterministic route fixture and therefore reached the app's safe load-error state. The contract-required standalone Playwright production runner supplied the authoritative fixture-controlled rendered evidence.

### Exact-head desktop Details trigger correction

The original PR Quality failure was reproduced at head `4acb8606ca933d1a4fe284b65810218770bb2bc7`, run `30565749815`, job `90949842360`. The production runner timed out because `[data-active-set-details-trigger]` existed only in the mobile `lg:hidden` row and therefore had no visible desktop instance.

The correction added the canonical selector only to the desktop `set-details` quick action and preserved the existing `onQuickAction(action, event.currentTarget)` path, current-set destination, return-focus ref, single responsive Details surface, and desktop rail.

Exact-head CI then exposed previously masked runner contracts, corrected in the same bounded pass:

- `e6268ff4527877eabdc342bb490875b109fcacd7` added the desktop selector and destination coverage. PR Quality run `30566894136` showed the old AW-5 helper needed a visible selector.
- `9484e2894e7a51199d7ea0ddab1ae4b94fabd55b` targeted the visible Details trigger. PR Quality run `30567612645` then exposed a busy-feedback false positive and the missing mobile rest-preset scroll target.
- `25d2e7749388db3f77c12e6917a1a6346f35c1f9` scoped the busy assertion to `[data-aw5-feedback]`.
- `545e52e47ce56a7a8bcd2b967ebdd73f7ece80a1` restored mobile rest presets while preserving the established sticky spacer. PR Quality run `30569155038` proved the responsive preset selector also needed visible targeting.
- `86934557a1b0fcaec809146ddc7541dade33b68f` targeted the visible preset group. PR Quality run `30569843629` passed general rendered QA and all 23 AW-5 correction scenarios, but its base manifest still counted both responsive Details declarations.
- `a9dc153c7bfb4714c28bf582c8cc8ab4f70cf0c5` changed that diagnostic to count visible Details triggers. Phase A run `30570570485` and PR Quality run `30570570280` both passed.

The required desktop screenshot was manually inspected from the successful artifact. It shows the dark 1440×900 Active Workout execution view with the right-side Workout details surface open at Current set, populated RPE/RIR/type/note controls, a visible close control, and the underlying execution/rail layout preserved under the expected modal dimming. The panel remains within the viewport with no horizontal overflow.

The machine observation independently records `dialogFocused: true`, `drawerWithinViewport: true`, `drawerHorizontalOverflowPx: 0`, `focusReturned: true`, successful hydration, successful autosave flush, and no framework overlay. The final AW-5 correction manifest records all 23 scenarios clean, including `plan-day-rest-en-320x568` and `plan-day-details-dark-en-1440x900`.

## 36. Console/page/network error results

Seven scenarios recorded zero console errors, zero page errors, zero failed requests, and zero relevant failed responses.

The cached-refresh-error scenario deliberately returned one HTTP 503 from the Muscle Analysis endpoint. Chromium emitted the corresponding one expected failed-resource console message. The artifact records one relevant failed response, zero unexpected console errors, zero page errors, and zero transport-level failed requests. The cached successful map remained visible.

## 37. Database/migration confirmation

No database schema, migration, SQL, RLS, grant, function, trigger, seed, or migration ledger file changed. No migration was created, edited, applied, or replayed.

## 38. Production Supabase confirmation

Supabase Production was not queried or mutated. No Production migration, marker update, data write, or administrative operation occurred.

## 39. Activity Catalog confirmation

Activity Catalog code and data were not changed or mutated. The existing local rendered-QA fixture was extended only to provide deterministic guide/no-guide responses to the application under test.

## 40. Compatibility-marker confirmation

The compatibility marker and its update tooling were not changed or executed.

## 41. Deployment confirmation

No deployment, promotion, release preflight, Exact Release, auto-merge, merge, or production operation occurred.

## 42. Known genuine limitations

- Muscle Load is based on saved completed sets, matching the active-session API contract; unsaved drafts are intentionally not analyzed.
- V1 broad compatibility may identify a broad muscle without detailed regional mapping. The UI states this instead of inventing precision.
- PNG and JSON evidence is intentionally not committed. The final exact-head evidence is retained in the successful GitHub Actions artifact named above.

## 43. Out-of-scope findings

No out-of-scope product defect requiring a separate change was found during the bounded implementation and rendered inspection.

## 44. Working-tree status

The working tree was clean at corrected implementation/evidence commit `a9dc153c7bfb4714c28bf582c8cc8ab4f70cf0c5`. This report is the only intended report-closure change after that commit. Generated screenshots, logs, and machine evidence remain outside the repository and uncommitted.

## 45. Explicit confirmation that the PR is unmerged

PR #92 is open, Draft, and unmerged. Auto-merge is not enabled.

## 46. Explicit confirmation that AW-7 was not started

AW-7 was not inspected, designed, implemented, tested, committed, or started.
