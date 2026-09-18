create or replace function public.food_catalog_export_owner_personal_overrides_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_revisions jsonb;
  v_overrides jsonb;
  v_operations jsonb;
begin
  if v_user is null then
    raise exception 'Authenticated user is required for personal override export.' using errcode='42501';
  end if;

  perform private.food_catalog_governance_require_active_member_account(v_user);

  select coalesce(
    jsonb_agg(to_jsonb(revision_row) order by revision_row.food_id, revision_row.revision_number, revision_row.id),
    '[]'::jsonb
  )
  into v_revisions
  from (
    select *
    from public.food_personal_override_revisions
    where user_id = v_user
    order by food_id asc, revision_number asc, id asc
  ) revision_row;

  select coalesce(
    jsonb_agg(to_jsonb(override_row) order by override_row.food_id),
    '[]'::jsonb
  )
  into v_overrides
  from (
    select *
    from public.food_personal_overrides
    where user_id = v_user
    order by food_id asc
  ) override_row;

  select coalesce(
    jsonb_agg(to_jsonb(operation_row) order by operation_row.operation_id),
    '[]'::jsonb
  )
  into v_operations
  from (
    select *
    from public.food_personal_override_operations
    where user_id = v_user
    order by operation_id asc
  ) operation_row;

  return jsonb_build_object(
    'personal_food_override_revisions', v_revisions,
    'personal_food_overrides', v_overrides,
    'personal_food_override_operations', v_operations
  );
end
$function$;

revoke all on function public.food_catalog_export_owner_personal_overrides_v1() from public, anon, authenticated, service_role;
grant execute on function public.food_catalog_export_owner_personal_overrides_v1() to authenticated;

create or replace function public.food_catalog_export_owner_correction_report_payloads_v1()
returns table (
  report_id uuid,
  reporter_user_id uuid,
  claim_text text,
  description text,
  evidence jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authenticated user is required for owner correction export.' using errcode='42501';
  end if;

  perform private.food_catalog_governance_require_active_member_account(v_user);

  return query
  select
    member_payload.report_id,
    member_payload.reporter_user_id,
    member_payload.claim_text,
    member_payload.description,
    member_payload.evidence,
    member_payload.created_at
  from public.food_catalog_correction_report_member_payloads member_payload
  where member_payload.reporter_user_id = v_user
  order by member_payload.created_at asc, member_payload.report_id asc;
end
$function$;

revoke all on function public.food_catalog_export_owner_correction_report_payloads_v1() from public, anon, authenticated, service_role;
grant execute on function public.food_catalog_export_owner_correction_report_payloads_v1() to authenticated;
