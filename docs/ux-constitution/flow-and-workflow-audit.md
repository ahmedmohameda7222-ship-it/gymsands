# Plaivra Flow & Workflow Audit Standard

**Version:** 2026.1  
**Status:** Required part of the Plaivra UX Constitution  
**Parent standards:**

- `docs/product/ai-first-tracker-model.md`
- `docs/ux-constitution/README.md`
- `docs/ux-constitution/motion-and-interaction.md`
- `docs/ux-progress/README.md`

---

## 1. Core rule

Plaivra audits must be **flow-first**, not button-first.

Plaivra audits must also be **AI-first**, not manual-entry-first.

Before auditing buttons, spacing, icons, or animations, audit whether the section's workflow is correct for Plaivra's actual product model:

```txt
ChatGPT handles messy input.
Plaivra handles structure, review, import, tracking, history, and overview.
```

A visually polished bad flow is still a bad product experience.

A polished manual-entry flow is also wrong when the route should primarily support ChatGPT-assisted import/apply.

---

## 2. Audit order

Every section audit must follow this order:

```txt
1. Product role
2. AI-first vs manual-entry role
3. User intent and entry points
4. Current workflow
5. Ideal workflow
6. Flow decision
7. Information architecture and screen structure
8. Content, coaching comments, and microcopy
9. Buttons and action hierarchy
10. States: loading, empty, success, error, offline, pending
11. Motion and interaction design
12. Implementation risk
13. Score and correction prompt
```

Do not start by judging buttons unless the workflow itself already passes.

---

## 3. Product role check

For every route or section, first answer:

```txt
What job does this section do in Plaivra?
Is this section daily-use, setup, review, planning, editing, or settings?
Is this route primarily for AI-assisted import, overview/tracking, direct execution, manual fallback, or advanced editing?
Is the user here to act quickly, explore, configure, or recover from a problem?
Would this section still make sense on web, iOS, and Android?
```

Examples:

| Section type | Expected experience |
|---|---|
| AI-assisted import | Trust-first, reviewable, clear apply/reject/correct path |
| Daily action | Fast, low-friction, optimistic, minimal thinking |
| Tracker/overview | Clear status, history, trends, next action |
| Setup/onboarding | Guided, calm, progressive, confidence-building |
| Planning | Structured, editable, reversible |
| Review/report | Insight-first, not action-heavy |
| Settings/privacy | Stable, serious, low motion, explicit consequences |
| AI permissions/imports | Trust-first, transparent, approval-based |

---

## 4. AI-first data-entry hierarchy

Plaivra is not primarily a manual-entry app.

Every data-entry route must be audited against this hierarchy unless there is a documented exception:

```txt
1. ChatGPT-assisted import/apply
2. Fast repeat/reuse from previous Plaivra data
3. Simple manual add/edit
4. Advanced manual builder
```

Audit questions:

```txt
Where is the ChatGPT import/apply path?
Is it primary when it should be primary?
Is manual entry available without dominating?
Can the user review imported data before it changes important state?
Can the user correct AI-estimated data easily?
Does Plaivra provide a useful overview after import?
```

Manual entry should be treated as:

```txt
- fallback
- correction path
- quick edit path
- power-user path
- offline/emergency path
```

Exception examples:

| Route | Primary behavior |
|---|---|
| Workout session | Direct set logging is primary; ChatGPT supports replacement/coaching. |
| Hydration | Direct quick logging is primary; ChatGPT is usually unnecessary. |
| Settings/privacy | Direct control is primary; AI must not obscure consequences. |

---

## 5. User intent and entry point check

For each route, identify:

```txt
1. Why did the user arrive here?
2. What does the user expect to happen next?
3. Is the user trying to import from ChatGPT, review imported data, track progress, or manually correct something?
4. What should be done in under 10 seconds?
5. What should be deferred to a secondary screen, sheet, or edit mode?
6. What must never happen silently?
```

A route fails this check if it treats all users as if they have the same intent.

A data-entry route also fails this check if it assumes the user wants to manually fill forms when the intended Plaivra behavior is ChatGPT-assisted import.

---

