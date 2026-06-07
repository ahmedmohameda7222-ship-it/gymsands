# FitLife Hub

FitLife Hub is a private gym web app for workout logging, meal tracking, calorie targets, progress, onboarding, and admin-managed wellness operations.

## Included

- Next.js App Router, React, and TypeScript
- Tailwind CSS luxury wellness design tokens
- Supabase Auth, database, RLS, and Storage
- Egyptian food seed data
- Clean exercise library based on reviewed wger imports
- Rule-based onboarding workout generation
- Food, coach, email, wearable, health, and maps server routes
- Admin review tools for users, foods, workouts, videos, API imports, exercise approvals, and API status

## Environment

Copy `.env.example` and configure only the providers you use. Public browser variables are limited to `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, and `NEXT_PUBLIC_USE_MOCK_AUTH`.

All provider keys stay server-side:

- `SUPABASE_SERVICE_ROLE_KEY`
- `WGER_API_KEY`
- `USDA_API_KEY`
- `EDAMAM_APP_ID`
- `EDAMAM_APP_KEY`
- `NUTRITIONIX_APP_ID`
- `NUTRITIONIX_API_KEY`
- `OPENAI_API_KEY`
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

If a provider key is blank, its API route returns a clear `503` JSON response.

## Supabase Setup

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
17. Register the first admin user.
18. Run `supabase/seed/004_admin_setup_placeholder.sql` after editing the admin email if needed.

For projects that already imported legacy exercise data, back up the database first, then review the cleanup SQL under `supabase/cleanup`.

## wger Exercise Import

1. Configure `WGER_API_KEY`.
2. Sign in as an admin.
3. Open Admin > API Imports.
4. Import a page of wger exercises.
5. Review imported source, source ID, source URL, license, and author fields.
6. Approve exercises before they can appear in generated plans.

Imported exercises start with `is_approved = false`. The workout generator reads only approved global rows from `public.exercises`.

## Full Plan Generation

After onboarding, `/api/workout-plan/generate` creates one complete active plan from deterministic rules:

- Goal normalization: muscle gain, fat loss, strength, or general fitness
- Experience filtering: beginner, intermediate, or advanced
- Weekly split selection from 2 to 6 days
- Warm-up block for every day
- Strength block from approved Supabase exercises
- Cardio block based on goal and experience
- Cool-down block for every day
- Scheduled sessions for completion tracking

The route writes both `user_workout_plan_blocks` / `user_workout_plan_block_items` and compatible `user_workout_plan_exercises` rows.

## Provider Routes

Implemented server routes:

- Open Food Facts barcode lookup
- USDA food search and detail lookup
- Edamam meal parsing
- Nutritionix food and exercise parsing
- wger exercise import
- OpenAI coach notes and summaries
- Resend email sending
- Strava OAuth and activity import
- Google Health OAuth-ready placeholder import
- Google Maps Routes distance/time lookup

Health Connect is Android-native and is documented in-app as future Android support only.

## Local Development

```bash
npm install
npm run build
npm run lint
```

## Safety

FitLife Hub is for general fitness tracking and coaching support. It is not medical advice. Users should avoid training through serious pain and consult a qualified professional for medical concerns.
