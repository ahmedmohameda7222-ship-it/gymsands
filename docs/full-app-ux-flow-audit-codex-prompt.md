# Codex Prompt — Full Plaivra UX Flow Audit, Redesign, and Progress Tracking

You are working on the Plaivra repo.

This is a **full UX cleanup, product-flow audit, redesign, and progress-tracked implementation pass** for the entire Plaivra application after the ChatGPT execution layer implementation.

This is not only a small bugfix task.

The app currently has the new ChatGPT execution layer implemented, but the UX may still feel too technical, too complex, too form-heavy, and not friendly enough for normal users.

Your task is to make the app feel like a real user-friendly fitness/nutrition product.

---

## Repository

Repo:

```txt
ahmedmohameda7222-ship-it/gymsands
```

Recent implementation commit:

```txt
ec2e171 feat: add ChatGPT execution layer workflows
```

Before editing:

```bash
git status
git pull
```

If the working tree is not clean, do not discard changes. Stop and report.

---

## Main objective

Make Plaivra significantly more user-friendly.

The user should not feel that they are using a technical tool, a developer dashboard, or an internal AI/MCP interface.

The user should feel:

```txt
I know where to go.
I know what each button does.
I can start a workout quickly.
I can log a set quickly.
I can fix a meal quickly.
I can use ChatGPT help without understanding JSON, MCP, tools, or internal data.
I am not confused by too many buttons.
The app guides me naturally.
```

---

## Very important design freedom

The app currently has no public users.

You are allowed to improve design, layout, section flow, button placement, navigation, and UX patterns.

You may change UI structure if it makes the app easier.

You may redesign cards, pages, tabs, forms, and flows.

Do **not** preserve bad UX just because it currently exists.

However:

- do not remove important working features
- do not break existing data
- do not break auth
- do not break Supabase/RLS
- do not break MCP permissions
- do not turn Plaivra into an internal AI generator

---

## Core product rule

Plaivra must remain a **ChatGPT execution layer**, not a built-in AI generator.

ChatGPT is responsible for:

- workout reasoning
- meal reasoning
- exercise substitution decisions
- meal regeneration decisions
- weekly review decisions
- coaching explanations

Plaivra is responsible for:

- storing structured data
- tracking execution
- showing simple user-friendly actions
- preparing context internally
- saving structured results
- keeping the user in control
- making the UX simple and understandable

Do **not** add:

- internal workout generator
- internal meal generator
- OpenAI API plan generation inside Plaivra
- Gemini generation
- hidden automatic plan rewriting
- medical diagnosis
- medical nutrition engine
- autonomous destructive changes

---

# Absolute rule: never show JSON to the user

This is critical.

The current implementation shows raw JSON context in the AI action request dialog.

Remove this completely from the user interface.

Do **not** show:

- JSON preview
- raw context
- technical context
- “Advanced: View technical context”
- hidden expandable raw JSON
- developer-style request text
- MCP/tool/internal field names
- source IDs unless truly needed
- database-style object structures

The user must never see JSON.

JSON can exist internally in the database or service layer, but it must not appear in UI.

If a prompt must be copied to ChatGPT, make it human-readable, short, and clean.

Example of acceptable user-facing request:

```txt
Please help me replace Bench Press in today’s Push workout.

Reason: shoulder discomfort.
Goal: suggest a safer alternative for the same muscle group.
Context: I am currently doing Push Day, and my previous best was 60 kg x 8.

Do not change anything automatically. Explain the recommendation first.
```

Example of forbidden user-facing request:

```json
{
  "workout_day": {...},
  "context_json": {...},
  "source_id": "...",
  "planned_exercises": [...]
}
```

No JSON. No technical object previews. No developer mode.

---

# Progress tracking requirement

You must track your work during implementation, not only at the end.

Create or update this file before making major changes:

```txt
docs/full-app-ux-flow-audit-and-polish-status.md
```

Use it as a live progress tracker.

Update it after each major section is reviewed and after each major fix is implemented.

The tracker must include:

