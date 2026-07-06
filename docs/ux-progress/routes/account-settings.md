# Route Audit: `/settings/account`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 59 / 100  
**Flow decision:** Tune flow with session-action safety, deletion-request transparency, and mobile control hardening

---

## Files inspected

- `app/(private)/settings/account/page.tsx`
- `components/settings/settings-page-shell.tsx`
- `components/settings/settings-section-card.tsx`
- `components/auth/auth-provider.tsx`
- `app/api/user/privacy-requests/route.ts`
- Related context from:
  - `docs/ux-progress/routes/settings.md`
  - `docs/ux-progress/routes/settings-data-privacy.md`
  - `docs/ux-progress/routes/settings-ai-imports.md`

---

## 1. Product role

`/settings/account` is Plaivra's account-control route. It links to profile editing, fitness profile editing, current-session sign-out, and account deletion request submission.

The route should answer:

```txt
Where do I edit my profile and fitness profile?
What account/session am I controlling?
Can I sign out safely and understand what happens?
Can I request account deletion safely?
Can I see whether a deletion request is already pending?
Can I recover from failed sign-out or request submission?
```

This route is not AI-first and not a tracking route. It is a trust and control surface. The highest-risk action is account deletion request submission, and the route must make status, confirmation, and consequences clear.

The current route has a useful base: profile and fitness profile links, a sign-out action, a destructive-section visual treatment, deletion-request posting through an authenticated API, server-side rate limiting, existing-request detection, and ChatGPT connection revocation when a deletion request exists or is created. The main issues are interaction safety and transparency: deletion confirmation uses `window.confirm`, deletion request status/history is not loaded on the page, sign-out has no pending/error state, deletion results are toast-only, and shared settings controls are below the 48px target.

---

## 2. AI-first vs manual-entry role

Account settings is a sensitive account-control route.

Expected hierarchy:

```txt
1. Account identity / session confidence
2. Profile and fitness profile links
3. Sign out current device/session
4. Deletion request status and request action
5. Clear consequence copy and recovery states
```

Current hierarchy:

```txt
1. Back button
2. PageHeading
3. Profile link card
4. Fitness profile link card
5. Account session card with Sign out
6. Delete account card with request button
```

The structure is mostly correct. It needs stronger state handling and account-request visibility.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Edit profile | Clear link and 48px target. |
| Edit fitness profile | Clear link to onboarding edit flow. |
| Sign out | Pending state, failure recovery, and clear current-device copy. |
| Request account deletion | App confirmation, pending state, success/failure status, no browser confirm. |
| Check deletion status | Existing pending request is visible before pressing the button. |
| Revoke AI access during deletion | If ChatGPT access is revoked, status is shown clearly. |
| No session/access token | Inline sign-in-required/retry state, not toast only. |

---

## 4. Current workflow map

```txt
Enter /settings/account
-> SettingsPageShell back button
-> Profile SettingsSectionCard link to /profile
-> Fitness profile SettingsSectionCard link to /onboarding?edit=true
-> Account Session card -> Sign out calls signOut()
-> Delete Account card -> browser confirm -> POST /api/user/privacy-requests
-> toast reports result
```

Strong points:

- Account route is separate from general settings.
- Profile and fitness profile links are clear.
- Deletion request is not immediate deletion; the route says it is submitted for review.
- Deletion request API requires auth and rate limits requests.
- Deletion request API checks for existing pending/in-progress requests.
- Deletion request API revokes active ChatGPT connections when deletion is requested.
- No service-role credential is exposed to the browser.
- Route is correctly not AI-first.

Main workflow issues:

- Account page does not show the signed-in email, profile name, or account identity.
- Sign out has no pending state, no disabled state, and no failure feedback if `supabase.auth.signOut()` fails.
- `signOut()` in AuthProvider does not catch or expose sign-out errors.
- Sign out button uses `size="sm"`, below the 48px target.
- Deletion request uses `window.confirm`, which is inconsistent with the app's sensitive-action UX.
- Deletion request status/history is not fetched through the available GET endpoint.
- Existing pending deletion requests are only discovered after pressing Request.
- Deletion request success/failure is toast-only; the page does not retain inline status.
- Deletion request disables only the button during submit, but no broader status block appears.
- `setIsRequestingDeletion(false)` is not in a `finally`, so JSON/fetch failures can leave the button stuck.
- Network/fetch failures around deletion request are not caught.
- Deletion copy is correct but too thin for a serious account action; it should explain review, data removal timing, and AI access revocation if applicable.
- `SettingsPageShell` back button uses `size="sm"`, below the 48px target.
- `SettingsSectionCard` icon containers use `h-10 w-10`, and action pills are small.
- Deletion card lacks a status area for request id/date/status.

