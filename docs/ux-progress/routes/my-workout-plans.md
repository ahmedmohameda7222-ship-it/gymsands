# Route Audit: `/my-workout/plans`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 63 / 100  
**Flow decision:** Reorder flow

---

## 1. Product role

This route is currently doing four jobs at once:

1. Start today's workout.
2. Show the active plan calendar.
3. Manage saved workout plans.
4. Import or create a new plan.

This is not fundamentally wrong, but the current order and hierarchy make the route feel like a management page first and a training-start page second.

For a premium daily-use product, the route should behave like this:

```txt
Today first -> weekly context -> saved plans library -> add/import plan
```

---

## 2. User intent and entry points

Likely reasons the user opens this route:

| User intent | Expected route behavior |
|---|---|
| I want to train now | Show today's workout and Start/Resume immediately. |
| I want to check my week | Show the active weekly calendar. |
| I want to manage plans | Show saved plans library and actions. |
| I have no plan yet | Guide me to import from ChatGPT or create manually. |
| I want another plan | Let me add/import a plan without hiding the import flow. |

Current issue: the page title says “My workout”, but the screen starts with Refresh/Create controls, then calendar, then plan cards, while import is hidden in a Disclosure below the main content.

---

## 3. Current workflow map

```txt
Enter /my-workout/plans
-> Page heading
-> Refresh/Create manually controls
-> Loading/error/empty state
-> If active plan: weekly calendar
-> If today has workout: separate mobile-only Today's Workout card
-> Saved plan grid
-> Archived plans
-> Collapsed ChatGPT import disclosure
```

Issues:

- The strongest user intent, “start today's workout”, is not the first mental object.
- Start Today can appear in the calendar header and again in the mobile card.
- Empty state sends the user to `/settings/ai-imports` for ChatGPT import setup instead of making the plan creation/import path feel immediate.
- ChatGPT import is hidden after the plan grid and disappears entirely if any imported plan already exists.
- Plan management actions live in a small 40px details trigger and small menu buttons.

---

## 4. Recommended workflow map

```txt
Enter /my-workout/plans
-> Loading/error gate
-> If no plans:
   -> Plan setup hero
   -> Primary: Import from ChatGPT
   -> Secondary: Create manually
   -> Explain that plans can be edited after import
-> If active plan exists:
   -> Today hero: Start/Resume today's workout or clear rest-day message
   -> Weekly calendar as context
   -> Saved plans library
   -> Add plan/import plan as secondary action in library header or collapsed sheet
-> If plans exist but no active plan:
   -> Choose active plan hero
   -> Saved plan cards with Set as active action
   -> Add/import option secondary
```

This is a **reorder flow**, not a full replacement.

---

## 5. Missing comments / microcopy

Add or improve copy for:

- Why “Import from ChatGPT” is the recommended path for most users.
- What happens after import: “You can review, edit, schedule, and start workouts in Plaivra.”
- Rest-day state: user should understand that no workout today is normal, not a missing plan.
- Set as default: explain that default plan controls today's schedule.
- Archived plans: explain history is kept.
- ChatGPT access: explain read/write in the context of importing a workout plan.

Avoid generic helper copy that repeats labels.

---

## 6. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 8 | 15 | The route has the right ingredients but wrong hierarchy. Today/start should lead. |
| Button size, placement, and hierarchy | 9 | 15 | Main buttons are mostly okay; details trigger and menu buttons are too small/dense. |
| Spacing consistency and visual rhythm | 7 | 10 | Mostly on scale; plan grid and card actions feel utilitarian. |
| Feedback, optimistic UI, loading, and errors | 10 | 15 | Loading, error, empty states exist; plan actions reload the whole list and import silently fails on context load. |
| Motion and interaction quality | 5 | 15 | Calendar/card/menu changes are mostly static; no plan-selection or import-status choreography. |
| Mobile-first behavior and tap comfort | 7 | 10 | Mobile today card exists, but duplicate start actions and dense management actions remain. |
| AI safety, privacy, and destructive-action control | 8 | 10 | Delete is confirmed and permissions are explicit, but import/access framing needs more trust. |
| Premium/subscription readiness | 9 | 10 | Valuable feature set, but needs stronger workflow hierarchy before it feels paid-product ready. |
| **Total** | **63** | **100** | Functional, but workflow feels management-heavy. |

---