```md
# Full App UX Flow Audit and Polish Status

## Current progress

| Area | Audit started | Problems found | Fixes implemented | Tested | Status | Notes |
|---|---:|---:|---:|---:|---|---|
| Global navigation | No | 0 | 0 | No | Not started | |
| Dashboard | No | 0 | 0 | No | Not started | |
| Workout plans | No | 0 | 0 | No | Not started | |
| Workout session | No | 0 | 0 | No | Not started | |
| Meal plan | No | 0 | 0 | No | Not started | |
| Grocery list | No | 0 | 0 | No | Not started | |
| Calories / targets | No | 0 | 0 | No | Not started | |
| Wellness | No | 0 | 0 | No | Not started | |
| Settings / Coaching Context | No | 0 | 0 | No | Not started | |
| ChatGPT request flow | No | 0 | 0 | No | Not started | |
| Mobile UX | No | 0 | 0 | No | Not started | |
| Permissions / MCP UX | No | 0 | 0 | No | Not started | |

## Detailed implementation log

| Step | Section | Problem | Fix | Files changed | Test result | Status |
|---|---|---|---|---|---|---|

## Completion score

- Total sections planned:
- Sections audited:
- Sections improved:
- Sections tested:
- Fully complete:
- Partial:
- Missing:
- Completion percentage:

## Remaining risks

## Automated test results

## Manual normal-user test results

## Final assessment
```

At the end, calculate real completion percentage.

Do not say “done” without showing what was audited, changed, tested, and what remains.

---

# Files to read first

Read these files before making changes:

```txt
docs/chatgpt-execution-layer-implementation-plan.md
docs/chatgpt-execution-layer-implementation-status.md

components/ai/ai-action-request-dialog.tsx
components/ai/workout-ai-action-panel.tsx

components/profile/execution-profiles.tsx

components/wellness/daily-checkins.tsx

components/meals/my-meal-plan-builder.tsx
components/meals/grocery-list-panel.tsx
components/meals/meal-ai-actions.tsx
components/meals/nutrition-target-profiles.tsx
services/meals/meal-validation.ts

components/workouts/workout-day-session.tsx

app/(private)/dashboard/page.tsx
app/(private)/my-workout/plans/page.tsx
app/(private)/my-meal-plan/page.tsx
app/(private)/calories/page.tsx
app/(private)/wellness/page.tsx
app/(private)/settings/page.tsx
app/(private)/settings/coaching-profile/page.tsx

services/database/execution-layer.ts
types/database.ts

lib/mcp/server.ts
lib/mcp/tools.ts
lib/mcp/scopes.ts

supabase/migrations/
```

Also inspect any related components/routes/services you find while tracing the flows.

---

# Part 1 — Fix AI request UX completely

Files:

```txt
components/ai/ai-action-request-dialog.tsx
components/ai/workout-ai-action-panel.tsx
components/meals/meal-ai-actions.tsx
components/workouts/workout-day-session.tsx
```

## Current problem

The current ChatGPT request flow feels too technical.

It shows context previews, JSON, long generated prompt text, and developer-like request content.

The user should not see any of that.

## Required new behavior

When the user clicks a ChatGPT action, show a simple dialog:

```txt
Ask ChatGPT for help

What do you want help with?
[short human-readable summary]

Optional note:
[textbox]

[Prepare request]
```

After the request is prepared:

```txt
Your ChatGPT request is ready.

Next:
1. Open ChatGPT.
2. Ask ChatGPT to help with this request.
3. Review the answer.
4. Approve only the changes you want saved in Plaivra.

[Copy simple request]
[Open ChatGPT]
[Mark as sent]
[Mark as resolved]
[Cancel]
```

## Absolutely forbidden

Do not show raw JSON.

Do not show technical context.

Do not show `context_json`.

Do not show full database rows.

Do not show IDs unless required.

Do not show `source_type`, `source_id`, internal object names, or raw arrays.

## Required helper

Create a clean helper that converts context to a simple human summary.

Possible file:

```txt
components/ai/ai-action-summary.ts
```

Example output:

### Workout replacement

```txt
Workout: Push Day
Exercise: Bench Press
Reason: Shoulder discomfort
Goal: Suggest a safe replacement
```

### Low readiness

```txt
Workout: Leg Day
Today’s readiness: Low
Goal: Make the workout lighter without changing the full plan
```

