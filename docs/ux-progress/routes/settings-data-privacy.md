# Route Audit: `/settings/data-privacy`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 61 / 100  
**Flow decision:** Tune flow with privacy-action hardening

---

## Files inspected

- `app/(private)/settings/data-privacy/page.tsx`
- `components/settings/settings-toggle-row.tsx`
- `components/settings/settings-page-shell.tsx`
- `lib/settings/user-settings-context.tsx`
- `services/database/user-settings.ts`
- `app/api/user/data-export/route.ts`
- `lib/privacy/data-export.ts`

---

## 1. Product role

`/settings/data-privacy` should be Plaivra's privacy visibility, export, and safe-settings control route.

The route should answer:

```txt
What sensitive data can I hide in the app?
Did my privacy setting save or fail?
Can I export my Plaivra data safely?
What exactly does export include?
What does reset settings do, and what does it not delete?
Where do I review privacy/terms and contact the operator?
```

This route is not AI-first and not a data-entry route. It is a privacy/trust route. The main UX requirement is confidence: privacy toggles, export, and reset must show clear pending, success, failure, and confirmation states.

The current route has good primitives: privacy toggles, legal/contact links, CSV export, settings reset, loading state, and a shared settings shell. The main problem is that several sensitive actions rely on optimistic updates/toasts without enough inline recovery. Reset settings has no confirmation, export errors are toast-only, and the route does not clearly explain what export includes or what privacy toggles hide versus delete.

---

## 2. AI-first vs manual-entry role

Data privacy is a trust-control route.

Expected hierarchy:

```txt
1. Privacy status summary
2. Visibility toggles with saved/failed state
3. Export data with clear scope and pending/error/success
4. Legal/contact links
5. Reset settings with explicit confirmation
6. Clear distinction: hide/display settings vs delete/export/account requests
```

Current hierarchy:

```txt
1. SettingsPageShell heading
2. Privacy card:
   -> privacy helper row
   -> five visibility toggles
   -> saved text after any save
3. Privacy information/contact card
4. Safe actions card:
   -> Export CSV
   -> Reset settings
```

The structure is reasonable, but risk and feedback hierarchy needs improvement. Export and reset should not feel like normal row actions. The user must know export is private, CSV contains broad account data, reset only resets app settings, and toggles hide UI surfaces but do not delete saved data.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| I want to hide weight/calories/photos/profile details | Toggle should update optimistically, then show saved or rollback/error inline. |
| I want private profile mode | Explain what it hides and what it does not delete. |
| I want to export my data | Explain export scope, pending, success, failure, and file format. |
| Export failed | Keep a visible failure state and retry option, not only a toast. |
| I want to reset settings | Require confirmation and explain that data/logs are not deleted. |
| Settings failed to load | Show an ErrorState/degraded state, not just loading text/toast from provider. |
| I want deletion/account rights | Link clearly to account deletion/privacy contact route, not only legal pages. |

---

## 4. Current workflow map

```txt
Enter /settings/data-privacy
-> if settings loading: text loading state
-> Privacy card:
   -> static helper row
   -> SettingsToggleRow for hide body weight
   -> SettingsToggleRow for hide calories
   -> SettingsToggleRow for hide progress photos
   -> SettingsToggleRow for hide profile details
   -> SettingsToggleRow for private profile mode
   -> saved text if any setting was saved
-> Privacy information/contact card:
   -> Privacy Policy
   -> Terms
   -> Contact Ahmed Mohamed
-> Safe actions card:
   -> Export Plaivra Data -> GET /api/user/data-export -> CSV download
   -> Reset Settings -> resetSettings immediately
```

Strong points:

