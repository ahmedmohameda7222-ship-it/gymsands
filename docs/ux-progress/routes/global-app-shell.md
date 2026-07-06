# Route Audit: Global app shell / navigation

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 63 / 100  
**Flow decision:** Tune shell with navigation reliability, safe-area, and motion hardening

---

## Files inspected

- `app/layout.tsx`
- `app/(private)/layout.tsx`
- `components/layout/app-shell.tsx`
- `components/layout/page-heading.tsx`
- `components/workouts/active-workout-indicator.tsx`
- `components/settings/app-preference-effects.tsx`
- `components/auth/protected-route.tsx`
- `app/globals.css`
- Route validity spot checks:
  - `app/(private)/today-workout/page.tsx`
  - `app/(private)/workouts/session/[workoutId]/page.tsx` attempted and not found

---

## 1. Product role

The global app shell is Plaivra's navigation, layout, and route-continuity layer. It controls whether the app feels like one coherent product or a set of disconnected pages.

The shell should answer:

```txt
Where am I?
Where can I go next?
Is there an active workout?
Am I offline or at risk of losing changes?
Can I reach core actions with one thumb?
Does the current route have enough bottom/safe-area space?
Does motion respect my preferences?
Do global links point to real routes?
```

This layer is not AI-first or manual-entry-first. It is navigation infrastructure. Its job is to preserve context, avoid route confusion, expose active system states, and make daily actions reachable without crowding the screen.

The current shell has a strong foundation: desktop sidebar, sticky header, mobile bottom nav, More drawer, Quick Log FAB, offline banner, active workout indicator, skip link, protected-route gating, theme/language/effect handling, and safe-area padding in several places. The main issues are route-action validity, motion compliance, bottom-stack overlap risk, and 48px consistency. The shell still contains links to `/workouts/session/[workoutId]`, but that route was not found during route inspection. The global route transition uses Framer Motion without checking `reduceAnimations`. Several buttons/links rely on 44px mobile CSS or `size="sm"`, below Plaivra's 48px standard.

---

## 2. AI-first vs manual-entry role

Global shell is a context and navigation layer.

Expected hierarchy:

```txt
1. Route content
2. Current route / active nav state
3. One-thumb mobile primary navigation
4. Quick Log shortcuts
5. Active workout continuity
6. Offline/sync risk state
7. More/secondary navigation
8. Account/sign-out controls
```

Current hierarchy:

```txt
Desktop:
Sidebar -> header -> main content -> active workout indicator

Mobile:
Header/menu/brand -> main content -> active workout indicator -> Quick Log FAB -> bottom nav -> More drawer

Special routes:
Onboarding no full shell
Workout session no nav shell, only offline banner
```

The hierarchy is mostly correct. The weakness is collision management and state honesty: active workout indicator, bottom nav, and Quick Log FAB can compete for the bottom area; offline state is visible but not tied to retry/sync; route transitions do not visibly respect user reduced-motion settings.

---

## 3. User intent and entry points

| User intent | Expected shell behavior |
|---|---|
| Move between major areas | Bottom nav and sidebar should have correct active state and valid routes. |
| Access less-common areas | More drawer should be readable, scroll-safe, and 48px comfortable. |
| Quick log common items | Quick Log should be reachable but not block nav/content. |
| Resume active workout | Active workout indicator should not overlap primary nav or page CTAs. |
| Go offline | Offline banner should show risk clearly and avoid covering header/actions. |
| Use reduced motion | Route transitions, drawer motion, and global decorative effects should reduce. |
| Sign out | Sign-out should be clear, comfortable, and not accidentally tapped. |
| Use screen reader/keyboard | Skip link, landmarks, aria-current, focus rings, and labels should be reliable. |

---

## 4. Current workflow map

```txt
RootLayout
-> Toast/Auth/UserSettings/SuccessFeedback providers
-> AppPreferenceEffects applies theme, language, direction, reduced motion classes
-> ProtectedRoute validates auth, consents, onboarding
-> AppShell renders either onboarding shell, workout-session shell, or full shell
-> desktop sidebar and header
-> mobile header, bottom nav, Quick Log sheet, More drawer
-> active workout indicator overlays when a session is open
-> route content animates on pathname changes
```

