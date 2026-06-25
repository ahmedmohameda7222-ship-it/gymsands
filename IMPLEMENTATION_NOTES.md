# Plaivra implementation notes

This repository is the source of truth for the Plaivra responsive web app.

## Product boundary

Plaivra does not generate workout or meal plans internally. Users create plans with ChatGPT or another external tool, then import/save them into Plaivra. Plaivra stores, schedules, edits, and tracks imported plans.

## Current primary private routes

- `/dashboard` — Today dashboard.
- `/my-workout/plans` — imported and manual workout plans.
- `/my-workout/plans/[id]` — saved plan details and editing.
- `/workouts` — exercise library.
- `/workouts/session/[id]` — single-exercise workout logger.
- `/workouts/session/day/[dayId]` — saved plan day workout logger.
- `/workout-history` — workout history.
- `/calories` — food log, water, calories, macros, and food search/logging.
- `/my-meal-plan` — meal planning.
- `/calories/custom-food-meal` — custom kitchens, foods, and meals.
- `/calories/weekly-overview` — nutrition summary.
- `/progress` — weight, measurements, and progress photos.
- `/personal-records` — personal records.
- `/wellness` — wellness hub.
- `/hydration`, `/habits`, `/sleep-recovery`, `/supplements`, `/daily-fit-tasks` — wellness subflows.
- `/settings` — connected apps and ChatGPT import setup.
- `/profile` — profile and goal settings.
- `/admin/*` — admin-only tools.

The old `/meals` route was removed. Food logging lives in `/calories`; custom kitchen/food/meal management lives in `/calories/custom-food-meal`.

## ChatGPT import / MCP

Implemented MCP-related routes and modules:

- `app/api/mcp/route.ts`
- `lib/mcp/auth.ts`
- `lib/mcp/server.ts`
- `lib/mcp/tools.ts`
- `lib/mcp/tool-executor.ts`
- `lib/mcp/schemas.ts`
- `lib/server/supabase-admin.ts`
- `docs/chatgpt-mcp.md`

ChatGPT saves workout and meal plan data through the MCP tool executor. There is no `/api/workout-plan/generate` route and no in-app workout-plan generation path.

## Supabase migrations

Use the canonical migration order in `README.md`. The previously colliding `014_*` migration names have been normalized so that:

- `014_clean_exercise_library_and_api_integrations.sql` remains migration 014.
- `015_chatgpt_mcp_connections.sql` contains ChatGPT/MCP connection tables.
- `016_auto_activate_wger_exercises.sql` contains wger activation cleanup.
- `017_exercise_calorie_reference.sql` contains the exercise calorie reference data.

## Removed internal generator modules

The old rule-based workout generator modules were removed because Plaivra no longer generates workout plans internally:

- `lib/workouts/generator.ts`
- `lib/workouts/cardio-generator.ts`
- `lib/workouts/cooldown-generator.ts`
- `lib/workouts/exercise-selection.ts`
- `lib/workouts/generator-rules.ts`
- `lib/workouts/warmup-generator.ts`

## Validation commands

```bash
npm run lint
npm run typecheck
npm run build
```
