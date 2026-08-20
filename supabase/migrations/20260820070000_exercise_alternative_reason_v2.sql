-- Exercise Detail V2 / Active Workout replacement reason vocabulary.
-- Repository-only pending migration. This is additive: historical rows are not rewritten.

alter table public.user_exercise_alternatives
  drop constraint if exists user_exercise_alternatives_reason_check;

alter table public.user_exercise_alternatives
  add constraint user_exercise_alternatives_reason_check
  check (
    reason in (
      -- Historical values remain valid for backward-compatible reads.
      'machine_taken',
      'no_equipment',
      'pain_or_discomfort',
      'too_hard',
      'home_alternative',
      'same_muscle',
      'lower_back_friendly',
      'knee_friendly',
      'shoulder_friendly',
      'other',
      -- Canonical V2 user intents. New writes preserve these exact values.
      'want_harder',
      'pain_discomfort',
      'no_spotter',
      'technique_confidence',
      'variation'
    )
  );