### Meal action

```txt
Meal: Chicken rice bowl
Meal type: Lunch
Goal: Make it cheaper and keep the macros practical
```

### Weekly review

```txt
Goal: Review this week’s training, meals, hydration, and recovery
Focus: suggest small practical improvements
```

## Copy request text

The copied request must be human-readable.

Example:

```txt
Please help me with this Plaivra request:

Goal: Replace an exercise in today’s workout.
Workout: Push Day.
Exercise: Bench Press.
Reason: Shoulder discomfort.

Please recommend a practical replacement. Explain your reasoning first. Do not make changes unless I approve them.
```

No JSON.

## Request lifecycle

Add user-facing buttons:

- Copy request
- Open ChatGPT
- Mark as sent
- Mark as resolved
- Cancel request

Use existing statuses:

```txt
ready_for_chatgpt
sent_to_chatgpt
resolved
cancelled
```

Acceptance criteria:

- user never sees JSON
- request feels simple
- user understands what to do next
- request statuses can be changed
- copy still works
- open ChatGPT still works
- mobile dialog is clean

Update the progress tracker after this part.

---

# Part 2 — Recent ChatGPT Requests

Current problem:

A user can create a ChatGPT request, close the dialog, and lose it.

Create:

```txt
components/ai/recent-ai-action-requests.tsx
```

And add a route if appropriate:

```txt
app/(private)/settings/chatgpt-requests/page.tsx
```

or place it in a better existing route if the app already has an AI settings area.

## Required UI

Show recent requests in normal language:

```txt
Recent ChatGPT Requests

Replace exercise
Status: Ready
Created: Today
[Copy] [Mark sent] [Resolve] [Cancel]

Weekly review
Status: Sent
Created: Yesterday
[Copy] [Resolve]
```

Do not show raw JSON.

Do not show technical context.

Show max 3 on dashboard if added there.

Full list can be in settings or coaching context.

Acceptance criteria:

- user can find recent requests
- user can copy again
- user can mark sent/resolved/cancelled
- no JSON appears

Update the progress tracker after this part.

---

# Part 3 — Full app UX flow audit

This is a major part of the task.

You must inspect the whole application section by section and act like a normal user.

For each section, answer:

```txt
What is the main user goal here?
Can a normal user complete it easily?
Are there too many buttons?
Are there duplicate actions?
Are there redirects that feel wrong?
Are important actions hidden?
Are secondary actions too visible?
Does mobile feel crowded?
Does the page explain itself clearly?
```

Then improve the flow.

You are allowed to change design/layout if it improves UX.

Update the progress tracker section by section.

---

# Sections to audit and improve

## 1. Dashboard

Review:

- first screen after login
- today summary
- workout shortcut
- meal/calorie summary
- water/habits/wellness
- daily check-in
- weekly ChatGPT review
- recent ChatGPT requests if added

Look for:

- too many cards
- too much scrolling
- dashboard becoming a form wall
- unclear primary action
- duplicate shortcuts
- weak mobile layout

Required improvement:

Dashboard should answer:

```txt
What should I do today?
What is my current status?
What is the next best action?
```

Keep dashboard simple.

Recommended structure:

```txt
Today
- Workout today
- Calories/protein today
- Water
- Check-in quick card

Next actions
- Start workout
- Log meal
- Check in
- Ask weekly review

Recent
- latest ChatGPT requests
```

Do not overload it.

Update progress tracker after Dashboard audit and fixes.

---

## 2. Workout Plans

Review:

- how a user creates/imports a workout
- how a user views a plan
- how a user starts today’s workout
- how a user edits a workout
- how a user skips a workout
- how a user asks ChatGPT for changes

Look for:

- confusing buttons
- too many places to start workout
- unclear active plan
- hidden edit actions
- duplicate ChatGPT actions
- redirects that send the user away from the expected place

Required improvement:

Make the flow obvious:

```txt
My Workout
1. Active plan visible
2. Today’s workout visible
3. Start workout button clear
4. Edit plan secondary
5. ChatGPT actions secondary
```

Update progress tracker after Workout Plans audit and fixes.

---

## 3. Workout Session

Review as a user in the gym.

