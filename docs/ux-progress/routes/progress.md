# Route Audit: `/progress`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 62 / 100  
**Flow decision:** Tune flow

---

## Files inspected

- `app/(private)/progress/page.tsx`
- `components/progress/progress-entry-modal.tsx`
- `components/progress/progress-charts.tsx`
- `services/database/progress.ts`
- `services/progress/progress-measurements.ts`
- `services/progress/progress-photos.ts`
- `services/database/nutrition.ts`
- `services/database/workout-sessions.ts`
- `services/database/profile.ts`
- `types/database.ts`

---

## 1. Product role

`/progress` should be the user's long-term body and performance trend tracker.

It should answer:

```txt
What changed?
Am I moving toward my goal?
What should I log next to make the trend more reliable?
Can I safely review/edit/delete sensitive progress data?
```

This route is not ChatGPT/import-first. Progress entries, measurements, and progress photos are sensitive direct user data. Plaivra should make entry, review, correction, deletion, and privacy state clear. ChatGPT may later help explain trends, but no AI interpretation should be required to log body weight, measurements, or photos.

The current route has substantial functionality: progress entries, goal weight, trend cards, charts, measurement trends, photo upload/comparison, history, edit, and delete. The core issue is polish and trust. It is functional, but the first screen is too weight-centric, load errors are toast-only, privacy/photo states need clearer framing, and many repeated controls miss the 48px mobile standard.

---

## 2. AI-first vs manual-entry role

Progress is a direct tracking route with optional AI interpretation later.

Expected hierarchy:

```txt
1. Goal/trend status
2. Next best logging action
3. Add progress entry / add photo
4. Trend charts and measurements
5. History with edit/delete correction
6. Privacy controls and photo visibility state
7. Optional ChatGPT trend review later, only with explicit request
```

Current hierarchy:

```txt
1. PageHeading with Add progress entry
2. Empty-state Add progress entry if no entries
3. Tabs: Overview / Measurements / Photos / History
4. Overview hero focused on current weight
5. Goal weight input inside hero
6. Add progress entry duplicated inside hero
7. Charts, feedback, measurement/photo/history previews
8. Measurements tab
9. Photos tab with upload/comparison/delete
10. History tab with edit/delete
```

The route does not need AI-first reframing. It needs clearer goal/trend hierarchy, stronger data-state reliability, privacy-state clarity, and mobile control cleanup.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| I want to see whether I am progressing | Show goal/trend status first, not only latest weight. |
| I want to add a progress entry | Provide one obvious add path and preserve typed values on failure. |
| I want to add a progress photo | Explain privacy state and photo visibility before upload. |
| I want to compare photos | Make before/after selection clear and comfortable on mobile. |
| I made a mistake | Edit/delete entry safely with clear pending and failure states. |
| I want to set goal weight | Save to profile where possible; clearly distinguish synced vs local fallback. |
| I hide progress photos | The route should explain that photos are hidden by setting, not missing. |
| Something failed to load | Show visible ErrorState/degraded state, not only a toast. |

---

## 4. Current workflow map

```txt
Enter /progress
-> PageHeading with Add progress entry
-> load progress entries, workout activity, nutrition week, photos unless hidden
-> if loading: skeleton
-> if load fails: toast only, then route exits loading
-> if no entries: dashed first-entry card
-> tabs:
   -> Overview
      -> current weight hero
      -> goal weight input or goal progress
      -> Add progress entry
      -> stats row
      -> charts
      -> feedback
      -> latest measurements preview
      -> photos shortcut
      -> recent history preview
   -> Measurements
      -> measurement trends
   -> Photos
      -> upload photo
      -> photo grid
      -> before/after comparison
   -> History
      -> edit card if active
      -> progress entries with details/edit/delete
```

Strong points:

- The route has a real overview instead of a blank report screen.
- `ProgressEntryModal` preserves typed values on save failure and shows inline form error.
- Progress photos are hidden when `settings.hideProgressPhotos` is enabled.
- Photo upload validates type and size in the service layer.
- Photo storage uses user-scoped paths and verifies ownership before deletion.
- Entry deletion uses a confirmation dialog.
- The route includes both data entry and review/correction paths.

Main workflow issues:

- Load failure is toast-only; the page can render empty/default states after a failed load.
- Progress entry service returns empty entries on read error, which can hide backend failure as “no entries.”
- Photos failing to load are silently converted to an empty list and only logged to console.
- The first screen is too current-weight-centric and does not produce one clear next best action.
- Add progress entry appears in multiple places, creating duplicate primary actions.
- Goal weight is still partly localStorage fallback, with unclear synced/local state.
- Photo privacy is implicit; users see upload/compare but not enough privacy reassurance or hidden-state explanation.
- Edit/delete/photo controls often use `h-10 w-10` or `h-11`, below the 48px mobile comfort baseline.
- Editing and deleting entries/photos wait for server success without strong pending/rollback/disabled row-level state.
- The history tab uses native `<details>` rows with action buttons inside summaries, which can be awkward and conflict-prone on mobile.
- Charts are useful, but chart empty states are generic and not tied to a next logging action.

---

## 5. Recommended workflow map

```txt
Enter /progress
-> Loading gate or ErrorState/degraded state
-> Progress status hero:
   -> goal/trend summary
   -> latest entry date
   -> next useful log action
   -> synced/local goal state
-> One primary add action:
   -> Add progress entry
   -> optional Add progress photo secondary if photos are visible
-> Overview:
   -> weight/waist/consistency metrics
   -> trend charts
   -> progress feedback
-> Measurements:
   -> measurement trends and latest values
-> Photos:
   -> privacy explanation
   -> upload
   -> grid
   -> comparison
-> History:
   -> clear list rows
   -> edit/delete correction with pending/failure states
```

This is a **tune flow** correction. The route already has the right major sections, but the trust, privacy, hierarchy, and mobile execution need work.

---

## 6. Flow decision label

**Tune flow.**

The main route structure can stay: overview, measurements, photos, history. The correction is to make the overview goal/trend-first, remove duplicated primary actions, add visible data-state recovery, strengthen privacy framing, and make correction actions comfortable/reliable.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Progress photos are private and only visible to you.”
- “Photos are hidden by your Progress photo privacy setting.”
- “Goal weight synced to profile” vs “Goal saved on this device only.”
- “Some progress data could not load. Existing saved data was not changed.”
- “Add one more weigh-in to unlock a trend.”
- “Add waist or measurements to make body-composition trends more useful.”
- “Entry was not deleted. Your history was restored.”
- “Photo file removed but metadata cleanup failed” should be recoverable/visible if it happens.

Avoid medical claims and avoid over-interpreting weight changes. Keep progress feedback simple and non-judgmental.

---

## 8. UI structure

Recommended first-screen order:

```txt
1. Progress status / goal trend hero
2. One primary logging action
3. Compact stats
4. Charts
5. Feedback
6. Measurement/photo/history previews
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| PageHeading add action + hero add action + empty add action | Duplicate primary action paths. | Keep one visible primary add action per state. | P1 |
| Current weight hero | Useful but too narrow. | Make it goal/trend/next-action hero. | P1 |
| Goal weight input | Useful but 44px controls and unclear local fallback/sync state. | 48px controls and explicit synced/local state. | P1 |
| Tabs | Correct major IA. | Keep, but ensure tab triggers meet mobile touch comfort. | P2 |
| Chart empty states | Helpful but passive. | Add next logging action link where appropriate. | P2 |
| Photo upload | Functional but privacy framing is too light. | Add privacy/hidden-state explanation before upload. | P1 |
| History rows | Dense with edit/delete inside summary. | Use explicit row layout or ensure summary/action interaction is safe. | P2 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Add progress entry | PageHeading, empty state, overview hero | Duplicated primary action. | Keep one dominant add action in the current state. | P1 |
| Save goal weight | Hero goal input | `h-11`, unclear pending/sync state. | 48px, pending, synced/local fallback copy. | P1 |
| Overview edit/delete recent row | Recent preview | `h-10 w-10`, below 48px. | Resize and add row-level pending/failure. | P1 |
| History edit/delete | Inside `<summary>` | Can conflict with row expansion and also `h-10`. | Use safer row action layout and 48px controls. | P1 |
| Photo upload | Photos tab | `h-11`; upload pending exists. | 48px and clearer privacy/state copy. | P1 |
| Photo delete | Photo card | `h-10 w-10`, no row-level pending. | 48px and pending/failure state. | P1 |
| Measurement/photo selects | Photos tab | `h-11`. | 48px. | P2 |
| See all / View links | Raw text buttons | Too small and not button-like. | Convert to 48px secondary buttons/links. | P2 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Initial loading | Skeleton shown. | Good baseline. | Keep. | P3 |
| Route load failure | Toast only. | User can see empty/default data as if real. | Add route-level ErrorState or degraded state with retry. | P1 |
| Progress entries read error | Service logs and returns empty. | “No entries” can mean failed load. | Surface degraded state or stop swallowing at route-critical layer. | P1 |
| Photo load failure | Console + empty photos. | Looks like no photos. | Show photo-specific degraded state. | P1 |
| Add entry pending | Modal button pending and form preserved on failure. | Good baseline. | Keep; optionally add success transition. | P2 |
| Goal save pending | No explicit saving state. | User can repeat tap and cannot tell sync status. | Add pending + synced/local state. | P1 |
| Edit entry pending | No row/card pending state. | Save can be repeated and state is unclear. | Add pending and disable relevant controls. | P1 |
| Delete entry pending | Confirmation then wait. | No row-level pending/rollback. | Add pending and safe unchanged/rollback behavior. | P1 |
| Photo upload failure | Toast only, no inline card error. | User may miss failure after file selection. | Add inline upload error. | P2 |
| Photo delete failure | Toast only. | Sensitive delete action needs clearer state. | Add inline/persistent failure feedback. | P1 |
| Hidden photos setting | Photos tab disappears. | Good for privacy, but no explanation in route. | Add hidden-state note or route-level privacy copy. | P2 |

---

## 11. Motion and interaction design

Progress route motion should be restrained and data-focused.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Add entry saved | Toast + modal closes. | Functional, but no overview update transition. | Subtle metric/chart update feedback. | P2 |
| Goal saved | Toast only. | Sync/local state not obvious. | State label transition, not celebration. | P1 |
| Edit entry saved | Toast only. | Hard to see what changed. | Row/card update highlight. | P2 |
| Delete entry/photo | Wait then removes. | No pending/undo/rollback clarity. | Row pending then exit after success; restore on failure. | P1 |
| Photo upload | Button text changes. | Acceptable but could show upload progress/selected file state. | Keep simple; add selected file and inline error. | P2 |
| Charts | Static render. | Acceptable. | Avoid heavy chart animation; respect reduced motion. | P3 |

No flashy transformations, body-change animations, or celebratory weight-loss effects. Progress data is sensitive.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Progress photos are sensitive. | Privacy mistakes damage trust. | Add explicit private/hidden-state copy and avoid broad storage changes. |
| Photo deletion has storage + metadata steps. | Partial deletion can happen. | Keep service safeguards; surface failure clearly in UI. |
| Goal weight uses profile plus localStorage fallback. | User may think local fallback synced everywhere. | Show synced vs local status and avoid rewriting schema in this pass. |
| Entry deletion includes measurements. | User must know linked measurement data is removed. | Keep confirmation, add pending/failure clarity. |
| Services swallow some read errors. | UI can misreport empty data. | Prefer route-level degraded state and targeted service changes only if safe. |
| Chart/metric updates depend on derived data. | Optimistic edits/deletes can desync calculations. | Snapshot previous entries before optimistic delete/edit if implementing optimism. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 9 | 15 | Correct tracker purpose and tabs, but first screen is too weight-centric and duplicate add actions compete. |
| Button size, placement, and hierarchy | 8 | 15 | Main add button is strong; many edit/delete/photo/goal controls are 40-44px and raw text links are small. |
| Spacing consistency and visual rhythm | 7 | 10 | Generally coherent, but overview is dense and history/photo controls are cramped. |
| Feedback, optimistic UI, loading, and errors | 6 | 15 | Skeleton and modal error are good; route errors and photo/load/edit/delete feedback are weak. |
| Motion and interaction quality | 5 | 15 | Mostly static; missing meaningful update/delete/sync-state transitions. |
| Mobile-first behavior and tap comfort | 7 | 10 | Tabs and cards are workable, but dense controls and details rows reduce comfort. |
| AI safety, privacy, and high-risk action control | 9 | 10 | No unsafe AI writes; photo privacy service has safeguards. Needs clearer visible privacy states. |
| Premium/subscription readiness | 11 | 10 | Feature set is rich, but the experience does not feel premium until hierarchy and trust states improve. |
| **Total** | **62** | **100** | Functional and feature-rich, but not yet a premium, trust-heavy progress tracker. |

Note: Premium/subscription score was capped in the total calculation. The route has strong feature value, but state quality prevents a higher overall score.

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| One primary action per visible section | Add progress entry appears in heading, empty state, and overview hero. | Keep one state-appropriate primary add path. |
| Loading/error state clarity | Route load failure is toast-only; services can return empty arrays on failure. | Add ErrorState/degraded state and retry. |
| 48px tap target baseline | Edit/delete/photo controls use `h-10 w-10`; goal/photo controls use `h-11`. | Resize effective targets. |
| Trust/privacy clarity | Progress photos are sensitive, but privacy copy is minimal. | Add private/hidden-state framing. |
| Feedback loop completeness | Goal save/edit/delete/photo delete lack strong pending/failure visibility. | Add per-action pending and inline failure states. |
| Motion should clarify state | Saves/deletes mostly rely on toast. | Add subtle state transitions and row update highlights. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add route-level ErrorState/degraded state with retry for failed progress load. | Codex/Kimi/Human | Open |
| P1 | Distinguish empty progress from failed progress load. | Codex/Kimi/Human | Open |
| P1 | Show photo-specific degraded state if photos fail to load instead of silently showing no photos. | Codex/Kimi/Human | Open |
| P1 | Make overview hero goal/trend/next-action focused, not only current-weight focused. | Codex/Kimi/Human | Open |
| P1 | Remove duplicate primary Add progress entry placements. | Codex/Kimi/Human | Open |
| P1 | Add goal weight pending state and explicit synced/local fallback status. | Codex/Kimi/Human | Open |
| P1 | Resize edit/delete/photo/goal controls to 48px effective targets. | Codex/Kimi/Human | Open |
| P1 | Add row-level pending/failure states for edit/delete entry actions. | Codex/Kimi/Human | Open |
| P1 | Add safer mobile history row interaction instead of action buttons competing inside native summary. | Codex/Kimi/Human | Open |
| P1 | Add privacy copy for progress photos and hidden-photo setting. | Codex/Kimi/Human | Open |
| P1 | Add clear pending/failure state for photo delete. | Codex/Kimi/Human | Open |
| P2 | Add selected-file and inline upload error feedback for photo upload. | Codex/Kimi/Human | Open |
| P2 | Convert raw text “See all / View” controls into comfortable secondary buttons/links. | Codex/Kimi/Human | Open |
| P2 | Add restrained reduced-motion-safe update feedback for add/edit/delete/goal save. | Codex/Kimi/Human | Open |
| P3 | Keep the major tabs; do not merge every progress function into one long page. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/progress` distinguishes loading, failed load, empty state, and real data.
- [ ] Failed progress entries load does not display as confident “no entries.”
- [ ] Failed photo load does not display as confident “no photos.”
- [ ] Overview hero explains goal/trend status and next useful logging action.
- [ ] Only one primary Add progress entry action is visible per state.
- [ ] Goal weight save shows pending and then synced/local fallback state.
- [ ] Add progress entry preserves typed values on failure.
- [ ] Edit entry save shows pending, success, and failure inline.
- [ ] Delete entry has confirmation, pending state, and clear failure recovery.
- [ ] History rows are comfortable on mobile and action buttons do not conflict with expand/collapse.
- [ ] Photo upload explains privacy, validates selected file, and shows inline failure.
- [ ] Photo delete has confirmation, pending, and clear failure state.
- [ ] Photo hidden setting is explained when photos are hidden.
- [ ] Edit/delete/photo/goal/select/link controls meet 48px effective target.
- [ ] Motion is restrained, reduced-motion-safe, and limited to data updates/status changes.
- [ ] No ChatGPT/AI action is added as the primary progress logging flow.

---

## 17. Codex prompt section

Use this route with one-route UI/UX plus privacy/data-state review. It touches sensitive progress data and private photos, but it should not require AI import/apply work.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + privacy-sensitive progress data reviewer + data-state reliability reviewer
```

Implementation should not change database schema, storage bucket policy, auth, subscriptions, global theme, or unrelated progress/PR pages unless a narrow dependency requires it and is reported.

---

## 18. Implementation note

Do not rebuild the route from scratch. Preserve the current main sections:

```txt
Overview
Measurements
Photos
History
Add progress entry
Goal weight
Progress charts
Progress photos
```

The high-value correction is trust and hierarchy:

```txt
Goal/trend status -> one next logging action -> reliable add/edit/delete/photo states -> private trend review
```

Progress data is sensitive. The route should feel calm, precise, and trustworthy.