## 7. Button/action inventory

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Refresh | Top-right before content | Low-frequency action appears before primary user task. | Move to secondary/overflow or keep as low-emphasis after error/manual refresh context. | P2 |
| Create manually | Top-right before content | Useful but competes before user understands active state. | Move into Add plan area or no-plan setup hero as secondary. | P1 |
| Start today | Calendar header | Correct action but buried in calendar header. | Promote to Today hero. | P1 |
| Mobile Start Today's Workout | Separate mobile card | Duplicates Start today and fragments hierarchy. | Keep one Today hero pattern across mobile/desktop. | P1 |
| Open Plan | Plan card | Correct primary for library card. | Keep. | P2 |
| More actions trigger | Plan card top-right | `h-10 w-10`, below 48px baseline. | Resize to 48px effective area. | P1 |
| Set as default | Details menu | Important when no active/default plan, but hidden. | Surface as secondary/primary in plan card when no active plan; otherwise keep in menu. | P1 |
| Rename/Duplicate/Archive/Delete | Details menu | Dense menu with small buttons; destructive actions mixed with normal actions. | Increase touch target and separate destructive group. | P1 |
| Import from ChatGPT | Disclosure below page | Too hidden for no-plan or add-plan flow. | Move into no-plan hero and Add plan area. | P1 |
| Give ChatGPT access | Custom dashed button | Likely below 48px and weak trust framing. | Use standard Button styling and stronger access explanation. | P1 |

---

## 8. Motion/interaction inventory

| Interaction | Current behavior | Problem | Required standard | Decision | Priority |
|---|---|---|---|---|---|
| Loading plans | CardGridSkeleton | Good baseline. | Keep. | P2 |
| Load error | ErrorState with retry | Good baseline. | Keep. | P2 |
| Active plan calendar | Static grid | Day selection feels abrupt; no motion/state emphasis. | Add subtle selected-day/active-day feedback. | P2 |
| Start today | Route push | Fine, but no pressed/pending distinction. | Keep press feedback; no need for artificial delay. | P2 |
| Plan actions | Await server, reload plans | Feels heavy for default/duplicate/archive/rename. | Add pending state per plan and avoid full-page-feeling reload where possible. | P1 |
| Details menu | Native details open/close | Abrupt, small, no outside-close behavior. | Replace or improve with accessible 48px menu trigger and smoother state. | P1 |
| Import prompt copy/open | Copies then opens ChatGPT | Good idea, but status choreography is minimal. | Show prepare -> copied -> open ChatGPT status. | P2 |
| Permission grant | Saves then closes dialog | Good, but needs stronger pending label and access summary. | Add clearer pending/success copy. | P1 |

---

## 9. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Flow-first daily action | Today/start is not the primary first object. | Reorder to Today hero -> weekly context -> plan library. |
| One primary action per section | Refresh, create, start, open plan, import, and manage actions compete. | Group by user intent and demote low-frequency actions. |
| 48px tap target baseline | Plan action summary is `h-10 w-10`; menu buttons use `size=sm`. | Increase effective target size to 48px. |
| AI import should be contextual | Import flow is hidden in Disclosure and disappears if any imported plan exists. | Make import part of no-plan/add-plan workflow; do not hide forever after first import. |
| Motion should clarify state | Calendar, menu, and plan action transitions are static. | Add subtle, reduced-motion-safe feedback where state changes. |

---

## 10. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Reorder flow to lead with a Today hero when an active plan exists. | Codex/Kimi/Human | Open |
| P1 | For no-plan state, replace generic empty flow with a setup choice hero: Import from ChatGPT primary, Create manually secondary. | Codex/Kimi/Human | Open |
| P1 | Move Create manually and Import into an Add plan area instead of top-level competing controls. | Codex/Kimi/Human | Open |
| P1 | Remove duplicate Start Today patterns; use one consistent Today hero across mobile/desktop. | Codex/Kimi/Human | Open |
| P1 | Make plan More actions trigger and menu items 48px effective tap targets. | Codex/Kimi/Human | Open |
| P1 | Separate destructive menu actions visually from normal actions. | Codex/Kimi/Human | Open |
| P1 | Improve ChatGPT import/access framing and use standard button styling. | Codex/Kimi/Human | Open |
| P2 | Add subtle calendar selected-day and plan action pending feedback. | Codex/Kimi/Human | Open |
| P2 | Avoid silent import context load failure; show degraded-state copy if setup data cannot load. | Codex/Kimi/Human | Open |
| P2 | Add reduced-motion-safe menu/import/status transitions where useful. | Codex/Kimi/Human | Open |

---

## 11. Retest checklist

- [ ] If an active plan exists, the first meaningful object is today's workout/rest-day status.
- [ ] If no plans exist, the first meaningful object is a plan setup choice, not a settings redirect.
- [ ] Import from ChatGPT is accessible as an add-plan path, not hidden forever after one imported plan.
- [ ] Create manually is secondary to import in no-plan state.
- [ ] Start Today appears once as the dominant action when relevant.
- [ ] Plan management actions meet 48px effective tap target.
- [ ] Destructive actions are separated and confirmed.
- [ ] Loading, error, empty, and retry states remain intact.
- [ ] ChatGPT permission copy explains access clearly.
- [ ] Motion clarifies menu/state/calendar changes without decoration.
- [ ] Mobile 390x844 feels like a training-start flow, not only an admin plan library.

---

## 12. Implementation note

This route should not be redesigned visually from scratch. It should be **reordered and clarified**:

```txt
Today hero -> weekly calendar -> saved plan library -> add/import plan
```

Keep existing data services and plan actions. The high-value change is workflow hierarchy, not a new backend model.