Main goal:

```txt
Log workout quickly with minimal friction.
```

Primary actions must be:

- see current exercise
- enter reps
- enter weight
- finish set
- see rest timer
- use previous set
- finish workout

Secondary actions:

- ChatGPT actions
- progression details
- saved alternatives
- exercise guide
- custom video
- live summary
- detailed PR info

Required improvement:

Make workout mode less crowded.

Use collapsible sections:

```txt
Progression details
ChatGPT help
Exercise guide
Saved alternatives
Workout summary
```

Keep set logging primary.

### Replace exercise flow

Add two paths:

```txt
Replace manually for today
Ask ChatGPT
```

Manual replacement must be fast:

```txt
Replacement exercise name
Reason
[Use for today]
```

Store it as user-created alternative and show it immediately.

Do not require ChatGPT for a simple machine-taken scenario.

Update progress tracker after Workout Session audit and fixes.

---

## 4. Meal Plan

Review:

- user opens meal plan
- sees today’s meals
- adds a planned meal
- edits a meal
- marks meal done
- asks ChatGPT to fix a meal
- moves to shopping list

Look for:

- too many buttons in meal cards
- hidden important actions
- confusing validation warnings
- too technical macro copy
- mobile clutter

Required improvement:

Meal card primary actions:

```txt
Done
Edit
Add to grocery
```

ChatGPT primary actions:

```txt
Replace
Cheaper
Faster
```

More actions hidden under:

```txt
More meal fixes
```

Remove native ugly `<details>` if present and replace with styled app-consistent collapsible UI.

Update progress tracker after Meal Plan audit and fixes.

---

## 5. Grocery List

Review:

- user wants to shop
- user wants ingredient list
- user imports meals
- user checks items
- user marks already have
- user adds quick item
- user prints/shares

Current issue:

`Add meal-plan items` imports meal names, not true ingredient-level items.

Required changes:

Rename:

```txt
Add meal-plan items
```

to:

```txt
Import meals as rough list
```

Add helper text:

```txt
This imports meal names as a rough list. For ingredient-level groceries, use ChatGPT to build the list.
```

Make ChatGPT ingredient action more prominent:

```txt
Build ingredient list with ChatGPT
```

Mobile quick add should show only:

```txt
Item name
Add
```

Advanced fields collapsible:

```txt
Quantity
Unit
Section
Notes
```

Update progress tracker after Grocery audit and fixes.

---

## 6. Calories / Nutrition Targets

Review:

- daily calories page
- calorie targets
- training/rest target profiles
- active target display
- target editing
- water target

Current issue:

Active profile vs edit profile can confuse users.

Required improvement:

Make it clear:

```txt
Today detected as: Training day
Active target: 2600 kcal · P 180g · C 300g · F 70g
```

Then actions:

```txt
Edit active target
Override today
Copy from default
Use current target as default
```

Show profile cards:

```txt
Default day
Training day
Rest day
High activity day
```

Avoid confusing dropdown-only UX.

Update progress tracker after Calories audit and fixes.

---

## 7. Wellness

Review:

- sleep/recovery
- soreness/fatigue
- daily check-ins
- habits
- supplements
- wellness trackers

Current issue:

Daily check-in can be too heavy.

Required improvement:

Dashboard compact check-in should be short:

```txt
Energy
Soreness
Ready to train?
```

Full check-in belongs in Wellness.

Use segmented buttons instead of dropdowns where possible.

Values should be human:

```txt
Low / Okay / High
Ready / Maybe / Not today
```

Update progress tracker after Wellness audit and fixes.

---

## 8. Settings / Coaching Context

Review:

- AI permissions
- coaching context
- safety profile
- nutrition preferences
- profile settings

Current issue:

Coaching Context looks like a technical/admin form.

Required improvement:

Make it friendlier.

Split into cards:

```txt
Training safety
Food preferences
Budget & cooking
AI request context
```

Replace comma-separated inputs with chips/tag inputs.

Create reusable:

```txt
components/ui/tag-input.tsx
```

Use it for:

- injuries
- pain areas
- meal prep days
- kitchen equipment
- preferred cuisines
- disliked foods

Add clear helper text:

```txt
This helps ChatGPT understand your situation. Plaivra does not diagnose or give medical advice.
```

Do not make it scary, but keep safety clear.

Update progress tracker after Settings/Coaching audit and fixes.

---

# Part 4 — Safety logic improvement

Current issue:

Red safety profile currently blocks too few action types.

Improve safety decision logic.

Create helper:

```txt
getAiActionSafetyDecision(actionType, safetyProfile)
```

Return:

```txt
allow
warn
block
```

Use it inside the AI action request dialog.

## Suggested behavior

### Green

Allow normally.

### Yellow

Allow but show caution.

### Red

Block or pause risky requests:

- aggressive workout progression
- adjust next workout if it may increase load
- explain progression if it encourages loading
- high-protein/nutrition manipulation if eating-disorder risk exists
- aggressive meal/nutrition target changes if risk exists
- training through pain

Allow safer requests with warning:

- reduce workout volume
- reduce intensity
- recovery workout
- general weekly review

Never diagnose.

Never provide medical advice.

User-facing wording:

```txt
Because your safety profile is marked high caution, Plaivra will not prepare this request. For medical, pain, pregnancy/postpartum, medication, or eating-disorder concerns, consult a qualified professional.
```

Update progress tracker after Safety logic fixes.

---

# Part 5 — Remove technical wording from UI

Search the new UI for technical words and replace them where user-facing.

Avoid user-facing terms like:

```txt
context_json
source type
source id
MCP
scope
payload
raw context
technical context
object
JSON
database row
```

Use user-facing terms:

```txt
request
summary
saved request
ChatGPT help
your workout context
your meal context
permissions
```

MCP/scopes can remain in internal code and developer docs, but normal app UI should not feel technical.

Update progress tracker after technical wording cleanup.

---

# Part 6 — Navigation and redirect audit

Audit all main flows for wrong redirects.

Examples to check:

## Workout

- Click start workout from dashboard
- Click back from workout session
- Finish workout
- Skip workout
- Replace exercise
- Open coaching profile from pain/discomfort
- Return to workout after editing context if possible

## Meal

- Add food
- Mark done
- Add to grocery
- Go to shopping
- Create ChatGPT meal request
- Return to meal plan

## Settings

- Open coaching context
- Save profile
- Return to settings
- Open AI permissions
- Open recent ChatGPT requests

If a redirect feels wrong, fix it.

Do not send user to unrelated pages.

If an action can be completed in-place, prefer in-place dialog/drawer instead of redirect.

Update progress tracker after navigation audit and fixes.

---

# Part 7 — Duplicate button/action audit

Go section by section and identify duplicate or repeated actions.

Examples:

- same ChatGPT action repeated too many times
- start workout button in multiple confusing places
- edit action hidden and visible at same time
- disabled placeholders like “No guide added” shown repeatedly
- too many badges in the same row
- too many CTAs with same visual priority

Fix by using hierarchy:

```txt
Primary action: one obvious button
Secondary actions: smaller/outline
Advanced actions: collapsible menu
```

Update progress tracker after duplicate action cleanup.

---

# Part 8 — Mobile-first audit

Test layouts mentally and with browser if possible.

Focus especially on:

- dashboard
- workout session
- meal plan
- grocery list
- daily check-in
- coaching profile
- AI request dialog

Fix:

- horizontal overflow
- too many cards
- long buttons
- tiny tap targets
- sticky actions blocking content
- forms too long
- dialog too tall
- too many badges
- too many columns collapsing badly

Mobile should be usable with one hand where possible.

Update progress tracker after mobile audit and fixes.

---

# Part 9 — Visual design polish

You may redesign components to improve look and usability.

Allowed:

- change card layout
- change button grouping
- change tabs
- use collapsibles
- use drawers/dialogs
- simplify sections
- rename labels
- move actions
- remove disabled placeholder buttons
- improve spacing
- improve mobile layout
- change copy

Not allowed:

- remove core features
- remove user data
- break routes
- break Supabase
- break MCP
- add internal AI generation

## Specific visual improvements

### Remove noisy disabled placeholders

For workout exercise guide/custom video:

If no guide/video exists, do not show big disabled buttons repeatedly. Show nothing, or show small text only when useful.

