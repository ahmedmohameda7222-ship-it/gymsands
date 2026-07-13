# Plaivra AI-First Context and Tracking Model

**Version:** 2026.2
**Status:** Required product source of truth
**Authority:** Subordinate to `PLAIVRA_PRODUCT_CONSTITUTION.md`

## 1. Core decision

Plaivra is not primarily a manual data-entry application.

Plaivra is a persistent personal fitness context, structured execution, tracking, history, correction, and visualization system designed to work with ChatGPT.

```text
User starts from Plaivra or ChatGPT
→ user asks ChatGPT for advice or an action
→ ChatGPT reads only authorized task-relevant Plaivra context
→ ChatGPT reasons about the request
→ for executable requests, ChatGPT calls Plaivra tools
→ Plaivra stores confirmed structured data
→ Plaivra visualizes and tracks it
```

There is no normal manual copy-back and no second Plaivra review/import queue after a successful tool call.

## 2. Product differentiation

```text
ChatGPT handles reasoning, interpretation, and intelligent execution.
Plaivra handles persistent context, permissions, structure, ownership, history, tracking, visualization, and correction.
```

The user should not repeat the same age, body profile, goals, training context, food preferences, budget, cooking constraints, equipment, schedule, and functional fitness constraints in every conversation.

## 3. Data-entry and execution hierarchy

Use this hierarchy where relevant:

```text
1. ChatGPT direct execution through authorized tools
2. Fast execution from existing Plaivra plans/data
3. Simple direct logging or correction
4. Advanced manual editing when genuinely useful
```

Manual controls remain first-class for real-world execution, including workout sets, completion, hydration, habits, tasks, supplements, edits, corrections, and privacy controls.

Complex manual plan construction must not dominate the normal product when ChatGPT can create the structure directly.

## 4. Persistent context rule

The complete profile is not returned by default.

Use task-specific projections:

- training planning;
- nutrition planning;
- workout adjustment;
- meal preparation;
- daily execution;
- progress summary.

The user controls access by category and read/write scope.

## 5. Advisory versus executable actions

### Advisory

Read-only examples:

- explain my progress;
- review my current plan;
- summarize my adherence;
- tell me what to prioritize today.

### Executable

Write examples:

- create a workout or meal plan;
- log a meal;
- replace an exercise;
- save a grocery list;
- change a target;
- record progress.

ChatGPT must not claim an action was saved before the Plaivra tool confirms success.

## 6. UX implications

### Daily screens

Start with:

- what is active now;
- the next useful action;
- current progress/status;
- fast execution controls;
- a contextual ChatGPT action only when it adds real value.

Do not lead with large setup forms or an AI request queue.

### Empty states

Use the next best product action. Depending on context this may be:

- create with ChatGPT;
- connect Plaivra;
- start a plan;
- log directly;
- configure missing profile context.

Do not use generic `No data` states.

### Correction

Every ChatGPT-created record must be editable, replaceable, and deletable through normal Plaivra controls.

### Trust

Show:

- what permission is required;
- what context category will be read;
- whether the action will write data;
- pending, success, and failure state;
- destructive confirmation before the tool call where required.

Do not add a second approval screen after a confirmed non-destructive write.

## 7. Route implications

| Area | Product implication |
|---|---|
| Today/dashboard | Show current plan, progress, and next action. |
| Onboarding/profile | Save reusable user-controlled context once. |
| Workout plans | ChatGPT creation is primary; direct execution and editing remain in Plaivra. |
| Workout session | Fast direct logging; ChatGPT supports requested adaptation. |
| Nutrition log | Fast logging and correction; ChatGPT handles messy input and reasoning. |
| Meal plan | ChatGPT creates structured plans directly; Plaivra visualizes and tracks them. |
| Hydration/tasks/habits/supplements | Direct quick execution is primary. |
| Progress | Visualize history; ChatGPT may explain authorized trends. |
| Settings | Control account, permissions, consent, connection, export, and deletion. |

## 8. Audit questions

For each route ask:

1. What is the dominant user job?
2. Is repeated profile context reused rather than requested again?
3. Is ChatGPT used where reasoning adds value?
4. Are direct execution controls fast where ChatGPT is unnecessary?
5. Is authorized context minimal and clear?
6. Is the result stored as normal user-owned structured data?
7. Can the user correct it?
8. Are loading, success, failure, offline, and revoked states covered?

## 9. Agent instruction

Use this instruction in implementation tasks:

```text
Plaivra is a persistent, user-controlled fitness context and execution platform for ChatGPT. ChatGPT is the reasoning layer and directly creates or updates structured Plaivra data through authorized tools. Plaivra is the storage, visualization, tracking, history, correction, permission, privacy, and execution layer. Do not build a copy/import queue or a second in-app approval workflow. Preserve fast direct controls for daily real-world execution and correction.
```
