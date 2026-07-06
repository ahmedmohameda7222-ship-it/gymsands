# Route Audit: `/settings/preferences`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 62 / 100  
**Flow decision:** Tune flow with settings-state hardening

---

## Files inspected

- `app/(private)/settings/preferences/page.tsx`
- `components/settings/settings-toggle-row.tsx`
- `components/settings/settings-page-shell.tsx`
- `components/ui/select-field.tsx`
- `lib/settings/user-settings-context.tsx`
- `services/database/user-settings.ts`
- `lib/themes.ts`

---

## 1. Product role

`/settings/preferences` should be Plaivra's app-behavior and personalization control route.

The route should answer:

```txt
How does Plaivra look?
Which language and units does the app use?
What should open by default?
Which quick-log shortcuts should be visible?
Should the app reduce animations, use compact mode, or use larger text?
Did each preference save, fail, or roll back?
```

This route is not AI-first and not a data-entry route. It is a preference-control route. Its main UX requirement is reliability: every setting change should make it obvious whether the change is pending, saved, failed, or restored.

The current route has useful coverage: theme, language, units, calendar, dashboard start page, quick-log shortcuts, and accessibility settings. The main problem is not feature coverage. The problem is save-state clarity and mobile control quality. The page relies on the shared optimistic settings provider, but does not surface save errors inline, does not show per-control pending state, uses 40px native selects, and has motion effects even around reduced-animation preferences.

---

## 2. AI-first vs manual-entry role

Preferences is a system-control route.

Expected hierarchy:

```txt
1. Appearance and language
2. Units and calendar behavior
3. Dashboard/start behavior
4. Quick Log shortcuts
5. Accessibility preferences
6. Save/error/degraded state visible across all sections
```

Current hierarchy:

```txt
1. Appearance / theme picker
2. Language
3. Units
4. Calendar
5. Dashboard
6. Quick Log
7. Accessibility
8. Global saved/synced text
```

The hierarchy is mostly correct. The improvement is to make the state layer visible: loading, saving, failed save/rollback, saved sync, and local cache behavior should not rely on toasts or hidden provider state.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| I want to change theme | Show selected theme, save pending/success/failure, rollback if needed. |
| I want to change language | Save visibly and avoid cramped select controls. |
| I want to change units | Show each select comfortably on mobile and confirm saved state. |
| I want to choose Quick Log shortcuts | Make each toggle state reliable and not race during save. |
| I want less motion | The page itself should respect reduced motion or avoid decorative motion. |
| I want larger text | Explain effect and save status. |
| Settings failed to load | Show degraded/default state clearly, not just plain loading/toast. |
| Save failed | Show inline failure and previous value restored. |

---

## 4. Current workflow map

```txt
Enter /settings/preferences
-> if settings loading: plain loading text
-> Appearance card:
   -> collapsed selected theme row
   -> optional ThemePicker grid
-> Language card:
   -> native select
-> Units card:
   -> six native selects
-> Calendar card:
   -> week starts on select
-> Dashboard card:
   -> default start page select
-> Quick Log card:
   -> eight toggle rows
-> Accessibility card:
   -> compact mode, reduce animations, large text toggles
-> SaveStatus global synced/saved text
```

Strong points:

- The page covers the major settings a user expects.
- Theme picker has clear selected state and palette preview.
- Quick Log and accessibility settings are grouped correctly.
- `SettingsToggleRow` uses a large row surface with `min-h-[56px]`.
- The shared settings provider already performs optimistic updates and rollback on failure.
- Theme and language are cached for quick local paint behavior.
- The route avoids destructive account/privacy actions, which is correct.

Main workflow issues:

- The page does not use `saveError`, even though the provider exposes it.
- `updatePreference` awaits `updateSettings` but has no local try/catch or inline failure state.
- A failed preference save relies on provider toast and rollback only; the page does not explain which setting failed.
- No per-control pending state, so rapid changes can race or feel untrustworthy.
- Native select height is `h-10`, below the 48px target.
- Select rows force label and select into one row, which can be cramped on narrow mobile screens.
- Icons use `h-10 w-10`, below the 48px comfort baseline.
- Loading state is plain text, not a route skeleton/degraded state.
- Theme picker uses hover translate and transitions even though the route controls reduced animations.
- Accessibility settings do not preview or clarify when they take effect.
- Quick Log toggles have no descriptions; users may not know where shortcuts appear.
- SaveStatus is generic and detached from the changed control.

---

## 5. Recommended workflow map

