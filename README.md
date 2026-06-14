# FitLife Hub

FitLife Hub is a private fitness dashboard for storing, editing, and tracking workout plans, meal plans, calories, hydration, progress, habits, recovery, supplements, and personal records.

FitLife Hub does not generate workout or meal plans inside the app. Users create plans with ChatGPT, then export them to FitLife Hub for tracking.

## Product model

- ChatGPT creates personalized workout and meal plans.
- FitLife Hub stores exported plans.
- FitLife Hub lets users edit saved plans after import.
- FitLife Hub tracks workout completion, skipped days, sets, reps, weight, notes, duration, meals, macros, water, and progress.

## Included

- Next.js App Router, React, and TypeScript
- Tailwind CSS luxury wellness design tokens
- Supabase Auth, database, RLS, and Storage
- ChatGPT/FitLife connector URL support
- Workout plan storage and tracking
- Manual workout plan builder for advanced editing
- Exercise library based on active wger imports
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
- Gemini-based plan generation
- Billing, checkout, subscriptions, or payment flows

## Environment

Copy `.env.example` and configure only the providers you use.

Public browser variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_USE_MOCK_AUTH`
- `NEXT_PUBLIC_CHATGPT_CONNECT_URL`
- `NEXT_PUBLIC_FITLIFE_MCP_SERVER_URL`

Server-side provider keys:

- `SUPABASE_SERVICE_ROLE_KEY`
- `WGER_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI`
- `GOOGLE_HEALTH_CLIENT_ID`
- `GOOGLE_HEALTH_CLIENT_SECRET`
- `GOOGLE_HEALTH_REDIRECT_URI`
- `GOOGLE_MAPS_API_KEY`
- `GYM_ADDRESS` or `GYM_LAT` and `GYM_LNG`

If a provider key is blank, its API route should return a clear JSON response instead of failing silently.

## Supabase setup

Run SQL in this order:

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
11. `supabase/migrations/009_workout_template_recommendations.sql`
12. `supabase/migrations/010_exercise_metadata_and_order.sql`
13. `supabase/migrations/011_user_nutrition_and_video_persistence.sql`
14. `supabase/migrations/012_default_plan_and_egyptian_kitchen.sql`
15. `supabase/migrations/013_fitlife_hub_wellness_generated_plans.sql`
16. `supabase/migrations/014_clean_exercise_library_and_api_integrations.sql`
17. `supabase/migrations/015_auto_activate_wger_exercises.sql`
18. `supabase/migrations/016_exercise_calorie_reference.sql`
19. Register the first admin user.
20. Run `supabase/seed/004_admin_setup_placeholder.sql` after editing the admin email if needed.

For projects that already imported legacy exercise data, back up the database first, then review the cleanup SQL under `supabase/cleanup`.

## ChatGPT plan export workflow

1. User creates a workout or meal plan with ChatGPT.
2. ChatGPT exports the structured plan to FitLife Hub through the connector.
3. FitLife Hub saves the plan to the user's account.
4. User tracks sessions, sets, reps, weights, skipped days, planned meals, completed meals, calories, and progress.

## wger exercise import

1. Configure `WGER_API_KEY`.
2. Sign in as an admin.
3. Open Admin > API Imports.
4. Import a page of wger exercises.
5. New exercises become active immediately.
6. Open Admin > Exercise Library and remove anything you do not want members to use.

Duplicate imports keep removed rows hidden.

## Provider routes

Implemented server routes include:

- Open Food Facts barcode lookup, user food saving, daily log adding, and meal plan adding
- Local exercise calorie estimates from Supabase reference data
- wger exercise import
- Resend email sending
- Strava OAuth and activity import
- Google Health OAuth-ready placeholder import
- Google Maps Routes distance/time lookup

Health Connect is Android-native and is documented in-app as future Android support only.

## Local development

```bash
npm install
npm run build
npm run lint
npm run typecheck
```

## Safety

FitLife Hub is for general fitness tracking and coaching support. It is not medical advice. Users should avoid training through serious pain and consult a qualified professional for medical concerns.
