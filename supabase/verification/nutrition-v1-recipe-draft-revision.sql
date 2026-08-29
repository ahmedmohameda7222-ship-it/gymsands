-- Disposable verification for Nutrition V1 Recipe Working Draft optimistic concurrency.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_revision_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1_revision_rejected(p_sql text, p_message text)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception '%', p_message;
end
$function$;

grant execute on function pg_temp.nv1_revision_assert(boolean, text) to public;
grant execute on function pg_temp.nv1_revision_rejected(text, text) to public;

do $catalog$
begin
  perform pg_temp.nv1_revision_assert(
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'nutrition_recipe_drafts'
        and column_name = 'revision'
        and data_type = 'bigint'
        and is_nullable = 'NO'
    ),
    'Recipe Working Draft revision column missing.'
  );
  perform pg_temp.nv1_revision_assert(
    to_regprocedure('public.autosave_nutrition_recipe_draft(uuid,bigint,jsonb,jsonb,jsonb,jsonb)') is not null,
    'Revision-aware Recipe autosave RPC missing.'
  );
  perform pg_temp.nv1_revision_assert(
    to_regprocedure('public.autosave_nutrition_recipe_draft(uuid,jsonb,jsonb,jsonb,jsonb)') is null,
    'Legacy unversioned Recipe autosave RPC remains callable.'
  );
end
$catalog$;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'f3260000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'nutrition-revision-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'f3260000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'nutrition-revision-intruder@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.nutrition_recipes (id, user_id, name) values (
  'f3260000-0000-4000-8000-000000000010',
  'f3260000-0000-4000-8000-000000000001',
  'Revision fixture'
);
insert into public.nutrition_recipe_drafts (
  id, recipe_id, user_id, name, servings, draft_metadata
) values (
  'f3260000-0000-4000-8000-000000000011',
  'f3260000-0000-4000-8000-000000000010',
  'f3260000-0000-4000-8000-000000000001',
  'Revision fixture', 2, '{}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3260000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $owner$
declare
  v_saved jsonb;
begin
  v_saved := public.autosave_nutrition_recipe_draft(
    'f3260000-0000-4000-8000-000000000010',
    0,
    '{"name":"First intent","servings":2,"draft_metadata":{}}'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
  perform pg_temp.nv1_revision_assert(
    (v_saved->>'revision')::bigint = 1
    and (select revision = 1 and name = 'First intent' from public.nutrition_recipe_drafts where id = 'f3260000-0000-4000-8000-000000000011'),
    'Recipe autosave did not atomically increment revision.'
  );

  begin
    perform public.autosave_nutrition_recipe_draft(
      'f3260000-0000-4000-8000-000000000010',
      0,
      '{"name":"Stale overwrite","servings":2,"draft_metadata":{}}'::jsonb,
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
    );
    raise exception 'Stale Recipe autosave unexpectedly succeeded.';
  exception when serialization_failure then
    null;
  end;

  perform pg_temp.nv1_revision_assert(
    (select revision = 1 and name = 'First intent' from public.nutrition_recipe_drafts where id = 'f3260000-0000-4000-8000-000000000011'),
    'Stale Recipe autosave modified canonical Draft state.'
  );

  v_saved := public.autosave_nutrition_recipe_draft(
    'f3260000-0000-4000-8000-000000000010',
    1,
    '{"name":"Second intent","servings":2,"draft_metadata":{}}'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
  perform pg_temp.nv1_revision_assert(
    (v_saved->>'revision')::bigint = 2
    and (select revision = 2 and name = 'Second intent' from public.nutrition_recipe_drafts where id = 'f3260000-0000-4000-8000-000000000011'),
    'Current Recipe autosave did not advance after stale rejection.'
  );
end
$owner$;

select set_config('request.jwt.claim.sub', 'f3260000-0000-4000-8000-000000000002', true);
select pg_temp.nv1_revision_rejected(
  $$select public.autosave_nutrition_recipe_draft(
    'f3260000-0000-4000-8000-000000000010', 2,
    '{"name":"Intruder","servings":2,"draft_metadata":{}}'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  )$$,
  'Cross-owner Recipe autosave was accepted.'
);

rollback;
