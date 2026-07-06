# Route Audit: `/settings/ai-imports`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 66 / 100  
**Flow decision:** Tune flow with trust-state hardening

---

## Files inspected

- `app/(private)/settings/ai-imports/page.tsx`
- `app/(private)/settings/ai-imports/chatgpt-setup/page.tsx`
- `components/settings/ai-permissions-card.tsx`
- `components/settings/connected-apps.tsx`
- `components/settings/settings-page-shell.tsx`
- `services/database/ai-permissions.ts`
- `lib/mcp/permission-presentation.ts`
- `types/database.ts`

---

## 1. Product role

`/settings/ai-imports` is Plaivra's AI trust and connection control center.

The route should answer:

```txt
Is ChatGPT connected?
What can ChatGPT view?
What can ChatGPT change?
What still requires my approval?
How do I connect, reconnect, or revoke access safely?
What happened recently through ChatGPT?
```

This route is central to Plaivra's AI-first model. It is not a normal settings route and not a manual tracker. It is the permission, connection, and trust layer that makes AI-assisted import/apply acceptable.

The current route has many correct building blocks: trust intro, per-section read/write permissions, full vs custom mode, examples, save feedback, setup guide, connection status, and revoke. The main problem is not missing features. The problem is trust-state reliability: permission load failures are silent, connection load failures are silent, destructive/revoke flow uses browser confirm, and the route does not present a single connection lifecycle summary before the detailed controls.

---

## 2. AI-first vs manual-entry role

This route is AI-first infrastructure, not AI-generated content entry.

Expected hierarchy:

```txt
1. Connection lifecycle status
2. Permission confidence state
3. What ChatGPT can view/change
4. Save/reconnect requirement
5. Setup / reconnect / revoke controls
6. Recent allowed/denied activity
7. Clear failure recovery
```

Current hierarchy:

```txt
1. SettingsPageShell heading
2. Trust intro card: You decide what reaches ChatGPT
3. AiPermissionsCard
4. ChatGptSetupCard
5. ConnectionStatusCard
```

The route correctly says Plaivra never changes plans/logs silently, but it should put status and confidence first. The user must immediately know whether they are connected, whether permissions loaded successfully, and whether saved permissions match the current connection.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| I want to connect ChatGPT | Show setup path and whether the deployment is ready. |
| I want to know if I am connected | Show connection status first, with reliable loading/error state. |
| I want to control what ChatGPT can access | Show permissions with clear read/change distinction and saved state. |
| I want to revoke access | Use app confirmation, pending state, success/failure state, and clear result. |
| I changed permissions | Explain that reconnect may be required and show saved vs active connection confidence. |
| Permission load failed | Do not show default permissions as if they are saved. |
| Connection load failed | Do not show “not connected” as if it is confirmed. |
| I want to audit what ChatGPT did | Show recent allowed/denied activity or link to it. |

---

## 4. Current workflow map

```txt
Enter /settings/ai-imports
-> trust intro card
-> AiPermissionsCard:
   -> load saved permissions
   -> if loading: spinner card
   -> if load fails: console.warn only, defaults remain visible
   -> choose full or custom
   -> custom read/write toggles by area
   -> save permissions
-> ChatGptSetupCard:
   -> shows setup button
   -> shows missing connection URL error if env missing
-> ConnectionStatusCard:
   -> loads existing connections
   -> if API fails: silently no state update
   -> status card says connected/not connected based on state
   -> refresh
   -> revoke via window.confirm
```

Strong points:

- Route-level intro directly says the user decides what reaches ChatGPT.
- The route explicitly says Plaivra never changes plans/logs silently.
- The permissions model distinguishes View from Change.
- Write permission automatically includes read permission for that section.
- Removing read/write permission requires confirmation.
- Sensitive areas are marked as sensitive in the permissions UI.
- The setup guide explains that OAuth client ID is not a secret.
- Revoke copy explains that Plaivra data is not deleted.
- Missing connection URL is visibly shown.

Main workflow issues:

- Saved AI permission load failure is only logged to console. The UI can show default/no saved permissions as if that is the real saved state.
- `getAiPermissionSettings` returns `null` on read error, which is indistinguishable from no saved settings.
- Switching to full access does not require a heightened confirmation before saving.
- The route lacks a top-level status hero summarizing connected/not connected, permissions saved/unsaved, and setup/reconnect requirement.
- Connection status fetch failure is silent. The UI can look like “not connected” when the request actually failed.
- Revoking connection uses `window.confirm`, not the app confirmation/status pattern.
- Refresh connection uses `size=sm`, below the 48px comfort target.
- Permission toggle buttons use `min-h-11`, below the 48px target.
- Recent ChatGPT activity exists as `ChatGptActivityCard` but is not shown on the main `/settings/ai-imports` route.
- Setup flow is long and useful, but the main route does not summarize setup readiness and next step strongly enough.

---

## 5. Recommended workflow map

```txt
Enter /settings/ai-imports
-> AI connection status hero:
   -> Connected / Not connected / Unknown because load failed
   -> Permission status: saved / unsaved / failed to load
   -> Next action: save permissions, setup, reconnect, revoke, or retry
-> Permissions card:
   -> load skeleton
   -> explicit load error with retry
   -> full/custom selection
   -> custom read/change matrix
   -> save with full-access confirmation if needed
-> Connection controls:
   -> setup/reconnect link
   -> refresh with loading/error
   -> revoke with app confirmation and inline status
-> Recent activity:
   -> allowed/denied activity or empty state
-> Setup guide link/card
```

This is a **tune flow with trust-state hardening** correction. The route is conceptually correct, but it must stop treating failed trust-state reads as quiet empty/default states.

---

## 6. Flow decision label

**Tune flow with trust-state hardening.**

The existing permission and setup components should be preserved. The correction is to make permission/connection state reliable and explicit, strengthen high-risk confirmations, and improve mobile tap comfort.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Permissions could not load. Plaivra is not showing a confirmed saved permission state.”
- “Connection status could not be checked. Retry before assuming ChatGPT is disconnected.”
- “Full access lets ChatGPT view and change all supported areas you approve in chat.”
- “Saved permissions affect future connections. Reconnect ChatGPT after changing permissions.”
- “Active connection may still use older permissions until reconnect.”
- “Recent activity shows allowed/denied actions, not private request details.”
- “Revoke stops ChatGPT access tokens; it does not delete Plaivra data.”

Avoid vague language like “connected apps” without explaining whether it means saved permissions, OAuth client created, or active access token.

---

## 8. UI structure

Recommended first-screen order:

```txt
1. AI connection/status hero
2. Permission load/save card
3. Connection setup/revoke/status card
4. Recent activity card
5. Detailed setup guide link
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Trust intro card | Good copy but not status-aware. | Convert/augment into status hero. | P1 |
| Permission card | Strong controls, weak load failure state. | Add inline load error and retry. | P1 |
| Full access mode | Broad access selected without heightened confirmation. | Require confirmation before saving full access. | P1 |
| Connection status | Failure hidden as empty/not-connected state. | Add loading/error/unknown state. | P1 |
| Revoke | Browser confirm. | Use app confirm with pending/success/failure status. | P1 |
| Activity | Component exists but not displayed here. | Show or link recent ChatGPT activity from this route. | P2 |
| Setup card | Good but generic. | Add next-step/status context based on connection state. | P2 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Full/custom mode | Permission card | Good card buttons; no full-access confirmation before save. | Keep; confirm full access on save. | P1 |
| View/Change toggles | Custom permissions | `min-h-11`, dense text/icons. | 48px effective target. | P1 |
| Save permissions | Bottom of permissions card | Good 48px baseline. | Keep; add full-access confirmation and save failure inline. | P1 |
| Setup ChatGPT import | Setup card | Good primary setup action. | Keep; ensure 48px. | P2 |
| Refresh connection | Connection card | `size=sm`, no explicit load error. | 48px + loading/error status. | P1 |
| Revoke connection | Connection card | Browser confirm, no inline failure. | App confirm + pending/success/failure. | P1 |
| Reconnect ChatGPT | Connection card | Good fallback. | Keep; 48px. | P2 |
| Setup flow copy buttons | ChatGPT setup subroute | Many buttons, mostly okay; copy errors not handled. | Add copy error feedback if feasible. | P2 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Permissions loading | Spinner card. | Good baseline. | Keep. | P3 |
| Permissions load failure | Console warning only. | Dangerous trust ambiguity. | Inline error with retry; do not present default as confirmed saved state. | P1 |
| No saved permissions | Amber warning. | Good baseline if load succeeded. | Keep but only after confident load. | P1 |
| Permissions save pending | Button spinner. | Good baseline. | Keep; prevent duplicate saves. | P2 |
| Permissions save failure | Toast only. | User may miss failed save. | Inline failure state. | P1 |
| Full access save | Same as normal save. | Broad access needs extra confirmation. | Confirm before saving full access. | P1 |
| Connection loading | No visible initial loading in status card. | Can briefly show not connected/empty. | Add loading state. | P1 |
| Connection load failure | Silent. | Can mislead user. | Show unknown/error state with retry. | P1 |
| Revoke pending | Button disabled while busy. | Good baseline. | Add app confirm and inline status. | P1 |
| Revoke failure | Toast only. | Sensitive failure can be missed. | Inline failure state. | P1 |
| Activity loading/error | Activity component handles state, but not shown on route. | User cannot audit from main route. | Show component or link. | P2 |

---

## 11. Motion and interaction design

This route should use motion only to clarify trust state.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Permission save | Inline feedback appears. | Good baseline. | Keep, but also show failure inline. | P2 |
| Permission load failure | No visible state. | Not a motion issue, but trust issue. | Static error with retry. | P1 |
| Toggle permissions | Instant state. | Fine, but small targets. | Optional subtle selected-state transition. | P2 |
| Revoke connection | Browser confirm then toast. | Not integrated. | App confirm + pending + status transition. | P1 |
| Connection refresh | No visible card-level loading/error. | Hard to trust. | Loading/unknown state transition. | P1 |

No decorative AI animations. This page should feel sober and security-like.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Permissions are a safety boundary. | Failed reads must not masquerade as default settings. | Introduce explicit load status and do not mark defaults as saved after errors. |
| Full access is broad. | User may grant too much access without realizing. | Add confirm step before saving full access. |
| Existing connections may use old permissions. | User may think save immediately updates active ChatGPT state. | Keep reconnect copy and make it more prominent. |
| Revoke must be reliable. | If revoke fails, ChatGPT may still have access. | Inline failure state and keep connected status until confirmed revoked. |
| Setup flow depends on current ChatGPT UI. | Wording may change. | Keep instructions flexible and avoid claiming exact external UI permanence. |
| Connector/API semantics are sensitive. | Audit should not rewrite auth/API behavior. | UI-only trust-state hardening unless a small service return-state change is necessary. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 11 | 15 | Correct trust route purpose, but missing top-level status/lifecycle hero. |
| Button size, placement, and hierarchy | 9 | 15 | Main save/setup actions are okay; toggles/refresh/revoke need 48px and stronger hierarchy. |
| Spacing consistency and visual rhythm | 8 | 10 | Readable cards, but dense custom permissions and setup flow. |
| Feedback, optimistic UI, loading, and errors | 6 | 15 | Critical load/revoke/connection failures are too quiet. |
| Motion and interaction quality | 6 | 15 | Mostly stable, but lacks trust-state transitions. |
| Mobile-first behavior and tap comfort | 8 | 10 | Layout works, but permission toggles and small controls need cleanup. |
| AI safety, privacy, and high-risk action control | 10 | 10 | Strong model and copy; needs failure-state hardening. |
| Premium/subscription readiness | 8 | 10 | Strong feature depth, but trust-state ambiguity blocks premium confidence. |
| **Total** | **66** | **100** | Correct AI trust foundation, but must harden permission/connection state before release. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Permission and connection read failures can be silent. | Add explicit error/unknown states and retry. |
| AI action safety | Full access can be selected and saved without heightened confirmation. | Confirm before saving broad access. |
| High-risk action confirmation | Revoke uses browser confirm. | Use app confirmation/status pattern. |
| 48px tap target baseline | Permission toggles use `min-h-11`; refresh uses `size=sm`. | Resize effective targets. |
| Trust-state hierarchy | Route starts with generic intro rather than connection/permission confidence. | Add status hero. |
| Auditability | Activity component exists but is not visible on main route. | Show recent activity or link clearly. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add top-level AI connection/permission status hero. | Codex/Kimi/Human | Open |
| P1 | Add explicit permission load error state with retry. | Codex/Kimi/Human | Open |
| P1 | Ensure failed permission load is not displayed as confident default/no saved settings. | Codex/Kimi/Human | Open |
| P1 | Add inline permission save failure state. | Codex/Kimi/Human | Open |
| P1 | Require app confirmation before saving full access mode. | Codex/Kimi/Human | Open |
| P1 | Add connection loading/error/unknown state to `ConnectionStatusCard`. | Codex/Kimi/Human | Open |
| P1 | Replace revoke `window.confirm` with app confirmation/status pattern. | Codex/Kimi/Human | Open |
| P1 | Add inline revoke failure/success state and keep status honest until reload confirms. | Codex/Kimi/Human | Open |
| P1 | Resize permission toggles, refresh, revoke/reconnect, and shared back controls to 48px effective targets. | Codex/Kimi/Human | Open |
| P2 | Show `ChatGptActivityCard` on the main AI imports route or add a clear activity link. | Codex/Kimi/Human | Open |
| P2 | Make reconnect-after-permission-change copy more prominent. | Codex/Kimi/Human | Open |
| P2 | Add copy-to-clipboard failure handling in setup flow. | Codex/Kimi/Human | Open |
| P2 | Reduce density of custom permission cards on mobile without removing details. | Codex/Kimi/Human | Open |
| P3 | Keep the detailed setup guide, but consider step progress/anchor navigation later. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/settings/ai-imports` first screen shows connection status and permission confidence.
- [ ] Permission loading, loaded, no saved settings, failed load, and save failure are visually distinct.
- [ ] Failed permission load cannot be mistaken for confirmed default/no saved permissions.
- [ ] Full access save requires an app confirmation.
- [ ] Custom read/change toggles are 48px effective targets.
- [ ] Permission save gives pending, success, and inline failure feedback.
- [ ] Connection status has loading, connected, not connected, and unknown/error states.
- [ ] Revoke connection uses app confirmation, not browser confirm.
- [ ] Revoke pending/failure/success states are visible and honest.
- [ ] Refresh/revoke/reconnect/back controls meet 48px effective target.
- [ ] Recent ChatGPT activity is visible or clearly reachable.
- [ ] Missing MCP URL state remains visible.
- [ ] Setup flow still explains OAuth client ID is not a secret.
- [ ] No API semantics, auth behavior, permission scope semantics, or database schema are changed.

---

## 17. Codex prompt section

Use this route with privacy/security/data-state review. This is a sensitive AI trust route, so include security review even for UI work.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + AI permission safety reviewer + connection-state reliability reviewer
```

Implementation should not change OAuth semantics, MCP API behavior, permission scope names, database schema, auth, global theme, or unrelated routes.

---

## 18. Implementation note

Do not rebuild the AI imports route from scratch. Preserve the current building blocks:

```txt
Trust intro
AiPermissionsCard
ChatGptSetupCard
ConnectionStatusCard
ChatGptSetupFlow
ChatGptActivityCard
```

The high-value correction is trust-state honesty:

```txt
Known connection state -> known permission state -> safe permission changes -> safe setup/revoke -> auditable activity
```

This page decides whether Plaivra's AI-first model is trustworthy. Treat silent failures as release blockers.