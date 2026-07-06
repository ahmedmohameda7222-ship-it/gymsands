# Route Audit: `/settings`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 64 / 100  
**Flow decision:** Tune flow

---

## Files inspected

- `app/(private)/settings/page.tsx`
- `components/settings/profile-summary-card.tsx`
- `components/settings/setup-progress-card.tsx`
- `components/settings/settings-hub-card.tsx`
- `components/settings/settings-page-shell.tsx`
- `components/settings/settings-section-card.tsx`
- `app/(private)/settings/account/page.tsx`
- `services/database/profile.ts`
- `services/database/nutrition.ts`
- `services/database/workout-plans.ts`

---

## 1. Product role

`/settings` should be the control center for account, setup, preferences, AI access, privacy, reminders, and coaching context.

The route should answer:

```txt
Is my Plaivra setup complete?
What setting should I fix next?
Where do I manage account, AI access, preferences, privacy, and reminders?
Which areas are sensitive or require extra care?
```

This route is not an AI-first import route. It is a navigation and trust-control hub. It should make account/data/AI/privacy sections clear, safe, and easy to reach.

The current route has a strong base: profile summary, setup progress, and category cards. The problem is not structure. The problem is state clarity and hierarchy quality: setup load failure is silently logged, some setup items can show false incomplete/complete states, small buttons miss the 48px standard, and sensitive settings are mixed with normal settings without enough visual separation.

---

## 2. AI-first vs manual-entry role

Settings is a trust/control route, not a data-entry route.

Expected hierarchy:

```txt
1. Profile/account summary
2. Setup completion / next setup action
3. Critical trust controls: AI imports, privacy, coaching context
4. Normal preferences: reminders, display/preferences
5. Account/session controls
6. Subroute navigation with safe back behavior
```

Current hierarchy:

```txt
1. Page heading
2. Profile summary
3. Setup progress if incomplete
4. Category list:
   - Account
   - Reminders
   - AI Imports
   - Preferences
   - Coaching context
   - Data privacy
```

This is mostly correct, but the route does not visually distinguish normal settings from trust-sensitive controls. AI imports, coaching context, and data privacy need stronger status/trust framing because they affect user data, permissions, and future ChatGPT request context.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| I want to finish setup | Show one next setup action with reliable status. |
| I want to manage account/profile | Make profile/account entry obvious and safe. |
| I want to control ChatGPT access | AI Imports should be clearly labeled as permissions/access, not just another card. |
| I want to manage privacy/data | Data Privacy should be visibly sensitive and not buried. |
| I want to change preferences/reminders | Normal settings should be easy to find but visually calmer. |
| I want to know whether data loaded | Show loading/degraded state instead of silently wrong setup status. |
| I want to leave the app safely | Account/session controls should have comfortable, explicit actions on subroutes. |

---

## 4. Current workflow map

```txt
Enter /settings
-> PageHeading
-> load onboarding, targets, plan, meal plan items, food logs
-> ProfileSummaryCard
-> if setup incomplete and not loading: SetupProgressCard
-> SettingsHubCard list:
   -> Account
   -> Reminders
   -> AI Imports
   -> Preferences
   -> Coaching context
   -> Data Privacy
-> mobile spacer
```

Strong points:

- The route is simple and easy to scan.
- Profile summary respects private profile mode and hides profile details.
- Setup progress has a next item and progress count.
- Settings hub cards have large row surfaces and direct navigation.
- The route includes important trust surfaces: AI imports, coaching context, and data privacy.
- Subroutes use a shared settings shell with a back button, which supports orientation.

Main workflow issues:

- Setup status load failure is only logged with `console.warn`; no visible degraded state.
- If setup data fails to load, the checklist can be hidden or inaccurate.
- Setup progress uses small `size=sm` action buttons and a small native details summary.
- Profile edit icon button is `h-10 w-10` and hidden on mobile; lower actions are present but may not be enough for one-handed use.
- Hub cards are all visually equal; trust-sensitive cards need stronger grouping or labels.
- There is no search/filter or “most important settings” grouping, so the page may grow poorly as settings expand.
- Category descriptions are useful but not status-aware. For example, AI imports does not show whether access is enabled, and privacy does not show if private modes are active.
- Subroute back button uses `size=sm`, below 48px effective target.
- Account settings uses browser `window.confirm` for account deletion request instead of the app confirmation pattern.

---

## 5. Recommended workflow map

