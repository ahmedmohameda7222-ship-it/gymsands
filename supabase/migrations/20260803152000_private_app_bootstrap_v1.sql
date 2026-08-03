-- PCS-2: one authenticated, owner-scoped read authority for private application startup.

create or replace function public.get_private_app_bootstrap_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  profile_payload jsonb;
  account_state text;
  consent_payload jsonb;
  onboarding_payload jsonb;
  settings_payload jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select to_jsonb(profile)
    into profile_payload
  from public.profiles profile
  where profile.id = actor_id;

  select access.state
    into account_state
  from public.account_access_states access
  where access.user_id = actor_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'consent_type', consent.consent_type,
        'version', consent.version,
        'granted', consent.granted,
        'revoked_at', consent.revoked_at
      )
      order by consent.consent_type, consent.version
    ),
    '[]'::jsonb
  )
    into consent_payload
  from public.user_consents consent
  where consent.user_id = actor_id
    and consent.granted = true
    and consent.revoked_at is null;

  select jsonb_build_object(
    'age', onboarding.age,
    'completed_at', onboarding.completed_at
  )
    into onboarding_payload
  from public.onboarding_answers onboarding
  where onboarding.user_id = actor_id;

  select to_jsonb(settings)
    into settings_payload
  from public.user_app_settings settings
  where settings.user_id = actor_id;

  return jsonb_build_object(
    'contractVersion', 1,
    'userId', actor_id,
    'profile', profile_payload,
    'accountAccessState', coalesce(account_state, 'active'),
    'consentRecords', coalesce(consent_payload, '[]'::jsonb),
    'onboarding', coalesce(
      onboarding_payload,
      jsonb_build_object('age', null, 'completed_at', null)
    ),
    'settings', settings_payload
  );
end;
$$;

revoke all on function public.get_private_app_bootstrap_v1() from public, anon;
grant execute on function public.get_private_app_bootstrap_v1() to authenticated, service_role;

comment on function public.get_private_app_bootstrap_v1() is
  'Returns the authenticated actor private-app bootstrap facts. Product rules remain TypeScript authorities.';
