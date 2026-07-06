# Plaivra

Plaivra is a mobile-first fitness, nutrition, and wellness tracking app for storing user context, imported plans, daily logs, progress, and coaching preferences in one private account.

Plaivra does **not** generate workout or meal plans internally. Users can create plans with ChatGPT or another external tool, then save, import, edit, and track those plans in Plaivra.

## Product model

- Plaivra stores the user's body profile, goals, training setup, schedule, nutrition preferences, coach context, and AI permission settings.
- Plaivra can use saved profile/context to make future ChatGPT requests more relevant.
- ChatGPT or another external tool creates workout and meal plan suggestions.
- Plaivra stores imported/exported plans and lets users edit them after import.
- Plaivra tracks workout completion, skipped days, sets, reps, weight, notes, duration, meals, macros, water, wellness, personal records, and progress.
- Plaivra should not claim that it directly generates or automatically personalizes workout or meal plans inside the app.

## Included

- Next.js App Router, React, and TypeScript
- Tailwind CSS luxury wellness design tokens
- Supabase Auth, database, RLS, and Storage
- ChatGPT/Plaivra connector URL support
- Guided onboarding and editable profile context
- AI permission settings for read/write access by section
- Workout plan storage, editing, and tracking
- Manual workout plan builder for advanced editing
- Exercise library based on the real 600-exercise SQL seed
- Workout session tracking with set logs
- Meal planning and daily food logging
- Egyptian food seed data
- Custom food, kitchen, and meal builder
- Camera barcode lookup with direct food logging
- Local exercise calorie reference database
- Hydration, habits, daily tasks, sleep/recovery, supplements, personal records, and progress tracking
- Admin tools for users, foods, exercises, workouts, videos, API imports, exercise removal, API status, welcome messages, and settings

## Not included

- Internal workout plan generation
- Internal meal plan generation
- Internal AI plan generation inside Plaivra
- Billing, checkout, subscriptions, or payment flows
- Medical diagnosis, injury diagnosis, or clinical coaching

## Core user journeys

1. A user registers or signs in.
2. The user completes onboarding to save body profile, goals, training setup, schedule, nutrition preferences, coach context, and AI personalization settings.
3. The user creates workout or meal plans in ChatGPT or another external tool.
4. The user imports/saves structured plans into Plaivra.
5. Plaivra stores, edits, and tracks the plans over time.
6. The user logs workouts, sets, reps, meals, calories, hydration, wellness data, progress, and personal records.
7. When the user asks ChatGPT for help, Plaivra can provide saved profile/context so the request is more relevant.

## Current route structure

Primary private routes:

- `/onboarding?edit=true` — guided profile setup for body profile, goals, training context, schedule, nutrition preferences, coach context, and AI personalization settings
- `/dashboard` — Today dashboard and daily overview
- `/my-workout/plans` — imported and manual workout plans
- `/workouts` — exercise library
- `/workout-history` — workout history
- `/calories` — food log and calorie/macros tracking
- `/my-meal-plan` — meal planning
- `/calories/custom-food-meal` — custom food, kitchen, and meal builder
- `/calories/weekly-overview` — nutrition summary
- `/progress` — progress tracking
- `/personal-records` — PR tracking
- `/hydration` — account-backed daily water tracker
- `/wellness` — wellness hub, with habits, sleep/recovery, supplements, and daily tasks available from there
- `/settings` — connected apps, ChatGPT import setup, and AI permission controls, with advanced connection details hidden by default

The old `/meals` page was removed because food logging already lives under `/calories` and custom food/meal management lives under `/calories/custom-food-meal`.

## ChatGPT plan export workflow

1. User creates a workout or meal plan with ChatGPT or another external tool.
2. ChatGPT exports the structured plan to Plaivra through the connector/export workflow.
3. Plaivra saves the plan to the user's account.
4. User edits the saved plan when needed.
5. User tracks sessions, sets, reps, weights, skipped days, planned meals, completed meals, calories, hydration, wellness, and progress.

Plaivra's profile and onboarding data should be treated as context for ChatGPT requests, not as proof that Plaivra generates plans internally.

## Exercise library

