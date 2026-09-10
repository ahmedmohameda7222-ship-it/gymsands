\set ON_ERROR_STOP on
\set owner_uid '71000000-0000-4000-8000-000000000001'

-- Disposable certification harness for the external Auth/account identity prerequisite.
-- Auth-provider state is outside the Food Catalog portable artifact by design.
insert into auth.users(
  id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  :'owner_uid'::uuid,'authenticated','authenticated','plan7-owner@example.test','',
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,
  '2026-09-10T18:00:00Z'::timestamptz,'2026-09-10T18:00:00Z'::timestamptz
);

do $plan7_target_identity$
begin
  if not exists(select 1 from auth.users where id=:'owner_uid'::uuid) then
    raise exception 'Plan7 target external owner Auth identity is missing.';
  end if;
  if not exists(select 1 from public.profiles where id=:'owner_uid'::uuid) then
    raise exception 'Plan7 target canonical profile binding was not created.';
  end if;
  if not exists(select 1 from public.account_access_states where user_id=:'owner_uid'::uuid and state='active' and disabled_at is null) then
    raise exception 'Plan7 target active account-access binding was not created.';
  end if;
end
$plan7_target_identity$;
