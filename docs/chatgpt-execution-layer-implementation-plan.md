# Plaivra ChatGPT Execution Layer Implementation Plan

## Purpose

This document is the implementation reference for the next Plaivra feature phase.

Plaivra should remain a **ChatGPT-connected fitness and nutrition execution layer**, not a built-in AI generator.

The goal is to improve the app so that users can take what they agree on with ChatGPT and execute it inside Plaivra with better tracking, context, adjustment workflows, grocery support, safety context, and accountability.

---

## Core Product Principle

### ChatGPT is the reasoning layer

ChatGPT should remain responsible for:

- creating workout plans
- creating meal plans
- adjusting workout plans
- replacing exercises
- reviewing workout sessions
- adapting plans after skipped workouts
- changing meal plans based on budget, prep time, preferences, or constraints
- explaining recommendations to the user

### Plaivra is the execution layer

Plaivra should be responsible for:

- storing structured workout plans
- storing structured meal plans
- tracking workout completion
- tracking sets, reps, weight, RPE, RIR, notes, and duration
- tracking food logs, calories, macros, water, progress, recovery, habits, supplements, and check-ins
- storing user preferences and safety context
- showing clean UI actions in the right place
- preparing structured context for ChatGPT
- saving ChatGPT-updated plans back into the account through existing MCP/tooling
- giving the user full control before changes are applied

---

## Non-Goals

Do **not** build these features:

- internal workout plan generator
- internal meal plan generator
- internal AI coach inside Plaivra
- Gemini-based plan generation
- OpenAI API-based plan generation inside the app
- hidden automatic plan rewriting
- medical diagnosis engine
- medical nutrition engine
- autonomous safety decisions without user confirmation
- automatic destructive edits without confirmation

Plaivra can calculate, validate, store, display, and structure data.  
Plaivra should not independently become the AI brain.

---

## Existing Plaivra Foundation

Plaivra already has a strong base. Do not duplicate these systems unless needed.

Existing app capabilities include:

- ChatGPT-first product model
- workout plan import/storage
- manual workout plan builder
- workout calendar
- workout session tracking
- set logging
- reps/weight tracking
- RPE/RIR fields
- rest timer
- previous performance display
- personal record detection
- basic overload guidance
- skipped workout status
- meal plan tracker
- mark meal done -> food log
- calorie and macro tracking
- water tracking
- calorie target wizard
- food builder
- barcode lookup
- basic shopping list from meal plan items
- hydration
- habits
- daily fit tasks
- sleep/recovery tracking
- soreness/fatigue/recovery fields
- readiness estimate
- supplements
- progress entries
- body measurements
- AI permissions
- MCP scopes and tool authorization

The next phase should build on top of these systems.

---

## Implementation Philosophy

For every new feature, prefer this pattern:

1. User is in the relevant app context.
2. App shows a small, useful action.
3. User chooses the action.
4. App collects structured context.
5. App creates a clear request for ChatGPT.
6. ChatGPT decides the actual plan change.
7. Plaivra saves the final structured result.
8. User remains in control.

Example:

User is logging Bench Press and feels shoulder pain.

Plaivra should not independently prescribe a medical solution.  
Plaivra should offer:

- Replace exercise
- Reason: pain/discomfort
- Include current exercise, plan, equipment, previous performance, and safety profile
- Send/prepare for ChatGPT
- Save ChatGPT's replacement if the user confirms

---

## UX Placement Rule

Codex should choose the best UX placement based on the existing app structure.

General guidance:

- workout-specific actions belong in workout session and workout plan views
- meal-specific actions belong in meal plan and calorie/food pages
- safety/profile settings belong in onboarding and settings
- daily accountability belongs in dashboard and wellness
- grocery features belong in meal plan shopping tab
- AI actions should be near the user problem, not hidden in settings

The UI should be clean, mobile-first, consistent with existing Plaivra cards/buttons/tabs, and should not overload the user.

---

# Features To Implement

---

## 1. AI Action Request Framework

### Goal

Create a reusable framework for user-triggered ChatGPT actions.

This keeps Plaivra as the execution layer while ChatGPT remains the reasoning layer.

### Suggested entity

Create a durable structure for AI action requests.

Possible table/name:

```txt
ai_action_requests
```

### Suggested fields

```txt
id
user_id
action_type
source_type
source_id
status
context_json
user_note
created_at
updated_at
resolved_at
```

### Suggested action types

```txt
replace_exercise
adjust_next_workout
rebalance_week
review_workout_session
adjust_for_low_readiness
regenerate_meal
make_meal_cheaper
make_meal_faster
replace_meal_ingredient
build_grocery_list
review_week
```