---

## 5. Recommended workflow map

```txt
Enter Account Settings
-> Loading / loaded account identity
-> Profile / fitness profile links
-> Current session action:
   -> sign out pending / failed / success redirect
-> Account deletion section:
   -> current request status loaded from API
   -> app confirmation dialog
   -> request pending / submitted / failed
   -> explain ChatGPT revocation and review process
```

This is a **tune flow with session-action safety, deletion-request transparency, and mobile control hardening** correction. Do not redesign account management; harden sensitive action states.

---

## 6. Flow decision label

**Tune flow with session-action safety, deletion-request transparency, and mobile control hardening.**

Keep account settings simple. Do not add AI/import behavior.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Signed in as [email].”
- “Sign out of this device.”
- “Signing out…”
- “Could not sign out. Try again.”
- “Deletion request pending since [date].”
- “Submitting deletion request…”
- “Request submitted. Plaivra will review it before account data is removed.”
- “Active ChatGPT access will be revoked when deletion is requested.”
- “This is a request, not an immediate deletion.”
- “You may be contacted if more verification is needed.”

Avoid implying immediate deletion if the actual implementation only creates a review request.

---

## 8. UI structure

Recommended structure:

```txt
1. Account identity
2. Profile links
3. Session card
4. Deletion request status/action
5. Loading/error/retry states
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Account identity | Missing. | Show signed-in email/profile name. | P1 |
| Sign out | No pending/error state. | Add pending/failure status. | P1 |
| Deletion confirmation | Browser confirm. | Replace with app confirmation dialog/card. | P1 |
| Deletion status | Missing despite API GET support. | Fetch and show pending/in-progress/completed status. | P1 |
| Deletion request result | Toast-only. | Add inline status. | P1 |
| Fetch failure | Not caught. | Use try/catch/finally. | P1 |
| Controls | `size=sm`, `h-10`. | 48px targets. | P1 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Back | Shell top | `size=sm`. | 48px target. | P1 |
| Open Profile | Section card | Link row good; icon/action small. | Keep, adjust target internals. | P2 |
| Edit Fitness Profile | Section card | Good route. | Keep. | P2 |
| Sign out | Account session card | No pending/error; small. | Add pending/error and 48px. | P1 |
| Request deletion | Delete account card | Browser confirm; toast-only result. | App confirm + inline status. | P1 |
| Retry deletion request status | Missing. | Add if GET fails. | P2 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Account identity loading | Not represented. | User sees no identity. | Show email/session when loaded. | P2 |
| Sign out pending | None. | Duplicate click / no feedback. | Pending and disabled state. | P1 |
| Sign out failure | Not surfaced. | User may stay signed in without explanation. | Catch and show inline/toast. | P1 |
| Deletion status loading | Missing. | Pending request invisible. | Fetch status with skeleton. | P1 |
| Existing pending request | Only after POST. | User may press unnecessarily. | Show status first and disable/adjust action. | P1 |
| Deletion request pending | Button text only. | Minimal. | Inline status block. | P1 |
| Deletion request failure | Toast-only and no catch. | Can get stuck or be missed. | Try/catch/finally + inline error. | P1 |
| ChatGPT revoke status | API returns value but UI ignores. | AI access status not transparent. | Show if returned. | P2 |

---

## 11. Motion and interaction design

Account settings should use serious, low-motion feedback.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Confirm deletion request | Browser modal. | Outside app pattern. | App confirmation state/dialog, no decorative motion. | P1 |
| Submit deletion request | Button text changes. | Too little feedback. | Inline status update. | P1 |
| Sign out | Immediate redirect when successful. | Fine, but no pending/failure. | Pending state; no animation needed. | P1 |

No celebratory or playful feedback on account actions.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Account deletion is high trust. | Wrong copy can mislead users about deletion timing. | Say “request” and “review” consistently. |
| API revokes ChatGPT access. | User should understand AI connection impact. | Show revocation status/copy. |
| Auth signOut currently swallows error behavior. | Route cannot show failure unless signOut exposes it or route wraps status. | Add safe pending/error pattern. |
| GET privacy requests exists. | Not using it loses transparency. | Load latest relevant privacy requests. |
| Shared settings shell/card controls. | Fixes affect all settings pages. | Improve shared 48px controls carefully. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 10 | 15 | Clear purpose; missing account identity/status. |
| Button size, placement, and hierarchy | 8 | 15 | Clear actions, but small shared controls. |
| Spacing consistency and visual rhythm | 8 | 10 | Good card grouping. |
| Feedback, optimistic UI, loading, and errors | 6 | 15 | Deletion pending exists, but no status/load/finally; signout state missing. |
| Motion and interaction quality | 6 | 15 | Serious enough, but browser confirm breaks pattern. |
| Mobile-first behavior and tap comfort | 8 | 10 | Layout works, controls need 48px. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Good API safety and revocation, weak UI transparency. |
| Premium/subscription readiness | 5 | 10 | Account actions need more trust polish. |
| **Total** | **59** | **100** | Good base, but sensitive account actions need stronger status and confirmation. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| High-risk action confirmation | Account deletion request uses `window.confirm`. | App confirmation dialog/status. |
| Feedback loop completeness | Sign out and deletion request lack robust pending/error/success states. | Add state surfaces. |
| Loading/error state clarity | Privacy request status is not loaded. | Fetch and display request status. |
| 48px tap target baseline | Back/sign-out/buttons/icons are `size=sm`/`h-10`. | Resize controls. |
| Trust transparency | Existing deletion requests and ChatGPT revocation status hidden. | Show status/copy. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Show signed-in account identity on the route. | Codex/Kimi/Human | Open |
| P1 | Add sign-out pending, disabled, and failure state. | Codex/Kimi/Human | Open |
| P1 | Replace `window.confirm` deletion confirmation with app confirmation UI. | Codex/Kimi/Human | Open |
| P1 | Load existing privacy request status from `/api/user/privacy-requests`. | Codex/Kimi/Human | Open |
| P1 | Show pending/in-progress/completed deletion request state inline. | Codex/Kimi/Human | Open |
| P1 | Wrap deletion POST in try/catch/finally so the button cannot remain stuck. | Codex/Kimi/Human | Open |
| P1 | Add inline deletion request success/failure status, not toast-only. | Codex/Kimi/Human | Open |
| P1 | Resize Back, Sign out, Request deletion, and related controls to 48px. | Codex/Kimi/Human | Open |
| P2 | Surface ChatGPT access revocation status/copy when deletion is requested. | Codex/Kimi/Human | Open |
| P2 | Add retry for privacy request status load. | Codex/Kimi/Human | Open |
| P2 | Improve destructive copy with review/timeline/verification language. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/settings/account` shows signed-in account identity.
- [ ] Sign out has pending and failure states.
- [ ] Sign out button cannot be double-clicked repeatedly.
- [ ] Delete account request uses app confirmation, not `window.confirm`.
- [ ] Existing pending deletion request is visible before submitting again.
- [ ] Deletion POST has try/catch/finally and cannot leave button stuck.
- [ ] Deletion result appears inline and via appropriate non-disruptive feedback.
- [ ] ChatGPT access revocation copy/status is shown when relevant.
- [ ] Back, Sign out, Request deletion, and key row controls meet 48px on 390x844.
- [ ] `/settings`, `/settings/data-privacy`, and `/settings/ai-imports` still work after shared settings control changes.
- [ ] No database schema, auth semantics, AI import/apply behavior, global theme, or unrelated routes are changed.

---

## 17. Codex prompt section

Use this route with account/privacy safety and sensitive-action confirmation review.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + account/privacy safety reviewer + sensitive-action confirmation reviewer
```

Implementation should not change database schema, auth semantics, AI import/apply behavior, global theme, or unrelated route flows.

---

## 18. Implementation note

Do not rebuild account settings. Preserve the current route capability set:

```txt
Profile link -> fitness profile link -> sign out -> deletion request
```

The highest-value correction is trust and state visibility:

```txt
Account identity -> sign-out state -> deletion status -> app confirmation -> inline success/failure -> 48px controls
```
