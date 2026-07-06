# Route Audit: `/sleep-recovery`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 57 / 100  
**Flow decision:** Tune flow with quiet recovery-state feedback, input validation, and log safety

---

## Files inspected

- `app/(private)/sleep-recovery/page.tsx`
- `components/lifestyle/wellness-trackers.tsx`
- `services/wellness/wellness-data.ts`
- `services/database/wellness.ts`
- Related context from:
  - `docs/ux-progress/routes/wellness.md`
  - `docs/ux-progress/routes/weekly-overview-reports.md`

---

## 1. Product role

`/sleep-recovery` is Plaivra's recovery logging route. It captures sleep duration, sleep quality, bedtime, wake time, recovery, fatigue, soreness, stress, and notes. It also powers readiness estimates and reporting.

The route should answer:

```txt
How did I sleep and recover today?
Is there enough data for readiness or average sleep?
Can I save a recovery log safely?
Can I edit/delete a previous recovery log safely?
Can I trust the readiness wording as non-medical and based only on saved inputs?
Did load/save/delete fail?
```

This route is not AI-first. It is a calm, direct recovery check-in and history route. ChatGPT can later help interpret recovery patterns only as an explicit read-only action, not as primary logging and not as medical guidance.

The current route has a useful base: Average Sleep, Readiness, Latest Log, a detailed recovery form, and previous log cards. The main issues are state trust and quiet interaction quality. Loading is invisible, load failure is toast-only, save/delete have no pending/error state, delete is immediate, edit mode is invisible, input validation is weak, and controls in the shared tracker file are below the 48px target.

---

## 2. AI-first vs manual-entry role

Sleep & Recovery is direct sensitive check-in logging.

Expected hierarchy:

```txt
1. Today's recovery status and data confidence
2. Latest log and readiness explanation
3. Calm save/edit recovery form
4. Recent recovery logs
5. Safe edit/delete/retry states
6. Non-medical guidance wording
```

Current hierarchy:

```txt
1. PageHeading
2. TrackerShell
3. Average sleep / Readiness metrics
4. Latest log if present
5. Full form
6. Save Recovery Log
7. Recent logs via ActionCard
```

The structure is close. It needs loading/error/safety and input clarity before visual redesign.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Log today's recovery | Validate reasonable values, save with pending/success/failure. |
| Update today's log | Make edit mode visible and allow cancel/discard. |
| Review readiness | Explain that readiness is a simple non-medical estimate from saved data. |
| Review latest sleep | Show latest log confidently only after data loads. |
| Delete mistaken log | Confirmation or undo; no immediate destructive delete. |
| Load fails | Inline ErrorState/retry; not an empty readiness state. |
| Not enough data | Clear empty/insufficient-data state, not failure. |

---

## 4. Current workflow map

```txt
Enter /sleep-recovery
-> SleepRecoveryTracker loads 30 recovery logs
-> Average sleep and readiness are computed from items
-> Latest log renders if items[0] exists
-> user fills form and saves today's log
-> saved log is inserted/replaced in local list
-> user can edit by filling the form from a row
-> user can delete a row immediately
```

Strong points:

- Route is simple and direct.
- It includes recovery dimensions that are useful for training context.
- Readiness copy in `calculateReadiness` states that the estimate is non-medical.
- Average sleep requires at least two numeric sleep logs.
- Latest Log gives quick context.
- Form supports bedtime and wake time as well as subjective ratings.
- Save button is 48px high.

Main workflow issues:

- Initial loading has no skeleton/status.
- Load failure is toast-only and can appear as no recovery data.
- `getSleepRecoveryHistory` returns `[]` on error, making failed history indistinguishable from empty history.
- Save has no pending state, duplicate-submit protection, inline failure, or saved status.
- Save failure is not caught in the component, so the user has no stable recovery path.
- Delete is immediate with no confirmation or undo.
- Delete has no pending/failure recovery.
- Edit mode silently fills the form; there is no edit banner, cancel action, or discard guard.
- The form always logs `today`, so editing an older row changes data into today's date unless the existing date is preserved or clearly handled.
- Hours slept accepts arbitrary numbers; no clear range validation.
- Rating labels do not explain direction clearly enough: high fatigue/stress/soreness is worse, high recovery is better.
- Sleep quality accepts free text while other ratings are selects; this is flexible but inconsistent.
- Inputs/selects from the shared file use `h-11`, below the 48px target.
- ActionCard More summary is `h-11 w-11`; menu actions are `h-10`.
- The log title `No hours` is awkward when hours are missing.
- No specific empty state for no recovery logs yet.
- The route should remain low-stimulation; no heavy animation or celebratory motion is appropriate.