### Status values

```txt
draft
ready_for_chatgpt
sent_to_chatgpt
resolved
cancelled
```

### UX behavior

The app should allow the user to create a request from the correct page.  
The request should contain enough context for ChatGPT.

Examples:

- active workout day
- exercise name
- current plan
- previous performance
- RPE/RIR
- fatigue/soreness/readiness
- meal plan item
- nutrition preferences
- safety profile
- user note

The app can show:

- action preview
- copy prompt/context
- open ChatGPT setup
- waiting/resolved state
- cancel action

Do not apply final changes unless the user or ChatGPT returns a structured update through existing tools.

---

## 2. Workout AI Action Panel

### Goal

Add contextual ChatGPT action buttons inside workout-related pages.

### Suggested locations

- workout session page
- workout plan detail page
- workout day view
- workout history detail
- dashboard today workout card

### Actions

Add actions such as:

- Ask ChatGPT to review this session
- Ask ChatGPT to adjust next workout
- Ask ChatGPT to replace this exercise
- Ask ChatGPT to rebalance this week
- Ask ChatGPT to explain progression
- Ask ChatGPT to make today lighter

### Required context

For workout-session actions, include:

- current plan
- current day
- active exercise
- planned sets/reps/rest
- actual sets/reps/weight
- RPE/RIR
- notes
- previous performance
- PRs
- skipped exercises
- readiness data if available
- safety profile if available

---

## 3. Exercise Replacement Flow

### Goal

Let users quickly request or save exercise substitutions.

### User problem

Users often need alternatives because:

- machine is taken
- equipment is missing
- exercise causes pain/discomfort
- exercise is too hard
- user is training at home
- user wants the same muscle with different equipment

### Suggested UI

Add a `Replace exercise` button in:

- active workout session exercise card
- workout plan exercise row
- workout day detail page

### Replacement reasons

```txt
machine_taken
no_equipment
pain_or_discomfort
too_hard
home_alternative
same_muscle
lower_back_friendly
knee_friendly
shoulder_friendly
other
```

### Data to store

Create structured alternatives per plan exercise.

Suggested fields:

```txt
id
user_id
plan_exercise_id
original_exercise_name
alternative_exercise_name
reason
target_muscle
equipment
pain_friendly_note
created_by
created_at
updated_at
```

`created_by` can be:

```txt
user
chatgpt
```

### Behavior

The app should not automatically invent the replacement unless it is only saving a user-entered alternative.

For AI replacement:

1. User clicks replace.
2. User selects reason.
3. App creates AI action request.
4. ChatGPT returns a replacement.
5. App saves the replacement after user confirmation.

---

## 4. Skipped Workout Adjustment Flow

### Goal

Improve what happens after a user skips a workout.

### Existing state

Plaivra already supports skipped workout tracking.  
The missing piece is the next-step workflow.

### Suggested UX

After the user skips a workout, show a compact decision card:

```txt
You skipped Push Day. What should Plaivra do?
```

Options:

- Move to tomorrow
- Skip and continue
- Ask ChatGPT to rebalance this week
- Ask ChatGPT to reduce next session
- Add reason for skip

### Skip reasons

```txt
no_time
low_energy
sick
pain
travel
gym_closed
too_sore
other
```

### Behavior

Plaivra can store the skipped state and reason.

For rebalancing:

- create AI action request
- include the skipped workout, current week, remaining sessions, recovery data, and user note
- ChatGPT decides the actual adjusted plan
- app saves result only after confirmation/import

---

## 5. Progression Target Storage

### Goal

Store ChatGPT's next-session recommendations without building a full internal progression engine.

### Existing state

Plaivra already logs performance and shows simple overload guidance.

### Add fields/entity

Store progression recommendations per plan exercise or exercise session.

Suggested fields:

```txt
id
user_id
plan_exercise_id
exercise_name
next_target_weight_kg
next_target_reps
next_target_sets
progression_note
ai_recommendation
last_reviewed_at
last_reviewed_by
created_at
updated_at
```

`last_reviewed_by` can be:

```txt
user
chatgpt
system
```

### UX

Show next target near previous performance:

```txt
Last: 60 kg x 8
Next target: 60 kg x 10
ChatGPT note: Repeat weight until all working sets hit 10 reps.
```

### Important

Do not create a complex internal progression engine in this phase.  
Only store and display recommendations, and let ChatGPT update them.

---

## 6. Readiness-Based Workout Adjustment

### Goal

Connect sleep, fatigue, soreness, stress, and recovery data to workout actions.

### Existing state

