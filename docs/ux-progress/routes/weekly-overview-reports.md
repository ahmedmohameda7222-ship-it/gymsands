# Route Audit: `/calories/weekly-overview`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 57 / 100  
**Flow decision:** Tune flow with report-source confidence, empty-state clarity, and readable period controls

---

## Files inspected

- `app/(private)/calories/weekly-overview/page.tsx`
- `components/meals/weekly-overview.tsx`
- `components/reports/reporting-dashboard.tsx`
- `services/reports/reporting.ts`
- `services/database/nutrition.ts`
- `services/database/progress.ts`
- `services/database/workout-sessions.ts`
- `services/wellness/wellness-data.ts`

---

## 1. Product role

`/calories/weekly-overview` is Plaivra's broad reporting route. The page title is “Fitness Reports,” and the report aggregates workouts, nutrition, water, weight, measurements, habits, sleep, and PRs.

The route should answer:

```txt
What changed this week or month?
Which areas have enough data and which do not?
Is the report complete, partial, failed, or empty?
Can I move between weeks/months comfortably on mobile?
Can I trust the calculated averages and trends?
Can I export or review this report later?
```

This route is not a data-entry route and not AI-first by default. It is a read-only reporting and interpretation surface. Later, ChatGPT can support explicit “review my report” requests, but the core page must first present source confidence, empty states, and readable metrics.

The current route has a useful aggregation base, but it is still closer to a developer summary than a premium user report. It shows metric cards and details, but has plain loading/error text, no source-level confidence, no partial/degraded state even though multiple services can silently return empty arrays, no charts/timeline despite the route promise of reports, no export button despite `reportToCsv/downloadCsv` existing, and dense period controls on mobile.

---

## 2. AI-first vs manual-entry role

Weekly Overview / Reports is an analytical review route.

Expected hierarchy:

```txt
1. Report period and source confidence
2. Key summary / what changed
3. Metrics cards
4. Data coverage and missing-data explanation
5. Detail sections: workouts, nutrition, water, progress, habits, sleep, PRs
6. Export/share/review actions if safe and explicit
```

Current hierarchy:

```txt
1. PageHeading
2. Period controls card
3. Plain loading/error text
4. Metric grid
5. Empty states / period checks card
6. Measurement changes
7. PRs achieved
```

The current structure lacks a top-level report confidence layer. It also has a misleading card titled “Empty states / period checks,” which sounds like internal QA copy rather than user-facing report language.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Check weekly performance | Show current week summary first, with complete/partial data state. |
| Check monthly performance | Period switch should be comfortable and preserve confidence state. |
| Understand missing data | Explain which sources have no logs vs failed to load. |
| Move period | Previous/current/next should be 48px and compact on mobile. |
| Trust averages | Explain averages are based only on logged days. |
| Review measurements | Show enough/insufficient data clearly. |
| See achievements | PR section should show empty, loaded, and failed states distinctly. |
| Export report | If export exists in services, expose safe CSV export or remove dead code. |
| Ask AI to interpret | Optional future explicit action only; no silent analysis or changes. |

---

## 4. Current workflow map

```txt
Enter /calories/weekly-overview
-> PageHeading Fitness Reports
-> ReportingDashboard mode = weekly, selectedDate = today
-> range computed from week/month
-> Promise.all loads nutrition, workout activity, progress entries, habits, sleep logs, PRs
-> aggregateReport builds metrics
-> user switches weekly/monthly and previous/current/next
-> metric grid and detail cards render
```

Strong points:

- Route uses one consolidated reporting dashboard.
- Weekly/monthly mode is simple and understandable.
- Previous/current/next period controls exist.
- Aggregation covers many product areas: workouts, nutrition, water, progress, measurements, habits, sleep, and PRs.
- Metrics correctly distinguish “Not enough data” for many calculations.
- `reportMetrics` explains some calculations, such as average protein from logged food days only.
- `services/reports/reporting.ts` contains CSV helper functions, suggesting export intent.
- Page is read-only and avoids accidental data mutation.

Main workflow issues:

- Loading state is plain text: “Loading report...”.
- Error state is plain bordered text, not a proper ErrorState with retry.
- A single `Promise.all` can fail the whole report if one source throws, while many service functions swallow errors and return empty arrays; both behaviors hide source-level confidence.
- No partial report state: nutrition can load while habits/sleep/PRs fail, but the UI cannot say what is complete.
- Several data services return `[]` on error, making failed data indistinguishable from true no data.
- The page does not show data coverage by source.
- “Empty states / period checks” is internal-sounding and not premium user copy.
- There are no charts, timelines, or trend visuals despite the route being a “reports” page.
- Period control buttons may wrap awkwardly on mobile and are not organized as a clear segmented control + pager.
- There is no direct date picker or month/week selector; previous/next may be slow for older periods.
- `reportToCsv` and `downloadCsv` exist but are not exposed in the UI.
- No explicit “current period” state after moving away and back beyond button text.
- No reduced-motion considerations for future chart/metric transitions.
- No empty-state action guidance, e.g. log food, log workout, add progress, sleep check-in, habits.
- No AI-review action, and that is acceptable for now; if added, it must be explicit and review-only.

