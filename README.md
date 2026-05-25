# S&S Gym

S&S Gym is a private gym web app for workout logging, Egyptian food/macros, calorie tracking, progress tracking, and admin management.

It is not a commercial SaaS app. There is no pricing, checkout, subscription, payment, or billing flow.

## What Is Included

- Next.js App Router + React + TypeScript
- Tailwind CSS blue dashboard theme
- shadcn-style UI components
- Framer Motion-ready dependency setup
- Supabase Auth, database, RLS, and Storage structure
- Egyptian food database seed with 100 foods
- Workout library, workout sessions, exercise videos, and import-ready video tables
- Member dashboard, meals, calorie tracker, workouts, progress, profile, onboarding
- Admin dashboard for users, foods, workouts, videos, welcome messages, and settings
- Netlify deployment config

## Netlify Environment Variables

Add these in Netlify under Site configuration > Environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_APP_URL=https://your-netlify-site.netlify.app
NEXT_PUBLIC_USE_MOCK_AUTH=false
```

The app also has a code fallback in `lib/env.ts` for the public Supabase URL and anon key. Prefer Netlify variables, but if Netlify env injection is not working, those public values can be placed there and committed. Never place a Supabase `service_role` key in frontend code.

## Netlify Build Settings

- Framework preset: Next.js
- Build command: `npm run build`
- Publish directory: `.next`

`netlify.toml` is already included.

## Supabase Setup

1. Create a new Supabase project.
2. Open Project Settings > API.
3. Copy the Project URL into `NEXT_PUBLIC_SUPABASE_URL`.
4. Copy the anon public key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Open Authentication > URL Configuration.
6. Set Site URL to your Netlify URL.
7. Add redirect URLs:

```text
https://your-netlify-site.netlify.app
https://your-netlify-site.netlify.app/login
https://your-netlify-site.netlify.app/onboarding
https://your-netlify-site.netlify.app/profile
```

## SQL Files To Run In Supabase SQL Editor

Run these in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_policy_refresh.sql`
3. `supabase/seed/001_egyptian_foods.sql`
4. `supabase/seed/002_sample_workouts_and_videos.sql`
5. Register your first user on the deployed site.
6. Edit and run `supabase/seed/004_admin_setup_placeholder.sql` with your email to make yourself admin.

If you already ran `001_initial_schema.sql`, you can still paste and run `002_policy_refresh.sql` afterward. It refreshes grants, RLS policies, and the private `progress-photos` storage policies.

The placeholder for adding the full 3000+ workout video table later is:

```text
supabase/seed/005_full_workout_video_import_placeholder.sql
```

CSV import format:

```text
supabase/seed/003_workout_video_import_template.csv
```

## Supabase Storage Setup

The migration creates a private bucket:

```text
progress-photos
```

If you create it manually, use:

- Bucket name: `progress-photos`
- Public bucket: off / false
- File size limit: your preference
- Allowed MIME types: `image/png`, `image/jpeg`, `image/webp`

The migration also creates Storage policies so users can only upload, read, update, and delete files inside their own folder:

```text
progress-photos/{user_id}/{progress_entry_id}/{file}
```

Admins can read/manage through the admin role policies.

## How Portion Changes Work

Global Egyptian foods are stored in `food_items` with:

- `is_global = true`
- `is_editable_by_user = false`
- `source_type = user_provided_approximate_macro_table`

Members can change only `quantity` when adding food to `food_logs`. The app recalculates:

```text
logged calories/macros = base calories/macros * quantity
```

Normal users cannot edit the base calories, protein, carbs, or fat for global Egyptian foods. User-created foods go into `user_food_items`.

## Workout Video Import Support

The app includes:

- `exercise_videos`
- `workout_video_imports`
- Admin video management page
- Matching by exercise name and category
- Fallback display: `Video will be added soon.`

The URLs you provided from `muscleandstrength.com` are instruction pages, not direct video file/embed URLs. S&S Gym stores them as instruction sources now. If a direct YouTube, Vimeo, or hosted video URL is added in `video_url`, the app embeds it as a video.

## Welcome Back Popup

The dashboard checks:

1. `user_welcome_messages` for a custom user message.
2. `admin_settings` for the default message.

Admins can:

- Set the default welcome message.
- Set a custom message for a user.
- Enable or disable popup behavior.
- Choose `every_login` or `once_per_day`.
- Preview the message in the admin page.

## Deployed Site Test Checklist

After Netlify deploys:

1. Open the Netlify URL.
2. Register a new account.
3. Complete onboarding.
4. Confirm dashboard loads.
5. Add an Egyptian food with quantity `0.5`, `1`, and `2`.
6. Confirm calories/macros update correctly.
7. Start and complete a workout.
8. Add a progress entry and optional photo.
9. Confirm Supabase tables receive rows.
10. Make your account admin with `004_admin_setup_placeholder.sql`.
11. Visit `/admin` and test foods, videos, users, welcome messages, and settings.

## Safety Notes

- S&S Gym is for general fitness tracking only.
- It is not medical advice.
- Users with medical conditions should speak with a doctor.
- Do not train through serious pain.
- Nutrition values are approximate and may vary depending on preparation and portion size.
- Egyptian food macros may vary depending on preparation.

## Optional Developer Setup

Local development is optional. This project is prepared for Netlify-first deployment.

```bash
npm install
npm run build
```

## Password Safety

Passwords are handled by Supabase Auth. The app does not store plaintext passwords in any database table. Admin pages show email/profile information only.