Plaivra already stores recovery data and calculates readiness.

### Add behavior

Before starting a workout, if readiness is low, show a card:

```txt
Readiness is low today.
Ask ChatGPT to make this workout lighter?
```

Options:

- Ask ChatGPT to reduce volume
- Ask ChatGPT to reduce intensity
- Ask ChatGPT for recovery version
- Continue normally
- Log pain/discomfort

### Context to include

- latest sleep hours
- soreness
- fatigue
- stress
- recovery score
- today's planned workout
- recent workout history
- safety profile

### Safety rule

This should stay non-medical.  
Use wording like:

```txt
This is general fitness guidance. Do not train through sharp, unusual, or worsening pain.
```

---

## 7. Improved Grocery List

### Goal

Upgrade the existing shopping list into a more useful grocery execution tool.

### Existing state

Plaivra already has a basic shopping list from meal plan items.

### Missing

The current list is too food-name based and not enough ingredient/store/pantry based.

### Add features

- ingredient-level grocery items
- store sections
- quantity aggregation
- check-off items
- already-have-at-home toggle
- pantry notes
- print/share/export
- cheaper alternative request
- generate from selected week
- regenerate through ChatGPT

### Suggested grocery item fields

```txt
id
user_id
week_start
source_meal_plan_item_id
item_name
quantity
unit
store_section
checked
already_have
notes
created_by
created_at
updated_at
```

### Store sections

```txt
Protein
Carbs
Vegetables
Fruits
Dairy
Pantry
Frozen
Drinks
Other
```

### UX location

Use the existing `Shopping` tab in `My Meal Plan`.  
Improve it rather than creating a completely disconnected page unless UX requires it.

---

## 8. Budget and Prep-Time Nutrition Profile

### Goal

Store real-life meal planning constraints so ChatGPT can create practical meal plans.

### Add fields

```txt
weekly_food_budget
budget_currency
max_cooking_time_minutes
meal_prep_days
cooking_skill
kitchen_equipment
preferred_cuisines
disliked_foods
allergies
repeat_tolerance
meals_per_day
ingredient_reuse_preference
grocery_style_preference
```

### Suggested UX locations

- onboarding nutrition step
- settings/profile
- My Meal Plan top card
- Calories targets/tools area

### Important

These fields should be readable by ChatGPT through existing or extended profile/meal-plan tools.

---

## 9. Meal Regeneration Actions

### Goal

Let users fix one meal without regenerating the full meal plan.

### Add actions on meal plan item cards

- Regenerate this meal with ChatGPT
- Make this cheaper
- Make this faster
- Make this higher protein
- Replace ingredient
- Make dairy-free
- Make gluten-free
- Make Egyptian/Middle Eastern
- Add ingredients to grocery list

### Behavior

Each action should create an AI action request with:

- meal item
- date
- meal type
- calories/macros
- nutrition preferences
- budget/prep constraints
- user note

ChatGPT returns a replacement meal through existing MCP meal-plan tools.

---

## 10. AI Meal Validation

### Goal

Reduce incorrect calories/macros from AI-generated meal plans.

### Existing state

Plaivra already calculates food logs and targets.

### Add validation behavior

When meal items are imported or edited:

- compare calories and macros against known food data where possible
- flag missing or suspicious values
- warn if daily meal plan totals are far from targets
- warn if calories are extremely low or unrealistic
- allow user to review and correct numbers
- never silently overwrite user-entered values

### Suggested UI

Add small validation badges:

```txt
Looks valid
Needs review
Missing macros
Far from target
Very low calories
```

### Important

Do not rely on ChatGPT arithmetic as the source of truth.  
Plaivra should calculate and validate where possible.

---

## 11. Safety Profile and Red-Flag Flow

### Goal

Store health/safety context and show conservative warnings when needed.

### Add safety profile fields

```txt
injuries
pain_areas
medical_conditions
doctor_restrictions
medications_or_supplement_notes
pregnancy_or_postpartum
eating_disorder_risk_acknowledged
under_18_flag
movement_restrictions
nutrition_restrictions
emergency_warning_acknowledged
```

### Risk levels

```txt
green
yellow
red
```

### Suggested behavior

Green:

- normal app behavior

Yellow:

- show conservative warning
- include safety context in ChatGPT action requests

Red:

- block aggressive requests where appropriate
- recommend professional help
- do not generate or encourage extreme deficit, training through serious pain, or medical advice

### Important

Use careful wording:

```txt
Plaivra is not medical advice. For medical conditions, pain, pregnancy/postpartum, eating disorder concerns, or medication-related questions, consult a qualified professional.
```

### Suggested UX locations

