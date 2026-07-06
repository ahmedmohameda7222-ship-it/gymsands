# Plaivra Flow & Workflow Audit Standard

**Version:** 2026.1  
**Status:** Required part of the Plaivra UX Constitution  
**Parent standards:**

- `docs/ux-constitution/README.md`
- `docs/ux-constitution/motion-and-interaction.md`
- `docs/ux-progress/README.md`

---

## 1. Core rule

Plaivra audits must be **flow-first**, not button-first.

Before auditing buttons, spacing, icons, or animations, audit whether the section's workflow is correct.

A visually polished bad flow is still a bad product experience.

---

## 2. Audit order

Every section audit must follow this order:

```txt
1. Product role
2. User intent and entry points
3. Current workflow
4. Ideal workflow
5. Flow decision
6. Information architecture and screen structure
7. Content, coaching comments, and microcopy
8. Buttons and action hierarchy
9. States: loading, empty, success, error, offline, pending
10. Motion and interaction design
11. Implementation risk
12. Score and correction prompt
```

Do not start by judging buttons unless the workflow itself already passes.

---

## 3. Product role check

For every route or section, first answer:

```txt
What job does this section do in Plaivra?
Is this section daily-use, setup, review, planning, editing, or settings?
Is the user here to act quickly, explore, configure, or recover from a problem?
Would this section still make sense on web, iOS, and Android?
```

Examples:

| Section type | Expected experience |
|---|---|
| Daily action | Fast, low-friction, optimistic, minimal thinking |
| Setup/onboarding | Guided, calm, progressive, confidence-building |
| Planning | Structured, editable, reversible |
| Review/report | Insight-first, not action-heavy |
| Settings/privacy | Stable, serious, low motion, explicit consequences |
| AI permissions/imports | Trust-first, transparent, approval-based |

---

## 4. User intent and entry point check

For each route, identify:

```txt
1. Why did the user arrive here?
2. What does the user expect to happen next?
3. What should be done in under 10 seconds?
4. What should be deferred to a secondary screen, sheet, or edit mode?
5. What must never happen silently?
```

A route fails this check if it treats all users as if they have the same intent.

---

## 5. Current workflow map

Before recommending UI changes, map the current flow:

```txt
Entry point -> Screen state -> Primary action -> Secondary actions -> Success state -> Failure/recovery state -> Exit point
```

Also identify:

```txt
- Required decisions
- Optional decisions
- Repeated actions
- Risky actions
- Dead ends
- Loops
- Duplicated CTAs
- Missing comments/explanations
- Moments where the user may lose trust
```

---

## 6. Ideal workflow proposal

If the current flow is weak, propose a better workflow before touching buttons.

Use this structure:

```txt
Recommended flow:
1. First screen impression
2. Main user decision
3. Next best action
4. Optional/advanced choices
5. Success moment
6. Recovery path
7. Exit/next route
```

The proposed flow should reduce cognitive load and make the section feel intentional.

---

## 7. Flow decision labels

Every route audit must assign one flow decision:

| Decision | Meaning |
|---|---|
| Keep flow | Workflow is strong; only UI/action/motion fixes needed. |
| Tune flow | Workflow is mostly correct but needs ordering, grouping, or progressive disclosure. |
| Reorder flow | Same content, better sequence. |
| Split flow | One overloaded section should become multiple focused steps/sheets/routes. |
| Merge flow | Too many steps for tightly related decisions. |
| Replace flow | Current workflow is fundamentally weak and should be redesigned. |
| Needs validation | Plaivra lacks enough product evidence; make a conservative improvement only. |

---

## 8. Human-experience principles

### 8.1 Progressive disclosure

Show the most important options first. Defer advanced, rare, or risky options until they are relevant.

Use this for:

```txt
- Dashboard action density
- Onboarding details
- AI permissions
- Settings
- Workout editing
- Meal-plan editing
```

### 8.2 Staged disclosure

Use step-by-step flows when decisions are naturally sequential and do not need constant back-and-forth.

Good for:

```txt
- Onboarding
- Import/review/apply flows
- Subscription setup
- Account deletion
```

Bad for:

```txt
- Frequent daily logging
- Workout set tracking
- Water quick add
- Anything repeated many times per day
```

### 8.3 Three-anchor rule

This is a Plaivra product rule, not a universal law.

On every important screen, the user should quickly understand three anchors:

```txt
1. Where am I?
2. What matters most here?
3. What should I do next?
```

Do not blindly reduce every interface to three items. Use three anchors to protect clarity.

### 8.4 Peak and end moments

For important flows, define:

```txt
Peak moment: the moment that should feel most useful, satisfying, or confidence-building.
End moment: the final state the user remembers before leaving the flow.
```

Examples:

| Flow | Peak moment | End moment |
|---|---|---|
| Workout session | Completing final set or workout | Clear workout completion summary |
| Onboarding | Seeing setup progress become complete | Saved profile + clear next step |
| Meal plan | Plan becomes actionable | Shopping/list/logging next step |
| AI import | User understands what will be applied | Explicit approval and saved result |

### 8.5 Feedback loop

Every meaningful flow must close the loop:

```txt
Action -> visible response -> saved/pending status -> success/error -> next step
```

A flow is incomplete if the user acts and then has to guess what happened.

---

## 9. Content and comments check

Before button and animation fixes, check whether the route needs better explanation.

Add comments/microcopy only when it improves trust or action clarity.

Good comments explain:

```txt
- Why this field exists
- What will happen after saving
- What AI can read/write
- Why an action is disabled
- What data is missing
- What the next step is
```

Avoid comments that:

```txt
- Repeat the label
- Add visual noise
- Sound like AI filler
- Explain obvious buttons
- Make a daily action slower
```

---

## 10. Button audit happens after flow audit

Only after the workflow decision is made, audit buttons:

```txt
- Is there one primary action?
- Are secondary actions demoted?
- Are rare actions hidden?
- Are destructive actions protected?
- Are all tap targets at least 48 x 48 px?
- Are labels specific and action-oriented?
```

If the flow is going to change, do not waste time optimizing old buttons.

---

## 11. Motion audit happens after flow audit

Motion must support the chosen workflow.

Examples:

| Flow issue | Motion role |
|---|---|
| Step-by-step onboarding | Step transition, progress motion, calm completion |
| Daily logging | Instant tap feedback, optimistic completion |
| Report review | Chart/value transitions, no excessive movement |
| Settings/privacy | Minimal motion, clear confirmation |
| AI import | Status choreography: prepare -> copy -> open -> apply |

Do not choose animation before choosing the flow.

---

## 12. Audit output format

Every future route audit should include:

```txt
1. Flow verdict
2. Current workflow map
3. Recommended workflow map
4. Flow decision label
5. Missing comments/microcopy
6. Button/action inventory
7. Motion/interaction inventory
8. Required fixes P0/P1/P2/P3
9. Score
10. Codex prompt section
```

---

## 13. Agent instruction

When asking Codex, Kimi, Claude, or another agent to audit or implement UX changes, include:

```txt
Audit the workflow first. Do not begin with buttons or visual polish. If the flow is weak, propose the corrected flow before changing UI. Only after the flow decision is clear should you audit buttons, spacing, states, and motion. Use docs/ux-constitution/flow-and-workflow-audit.md as a required source of truth.
```
