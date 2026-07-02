-- Phase 6 legal/privacy consent types.
-- Forward-only and intentionally not applied automatically.

alter table public.user_consents
  drop constraint if exists user_consents_consent_type_check;

alter table public.user_consents
  add constraint user_consents_consent_type_check
  check (
    consent_type in (
      'terms',
      'privacy',
      'ai_processing',
      'fitness_data',
      'health_disclaimer',
      'marketing',
      'cookies',
      'age_18',
      'age_16',
      'chatgpt_connection'
    )
  );