```txt
Enter /settings/preferences
-> Preferences status card:
   -> loaded / saving / saved / failed / degraded
-> Appearance & language
-> Units & calendar
-> Dashboard behavior
-> Quick Log shortcuts
-> Accessibility
-> Inline save result near the affected control plus global fallback error
```

This is a **tune flow with settings-state hardening** correction. Keep the route structure and sections, but improve save confidence, mobile control comfort, and reduced-motion compliance.

---

## 6. Flow decision label

**Tune flow with settings-state hardening.**

The route is useful and does not need a redesign. It needs reliable inline state handling, comfortable controls, and clearer accessibility behavior.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Changes save automatically to your Plaivra account.”
- “If saving fails, Plaivra restores your previous setting.”
- “Quick Log shortcuts control the mobile quick-log menu only.”
- “Reduce animations limits non-essential motion across Plaivra.”
- “Large text mode increases readable UI text where supported.”
- “Theme and language may update immediately on this device and sync to your account.”
- “Settings could not load. Plaivra is showing cached/default preferences.”

Avoid over-explaining every unit. Keep descriptions short and action-oriented.

---

## 8. UI structure

Recommended structure:

```txt
1. Preference save/sync status
2. Appearance and language
3. Units and calendar
4. Dashboard start behavior
5. Quick Log shortcuts
6. Accessibility
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Loading state | Plain text. | Skeleton or ErrorState/degraded state. | P2 |
| SaveStatus | Detached and generic. | Add global save state plus affected-control feedback. | P1 |
| Select rows | Label/select forced side-by-side. | Stack on mobile or use 48px select controls. | P1 |
| Theme picker | Good but can feel heavy. | Keep; add saving/failure state and reduced-motion-safe transitions. | P2 |
| Quick Log toggles | No descriptions. | Add short descriptions or helper copy. | P2 |
| Accessibility toggles | Good group, but route itself uses decorative motion. | Respect reduced-motion preference. | P1 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Theme picker open | Appearance card | Large row, good. | Keep; ensure 48px and reduced-motion safe. | P2 |
| Theme select | Theme grid | Good large cards, but no pending/failure. | Add pending/saved/failed state. | P1 |
| Native selects | Language/units/calendar/dashboard | `h-10`, below 48px. | Use 48px select height. | P1 |
| Quick Log toggles | Quick Log card | Large row; no pending/failure/descriptions. | Keep row, add state/descriptions. | P1 |
| Accessibility toggles | Accessibility card | Good row size; state not explicit. | Add pending/failure and respect reduceAnimations. | P1 |
| Back button | Shared shell | Existing shared shell uses `size=sm`. | Covered by settings hub correction; note here. | P1 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Settings loading | Plain text. | Low confidence. | Add skeleton or route loading card. | P2 |
| Settings load failure | Provider toast + default/cached fallback. | Page can look confidently loaded. | Surface degraded state using `saveError`/provider state. | P1 |
| Select save pending | No per-control state. | User can change several controls without knowing saves. | Add affected-key pending state or global saving banner. | P1 |
| Select save failure | Provider rollback + toast only. | Failure can be missed. | Inline failure with restored previous value copy. | P1 |
| Toggle save pending | No row pending state. | Rapid toggles can confuse. | Disable affected row/global save or show pending. | P1 |
| Theme save pending | No state. | Selected card may look final before save. | Pending/saved/failed feedback. | P1 |
| Save success | Generic footer text. | Detached from action. | Add concise recently-saved row/global timestamp. | P2 |
| Reduce animations | Saves like any toggle. | Page still has hover translate/transition. | Respect reduced motion in this route. | P1 |

---

## 11. Motion and interaction design

Preferences should demonstrate Plaivra's motion discipline because it includes the reduced-animation setting.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Theme card hover | `hover:-translate-y-0.5` and transitions. | Conflicts with reduced-motion route role. | Remove decorative translation or gate with reduced-motion. | P1 |
| Theme picker open | Instant render. | Acceptable, but could jump. | Reduced-motion-safe reveal. | P2 |
| Select changes | Instant optimistic update. | Good, but state unclear. | Pending/saved/rollback feedback. | P1 |
| Toggle changes | Instant optimistic update. | Good, but state unclear. | Pending/saved/rollback feedback. | P1 |
| Accessibility changes | Same as normal. | Reduce animation should affect this page immediately where possible. | Avoid non-essential motion. | P1 |

No decorative settings animations. Use only state clarity and simple reveal/collapse.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| User settings provider is shared globally. | Broad provider changes can affect many routes. | Prefer page-level display of existing `saveError` and small prop additions. |
| Optimistic rollback already exists. | Rewriting can introduce regressions. | Reuse rollback; expose visible page feedback. |
| Theme/language are cached locally. | Failed saves may still change local paint cache. | Make rollback/failed state explicit and confirm cache restoration where practical. |
| Reduced animation preference affects app-wide behavior. | This route should not demonstrate unwanted motion. | Remove/gate decorative hover transforms. |
| Many selects can cause rapid writes. | Repeated autosaves can race. | Add pending/disable behavior or debounce per-control where safe. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 10 | 15 | Correct settings coverage, but missing save-state hierarchy. |
| Button size, placement, and hierarchy | 8 | 15 | Toggle rows are good; native selects and icon/back targets need 48px cleanup. |
| Spacing consistency and visual rhythm | 8 | 10 | Sections are readable, but select rows can crowd on mobile. |
| Feedback, optimistic UI, loading, and errors | 5 | 15 | Provider has rollback, but page hides failure/pending states. |
| Motion and interaction quality | 5 | 15 | Theme hover motion conflicts with reduced-animation control role. |
| Mobile-first behavior and tap comfort | 8 | 10 | Mostly usable, but selects need larger/stacked mobile controls. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Low-risk route, but accessibility/reduced-motion trust matters. |
| Premium/subscription readiness | 10 | 10 | Good breadth; premium readiness blocked by state clarity rather than features. |
| **Total** | **62** | **100** | Functional and broad, but not trust-grade until save/pending/error states are visible. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Page does not surface provider `saveError` inline. | Add degraded/error state and rollback feedback. |
| 48px tap target baseline | Native select default is `h-10`; icons/back also below comfort. | Use 48px controls. |
| Motion should clarify state | Theme cards use decorative hover translation. | Remove/gate decorative motion. |
| Feedback loop completeness | Saves are optimistic but page does not show pending/failure by control. | Add pending/saved/error feedback. |
| Accessibility consistency | Route controls reduced animation but includes avoidable motion. | Respect reduced-motion immediately where feasible. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Surface settings load/save error inline using existing provider `saveError`. | Codex/Kimi/Human | Open |
| P1 | Add pending/saved/failed state for preference updates. | Codex/Kimi/Human | Open |
| P1 | Prevent confusing rapid repeated changes while a setting save is pending. | Codex/Kimi/Human | Open |
| P1 | Resize native select controls to 48px effective height. | Codex/Kimi/Human | Open |
| P1 | Stack select rows on narrow mobile when needed. | Codex/Kimi/Human | Open |
| P1 | Remove or gate decorative theme-card hover translation for reduced-motion safety. | Codex/Kimi/Human | Open |
| P1 | Make reduceAnimations preference visibly respected by this route. | Codex/Kimi/Human | Open |
| P2 | Replace plain loading text with skeleton/degraded state. | Codex/Kimi/Human | Open |
| P2 | Add short descriptions/help copy for Quick Log shortcuts. | Codex/Kimi/Human | Open |
| P2 | Add clearer save/sync copy near recently changed controls. | Codex/Kimi/Human | Open |
| P2 | Resize icon containers and shared back controls to 48px where relevant. | Codex/Kimi/Human | Open |
| P3 | Optional: add section-level summary/status chips for Appearance, Units, Quick Log, Accessibility. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/settings/preferences` shows a proper loading skeleton or degraded state.
- [ ] Load/save errors are visible inline, not only via toast.
- [ ] Failed setting save rolls back and explains that previous value was restored.
- [ ] Each select is 48px effective height.
- [ ] Select rows stack cleanly on 390x844 mobile.
- [ ] Theme picker cards remain usable and reduced-motion-safe.
- [ ] The Reduce animations setting removes/gates non-essential route motion where feasible.
- [ ] Quick Log toggles have clearer helper copy.
- [ ] Rapid repeated changes do not create confusing state.
- [ ] Save/sync state is visible and specific enough to trust.
- [ ] No database schema, auth, global settings semantics, or unrelated routes are changed.

---

## 17. Codex prompt section

Use this route with standard settings-state review. It is not a high-risk data route, but it controls accessibility and global app behavior.

```txt
/caveman lite

$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + settings-state reliability reviewer + accessibility UX reviewer
```

Implementation should not change database schema, auth, user settings semantics, theme definitions, global theme architecture, or unrelated routes.

---

## 18. Implementation note

Do not rebuild the route from scratch. Preserve the current route model:

```txt
Theme
Language
Units
Calendar
Dashboard start page
Quick Log shortcuts
Accessibility
```

The high-value correction is preference-save confidence:

```txt
Loaded preferences -> comfortable controls -> clear pending/save/failure -> reduced-motion-safe UI
```

This page should feel calm, predictable, and recoverable.