PLAIVRA SEED-ONLY GUIDE

This file is not migration authority.

Migration authority:
- supabase/migration-ledger.json
- the immutable files under supabase/migrations/
- the repository's supported Supabase CLI/release procedure

Never copy, replay, rename, rewrite, delete, or manually reorder an applied migration from this directory or the Supabase SQL Editor.

Seeds are optional data fixtures for a fresh local, isolated development, or explicitly approved reviewer environment. Do not run them against production unless a separately reviewed operation explicitly authorizes the exact seed and target.

Available seed files:
1. 001_egyptian_foods.sql — optional app-owned food reference data for an appropriate fresh environment.
2. 002_sample_workouts_and_videos.sql — optional small demo fixture only.
3. 004_admin_setup_placeholder.sql — manual placeholder; edit and review the target identity before use.

Use `supabase db reset --local` for the repository's local migration chain. The Quality workflow resets with `--no-seed`, so seeds are not required for migration or application correctness.

Exercise catalog data comes from the current migration/provider architecture. Do not search for or run retired numbered FitLife migrations or duplicate exercise seeds.
