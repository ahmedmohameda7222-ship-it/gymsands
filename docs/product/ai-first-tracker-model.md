# Plaivra AI-First Tracker Model

**Version:** 2026.1  
**Status:** Required product source of truth  
**Purpose:** Define Plaivra's core product model so future UX audits and implementation prompts do not treat Plaivra like a normal manual tracker.

---

## 1. Core product decision

Plaivra is **not primarily a manual data-entry app**.

Plaivra is an **AI-first tracker and overview system**.

The intended product model is:

```txt
User talks to ChatGPT
-> ChatGPT understands the request / photo / meal / workout / plan
-> ChatGPT prepares structured data
-> Plaivra imports or applies the structured data
-> Plaivra becomes the clean overview, tracker, history, and control layer
```

Manual entry must exist, but it should not be the main product promise.

Manual entry is:

```txt
- fallback
- correction path
- quick edit path
- power-user path
- offline/emergency path
```

The main experience should feel like:

```txt
Talk to ChatGPT -> review/apply in Plaivra -> track progress in Plaivra
```

---

## 2. Product positioning

Plaivra should not compete only as another calorie tracker, workout tracker, or wellness tracker.

Plaivra's differentiation:

```txt
ChatGPT handles messy input.
Plaivra handles structure, tracking, memory, and progress overview.
```

Examples:

| User input to ChatGPT | Plaivra result |
|---|---|
| Photo of a meal | Estimated calories/macros added to food log after review/import |
| “I ate chicken, rice, and salad” | Structured food log with calories/macros estimate |
| “Make me a 3-day PPL plan” | Workout plan imported into Plaivra |
| “Machine is taken, replace this exercise” | Temporary replacement saved for today or suggested for approval |
| “Adjust my calories for training days” | Day-type targets imported/reviewed in Plaivra |
| “Build a 1-week meal plan” | Meal plan imported into Plaivra |
| “Review my week” | Summary/insights generated from Plaivra data through explicit permission |

---

## 3. Data entry hierarchy

Every data-entry route must follow this hierarchy unless there is a documented exception.

```txt
1. ChatGPT-assisted import/apply
2. Fast repeat/reuse from previous Plaivra data
3. Simple manual add/edit
4. Advanced manual builder
```

This means:

- ChatGPT import should be visible and trusted, not hidden as an advanced tool.
- Repeat/reuse should be fast for daily actions.
- Manual entry should be available but not dominate the first screen.
- Advanced builders should not crowd daily-use flows.

---

## 4. Plaivra's role after import

Plaivra should be the place where the user can:

```txt
- review imported data
- approve or reject changes
- edit structured data
- track daily progress
- see history and trends
- understand what is active today
- control AI permissions
- export/delete data
```

Plaivra must not silently accept risky AI changes.

AI-assisted changes should be:

```txt
- explicit
- reviewable
- reversible where practical
- scoped by permission
- clearly attributed to ChatGPT/import
```

---

## 5. UX implications

### 5.1 Daily screens

Daily screens should start with:

```txt
What is active now?
What did ChatGPT/import add?
What should I review or do next?
What can I log quickly if I do not want to use ChatGPT?
```

They should not start with a large manual form unless the route is specifically a builder/editor.

### 5.2 Empty states

Empty states should not only say “add manually.”

They should usually offer:

```txt
Primary: Ask/Import from ChatGPT
Secondary: Create manually
Tertiary: Browse templates/recent examples if relevant
```

### 5.3 Correction/edit flows

Because AI estimates may be imperfect, Plaivra must make correction easy.

Important correction paths:

```txt
- edit food quantity/macros
- change meal type/date
- remove incorrect item
- review imported workout plan before activation
- replace exercise for today only
- adjust day-type calories
```

### 5.4 Trust framing

Any ChatGPT import should explain:

```txt
- what data ChatGPT will produce
- what Plaivra will import
- whether the user must approve before saving
- whether existing data will be overwritten
- what can be edited afterward
```

---

## 6. Audit rule

Future audits must not judge Plaivra as if manual input is the primary product.

For every route, ask:

```txt
1. Is this a tracker/overview route or a manual-entry route?
2. Where is the ChatGPT-assisted import path?
3. Is manual entry available as fallback without dominating?
4. Is review/apply clear and safe?
5. Can the user correct AI-imported data easily?
6. Does Plaivra give a useful overview after import?
```

If a route makes manual entry the main experience when AI import should be primary, mark it as a workflow issue.

---

## 7. Route implications

| Route | AI-first implication |
|---|---|
| Dashboard | Show imported/active state and next review/action, not many manual CTAs. |
| Onboarding | ChatGPT can help generate initial profile/preferences, but user must review. |
| Workout plans | Import from ChatGPT should be the primary plan creation path. Manual create is secondary. |
| Workout session | Execution/logging is direct; ChatGPT helps with replacement/coaching, not every set. |
| Calories | ChatGPT/photo/text meal import should be primary. Manual food entry is fallback/edit path. |
| Meal plan | ChatGPT meal-plan generation/import should be primary. Manual editing remains available. |
| Hydration | Direct quick logging is primary; ChatGPT is not needed for every water log. |
| Progress | Tracker/overview role; ChatGPT can summarize trends with explicit permission. |
| Settings / AI imports | Must clearly control what ChatGPT can read/write/import. |
| Data privacy | Must clearly show what Plaivra stores after AI imports. |

---

## 8. Codex instruction

When asking Codex or another agent to implement Plaivra flows, include:

```txt
Plaivra is an AI-first tracker, not primarily a manual data-entry app. ChatGPT-assisted import/apply should be the primary data-entry path where appropriate. Manual entry must remain available as fallback/edit/power-user path, but it should not dominate daily flows. Review/apply, correction, permission, and overview states are central to the product.
```
