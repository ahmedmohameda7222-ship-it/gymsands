-- Register the material English legal-document revision without rewriting
-- prior consent records. This is a version marker, not legal approval.
insert into public.public_app_settings (key, value)
values (
  'legal_document_versions',
  jsonb_build_object(
    'terms', '2026-07-11',
    'privacy', '2026-07-11',
    'fitness_data', '2026-07-11',
    'health_disclaimer', '2026-07-11',
    'chatgpt_connection', '2026-07-11',
    'age_16', '2026-07-02',
    'effective_date', '2026-07-11',
    'review_status', 'professional_legal_review_required'
  )
)
on conflict (key) do update
set value = excluded.value;

comment on column public.user_consents.version is
  'Version of the specific legal or product consent accepted by the user. Prior versions remain immutable evidence.';
