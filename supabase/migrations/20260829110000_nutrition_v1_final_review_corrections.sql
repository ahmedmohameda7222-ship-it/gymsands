begin;

-- Final Nutrition V1 review corrections are forward-only:
-- 1. make hydration writes replay-safe across ambiguous retries;
-- 2. explicitly fold the late Saved Meal creation replay ledger into account deletion.

alter table public.water_logs
  add column if not exists operation_id uuid;

create unique index if not exists water_logs_user_operation_id_uq
  on public.water_logs (user_id, operation_id)
  where operation_id is not null;

create or replace function public.log_nutrition_water(
  p_operation_id uuid,
  p_log_date date,
  p_amount_ml integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.water_logs%rowtype;
  v_inserted public.water_logs%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'Water Operation ID is required.' using errcode = '22023';
  end if;
  if p_log_date is null then
    raise exception 'Water log date is required.' using errcode = '22023';
  end if;
  if p_amount_ml is null or p_amount_ml <= 0 then
    raise exception 'Water amount must be greater than zero.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0)
  );

  select * into v_existing
  from public.water_logs
  where user_id = v_user_id
    and operation_id = p_operation_id;

  if found then
    if v_existing.log_date <> p_log_date or v_existing.amount_ml <> p_amount_ml then
      raise exception 'Water Operation ID was already used with different input.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'id', v_existing.id,
      'amount_ml', v_existing.amount_ml,
      'created_at', v_existing.created_at,
      'alreadyLogged', true
    );
  end if;

  insert into public.water_logs (user_id, log_date, amount_ml, operation_id)
  values (v_user_id, p_log_date, p_amount_ml, p_operation_id)
  returning * into v_inserted;

  return jsonb_build_object(
    'id', v_inserted.id,
    'amount_ml', v_inserted.amount_ml,
    'created_at', v_inserted.created_at,
    'alreadyLogged', false
  );
end;
$$;

revoke all on function public.log_nutrition_water(uuid, date, integer) from public, anon;
grant execute on function public.log_nutrition_water(uuid, date, integer) to authenticated, service_role;

comment on function public.log_nutrition_water(uuid, date, integer) is
  'Owner-derived idempotent Nutrition V1 hydration command. An unchanged retry replays the original water row; semantic reuse of an operation ID is rejected.';

-- The replay table already has an ON DELETE CASCADE FK to profiles. This
-- wrapper adds explicit deletion and residual verification so the service-role
-- account purge remains complete even as private replay ledgers are added.
alter function public.purge_account_application_data_atomic(uuid) set schema private;
alter function private.purge_account_application_data_atomic(uuid)
  rename to nutrition_v1_final_review_core_purge_account_application_data_atomic;

create function public.purge_account_application_data_atomic(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_saved_meal_creation_operations integer := 0;
begin
  delete from private.nutrition_saved_meal_creation_operations where user_id = p_user_id;
  get diagnostics v_saved_meal_creation_operations = row_count;

  v_result := private.nutrition_v1_final_review_core_purge_account_application_data_atomic(p_user_id);

  if exists (select 1 from private.nutrition_saved_meal_creation_operations where user_id = p_user_id) then
    raise exception 'Nutrition V1 account-data purge left Saved Meal creation replay rows behind.' using errcode = '23514';
  end if;

  return v_result || jsonb_build_object(
    'nutrition_saved_meal_creation_operations_deleted', v_saved_meal_creation_operations
  );
end;
$$;

revoke all on function private.nutrition_v1_final_review_core_purge_account_application_data_atomic(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.purge_account_application_data_atomic(uuid)
  from public, anon, authenticated;
grant execute on function public.purge_account_application_data_atomic(uuid) to service_role;

comment on function public.purge_account_application_data_atomic(uuid) is
  'Service-role account deletion authority. Explicitly removes the Saved Meal creation replay ledger, verifies no replay rows remain, then delegates to the reviewed application-data purge graph.';

notify pgrst, 'reload schema';
commit;