### Shorten mobile buttons

Desktop:

```txt
Replace exercise
Make today lighter
Review workout
```

Mobile:

```txt
Replace
Lighter
Review
```

### Use collapsible advanced sections

Anything not required during the current user task should be secondary.

Update progress tracker after visual polish.

---

# Part 10 — Section-by-section final UX test

After changes, test as a normal user.

Do not only run automated tests.

Simulate these flows:

## New user / dashboard

1. Log in.
2. Land on dashboard.
3. Understand what to do next within 5 seconds.
4. Start daily check-in.
5. Navigate to workout.
6. Navigate to meal plan.

## Workout flow

1. Open My Workout.
2. Find active plan.
3. Start today's workout.
4. Log first set.
5. Use previous set.
6. Finish set.
7. See rest timer.
8. Replace exercise manually.
9. Ask ChatGPT to replace exercise.
10. Finish workout.
11. Return to relevant place.

## Meal flow

1. Open My Meal Plan.
2. Add planned meal.
3. Mark meal done.
4. Edit meal.
5. Use ChatGPT cheaper/faster action.
6. Add meal to grocery.
7. Go to shopping list.

## Grocery flow

1. Add quick grocery item.
2. Add quantity/section from advanced details.
3. Import meals as rough list.
4. Build ingredient list with ChatGPT.
5. Check items.
6. Mark already have.
7. Share/export.

## Calories flow

1. Open Calories.
2. See current target.
3. Understand active target profile.
4. Edit active target.
5. Override target if needed.
6. Confirm old target system still works.

## Wellness flow

1. Open Wellness.
2. Fill full check-in.
3. Add recovery/sleep if available.
4. Confirm workout readiness can use this data.

## Settings / coaching profile

1. Open Settings.
2. Open Coaching Context.
3. Add injuries as chips.
4. Add food preferences as chips.
5. Save.
6. Confirm safety/caution copy is understandable.
7. Open recent ChatGPT requests.

## ChatGPT request flow

1. Create workout request.
2. Confirm no JSON appears.
3. Confirm simple request summary appears.
4. Copy request.
5. Open ChatGPT.
6. Mark sent.
7. Mark resolved.
8. Find it later in recent requests.

Update progress tracker after manual flow testing.

---

# Testing commands

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

Run tests:

```bash
npm test
```

or the correct available test command.

If tests fail, fix them.

Update progress tracker with actual results.

---

# Required final report

Update:

```txt
docs/full-app-ux-flow-audit-and-polish-status.md
```

Include:

```md
# Full App UX Flow Audit and Polish Status

## Summary

## Current progress

## Global UX changes

## AI request UX changes

## Section-by-section audit

| Section | Problems found | Changes made | UX score before | UX score after | Status |
|---|---|---|---:|---:|---|

## Navigation/redirect fixes

## Duplicate action cleanup

## Mobile UX fixes

## Safety UX fixes

## Detailed implementation log

| Step | Section | Problem | Fix | Files changed | Test result | Status |
|---|---|---|---|---|---|---|

## Completion score

- Total sections planned:
- Sections audited:
- Sections improved:
- Sections tested:
- Fully complete:
- Partial:
- Missing:
- Completion percentage:

## Remaining risks

## Automated test results

## Manual normal-user test results

## Final assessment
```

Final assessment must include scores:

```txt
Overall UX clarity:
Dashboard UX:
Workout UX:
Meal plan UX:
Grocery UX:
Calories UX:
Wellness UX:
Settings/Profile UX:
ChatGPT request UX:
Mobile usability:
```

---

# Commit instructions

After all tests pass:

```bash
git status
git diff --stat
```

Commit with:

```txt
fix: simplify and polish Plaivra user flows
```

Do not push unless instructed.

---

# Final quality target

The app should feel like this:

```txt
Simple first.
Powerful second.
Technical never visible to normal users.
```

The user should never need to understand JSON, MCP, tools, database structure, or raw context.

The user should only see clear actions:

```txt
Start workout
Log set
Replace exercise
Fix meal
Build grocery list
Check in
Ask ChatGPT
Review week
```

Plaivra should guide the user naturally through every section.

