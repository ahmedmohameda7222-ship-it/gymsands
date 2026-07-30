# Plaivra AW-7 Minimize, Review, and Completion Implementation Report

## 1. Executive summary

AW-7A, AW-7B, and AW-7C were completed as one uninterrupted implementation pass. The global Active Workout controller is now a compact minimized bar, Finish enters a persisted full review, completion is terminal-proofed and recoverable, and plan-day/direct sessions share one terminal summary with final saved-set Muscle Load. A later independent Planner audit identified and corrected one minimized-rest context defect before merge readiness.

## 2. Actual base SHA

`f1432433b6cec0d0565282157e9de07eab6ed3e0`

## 3. Base discrepancy

None. The fetched remote `main` matched the prompt's expected base exactly.

## 4. Branch

`feat/active-workout-aw7-minimize-review-completion`

## 5. Final head SHA

Planner-corrected implementation and exact remote evidence head: `1a523d6ab1c11ef3655c78ad3c4320e9a89b8abd`.

The required report commits are documentation-only descendants and cannot self-reference their own Git object IDs. The current PR head after the final evidence closure is `5cd6cb705f382514db471409da15511d3b3710c2`; no runtime, test, QA-harness, or visual behavior changes follow the validated implementation head above.

## 6. PR number/URL/Draft state

