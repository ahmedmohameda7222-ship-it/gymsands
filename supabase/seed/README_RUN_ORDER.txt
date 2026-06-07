RUN ORDER IN SUPABASE SQL EDITOR

Run migrations first, then seed only app-owned data.

1. Run every file in ../migrations in numeric order through 014.
2. Run 001_egyptian_foods.sql.
3. Run 002_sample_workouts_and_videos.sql only if you want the small manual demo set.
4. Register your first user.
5. Run 004_admin_setup_placeholder.sql after editing the target admin email if needed.

Exercise data now comes from the wger admin import route and is saved to public.exercises for review.
Imported exercises are hidden from the workout generator until an admin approves them.