---

## 5. Recommended workflow map

```txt
Enter Fitness Reports
-> Report header:
   -> weekly/monthly segmented control
   -> period label
   -> previous/current/next/date picker
   -> export CSV if implemented
-> Report confidence:
   -> complete / partial / failed / empty
   -> source coverage by nutrition/workouts/progress/habits/sleep/PRs
-> Summary metrics
-> Trend/detail sections:
   -> user-facing coverage copy, not internal empty-state language
   -> measurements and PRs
   -> optional simple chart/timeline later
-> Empty guidance:
   -> route-specific actions to add missing data
```

This is a **tune flow with report-source confidence, empty-state clarity, and readable period controls** correction. The aggregation service is useful; the UI needs trust and report-readability hardening.

---

## 6. Flow decision label

**Tune flow with report-source confidence, empty-state clarity, and readable period controls.**

Do not rebuild reporting from scratch. Fix state confidence, loading/error quality, period controls, and user-facing copy before adding charts.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Report built from logged workouts, food, water, progress, habits, sleep, and PRs.”
- “Partial report: some data sources could not load.”
- “No data logged for this period yet.”
- “Averages use only days with saved logs.”
- “Measurements need at least two entries in this period.”
- “No PRs recorded in this period.”
- “Export CSV” if implemented.
- “Review with ChatGPT” only if explicit and read-only later.

Replace “Empty states / period checks” with user-facing language such as “Data coverage this period.”

---

## 8. UI structure

Recommended structure:

```txt
1. Period and report actions
2. Report confidence / data coverage
3. Key metrics
4. Data coverage details
5. Measurement changes
6. PRs
7. Empty guidance and export
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Loading text | Plain text. | Report skeleton. | P1 |
| Error text | Plain bordered paragraph. | ErrorState with retry. | P1 |
| Multi-source load | No partial/source state. | Source-level load status. | P1 |
| Period controls | Five buttons in a flex wrap. | Segmented mode + pager/date control. | P1 |
| Internal copy | “Empty states / period checks.” | User-facing “Data coverage”. | P1 |
| Metrics | Good base but no visual trend. | Keep cards; optional chart later. | P2 |
| CSV helpers | Service exists but UI missing. | Add export or remove dead path. | P2 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Weekly / Monthly | Period card | Good concept but two independent buttons. | Convert to 48px segmented control. | P1 |
| Previous / Current / Next | Period card | Can wrap awkwardly on mobile. | Pager group with 48px targets. | P1 |
| Retry report | Missing. | Failed report has no direct retry. | Add retry. | P1 |
| Export CSV | Missing despite service helpers. | Useful report action not exposed. | Add if safe. | P2 |
| Log missing data actions | Missing. | Empty report gives no next steps. | Add contextual route links. | P2 |
| AI review | Missing. | Acceptable; optional later. | Add only as explicit read-only review. | P3 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Initial loading | Plain text. | Low trust and no layout stability. | Skeleton cards. | P1 |
| Whole-report failure | Toast + bordered text. | Toast can be missed; no retry. | Inline ErrorState with retry. | P1 |
| Partial source failure | Not represented. | Report can look complete or empty incorrectly. | Source status/degraded banner. | P1 |
| No data this period | Metrics say Not enough data. | No top-level empty guidance. | Empty report state with actions. | P1 |
| Missing individual sources | Blended into Not enough data. | User cannot know if not logged or failed. | Coverage card by source. | P1 |
| Period change pending | Loading text only. | Old report disappears abruptly. | Keep previous report with loading status or skeleton. | P2 |
| Export success/failure | Not applicable. | Export not exposed. | Add status if export added. | P2 |

---

## 11. Motion and interaction design

Reports should be calm and stable. Motion should help users understand period changes and data updates.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Period switch | Re-fetch and rerender. | Report disappears to text. | Stable skeleton/status; reduced-motion-safe update. | P1 |
| Metric changes | Instant text changes. | Acceptable, but can be abrupt. | Optional subtle count/card transition respecting reduced motion. | P3 |
| Future charts | None. | Not yet relevant. | Do not add heavy chart animation. | P3 |

No decorative report animation. Prioritize stable layout and readable numbers.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Reporting reads many user-data sources. | One failed source should not invalidate the whole report. | Use source-level results/metadata. |
| Services swallow errors as empty arrays. | UI cannot tell failed from true empty. | Add wrapper statuses in ReportingDashboard where feasible. |
| Reports aggregate sensitive health data. | Avoid overconfident conclusions. | Use cautious wording and source coverage. |
| Exposing CSV export touches privacy. | User may download sensitive health data. | Add clear local-file warning/status if exporting. |
| Charts could add scope. | Current issue is state trust, not visual flair. | Defer charts until confidence states are correct. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 9 | 15 | Useful reporting goal, but confidence layer missing. |
| Button size, placement, and hierarchy | 9 | 15 | Controls are functional but need mobile grouping and 48px verification. |
| Spacing consistency and visual rhythm | 8 | 10 | Clean cards, but details feel internal/developer-oriented. |
| Feedback, optimistic UI, loading, and errors | 5 | 15 | Plain loading/error and no partial-source state. |
| Motion and interaction quality | 5 | 15 | Stable enough but no proper loading transition or reduced-motion strategy. |
| Mobile-first behavior and tap comfort | 7 | 10 | Usable, but period controls can wrap and crowd. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Correctly read-only; export/AI review would need explicit privacy framing. |
| Premium/subscription readiness | 6 | 10 | Broad analytics are valuable, but trust/readability gaps block premium feel. |
| **Total** | **57** | **100** | Strong aggregation base, weak report confidence and presentation. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Plain loading and plain error text. | Skeleton + ErrorState/retry. |
| Data confidence | Multiple source failures can appear as no data. | Source-level status and partial report banner. |
| Premium copy quality | “Empty states / period checks” is internal wording. | User-facing data coverage language. |
| Mobile control hierarchy | Five period buttons wrap as a generic cluster. | Segmented mode + pager/date control. |
| Report action clarity | CSV helpers exist but no UI or privacy copy. | Add safe export or remove unused path. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Replace plain loading text with report skeleton. | Codex/Kimi/Human | Open |
| P1 | Replace plain failure text/toast-only behavior with inline ErrorState and retry. | Codex/Kimi/Human | Open |
| P1 | Add source-level confidence/coverage for nutrition, workouts, progress, habits, sleep, and PRs. | Codex/Kimi/Human | Open |
| P1 | Distinguish complete, partial, failed, no-data, and insufficient-data states. | Codex/Kimi/Human | Open |
| P1 | Replace “Empty states / period checks” with user-facing “Data coverage this period.” | Codex/Kimi/Human | Open |
| P1 | Rework period controls into a 48px segmented Weekly/Monthly control plus readable pager/current/date control. | Codex/Kimi/Human | Open |
| P2 | Add empty report guidance with links to Calories, Today Workout, Progress, Wellness/Sleep, and Habits where relevant. | Codex/Kimi/Human | Open |
| P2 | Expose CSV export using existing helpers with local-file privacy copy, or remove dead export helpers from scope later. | Codex/Kimi/Human | Open |
| P2 | Keep previous report visible while next period loads, with a clear loading overlay/status if feasible. | Codex/Kimi/Human | Open |
| P3 | Optional: add simple charts only after source confidence states are correct. | Codex/Kimi/Human | Open |
| P3 | Optional: add explicit read-only ChatGPT report review later; no silent AI interpretations. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/calories/weekly-overview` loads with skeleton cards, not plain text.
- [ ] Failed whole-report load shows ErrorState with retry.
- [ ] Partial source failure shows a degraded/partial report banner.
- [ ] Nutrition, workout, progress, habit, sleep, and PR source coverage are visible.
- [ ] No-data and insufficient-data are distinct from failed data.
- [ ] “Empty states / period checks” copy is replaced with user-facing report copy.
- [ ] Weekly/monthly and period navigation controls are 48px and readable on 390x844.
- [ ] Empty report guidance links to relevant logging routes.
- [ ] CSV export, if added, has privacy/local-file copy and success/failure state.
- [ ] No report source failures silently become confident zero-data metrics.
- [ ] No database schema, auth, AI import/apply behavior, global theme, or unrelated routes are changed.

---

## 17. Codex prompt section

Use this route with reporting source-confidence and privacy review.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + reporting data-confidence reviewer + health-data privacy reviewer
```

Implementation should not change database schema, auth behavior, AI import/apply behavior, global theme, or unrelated route flows.

---

## 18. Implementation note

Do not rebuild reporting. Preserve the current aggregation model:

```txt
Week/month period -> aggregate user data -> metric cards -> detail sections
```

The highest-value correction is report trust:

```txt
Readable period controls -> source confidence -> skeleton/ErrorState -> clear missing-data explanations -> optional safe export
```