Draft PR [#93](https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/93), open and unmerged.

## 7. One-pass AW-7A/B/C confirmation

AW-7A minimized controller/navigation, AW-7B authoritative review/correction, and AW-7C completion/recovery/terminal summary were implemented continuously on this one branch and PR. No later product phase was started. The Planner correction remained on the same branch and PR.

## 8. Authorities preserved

The AW-4 Active Session store, serialized command dispatcher, session engine reducer, canonical set writer, session clock, and terminal store guard remain singular authorities. AW-7 adds projections and coordination only; it adds no second store, timer, reducer, write queue, or terminalization path.

## 9. Minimized controller architecture

`ActiveWorkoutIndicator` remains the global owner. It hydrates the owner-scoped open session into the existing Active Session store, subscribes to authoritative snapshots, reads the existing session clock, and renders the presentational `ActiveWorkoutMinimizedBar`. The compatibility cache remains a mirror, not authority. The minimized progress projection is a pure tested helper owned by the minimized-bar module.

## 10. Minimized bar states

The compact bar projects active set progress, rest countdown/next context, paused state, persisted review readiness, and a recoverable load error. Whole-surface navigation resumes the exact session route. Pause/Resume is the only normal mutation. Finish and Cancel are absent.

During rest, the displayed next exercise and set now come directly from the authoritative execution cursor, which the session engine has already advanced to the true next target. It no longer searches for a prescription item after that cursor. Progress and review ratios exclude explicitly skipped prescription items and matching skipped-item logs.

## 11. Mobile/desktop overlay integration

The AppShell retains one measured controller-height reservation. Mobile/tablet place the bar above the existing floating navigation and safe-area offset. Desktop places a bounded 26rem bar at bottom-right (bottom-left in RTL) without obscuring primary content.

## 12. Minimize and autosave behavior

The session close control now minimizes. The core closes Details/replacement surfaces, requests the existing autosave coordinator flush, mirrors the authoritative execution snapshot, and permits navigation only after success. A failed flush leaves the member in-session with localized recoverable feedback. Duplicate minimize attempts are guarded.

## 13. Browser-back/fallback navigation

Session routes install a history sentinel so browser Back invokes the same minimize path. The per-user tab-scoped previous non-session route is validated before use. Direct sessions fall back to `/workouts`; plan-day sessions fall back to `/my-workout/plans`. Reduced-motion users receive an effectively immediate transition.

## 14. Active-session conflict behavior

Bootstrap checks owner-validated open-session authority before starting the requested source. A conflicting open session produces a dedicated surface with Resume, Back, and confirmed Cancel-and-start. The requested session is not launched until existing store cancellation succeeds and terminal cancellation is confirmed.

## 15. Review-state persistence

Finish first flushes pending canonical data and then awaits an authoritative `move_cursor` command to `view_state=session_review`, which sets `session_state=review`. Review becomes visible only after the persisted command succeeds. The minimized controller projects review from that same state.

## 16. Review information architecture

Review is a fixed full-session surface, not a narrow modal. It has a dedicated header/progress, exact incomplete warning, expandable exercise cards, set breakdown, workout note, factual summary rail, recovery state, and sticky Continue/Finish actions. Desktop uses a two-column layout; mobile/tablet remain one scroll owner.

## 17. Exercise/set summary rules

Review distinguishes completed, partial, incomplete, explicitly skipped, and factually replaced exercises. Not-started work is incomplete, not skipped. Skipped exercises are excluded from incomplete-set totals. Set rows expose reps, weight, RPE, RIR, set type, note presence, and pending/persisted state.

## 18. Jump/reopen behavior

Jump moves the authoritative cursor to an incomplete set and focuses the reps editor. Reopen uses the existing canonical restart path before moving the cursor. Continue selects the first incomplete non-skipped set. No parallel correction mechanism was added.

## 19. Partial-completion behavior

If incomplete sets remain, the first Finish action opens an additional confirmation with exact exercise/set/skip counts. Focus moves to “Finish anyway.” Continue returns to review. Completion remains single-flight through both local busy state and the store terminalization guard.

## 20. Completion terminalization

Completion flushes pending writes, delegates to `store.completeSession`, and accepts success only when the canonical root is terminal and execution state is absent. Terminal UI is never shown from request success alone.

## 21. Completion recovery

Any ambiguous failure force-hydrates the store. A terminal root completes locally from the verified projection. A still-started root restores persisted review and a Retry action. Hydration uncertainty keeps cache/state intact and presents reconnect/retry feedback without exposing the editor automatically.

## 22. Cache/timer cleanup

Compatibility cache, legacy workout timer, and rest timer are cleared only inside verified terminal finalization. Still-active and unverified recovery paths retain them.

## 23. Final completion surface

The existing AW-5 completion surface was extended rather than duplicated. It shows day/workout identity, duration, completed/planned sets, completed/partial/skipped/replaced counts, verified PRs, note, factual changes, saved-history disclosure, and Back to Today/Back to Workouts actions. Direct sessions do not auto-redirect.

## 24. Final Muscle Load

The shared controller accepts `mode=completed` after verified terminalization and issues one final factual request through the existing endpoint. The UI explicitly says “Saved sets only,” retains empty/partial/unavailable/error behavior, and does not block completion.

## 25. Plan-day behavior

Plan-day sessions preserve frozen prescription identity, replacements/skips, canonical final logs, route identity, and `/my-workout/plans` fallback. Review reports original/current replacement names only when source identity proves the change.

## 26. Direct behavior

Direct sessions use the same minimize, review, recovery, completion, and terminal surface. They retain `/workouts` fallback, omit plan-only replacement/skip behavior, and no longer redirect automatically to Workout History.

## 27. EN/DE/AR and RTL

All new member-facing minimized, navigation, conflict, review, recovery, and completion copy is present in EN/DE/AR. Arabic rendered RTL was inspected. Bidi isolation remains around member/content names. Two English separator encoding defects found during inspection were corrected.

## 28. Accessibility/focus/reduced motion

The minimize control has a localized accessible name; review cards expose expansion state; warnings and progress are labelled; partial confirmation focuses the explicit confirmation; Jump focuses the editor; terminal completion moves focus into one `main`, makes siblings inert/hidden, contains Tab, and removes the mutable editor. Motion respects reduced-motion preference.

## 29. Files created/changed/deleted

Created:

- `components/workouts/active-workout-minimized-bar.tsx`
- `components/workouts/active-workout/active-workout-conflict.tsx`
- `components/workouts/active-workout/active-workout-session-navigation.tsx`
- `components/workouts/active-workout-minimized-bar.test.tsx`
- `lib/product/active-workout-aw7-minimize-review-completion.test.ts`
- `scripts/run-aw7-layout-qa.mjs`

Changed:

- both session route pages, AppShell, global indicator, WorkoutSessionScreen
- Active Workout core, runtime model, review bridge, Muscle Load controller
- minimized-bar projection and focused regression tests
- core/runtime identity tests, compatibility cache tests, Train source-contract tests
- the AW-3B integration source contract and Train rendered-overlap probe
- active-workout i18n contracts and EN/DE/AR messages
- `package.json` and the shared rendered-QA fixture

Deleted:

- `plaivra_aw5_active_workout_ui_core_implementation_report.md` — rotated out by the repository evidence-hygiene rule because AW-7 is now current and AW-6 is the direct predecessor.

## 30. Tests created/changed

Added minimized-bar rendering tests and an AW-7 lifecycle/source contract. Extended runtime semantics for incomplete/skip/replacement facts, compatibility route storage, core terminal behavior, Muscle Load completed mode, i18n surfaces, and legacy Train contracts. Added `test:active-workout:aw7` and `qa:active-workout:aw7`.

The Planner correction added focused coverage proving that skipped prescription items and their logs are excluded from minimized progress, while canonical logs remain compatible when no item is skipped. A source contract prevents the rest projection from reintroducing a later `nextItem` search and requires the authoritative active item/set cursor.

## 31. Validation commands and factual results

Original implementation validation:

- `git diff --check` — passed.
- `npm run lint -- --quiet` — passed.
- `npm run typecheck` — passed.
- `npm run test:active-workout:aw7` — 11 files, 70 tests passed before the Planner correction.
- `npm run test:active-workout:aw6` — 9 files, 57 tests passed.
- `npm run test:unit` — 215 files, 1,398 tests passed before the Planner correction.
- `npm run test:scripts` — 171 tests passed.
- `npm run test:active-workout:aw3b` — 60 tests passed across its unit and source-integration phases.
- Focused corrected Train contracts — 2 files, 19 tests passed.
- `npm run qa:train` — 224 base observations and 23 AW-5 compatibility scenarios passed.

Planner-corrected exact-head validation on `1a523d6ab1c11ef3655c78ad3c4320e9a89b8abd`:

- Phase A Diff Validation run `30581021594` — passed.
- PR Quality run `30581021493` — passed.
- scope, integrity, core, database, UI/i18n, CI contracts, build, dependency audit, and required summary — passed.
- lint — passed.
- typecheck — passed.
- full unit job, including the new minimized progress and rest-context contracts — passed.
- production build — passed.
- Rendered UI QA — passed.
- database integration job — passed.

Final docs-only exact-head validation on `1fb16db421e613e577979d90a93ab214dc456077`:

- Phase A Diff Validation run `30581769829` — passed.
- PR Quality run `30581769801` — passed.
- every required job, including required summary and Rendered UI QA — passed.

Current final report head `5cd6cb705f382514db471409da15511d3b3710c2`:

- Phase A Diff Validation run `30582397175` — passed.
- PR Quality run `30582397154` — running at the time this self-contained report closure was committed; final immutable result belongs in the PR evidence comment because this file cannot self-reference a future workflow result without creating another head.

## 32. Production build result

The required `NEXT_PUBLIC_USE_MOCK_AUTH=false npm run build` passed during original implementation validation. Both the Planner-corrected implementation head and final docs-only head PR Quality production builds passed. Explicit QA-only production builds use `NEXT_PUBLIC_USE_MOCK_AUTH=true` and `NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA=true`; these do not enable mock auth in an ordinary Production build.

## 33. Rendered-QA matrix

The original ten production-server AW-7 scenarios passed:

1. Mobile EN 390x844 — minimized active bar above mobile nav.
2. Mobile EN 390x844 — minimized rest countdown.
3. Mobile AR 390x844 — paused observed, then persisted review bar captured in RTL.
4. Mobile EN 320x568 — full review, incomplete sets, sticky actions.
5. Tablet EN 768x1024 — set breakdown and Jump focus.
6. Desktop EN 1440x900 — compact bottom-right minimized bar.
7. Desktop dark EN 1440x900 — full review summary/list.
8. Mobile EN 390x844 — partial-completion confirmation and focus.
9. Mobile EN 390x844 — terminal partial completion with one saved set and final Muscle Load.
10. Desktop EN 1440x900 — terminal isolation with one saved set and final Muscle Load.

After the Planner correction, exact-head Rendered UI QA passed on both `1a523d6ab1c11ef3655c78ad3c4320e9a89b8abd` and docs-only head `1fb16db421e613e577979d90a93ab214dc456077`.

## 34. Artifact and screenshot paths

Original local AW-7 artifact:

`C:\Users\Ahmee\.codex\visualizations\2026\07\30\019fb46b-f313-71d3-9ff7-d4baefae1097\aw7-qa-final-03a25b11\aw7-layout-qa-results.json`

The original ten PNGs are in the same directory and are named `01-mobile-en-minimized-active-390x844.png` through `10-desktop-en-terminal-isolation-1440x900.png`.

Planner-corrected implementation-head remote rendered artifact:

```text
artifact ID: 8774802526
name: pr-quality-rendered-evidence-1a523d6ab1c11ef3655c78ad3c4320e9a89b8abd
digest: sha256:7787e190bcf688d58f3a93cc974c365e1534e5bd4d49c57175b387451a96e194
workflow run: 30581021493
```

Final docs-only exact-head remote rendered artifact:

```text
artifact ID: 8775060904
name: pr-quality-rendered-evidence-1fb16db421e613e577979d90a93ab214dc456077
digest: sha256:28e8427a81da85693a1c0a69ae13d7a87b81555bf2e5aeddf313c206aeb3fb98
workflow run: 30581769801
```

## 35. Manual visual findings/corrections

Original rendered-QA corrections:

- partial confirmation focus changed from Continue to Finish anyway;
- two mojibake separators were replaced by correct middle dots;
- terminal fixture journeys now save one set before partial completion;
- completed-mode fixture metadata now matches the final request;
- the legacy Train overlap probe ignores the minimized controller's own actions and hidden controls inside closed disclosures while retaining its visible page-action collision check.

Planner correction:

- the previous minimized rest projection could skip the authoritative next set and display a later exercise;
- rest copy now uses the cursor's active prescription item and `active_set_number` directly;
- the rest fallback no longer guesses a later exercise;
- minimized progress excludes skipped prescription items and matching skipped-item logs;
- the correction did not change bar dimensions, positioning, Pause/Resume behavior, review layout, completion layout, or session-engine transitions.

The corrected exact-head rendered artifacts were inspected for the affected Active Workout surfaces. No horizontal overflow, clipped controls, overlay collisions, duplicate controller, stale minimized bar, duplicate review/completion surface, or mutable editor behind terminal completion was found.

## 36. Console/page/network results

The original final artifact recorded zero console errors, zero page errors, zero unexpected failed requests/responses, and zero scenario failures. Seventeen cancelled Next.js `_rsc` prefetch/navigation requests were classified separately as expected `net::ERR_ABORTED` cancellations, not network failures. Both corrected exact-head Rendered UI QA runs completed successfully.

## 37. Database/migration confirmation

No migration, DDL, database schema, RLS, grant, ledger, or compatibility-version file changed. The Planner correction modified only UI projection logic, focused tests, and this report.

## 38. Supabase Production confirmation

Supabase Production was not queried, mutated, migrated, or otherwise modified.

## 39. Activity Catalog confirmation

Activity Catalog was not modified. Rendered QA intercepted the existing catalog fixture only.

## 40. Compatibility-marker confirmation

The compatibility marker remains unchanged.

## 41. Deployment confirmation

No deployment or production promotion was performed. GitHub/Netlify PR previews are provider-managed review checks, not an authorized Production deployment.

## 42. Known genuine limitations

- The committed report is necessarily a docs-only descendant of the exact corrected implementation/evidence head stated in section 5.
- Rendered QA uses deterministic mock-auth/fixture data and is not evidence of live Production database state.
- The Planner correction reused the existing exact-head remote Train/rendered matrix rather than performing a Production database journey.

## 43. Out-of-scope findings

No architectural or product issue requiring AW-8 or a separate phase was opened. Expected cancelled Next.js prefetches remain informational only.

## 44. Working-tree status

All correction writes were committed directly to the existing AW-7 branch. Exact-head integrity passed on the implementation and final report heads.

## 45. PR unmerged confirmation

PR #93 is open, Draft, and unmerged. No merge was attempted.

## 46. AW-8 not started confirmation

AW-8 was not started. No fatigue, recovery, hypertrophy, trend, or other AW-8 derived metric was added.

## 47. Planner correction closure

Old audited head:

`1b1d3b614d5e30d0e1009e8a9203c7bf9781cccc`

Corrected implementation/evidence head:

`1a523d6ab1c11ef3655c78ad3c4320e9a89b8abd`

Current final report head:

`5cd6cb705f382514db471409da15511d3b3710c2`

Root cause:

The session engine correctly advanced the authoritative cursor to the next set/item before entering rest, but the minimized controller searched for another item after that cursor and could present a later exercise as next.

Resolution:

The minimized rest context now uses the authoritative active item, set number, and set count. Minimized progress now uses non-skipped prescription items and excludes matching skipped-item logs. The existing session engine remained unchanged.

Evidence finalized before this immutable report closure:

- implementation-head Phase A `30581021594` — passed.
- implementation-head PR Quality `30581021493` — passed.
- docs-head Phase A `30581769829` — passed.
- docs-head PR Quality `30581769801` — passed.
- docs-head artifact `8775060904` — uploaded successfully.
- current final head Phase A `30582397175` — passed.
- current final head PR Quality `30582397154` — final status is recorded immutably in the PR comment after the workflow completes.
- PR remains Draft and unmerged.
- no migration, Production, Activity Catalog, compatibility-marker, deployment, merge, or AW-8 work occurred.