Exercise data comes from `supabase/migrations/016_seed_real_600_exercise_library.sql`.

Do not run the retired duplicate seed or wger activation migrations. For a new Supabase database, the canonical order below is the source of truth.

## Environment

Copy `.env.example` and configure only the providers you use.

Public browser variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_USE_MOCK_AUTH`
- `NEXT_PUBLIC_CHATGPT_CONNECT_URL`
- `NEXT_PUBLIC_PLAIVRA_MCP_SERVER_URL`

Server-side provider keys:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

If a provider key is blank, its API route should return a clear JSON response instead of failing silently.

## Supabase setup

Run SQL in this canonical order. Some legacy files share numeric prefixes; do not rename migrations that may already be applied in production. Use this documented order, then create future migrations with a unique new prefix after the latest applied migration.

Some migration filenames include legacy `fitlife` naming. Keep those filenames unchanged because they may already be applied in production; the current product and brand name is Plaivra.

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_policy_refresh.sql`
3. `supabase/seed/001_egyptian_foods.sql`
4. `supabase/seed/002_sample_workouts_and_videos.sql`
5. `supabase/migrations/003_production_hotfix.sql`
6. `supabase/migrations/004_user_workout_plans.sql`
7. `supabase/migrations/005_weekly_workout_plan_calendar.sql`
8. `supabase/migrations/006_workout_session_tracking.sql`
9. `supabase/migrations/007_meal_plan_and_persistent_sessions.sql`
10. `supabase/migrations/008_workout_history_skip_status.sql`
11. `supabase/migrations/009_imported_workout_session_tracking.sql`
12. `supabase/migrations/010_exercise_metadata_and_order.sql`
13. `supabase/migrations/011_user_nutrition_and_video_persistence.sql`
14. `supabase/migrations/012_default_plan_and_egyptian_kitchen.sql`
15. `supabase/migrations/013_fitlife_hub_wellness_generated_plans.sql`
16. `supabase/migrations/014_clean_exercise_library_and_api_integrations.sql`
17. `supabase/migrations/015_chatgpt_manual_workout_food_profile_tools.sql`
18. `supabase/migrations/015_chatgpt_mcp_connections.sql`
19. `supabase/migrations/016_seed_real_600_exercise_library.sql`
20. `supabase/migrations/017_add_force_type_secondary_muscles_to_library.sql`
21. `supabase/migrations/017_exercise_calorie_reference.sql`
22. `supabase/migrations/017_onboarding_duration_and_barcode.sql`
23. `supabase/migrations/018_fitlife_security_archive_reporting.sql`
24. `supabase/migrations/019_progress_photos_measurements.sql`
25. `supabase/migrations/020_wellness_sleep_recovery_fields.sql`
26. `supabase/migrations/021_chatgpt_mcp_full_access_scopes.sql`
27. `supabase/migrations/021_cloud_sync_persistence.sql`
28. `supabase/migrations/022_saved_nutrition_favorites_recipes.sql`
29. Register the first admin user.
30. Run `supabase/seed/004_admin_setup_placeholder.sql` after editing the admin email if needed.

For projects that already imported legacy exercise data, back up the database first, then review the cleanup SQL under `supabase/cleanup`.

Plaivra does not generate workout plans internally. Do not add or run workout-template recommendation seeds; plans should be imported from ChatGPT or created manually by the user.

See `docs/reliability-audit-2026-06-14.md` for migration-collision notes, local-storage audit findings, and recommended account-level persistence tables.

See `docs/professional-feature-roadmap-2026-06-14.md` for the phased product roadmap, recommended information architecture, Phase 1 slice, and follow-up prompts for Phase 2-4.

## Provider routes

Implemented server routes include:

- Open Food Facts barcode lookup, user food saving, daily log adding, and meal plan adding
- Local exercise calorie estimates from Supabase reference data
- Resend email sending

## Local development

```bash
npm install
npm run build
npm run lint
npm run typecheck
```

## Safety

Plaivra is for general fitness and wellness tracking. It is not medical advice, injury diagnosis, or a replacement for qualified medical care or professional coaching. Users should avoid training through serious pain and consult a qualified professional for medical concerns.
