-- Initial EU public launch eligibility: 16+.
--
-- This migration is intentionally staged. Existing rows are preserved for an
-- owner/legal review; PostgreSQL enforces a NOT VALID check for new and changed
-- rows without scanning or deleting historical data.

alter table public.onboarding_answers
  drop constraint if exists onboarding_answers_age_check;

alter table public.onboarding_answers
  add constraint onboarding_answers_age_launch_check
  check (age is null or age between 16 and 100)
  not valid;

comment on constraint onboarding_answers_age_launch_check on public.onboarding_answers is
  'Initial public launch accepts ages 16-100. Existing conflicting rows require owner review before later validation.';

-- Cutover gate (manual, later migration only):
-- 1. Run supabase/verification/age-eligibility-review.sql with owner access.
-- 2. Resolve every conflict_under_16/missing_confirmation decision without
--    silently deleting accounts.
-- 3. Add a later migration that VALIDATEs this constraint.
--
-- Forward-fix/rollback option before validation:
--   drop onboarding_answers_age_launch_check and restore a NOT VALID 13-100
--   check in a new migration. Never rewrite this file after it is applied.