## 6. Current workflow map

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
- Manual-entry dominance
- Hidden or weak ChatGPT import path
- Missing review/apply states
- Missing correction path
- Missing comments/explanations
- Moments where the user may lose trust
```

---

## 7. Ideal workflow proposal

If the current flow is weak, propose a better workflow before touching buttons.

Use this structure:

```txt
Recommended flow:
1. First screen impression
2. Main user decision
3. ChatGPT/import path where relevant
4. Review/apply/correct step where relevant
5. Manual fallback/edit path
6. Optional/advanced choices
7. Success moment
8. Recovery path
9. Exit/next route
```

The proposed flow should reduce cognitive load and make the section feel intentional.

---

## 8. Flow decision labels

Every route audit must assign one flow decision:

| Decision | Meaning |
|---|---|
| Keep flow | Workflow is strong; only UI/action/motion fixes needed. |
| Tune flow | Workflow is mostly correct but needs ordering, grouping, or progressive disclosure. |
| Reorder flow | Same content, better sequence. |
| Split flow | One overloaded section should become multiple focused steps/sheets/routes. |
| Merge flow | Too many steps for tightly related decisions. |
| Replace flow | Current workflow is fundamentally weak and should be redesigned. |
| Needs AI-first reframing | Current workflow treats manual entry as primary when Plaivra should be ChatGPT/import-first. |
| Needs validation | Plaivra lacks enough product evidence; make a conservative improvement only. |

---

## 9. Human-experience principles

### 9.1 Progressive disclosure

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

### 9.2 Staged disclosure

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
- Frequent direct logging
- Workout set tracking
- Water quick add
- Anything repeated many times per day
```

### 9.3 Three-anchor rule

This is a Plaivra product rule, not a universal law.

On every important screen, the user should quickly understand three anchors:

```txt
1. Where am I?
2. What matters most here?
3. What should I do next?
```

For AI-first routes, the three anchors usually become:

```txt
1. What did ChatGPT/import create or prepare?
2. What is Plaivra tracking now?
3. What should I review, apply, or correct?
```

Do not blindly reduce every interface to three items. Use three anchors to protect clarity.

### 9.4 Peak and end moments

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
| Meal plan | ChatGPT plan becomes structured and editable | Plan saved + next meal/shopping step |
| AI import | User understands what will be applied | Explicit approval and saved result |
| Calories | ChatGPT/photo meal estimate becomes editable log | Calories/macros updated in today's overview |

### 9.5 Feedback loop

Every meaningful flow must close the loop:

```txt
Action -> visible response -> saved/pending status -> success/error -> next step
```

For AI-first import flows:

```txt
Ask/import -> parse/prepare -> review -> apply -> tracked overview -> correction path
```

A flow is incomplete if the user acts and then has to guess what happened.

---

## 10. Content and comments check

Before button and animation fixes, check whether the route needs better explanation.

Add comments/microcopy only when it improves trust or action clarity.

Good comments explain:

```txt
- Why this field exists
- What will happen after saving
- What ChatGPT can read/write/import
- Whether data will be reviewed before applying
- How the user can correct an AI estimate
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

## 11. Button audit happens after flow audit

Only after the workflow decision is made, audit buttons:

```txt
- Is there one primary action?
- Is ChatGPT/import primary where it should be?
- Is manual entry secondary/fallback where appropriate?
- Are secondary actions demoted?
- Are rare actions hidden?
- Are destructive actions protected?
- Are all tap targets at least 48 x 48 px?
- Are labels specific and action-oriented?
```

If the flow is going to change, do not waste time optimizing old buttons.

---

## 12. Motion audit happens after flow audit

Motion must support the chosen workflow.

Examples:

| Flow issue | Motion role |
|---|---|
| Step-by-step onboarding | Step transition, progress motion, calm completion |
| AI import/review/apply | Status choreography: prepare -> review -> apply -> saved |
| Direct daily logging | Instant tap feedback, optimistic completion |
| Report review | Chart/value transitions, no excessive movement |
| Settings/privacy | Minimal motion, clear confirmation |
| ChatGPT open/copy flow | Prepare -> copy -> open -> return/apply status |

Do not choose animation before choosing the flow.

---

## 13. Audit output format

Every future route audit should include:

```txt
1. Flow verdict
2. AI-first/manual-entry role
3. Current workflow map
4. Recommended workflow map
5. Flow decision label
6. Missing comments/microcopy
7. Button/action inventory
8. Motion/interaction inventory
9. Required fixes P0/P1/P2/P3
10. Score
11. Codex prompt section
```

---

## 14. Agent instruction

When asking Codex, Kimi, Claude, or another agent to audit or implement UX changes, include:

```txt
Audit the workflow first. Do not begin with buttons or visual polish. Plaivra is an AI-first tracker, not primarily a manual data-entry app. If the flow treats manual entry as primary where ChatGPT/import should be primary, reframe the workflow before changing UI. Only after the flow decision is clear should you audit buttons, spacing, states, and motion. Use docs/product/ai-first-tracker-model.md and docs/ux-constitution/flow-and-workflow-audit.md as required sources of truth.
```