- onboarding
- settings/profile
- before AI action request
- before workout adjustment
- before aggressive nutrition target changes

---

## 12. Morning and Evening Check-ins

### Goal

Turn wellness tracking into a clear daily accountability loop.

### Existing state

Plaivra already has wellness, habits, tasks, sleep/recovery, supplements, hydration.

### Add morning check-in

Fields:

```txt
sleep_hours
energy_level
soreness_level
stress_level
motivation_level
workout_readiness
today_main_goal
today_blocker
```

### Add evening review

Fields:

```txt
workout_done
protein_hit
calories_hit
water_hit
steps_or_movement_done
meal_plan_followed
main_blocker
tomorrow_note
```

### UX locations

- dashboard
- wellness page
- optional quick action from mobile nav
- daily checklist card

### ChatGPT use

Check-ins should be available as context for ChatGPT so it can give short, practical feedback and adjust future plans.

---

## 13. Training-Day vs Rest-Day Nutrition Targets

### Goal

Allow nutrition targets to differ between training and rest days.

### Add structure

Support optional target profiles:

```txt
default_day
training_day
rest_day
high_activity_day
```

Fields per target:

```txt
calories
protein_g
carbs_g
fat_g
water_ml
notes
```

### Behavior

- keep protein stable unless user/ChatGPT changes it
- allow higher carbs on training days
- allow lower calories on rest days during fat loss
- show active target based on today's workout status
- user can override manually

### Important

This can be ChatGPT-guided, not internally generated.

---

## 14. Weekly AI Review Entry Point

### Goal

Let the user ask ChatGPT to review the week using real Plaivra data.

### Suggested location

- dashboard
- progress page
- workout history
- weekly nutrition summary
- wellness page

### Context

Include:

- workout adherence
- skipped workouts
- PRs
- total volume summary
- calories/protein averages
- water adherence
- sleep/recovery trends
- habits/tasks
- user notes

### Action

Create AI action request:

```txt
review_week
```

ChatGPT can then recommend:

- keep same plan
- adjust volume
- adjust targets
- improve meal prep
- fix adherence blocker

---

# Suggested Implementation Order

## Phase 1 — Foundation

1. Create this documentation file.
2. Add/extend database types and migrations for:
   - AI action requests
   - safety profile
   - nutrition preference profile
   - progression targets
   - exercise alternatives
   - improved grocery items
   - daily check-ins
3. Add service functions for the new entities.
4. Keep all operations RLS-safe and user-scoped.

## Phase 2 — Workout UX

1. Add workout AI action panel.
2. Add exercise replacement flow.
3. Add skipped workout adjustment UX.
4. Add progression target display.
5. Add readiness-based workout adjustment prompt.

## Phase 3 — Nutrition UX

1. Improve grocery list.
2. Add budget/prep nutrition profile.
3. Add meal regeneration actions.
4. Add meal validation badges.
5. Add training/rest day nutrition targets.

## Phase 4 — Accountability UX

1. Add morning check-in.
2. Add evening review.
3. Connect check-ins to dashboard/wellness.
4. Add weekly AI review entry point.

## Phase 5 — Polish and Verification

1. Verify mobile UX.
2. Verify no internal AI generation was added.
3. Verify every AI action requires user intent.
4. Verify destructive changes require confirmation.
5. Verify new data is user-scoped.
6. Verify build, lint, typecheck.
7. Update README route/feature notes if needed.

---

# Acceptance Criteria

The implementation is acceptable only if:

- Plaivra still does not generate full workout or meal plans internally.
- ChatGPT remains the decision/planning layer.
- New UI actions are placed near the user problem.
- User can understand what will happen before triggering an action.
- User can cancel AI action requests.
- User data remains scoped by user_id.
- No silent destructive edits are introduced.
- Food/calorie/macro validation is deterministic where possible.
- Safety warnings are conservative and non-medical.
- Existing workout, meal, calorie, wellness, and permission flows still work.
- `npm run build`, `npm run lint`, and `npm run typecheck` pass.

---

# Developer Notes For Codex

Before implementing:

1. Read the current README.
2. Read existing workout session components and services.
3. Read meal plan builder and shopping list code.
4. Read wellness/recovery code.
5. Read onboarding and settings/profile flows.
6. Read MCP scopes and tool executor.
7. Reuse existing UI components and design language.
8. Avoid large unrelated redesigns.
9. Avoid changing existing working behavior unless required.
10. Add small, composable features with clear user value.

The best implementation is not the one with the most AI.  
The best implementation is the one that makes ChatGPT decisions executable, trackable, reviewable, and safe inside Plaivra.