Strong points:

- App has a real shell instead of route-by-route navigation duplication.
- Root layout includes skip-to-content link and `main-content` target.
- Desktop sidebar is grouped by Today, Train, Eat, Progress, Wellness, Settings.
- Mobile bottom nav keeps Today, Train, Eat, and More reachable.
- Quick Log FAB can be customized through preferences.
- More drawer exposes the complete route set on mobile.
- Active workout indicator preserves workout continuity outside the session route.
- Offline banner exists for normal and workout-session shells.
- Onboarding and workout-session routes correctly get special shell treatment.
- AppPreferenceEffects applies theme, dark mode, language direction, reduced motion, large text, and compact mode.
- CSS includes reduced-motion and prefers-reduced-motion safeguards.

Main workflow issues:

- `quickLogItems` and ActiveWorkoutIndicator can route standalone workouts to `/workouts/session/[workoutId]`; the route file was not found during inspection.
- Global route transition uses Framer Motion regardless of `settings.reduceAnimations`.
- Mobile More drawer uses explicit slide/fade animations; it relies on CSS class overrides, but the shell does not choose a reduced-motion variant.
- CSS mobile global minimum is 44px for buttons/inputs, below the Plaivra 48px target.
- Desktop sidebar links use `py-2` and no `min-h-12`, likely under 48px.
- Desktop header logout uses `size="sm"`, below target.
- Mobile menu header trigger uses `Button size="icon"`, needs verification against 48px.
- Quick Log item icons are 36px while row is 48px; acceptable row target, but icon target may feel small.
- ActiveWorkoutIndicator buttons use `size="sm"`, below 48px, and four actions can crowd on mobile.
- ActiveWorkoutIndicator sits above bottom nav at `5.25rem`; combined with Quick Log FAB and route sticky CTAs, overlap risk remains.
- Offline banner top positions may overlap route headers or safe-area/notch on mobile.
- Active nav grouping is broad: Train active includes `/workouts`, `/workout-history`, `/my-workout`, and `/today-workout`; acceptable but More drawer can duplicate active states.
- Quick Log empty state only says choose items in Settings → Preferences; no direct link.
- ProtectedRoute loading is plain text, not branded skeleton, and errors checking setup/consent are console-only.
- There is no global sync status beyond offline/online.
- No clear z-index policy documented for offline banner, active workout indicator, bottom nav, Quick Log FAB, route sticky CTAs, and dialogs.

---

## 5. Recommended workflow map

```txt
App starts
-> branded auth/setup loading skeleton
-> full shell with verified route links
-> content has stable safe-area padding based on visible shell overlays
-> mobile bottom nav + Quick Log + active workout stack avoid collisions
-> route transitions respect reduceAnimations
-> offline/sync state visible but non-blocking
-> More drawer is 48px, scroll-safe, reduced-motion-aware
```

This is a **tune shell with navigation reliability, safe-area, and motion hardening** correction. The shell is conceptually strong and should not be rebuilt.

---

## 6. Flow decision label

**Tune shell with navigation reliability, safe-area, and motion hardening.**

Do not redesign navigation. Fix route validity, 48px comfort, reduced-motion compliance, bottom overlay collisions, and global state honesty.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “You are offline. New changes may not sync until connection returns.”
- “Active workout in progress.”
- “Return to active workout.”
- “Quick Log shortcuts can be changed in Preferences.”
- “No Quick Log shortcuts enabled.” with direct link to Preferences.
- “Loading Plaivra…” branded setup state with what is being checked.
- If standalone exercise start route is missing: “Start from a workout plan” or remove the route.

Avoid implying changes are synced while offline.

---

## 8. UI structure

Recommended structure:

```txt
1. Shell state banners: offline/sync/active workout
2. Desktop sidebar / mobile bottom nav
3. Route content with safe bottom offset
4. Quick Log sheet
5. More drawer
6. Account/sign-out controls
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Route links | `/workouts/session/[id]` route not found. | Verify and implement/redirect/remove. | P0 |
| Bottom overlays | Active workout + bottom nav + Quick Log + route CTAs may collide. | Define shell overlay stack and safe-area offsets. | P1 |
| Route transitions | Framer Motion always active. | Respect `settings.reduceAnimations`. | P1 |
| Tap targets | Several shell actions below 48px. | Normalize to 48px. | P1 |
| Offline banner | Visible but not connected to sync/retry state. | Clarify unsynced risk and avoid header overlap. | P2 |
| ProtectedRoute loading | Plain text. | Add branded skeleton/status. | P2 |
| More drawer | Good coverage but dense. | 48px links and reduced-motion-aware drawer. | P1 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Mobile bottom nav | Bottom fixed | Good primary pattern. | Keep. | P1 |
| Quick Log FAB | Center above nav | Good but can crowd active workout overlay. | Keep but define collision behavior. | P1 |
| More nav item | Bottom nav / drawer | Good. | Keep and resize drawer items if needed. | P1 |
| Desktop sidebar links | Sidebar | Likely under 48px. | Add min-h-12. | P1 |
| Desktop logout | Header size sm | Under 48px. | Resize to 48px or move to account card only. | P2 |
| Active workout actions | Floating indicator | `size=sm`, crowded. | 48px, group primary/secondary actions. | P1 |
| Quick Log items | Sheet rows | Row target is 48px, icon is 36px. | Keep row, optionally enlarge icon. | P2 |
| Mobile menu top trigger | Header | Size icon must be verified. | Ensure 48px. | P1 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Auth/setup loading | Plain “Loading Plaivra…” text. | Low premium confidence. | Branded skeleton/status. | P2 |
| Consent/setup check failure | Console warning and route continues. | Could hide setup/consent state issues. | Add degraded/retry where feasible. | P2 |
| Offline | Banner. | Good start but no sync nuance. | Clarify unsynced risk and avoid overlap. | P2 |
| Active workout load failure | `getOpenWorkoutSession` can return null on error. | Active workout may disappear silently. | Add safe degraded active-workout state if feasible. | P1 |
| Active workout finish/cancel failure | No inline pending/failure handling around floating actions. | Errors can be unhandled visually. | Add pending/failure states. | P1 |
| Quick Log empty | Plain text only. | No direct fix path. | Add Preferences link. | P3 |
| Route change | Motion only. | Does not respect setting directly. | Disable/reduce when reduceAnimations true. | P1 |

---

## 11. Motion and interaction design

Shell motion must be especially strict because it affects every route.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Route transition | Framer Motion opacity/y every pathname change. | Ignores user setting directly. | Disable y motion and/or transition when `reduceAnimations`. | P1 |
| More drawer | Slide/fade animation classes. | Needs explicit reduced-motion-safe variant. | Gate or rely on class with verification. | P1 |
| Quick Log sheet | Dialog open/close. | Acceptable if reduced-motion works. | Verify and gate if needed. | P2 |
| Active workout indicator | Fixed banner appears/disappears. | Can be abrupt or overlap. | Stable placement; reduced-motion-safe reveal. | P2 |
| Sidebar hover/active | Transitions. | Acceptable if reduced-motion CSS applies. | Verify. | P2 |

No decorative shell animation. Shell motion should only clarify navigation and state changes.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Shell affects every private route. | Broad changes can regress daily use. | Keep changes narrow and test major routes. |
| Bottom nav safe-area changes affect mobile CTA layout. | Route sticky CTAs may overlap or create wasted space. | Define overlay stack and test workout session/dashboard/calories. |
| Route validity fixes can touch workout session flow. | `/workouts/session/[id]` may need its own route/redirect. | Verify before changing; prefer safe redirect if standalone session route is not supported. |
| Reduced motion is global. | Must not break route animation or dialogs. | Use simple conditional config and rely on CSS where possible. |
| Offline banner can obscure content. | Users need warnings without blocking actions. | Use consistent top/safe-area offset and compact copy. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 11 | 15 | Strong structure, but route validity and overlay hierarchy need hardening. |
| Button size, placement, and hierarchy | 8 | 15 | Mobile nav is good; sidebar, active workout, and header actions need 48px cleanup. |
| Spacing consistency and visual rhythm | 8 | 10 | Clean shell, but bottom overlay stack can crowd mobile. |
| Feedback, optimistic UI, loading, and errors | 6 | 15 | Offline exists; active workout and setup checks need clearer failure states. |
| Motion and interaction quality | 6 | 15 | Route transitions and drawers need direct reduced-motion compliance. |
| Mobile-first behavior and tap comfort | 8 | 10 | Good bottom nav pattern; overlay collision risk. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Correctly infrastructure-only; sign-out/active cancel need safer pending/error. |
| Premium/subscription readiness | 8 | 10 | Strong base, but shell must be more reliable before launch. |
| **Total** | **63** | **100** | Good shell foundation; must fix route validity, motion, safe-area stack, and 48px consistency. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Core route/action reliability | `/workouts/session/[id]` route not found. | Verify/implement/redirect/remove link. |
| 48px tap target baseline | Sidebar links, header logout, active workout buttons, and some icon actions are small. | Normalize shell controls to 48px. |
| Reduced-motion compliance | Framer Motion route transition ignores setting. | Conditional transition based on `settings.reduceAnimations`. |
| Overlay clarity | Bottom nav, Quick Log FAB, active workout indicator can stack. | Define overlay offsets and route content padding. |
| Loading/error state clarity | ProtectedRoute loading is plain and checks can fail silently. | Branded loading/degraded state. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P0 | Verify `/workouts/session/[id]` links from Quick Log and active workout. Implement, redirect, or replace/remove if route is invalid. | Codex/Kimi/Human | Open |
| P1 | Make global route transitions respect `settings.reduceAnimations`. | Codex/Kimi/Human | Open |
| P1 | Normalize shell tap targets to 48px: sidebar links, mobile menu trigger, header logout, active workout actions. | Codex/Kimi/Human | Open |
| P1 | Define bottom overlay stack for mobile bottom nav, Quick Log FAB, active workout indicator, and route sticky CTAs. | Codex/Kimi/Human | Open |
| P1 | Add active workout pending/failure states for pause/finish/cancel and avoid silent disappearance on load failure. | Codex/Kimi/Human | Open |
| P1 | Verify More drawer links and active states for every top-level route. | Codex/Kimi/Human | Open |
| P2 | Add branded ProtectedRoute loading state and optional degraded setup/consent check state. | Codex/Kimi/Human | Open |
| P2 | Improve offline banner copy and safe-area placement. | Codex/Kimi/Human | Open |
| P2 | Add direct Preferences link when Quick Log has no visible items. | Codex/Kimi/Human | Open |
| P2 | Document or codify z-index/safe-area policy for shell overlays. | Codex/Kimi/Human | Open |
| P3 | Optional: add mobile route transition suppression when user returns from workout session. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] Mobile bottom nav works at 360x780, 390x844, and 430x932.
- [ ] More drawer links are valid and active states are correct.
- [ ] Quick Log links are valid; `/workouts/session/[id]` is fixed or removed/replaced.
- [ ] ActiveWorkoutIndicator route is valid for plan-day and standalone workouts.
- [ ] ActiveWorkoutIndicator actions have pending/failure states.
- [ ] Route transitions respect reduceAnimations setting.
- [ ] More drawer and Quick Log dialog are reduced-motion-safe.
- [ ] Sidebar links, header actions, mobile trigger, and active workout actions are 48px effective targets.
- [ ] Offline banner does not cover header or critical route actions.
- [ ] Active workout banner, Quick Log FAB, bottom nav, and route CTAs do not overlap.
- [ ] ProtectedRoute loading state is branded and not just plain text.
- [ ] No unrelated route flow, database schema, auth semantics, AI import/apply behavior, or global theme redesign is changed.

---

## 17. Codex prompt section

Use this route with shell-level review. It affects every authenticated route, so keep changes incremental and test broadly.

```txt
/caveman lite

$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + app-shell reliability reviewer + accessibility/motion reviewer
```

Implementation should not change database schema, auth semantics, AI import/apply behavior, route product flows, or redesign the whole navigation model.

---

## 18. Implementation note

Do not rebuild the shell. Preserve the current route model:

```txt
Desktop sidebar -> sticky header -> route content
Mobile header -> route content -> active workout indicator -> Quick Log FAB -> bottom nav -> More drawer
```

The highest-value correction is global reliability:

```txt
Valid links -> safe bottom stack -> 48px shell controls -> reduced-motion-safe transitions -> clear offline/active workout states
```
