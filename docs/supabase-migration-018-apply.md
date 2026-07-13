# Supabase migration 018 application

This project includes `supabase/migrations/018_fitlife_security_archive_reporting.sql`.

The migration adds and supports:

- `user_workout_plans.archived_at`
- `user_workout_plans.archived_reason`
- `mcp_rate_limits`
- `admin_audit_logs`
- supporting indexes and RLS policies

## Why this matters

The app code now uses these structures for:

- archived workout plans
- connector request tracking
- admin activity visibility
- admin audit and quality panels

If this migration is committed to GitHub but not applied to the live Supabase database, the app build can still pass, but production features that query these tables may show setup warnings or fail to load their audit data.

## Runtime safeguards

The admin audit and quality APIs now return empty data with setup warnings when pending database objects are missing.

Normal users should not see raw database errors from these checks. Development builds may expose technical details for debugging.

## Manual apply steps

If Supabase CLI is not available locally:

1. Open the Supabase project dashboard.
2. Go to SQL Editor.
3. Open `supabase/migrations/018_fitlife_security_archive_reporting.sql` from the repo.
4. Copy the full SQL.
5. Run it once.
6. Confirm that these objects exist:
   - `public.mcp_rate_limits`
   - `public.admin_audit_logs`
   - `public.user_workout_plans.archived_at`
   - `public.user_workout_plans.archived_reason`

## Safety

The migration uses `if not exists` / `add column if not exists` patterns, so rerunning it should be safe if it was only partially applied.

Do not delete old migrations. They are part of the database history.
