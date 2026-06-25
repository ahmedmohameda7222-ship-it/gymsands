# Reliability audit - 2026-06-14

This pass focused on low-risk cleanup, data trust, setup UX, and documentation. Plaivra remains a responsive web app that stores, schedules, edits, displays, and tracks imported plans. No internal workout or meal plan generation was added.

## Safe fixes implemented

- Dashboard now has a beginner "Start here" checklist based on real account data: profile name, calorie/water targets, active workout plan, first meal log, first progress entry, and workout started/history.
- Dashboard quick actions were de-duplicated and routed to the expected pages for workout import, meal planning, food logging, progress, hydration, and exercise library.
- `/hydration` is now a real account-backed tracker using `water_logs` and saved water targets, with quick add, today total, target progress, and recent history.
- ChatGPT import setup now defaults to a simple import wizard. Advanced URL/auth/scope details are hidden unless needed.
- Workout session saving no longer returns fake session IDs after Supabase failures in the touched single-workout flow.
- Workout set saving updates existing sets by exercise/set number and inserts new sets instead of deleting all session logs first.
- Completed workout set logs now auto-detect new personal records for max weight, max reps, estimated 1RM, and best session volume without inserting duplicates when an equal or better record already exists.
- User-facing errors in touched flows no longer mention migrations, SQL files, redeploys, or implementation details.
- Admin food save now refreshes the preview list after saving and shows a friendly failure message.
- Manual Plan Builder empty-state CTA now opens the builder instead of linking back to the same page.
- The stale barcode placeholder was removed because the calorie page already exposes real Open Food Facts barcode tools.
- Onboarding now loads saved answers so setup remains editable after signup.

## Account-level data still using device-only storage

These are intentionally not bulk-migrated in this pass because they affect multiple workflows and need table/RLS design plus data migration:

- Exercise favorites and custom exercise library preferences in `services/workouts/exercise-library-store.ts`.
- Meal-plan automation helpers for templates, copied weeks, batch meals, and shopping-list checks in `services/meals/meal-plan-automation.ts`.
- Food logging speed helpers such as recent/frequent/favorite quick logs in `services/meals/food-logging-speed.ts`.
- Enhanced wellness reminders/settings in `services/wellness/wellness-data.ts`.
- Workout filter preferences in `components/workouts/workout-browser.tsx`.
- Goal-weight fallback and body-fat estimate settings in `app/(private)/progress/page.tsx`.
- Welcome-popup seen state and workout timer drafts are device-only UI state and can stay local.

## Supabase migration recommendations

Do not rename existing migrations that may already be applied in production. The repository has duplicate numeric prefixes:

- `015_chatgpt_manual_workout_food_profile_tools.sql`
- `015_chatgpt_mcp_connections.sql`
- `015_seed_600_exercise_library_workouts.sql`
- `016_auto_activate_wger_exercises.sql`
- `016_seed_real_600_exercise_library.sql`
- `017_add_force_type_secondary_muscles_to_library.sql`
- `017_exercise_calorie_reference.sql`
- `017_onboarding_duration_and_barcode.sql`

Safe strategy:

- Keep these files in place.
- Document a canonical order in README.
- For future schema work, create new migrations with a unique next prefix after the latest applied migration.
- Prefer additive `if not exists`, `add column if not exists`, and policy refresh patterns for account data migrations.
- For new public tables on newer Supabase projects, explicitly grant Data API access as needed and enable RLS before use.

Recommended future account-level tables:

- `user_exercise_preferences` for favorites, hidden exercises, and custom exercise visibility.
- `user_meal_templates`, `user_batch_meals`, and `user_shopping_list_checks` for meal planning persistence.
- `user_food_shortcuts` for recent/frequent/favorite quick logging.
- `user_wellness_preferences` for reminders and body-fat estimate settings.
- `user_ui_preferences` for filters that should follow the account across devices.

## Information architecture recommendation

Keep the primary mental model simple:

- Today: dashboard, setup checklist, coaching, and immediate actions.
- Train: workout plans, session logging, exercise library, workout history, personal records.
- Eat: calories, food log, meal plan, custom foods/meals, barcode tools.
- Progress: weight, measurements, photos, reports.
- Wellness: hydration, habits, sleep/recovery, supplements, daily fit tasks.
- Settings/Admin: connection setup and technical/admin-only controls.

`/today-workout` appears to overlap with dashboard/workout-plan flows. It was not removed in this pass; treat it as a candidate for redirecting to the active workout day after usage is verified.

## Follow-up risks

- Single-workout set saving is safer, but a database-level unique index on `(workout_session_id, lower(exercise_name), set_number)` or a server-side RPC would make concurrent edits stronger.
- Meal template, batch meal, shopping-list, and quick-log preferences still need Supabase-backed migrations.
- Scheduled workout day sessions use a separate log model from single workout sessions; PR automation should be extended there after a focused audit of `user_exercise_logs`.
- Migration collision cleanup should remain documentation-first unless production migration history is audited.
