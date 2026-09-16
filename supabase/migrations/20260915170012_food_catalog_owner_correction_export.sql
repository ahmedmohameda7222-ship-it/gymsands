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