---

## 5. Recommended workflow map

```txt
Enter Sleep & Recovery
-> Loading / ErrorState / loaded state
-> Recovery status:
   -> average sleep
   -> readiness estimate
   -> data confidence / not enough data
-> Latest log
-> Save/edit form:
   -> clear today/edit mode
   -> validation
   -> pending/saved/failed
   -> cancel/discard edit
-> Recovery log list:
   -> 48px actions
   -> protected delete
```

This is a **tune flow with quiet recovery-state feedback, input validation, and log safety** correction. Do not rebuild the route; harden logging reliability and sensitive-state copy.

---

## 6. Flow decision label

**Tune flow with quiet recovery-state feedback, input validation, and log safety.**

Keep this route calm and direct. Do not make ChatGPT primary.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Readiness is a simple non-medical estimate from saved sleep and recovery ratings.”
- “Not enough recovery data yet.”
- “Saving recovery log…”
- “Recovery log saved.”
- “Save failed. Your recovery draft is still here.”
- “Editing recovery log from [date].”
- “Cancel edit.”
- “Delete this recovery log?”
- “Deleted recovery log. Undo.”
- “Fatigue, soreness, and stress: 1 = low, 5 = high.”
- “Recovery: 1 = poor, 5 = strong.”

Avoid medical certainty. Use cautious fitness language only.

---

## 8. UI structure

Recommended structure:

```txt
1. Recovery status and data confidence
2. Latest log
3. Save/edit form
4. Recent logs
5. Loading/error/retry states
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Loading | Missing. | Add skeleton/status. | P1 |
| Load failure | Toast-only or empty. | Inline ErrorState/retry. | P1 |
| Readiness | Good copy, but no load confidence. | Add data confidence/insufficient-data state. | P1 |
| Save form | No pending/failure/validation. | Add state and validation. | P1 |
| Edit mode | Invisible. | Add edit banner and cancel. | P1 |
| Delete | Immediate. | Confirm/undo. | P1 |
| Controls | Shared `h-11` / `h-10`. | 48px controls. | P1 |
| Empty history | Missing. | Add quiet empty state. | P2 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Save Recovery Log | Form bottom | Correct primary action, no pending/failure. | Add save state and duplicate protection. | P1 |
| Edit log | ActionCard menu | Edit mode invisible. | Edit banner + form focus. | P1 |
| Delete log | ActionCard menu | Immediate destructive. | Confirm/undo + failure recovery. | P1 |
| Retry load | Missing | Failed load looks empty. | Add retry. | P1 |
| Cancel edit | Missing | User cannot exit edit mode clearly. | Add. | P1 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Initial loading | No visible loading. | Empty can flash. | Skeleton/status. | P1 |
| Load failure | Toast-only / `[]`. | Failed == empty. | Inline ErrorState/retry. | P1 |
| Insufficient data | Metrics say Not enough data. | Good base but lacks source confidence. | Explain required inputs. | P2 |
| Save pending | None. | Duplicate save risk. | Pending button and disabled repeated save. | P1 |
| Save failure | Uncaught. | Draft can be confusing. | Inline error and preserve draft. | P1 |
| Save success | List updates. | No clear saved status. | Quiet saved feedback. | P2 |
| Delete pending/failure | None. | Trust risk. | Confirm/undo and restore on failure. | P1 |
| Empty logs | No dedicated state. | Weak first use. | Empty state with first log guidance. | P2 |

---

## 11. Motion and interaction design

Sleep & Recovery should have very restrained motion.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Save log | List updates. | Feedback not tied to form. | Quiet saved state near button. | P2 |
| Edit log | Form silently changes. | Disorienting. | Edit banner/focus; no heavy animation. | P1 |
| Delete log | Row disappears. | Abrupt. | Confirm/undo or pending removal. | P1 |
| Loading | None. | Layout uncertainty. | Skeleton. | P1 |

No celebration, confetti, pulse-heavy widgets, or alarmist color language.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Shared tracker file. | Changes can regress habits, supplements, tasks, PRs. | Scope SleepRecoveryTracker changes carefully. |
| Date handling during edit. | Editing older log may overwrite date as today. | Preserve edited record date or clearly restrict edit to today's log. |
| Recovery data is sensitive. | Avoid medical claims and alarmist copy. | Keep non-medical cautious wording. |
| Service fallback strips fields. | `upsertEnhancedSleepRecoveryLog` may retry without bedtime/wake/stress. | Surface partial save only if feasible; avoid claiming all fields saved if not. |
| Reports use sleep logs. | Delete/save affects weekly reports. | Retest reports after changes. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 10 | 15 | Strong focused route, but state confidence missing. |
| Button size, placement, and hierarchy | 8 | 15 | Save button good; shared inputs/menu actions too small. |
| Spacing consistency and visual rhythm | 8 | 10 | Calm layout, dense form. |
| Feedback, optimistic UI, loading, and errors | 5 | 15 | No skeleton, inline save/delete/error recovery. |
| Motion and interaction quality | 6 | 15 | Quiet enough, but edit/delete transitions weak. |
| Mobile-first behavior and tap comfort | 8 | 10 | Good grid, but 44/40px controls. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Correctly not AI-first; needs delete safety and cautious copy. |
| Premium/subscription readiness | 4 | 10 | Valuable route, but sensitive-state reliability is not ready. |
| **Total** | **57** | **100** | Good base; needs safety, validation, and calm state feedback. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Failed load can look empty. | Skeleton + ErrorState/retry. |
| 48px tap target baseline | Shared inputs/menu actions below target. | Resize controls. |
| High-risk action confirmation | Delete log is immediate. | Confirm/undo. |
| Feedback loop completeness | Save/delete lack pending/failure states. | Add local statuses. |
| Sensitive copy caution | Readiness needs stronger context at route level. | Add non-medical source copy. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add loading skeleton/status for recovery logs. | Codex/Kimi/Human | Open |
| P1 | Add inline ErrorState/retry; failed load must not look empty. | Codex/Kimi/Human | Open |
| P1 | Add save pending, duplicate protection, inline failure, and quiet saved state. | Codex/Kimi/Human | Open |
| P1 | Preserve draft on failed save. | Codex/Kimi/Human | Open |
| P1 | Add visible edit mode banner plus Cancel/Discard. | Codex/Kimi/Human | Open |
| P1 | Preserve edited record date or clearly restrict edit behavior. | Codex/Kimi/Human | Open |
| P1 | Add delete confirmation or undo with failure recovery. | Codex/Kimi/Human | Open |
| P1 | Add validation for hours slept and rating ranges. | Codex/Kimi/Human | Open |
| P1 | Resize inputs/selects and menu actions to 48px. | Codex/Kimi/Human | Open |
| P2 | Add empty recovery log state. | Codex/Kimi/Human | Open |
| P2 | Strengthen non-medical readiness/source copy. | Codex/Kimi/Human | Open |
| P2 | Improve log title when hours are missing. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/sleep-recovery` shows skeleton/status while loading.
- [ ] Failed load shows retry and does not look like no recovery logs.
- [ ] Save has pending, saved, and failed states.
- [ ] Failed save preserves draft.
- [ ] Hours slept and rating inputs validate reasonable values.
- [ ] Edit mode is visible and Cancel/Discard works.
- [ ] Editing an old recovery log does not silently change its date unless explicitly intended.
- [ ] Delete requires confirmation or undo and recovers on failure.
- [ ] Inputs/selects/menu actions are 48px on 390x844.
- [ ] Readiness copy remains non-medical and based on saved data only.
- [ ] Weekly reports still read sleep average correctly.
- [ ] No schema, auth, AI import/apply behavior, global theme, or unrelated tracker regressions.

---

## 17. Codex prompt section

Use this route with sensitive recovery-data reliability and shared-component regression review.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + sensitive recovery-data reviewer + shared-component regression reviewer
```

Implementation should not change database schema, auth behavior, AI import/apply behavior, global theme, or unrelated wellness tracker behavior.

---

## 18. Implementation note

Do not rebuild Sleep & Recovery. Preserve the current capability set:

```txt
Average sleep/readiness -> latest log -> recovery form -> recent logs
```

The highest-value correction is sensitive-state reliability:

```txt
Load confidence -> validated save/edit -> protected delete -> cautious readiness copy -> 48px controls
```