```txt
Enter /settings
-> Profile/account summary
-> Setup status card:
   -> skeleton while loading
   -> one next setup action
   -> visible degraded state if setup status fails
-> Trust & data controls group:
   -> AI Imports / permissions
   -> Data Privacy
   -> Coaching Context
-> Preferences group:
   -> Preferences
   -> Reminders
-> Account group:
   -> Account/session
-> Each hub card shows status where useful
```

This is a **tune flow** correction. The route should not be redesigned from scratch; it needs state, grouping, and touch-target improvements.

---

## 6. Flow decision label

**Tune flow.**

The main objects are correct. The correction is to make settings more trustworthy: visible setup loading/degraded states, clearer grouping of sensitive controls, better 48px tap comfort, and safer account/session patterns on connected subroutes.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Some setup status could not load. Your saved data was not changed.”
- “AI access controls what context Plaivra prepares for ChatGPT requests.”
- “Privacy controls affect what is shown on this device and what data can be exported.”
- “Coaching context helps personalize prepared requests; it does not change plans automatically.”
- “Account actions affect sign-in and account-level requests.”
- “Setup complete” state if all setup items are done.

Avoid making settings feel like a generic app menu. It should feel like a control center.

---

## 8. UI structure

Recommended structure:

```txt
1. Profile summary
2. Setup progress / next action / degraded state
3. Trust & data controls
4. Preferences and reminders
5. Account/session
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Setup progress | Hidden while loading and silent on failure. | Add skeleton/degraded state with retry. | P1 |
| Category cards | All equal despite different risk/trust levels. | Group into Trust & data, Preferences, Account. | P1 |
| AI Imports card | No permission/access status. | Add status badge or detail if available. | P2 |
| Data Privacy card | No private/export status. | Add status badge or stronger trust label. | P2 |
| Coaching context card | Important for ChatGPT context but looks like normal setting. | Label as context source and clarify no automatic changes. | P2 |
| Account subroute | Uses browser confirm. | Use app confirmation dialog pattern. | P1 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Setup next action | Setup card | `size=sm`, below comfort target. | Make 48px effective target. | P1 |
| Setup show all | Native details summary, tiny text/icon. | Hard to tap and weak affordance. | Make 48px expandable control. | P1 |
| Setup item action | Inside details | `size=sm`, dense. | 48px target, clear row action. | P1 |
| Profile edit icon | Desktop only, `h-10 w-10`. | Below 48px and hidden on mobile. | Resize; rely on visible mobile profile buttons. | P2 |
| Hub cards | Large rows. | Good baseline. | Keep; add grouping/status. | P2 |
| Subroute back | Shared shell uses `size=sm`. | Below 48px. | Resize to 48px. | P1 |
| Sign out | Account subroute `size=sm`. | High-impact action, small. | 48px and clearer pending/failure if async. | P1 |
| Request deletion | Button exists but browser confirm. | Inconsistent trust pattern. | App confirm dialog and clearer status. | P1 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Auth/profile loading | ProfileSummaryCard skeleton. | Good baseline. | Keep. | P3 |
| Setup status loading | Setup card hidden. | User cannot tell status is loading. | Add setup skeleton or loading row. | P1 |
| Setup load failure | `console.warn` only. | Checklist can be missing/inaccurate. | Inline degraded state with retry. | P1 |
| Setup complete | Card disappears. | Good, but may feel like nothing happened. | Optional compact “setup complete” status. | P3 |
| Hub card status | Static cards only. | No quick status for AI/privacy/preferences. | Add badges where reliable. | P2 |
| Account deletion request pending | Button text changes. | Good baseline. | Keep but add app confirm and inline status. | P1 |
| Account deletion request failure | Toast only. | Sensitive request failure can be missed. | Add inline failure/status. | P2 |

---

## 11. Motion and interaction design

Settings should use minimal motion. It should feel stable.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Setup load | Card appears/disappears. | Can feel jumpy. | Skeleton to loaded/degraded transition. | P1 |
| Expand setup checklist | Native details abrupt. | Acceptable but weak. | Reduced-motion-safe reveal. | P2 |
| Hub card press | Hover transition only. | Good enough. | Keep subtle; avoid decorative motion. | P3 |
| Account deletion request | Browser confirm. | Not integrated. | App confirm, no playful motion. | P1 |

Do not add animated settings cards, decorative transitions, or flashy account/privacy effects.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Setup checklist depends on several services. | Partial failure can show wrong setup status. | Track load failure/degraded state and retry. |
| Some services may return fallback empty values. | The hub can mistake failed data for incomplete setup. | Only show confident status for successfully loaded sections. |
| AI/privacy cards lead to sensitive subroutes. | Users need clear trust framing. | Add grouping/status without changing permissions logic. |
| Account deletion request is sensitive. | Browser confirm is inconsistent and easy to miss. | Use shared app confirmation and inline request status. |
| Broad settings refactor can touch many subroutes. | User asked for route audits, not implementation. | Keep prompt scoped to settings hub and shared settings shell only, except narrow account confirmation cleanup. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 10 | 15 | Correct hub model, but sensitive controls need grouping and status. |
| Button size, placement, and hierarchy | 9 | 15 | Hub cards are good; setup/back/account controls need 48px cleanup. |
| Spacing consistency and visual rhythm | 8 | 10 | Clean page structure, but category grouping is underdeveloped. |
| Feedback, optimistic UI, loading, and errors | 6 | 15 | Profile skeleton exists; setup loading/error is weak and toast/console-heavy. |
| Motion and interaction quality | 6 | 15 | Stable but flat; setup expansion/load transitions can improve. |
| Mobile-first behavior and tap comfort | 8 | 10 | Hub rows are mobile-friendly; small controls remain. |
| AI safety, privacy, and high-risk action control | 9 | 10 | Sensitive surfaces exist but need stronger visible framing. |
| Premium/subscription readiness | 8 | 10 | Solid hub, but not yet trust-control-grade. |
| **Total** | **64** | **100** | Good structure; needs trustworthy states, grouping, and mobile control polish. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Setup load failure is `console.warn` only. | Add visible degraded state and retry. |
| One primary next action | Setup card has next action, but loading/failure states can hide it. | Keep next action visible with confidence/degraded status. |
| 48px tap target baseline | `size=sm`, `h-10`, and tiny details summary controls. | Resize effective targets. |
| Trust-sensitive action separation | AI/privacy/coaching/account appear as equal normal cards. | Group and label trust/data controls. |
| Serious action pattern | Account deletion request uses browser confirm. | Use app confirmation/status pattern. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add setup status loading skeleton/placeholder instead of hiding setup progress while loading. | Codex/Kimi/Human | Open |
| P1 | Add inline degraded/error state with retry if setup status data fails to load. | Codex/Kimi/Human | Open |
| P1 | Track partial setup data confidence so failed reads are not shown as reliable incomplete setup. | Codex/Kimi/Human | Open |
| P1 | Group settings cards into Trust & data, Preferences, and Account sections. | Codex/Kimi/Human | Open |
| P1 | Resize setup next action, setup expand control, setup item actions, shared back button, sign-out button to 48px effective targets. | Codex/Kimi/Human | Open |
| P1 | Replace account deletion browser confirm with shared app confirmation/status pattern. | Codex/Kimi/Human | Open |
| P2 | Add status badges/details for AI imports, data privacy, and coaching context where reliable. | Codex/Kimi/Human | Open |
| P2 | Add microcopy clarifying AI imports, privacy, and coaching context roles. | Codex/Kimi/Human | Open |
| P2 | Add reduced-motion-safe setup expand/collapse and loading transition. | Codex/Kimi/Human | Open |
| P3 | Optional compact “setup complete” status if all setup items are done. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/settings` shows profile summary correctly in normal and private profile modes.
- [ ] Setup status shows a loading placeholder while setup data is loading.
- [ ] Setup load failure shows visible degraded state and retry.
- [ ] Failed setup reads are not displayed as confident incomplete setup.
- [ ] Settings cards are grouped into trust/data, preferences, and account areas.
- [ ] AI Imports, Data Privacy, and Coaching Context have clearer trust/context copy.
- [ ] Setup action buttons, expand control, shared back button, and account actions meet 48px effective tap target.
- [ ] Account deletion request uses app confirmation/status pattern, not browser confirm.
- [ ] Hub cards remain simple and easy to scan on 390x844 mobile.
- [ ] No AI/import workflow is added to `/settings` itself.
- [ ] No unrelated settings subroutes are changed beyond shared shell/account cleanup required by this audit.

---

## 17. Codex prompt section

Use this route with one-route UI/UX plus user-data safety review. It touches account, privacy, and AI access navigation, but it should not change underlying permissions or account deletion API behavior.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + settings trust/safety reviewer + data-state reliability reviewer
```

Implementation should not change database schema, auth behavior, AI permission logic, privacy request API semantics, subscriptions, global theme, or unrelated routes.

---

## 18. Implementation note

Do not rebuild settings from scratch. Preserve the main model:

```txt
Profile summary
Setup progress
Settings hub cards
Shared settings shell
```

The high-value correction is trust-control quality:

```txt
Profile/setup confidence -> grouped sensitive controls -> comfortable navigation -> visible recovery states
```

Settings should feel stable, safe, and precise.