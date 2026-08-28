begin;

-- Nutrition V1 Saved Meal creation uncertain-completion closure.
-- The existing create_nutrition_saved_meal RPC remains the atomic root+children
-- authority. This forward wrapper adds owner-scoped replay convergence without
-- mutating any previously applied migration or changing Saved Meal semantics.

create table if not exists private.nutrition_saved_meal_creation_operations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null,
  saved_meal_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

comment on table private.nutrition_saved_meal_creation_operations is
  'Owner-scoped replay ledger for atomic Saved Meal creation. Stores only a normalized request hash and result identity so ambiguous retries cannot create duplicate roots.';

revoke all on table private.nutrition_saved_meal_creation_operations from public, anon, authenticated;
grant select, insert, update, delete on table private.nutrition_saved_meal_creation_operations to service_role;

create or replace function public.create_nutrition_saved_meal_idempotent(
  p_operation_id uuid,
  p_name text,
  p_note text default null,
  p_is_favorite boolean default false,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request jsonb;
  v_request_hash text;
  v_existing private.nutrition_saved_meal_creation_operations%rowtype;
  v_existing_root public.nutrition_saved_meals%rowtype;
  v_created jsonb;
  v_saved_meal_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'Saved Meal creation Operation ID is required.' using errcode = '22023';
  end if;

  v_request := jsonb_build_object(
    'name', btrim(coalesce(p_name, '')),
    'note', nullif(btrim(coalesce(p_note, '')), ''),
    'isFavorite', coalesce(p_is_favorite, false),
    'items', coalesce(p_items, '[]'::jsonb)
  );
  v_request_hash := encode(
    extensions.digest(convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Serialize the owner/operation namespace before checking the ledger so two
  -- concurrent first attempts cannot both commit separate Saved Meal roots.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0)
  );

  select * into v_existing
  from private.nutrition_saved_meal_creation_operations
  where user_id = v_user_id
    and operation_id = p_operation_id;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'Saved Meal creation Operation ID was already used with different input.' using errcode = '22023';
    end if;

    select * into v_existing_root
    from public.nutrition_saved_meals
    where id = v_existing.saved_meal_id
      and user_id = v_user_id;

    if not found then
      raise exception 'Saved Meal creation replay result is no longer available.' using errcode = 'P0002';
    end if;

    return to_jsonb(v_existing_root) || jsonb_build_object('reused', true);
  end if;

  -- Reuse the already-approved atomic root+children command in this same
  -- PostgreSQL transaction. If it fails, no replay ledger row can survive.
  v_created := public.create_nutrition_saved_meal(
    p_name,
    p_note,
    p_is_favorite,
    p_items
  );
  v_saved_meal_id := (v_created->>'id')::uuid;

  if v_saved_meal_id is null then
    raise exception 'Saved Meal creation returned an invalid identity.' using errcode = 'P0001';
  end if;

  insert into private.nutrition_saved_meal_creation_operations (
    user_id, operation_id, request_hash, saved_meal_id
  ) values (
    v_user_id, p_operation_id, v_request_hash, v_saved_meal_id
  );

  return v_created || jsonb_build_object('reused', false);
end
$function$;

revoke all on function public.create_nutrition_saved_meal_idempotent(uuid, text, text, boolean, jsonb) from public, anon;
grant execute on function public.create_nutrition_saved_meal_idempotent(uuid, text, text, boolean, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