- The route exists and is easy to scan.
- It uses the shared SettingsPageShell.
- The toggle rows are large row buttons with `min-h-[56px]`.
- The settings context already performs optimistic updates and rollback on failed saves.
- The provider exposes `saveError`, which can support inline failures.
- Data export endpoint is authenticated, rate-limited, no-store, CSV, and uses a private current-user export builder.
- Export includes broad user-owned Plaivra data and warnings for skipped tables.
- The route no longer exposes full data export/deletion request buttons in a casual way.

Main workflow issues:

- The page does not surface `saveError` inline even though the provider exposes it.
- `updateSetting` awaits `updateSettings` without local try/catch; failures rely on provider toast and rollback only.
- Toggle labels lack descriptions, so users may not know what each privacy option hides.
- Save feedback says only saved to account; it does not say which setting saved.
- `SettingsToggleRow` has no pending/disabled state per toggle, so repeated toggles during save can be confusing.
- Loading state is plain text, not a privacy-route skeleton or ErrorState.
- Reset settings has no confirmation despite being a broad action.
- Reset settings copy is not specific enough about what it resets and what it does not delete.
- Export success/failure is toast-only; no inline export status/history.
- Export copy says CSV but does not explain that it is a broad, flattened private export and may include warnings/metadata.
- Safe actions rows can be cramped on mobile because text and button are forced into one row.
- Icon containers are `h-10 w-10`, below the 48px comfort baseline.
- Legal/contact links are present but not grouped as rights/help actions.

---

## 5. Recommended workflow map

```txt
Enter /settings/data-privacy
-> Privacy status / explanation card:
   -> Visibility settings hide app surfaces; they do not delete saved data
-> Visibility controls:
   -> each row has label + description + pending/saved/error behavior
   -> inline save error / rollback notice
-> Export data card:
   -> scope summary
   -> Export CSV button
   -> pending/success/error retry state
-> Rights/help card:
   -> Privacy Policy, Terms, contact, account deletion/account settings link
-> Reset settings card:
   -> clearly separate from export
   -> confirmation dialog
   -> pending/success/error state
```

This is a **tune flow with privacy-action hardening** correction. Keep the route lightweight, but make privacy action states honest and serious.

---

## 6. Flow decision label

**Tune flow with privacy-action hardening.**

The route should keep the existing basic sections, but improve action confidence, confirmation, inline failure states, and microcopy.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “These settings hide information in Plaivra UI. They do not delete saved data.”
- “Hide body weight on dashboard and summary cards.”
- “Hide calories on dashboard and nutrition summaries.”
- “Hide progress photos from the Progress route.”
- “Private profile mode hides identifying profile details on shared screens.”
- “Export CSV includes account, app settings, AI permissions, workouts, nutrition, hydration, progress, wellness, and redacted ChatGPT activity where available.”
- “Reset settings restores display/privacy/preferences defaults. It does not delete logs, plans, meals, photos, or your account.”
- “Export failed. No file was downloaded.”
- “Settings save failed. Your previous setting was restored.”

Avoid implying privacy toggles remove data from the database. They hide display surfaces only.

---

## 8. UI structure

Recommended structure:

```txt
1. Privacy explanation/status
2. Visibility toggles
3. Export data
4. Rights and contact
5. Reset settings
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Privacy helper row | Generic. | Explain hide vs delete. | P1 |
| Toggle rows | No descriptions/pending/error. | Add descriptions and inline save state. | P1 |
| Export row | Single row can be cramped; feedback toast-only. | Use dedicated export card/status. | P1 |
| Reset settings | No confirmation. | Separate into serious action with app confirm. | P1 |
| Legal/contact | Good links, weak rights framing. | Group as rights/help and add account deletion/account link. | P2 |
| Loading state | Plain text. | Skeleton or ErrorState/degraded state. | P2 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Privacy toggles | Full row buttons | Good size, but no pending/error state. | Keep row button; add pending/error/saved state. | P1 |
| Export CSV | Safe actions row | Button is okay, but status is toast-only. | Add inline pending/success/error and retry. | P1 |
| Reset settings | Same safe actions card | Broad action, no confirmation. | Move/separate or visually mark; require app confirm. | P1 |
| Privacy Policy / Terms / Contact | Info card | Buttons likely 40px+ but not guaranteed; mobile wraps. | Ensure 48px targets. | P2 |
| Back button | Shared shell | Existing shell uses `size=sm`. | Covered by settings hub correction; keep note here. | P1 |
| Icon buttons/containers | Row visuals use `h-10 w-10`. | Below comfort baseline. | Resize to 48px where interactive/visual target matters. | P2 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Settings loading | Plain text. | Not premium and no route context. | Add skeleton/degraded state. | P2 |
| Settings load failure | Provider toast + default settings. | Page can show defaults as if real unless error surfaced. | Surface `saveError`/load error inline. | P1 |
| Toggle save pending | Provider global `isSavingSettings`; row still tappable. | Repeated toggles can race/confuse. | Disable or show pending for affected row/global save. | P1 |
| Toggle save failure | Provider rollback + toast. | User may miss failure. | Inline failure: previous setting restored. | P1 |
| Toggle save success | Generic saved text. | Does not identify what saved. | Show recently saved row or timestamp. | P2 |
| Export pending | Button text “Preparing…”. | Good baseline. | Keep; add card status. | P2 |
| Export failure | Toast only. | User may miss no file downloaded. | Inline export error/retry. | P1 |
| Export success | Toast only. | Acceptable, but privacy-sensitive. | Inline “Downloaded on this device” status. | P2 |
| Reset pending | Button disabled. | Good baseline. | Keep with confirmation/status. | P1 |
| Reset failure | Provider toast only. | User may miss failure. | Inline failure/status. | P1 |
| Reset success | Toast + saved text. | Needs explicit “settings only” copy. | Inline success that clarifies no data deleted. | P1 |

---

## 11. Motion and interaction design

Privacy route motion should be minimal and serious.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Toggle saved | Toggle moves immediately. | Optimistic but no visible save/rollback status. | Pending/saved/rollback state; reduced-motion-safe. | P1 |
| Export | Button text changes. | Good start. | Add static status, no fancy progress. | P2 |
| Reset | Immediate reset. | No confirmation. | App confirm + pending/success/failure state. | P1 |
| Loading | Plain text. | Low quality. | Skeleton/card placeholder. | P2 |

No celebratory motion for privacy actions. Avoid animated shields or playful data-export effects.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Privacy toggles are display controls, not deletion. | User may misunderstand privacy guarantees. | Add explicit hide-vs-delete copy. |
| Provider falls back to defaults on load failure. | Defaults can look like true settings. | Surface load/degraded state in the page. |
| Optimistic toggles can fail. | User may think privacy setting changed when it rolled back. | Inline save failure and restored previous setting copy. |
| Export includes sensitive broad data. | CSV may be stored on device. | Add scope and local-file warning. |
| Reset settings affects multiple app settings. | Broad action should not happen accidentally. | Confirmation dialog and explicit “does not delete data.” |
| Data export endpoint is server-authenticated. | Do not change semantics during UI audit. | Keep API behavior; only improve UI states unless a small bug is found. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 9 | 15 | Correct route purpose, but export/reset/privacy explanation hierarchy is weak. |
| Button size, placement, and hierarchy | 9 | 15 | Toggle rows are large; reset/export/back/icon/action controls need comfort and hierarchy cleanup. |
| Spacing consistency and visual rhythm | 8 | 10 | Simple and readable; safe actions rows can be cramped on mobile. |
| Feedback, optimistic UI, loading, and errors | 5 | 15 | Provider has rollback, but page hides most inline failure/status states. |
| Motion and interaction quality | 5 | 15 | Basic optimistic toggle motion only; missing rollback/save/reset/export state clarity. |
| Mobile-first behavior and tap comfort | 8 | 10 | Mostly workable; row actions need better stacking and 48px consistency. |
| AI safety, privacy, and high-risk action control | 9 | 10 | Privacy controls and export exist; reset confirmation and explicit hide-vs-delete copy missing. |
| Premium/subscription readiness | 8 | 10 | Useful route, but not trust-grade until states are explicit. |
| **Total** | **61** | **100** | Lightweight and functional, but privacy actions need stronger state and confirmation handling. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Settings load/save/export/reset errors are mostly toast-only or hidden. | Add inline states and retry. |
| High-risk action confirmation | Reset settings runs immediately. | Add app confirmation. |
| Trust-sensitive microcopy | Privacy toggles do not explain hide vs delete. | Add explicit copy. |
| 48px tap target baseline | Shared back button, small icon containers, and some links/actions need audit. | Resize/stack controls. |
| Feedback loop completeness | Toggle rollback exists in provider, but not clearly visible on page. | Surface rollback/failure state. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Surface settings load/save error inline using existing `saveError` and a degraded state. | Codex/Kimi/Human | Open |
| P1 | Add pending/saved/failed state for privacy toggles; prevent confusing rapid toggles during save. | Codex/Kimi/Human | Open |
| P1 | Add descriptions to each privacy toggle explaining what it hides. | Codex/Kimi/Human | Open |
| P1 | Add clear hide-vs-delete privacy explanation. | Codex/Kimi/Human | Open |
| P1 | Add inline export success/failure/retry state, not only toast. | Codex/Kimi/Human | Open |
| P1 | Add export scope summary and local-file privacy warning. | Codex/Kimi/Human | Open |
| P1 | Require app confirmation before reset settings. | Codex/Kimi/Human | Open |
| P1 | Add reset pending/success/failure state that clarifies no logs/plans/account data were deleted. | Codex/Kimi/Human | Open |
| P2 | Improve loading skeleton instead of plain text. | Codex/Kimi/Human | Open |
| P2 | Stack export/reset rows on mobile so text and button do not crowd. | Codex/Kimi/Human | Open |
| P2 | Ensure legal/contact/export/reset/back controls are 48px effective targets. | Codex/Kimi/Human | Open |
| P2 | Add account deletion/account settings link under rights/help if appropriate. | Codex/Kimi/Human | Open |
| P3 | Optional: show last export/download timestamp for current session only. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/settings/data-privacy` clearly explains that privacy toggles hide UI surfaces and do not delete saved data.
- [ ] Every privacy toggle has a short description.
- [ ] Toggle save pending/success/failure states are visible.
- [ ] Failed toggle save rolls back and tells the user previous setting was restored.
- [ ] Settings load failure is visible as degraded/unknown state, not confident defaults.
- [ ] Export card explains CSV scope and local-file privacy.
- [ ] Export pending/success/failure/retry states are visible inline.
- [ ] Reset settings requires app confirmation.
- [ ] Reset success/failure is visible inline and clarifies no Plaivra logs/plans/account data were deleted.
- [ ] Export/reset rows stack cleanly on 390x844 mobile.
- [ ] Legal/contact/help actions meet 48px target.
- [ ] No API semantics, data export contents, schema, auth, or unrelated routes are changed.

---

## 17. Codex prompt section

Use this route with privacy/data-state review. It is smaller than AI imports, but it controls sensitive display settings and user export.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + privacy UX reviewer + settings data-state reliability reviewer
```

Implementation should not change data export API semantics, export table selection, auth behavior, database schema, account deletion behavior, global theme, or unrelated routes.

---

## 18. Implementation note

Do not rebuild the route from scratch. Preserve the existing route model:

```txt
Privacy toggles
Legal/contact links
Export CSV
Reset settings
```

The high-value correction is privacy-action confidence:

```txt
Clear privacy meaning -> reliable toggle saves -> explicit export status -> confirmed reset settings
```

This page should feel serious, clear, and recoverable. It should not rely on toasts for privacy-critical outcomes.