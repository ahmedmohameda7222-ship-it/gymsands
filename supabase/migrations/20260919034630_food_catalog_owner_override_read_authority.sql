begin;

create or replace function public.food_catalog_get_current_personal_override_v1(p_food_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_current_revision_id uuid;
  v_pointer_revision bigint;
  v_revision_id uuid;
  v_revision_user_id uuid;
  v_revision_food_id uuid;
  v_revision_number bigint;
  v_is_deleted boolean;
  v_nutrition_override jsonb;
  v_serving_label text;
  v_note text;
begin
  if v_user is null then
    raise exception 'Authenticated Personal Override owner is required.' using errcode='42501';
  end if;
  if p_food_id is null then
    raise exception 'Personal Override Food ID is required.' using errcode='22023';
  end if;

  perform private.food_catalog_governance_require_active_member_account(v_user);

  select
    o.current_revision_id,
    o.pointer_revision,
    r.id,
    r.user_id,
    r.food_id,
    r.revision_number,
    r.is_deleted,
    r.nutrition_override,
    r.serving_label,
    r.note
  into
    v_current_revision_id,
    v_pointer_revision,
    v_revision_id,
    v_revision_user_id,
    v_revision_food_id,
    v_revision_number,
    v_is_deleted,
    v_nutrition_override,
    v_serving_label,
    v_note
  from public.food_personal_overrides o
  left join public.food_personal_override_revisions r
    on r.id = o.current_revision_id
  where o.user_id = v_user
    and o.food_id = p_food_id;

  if not found then
    return jsonb_build_object(
      'foodId', p_food_id,
      'hasOverride', false,
      'revisionId', null,
      'pointerRevision', 0,
      'isDeleted', false,
      'nutritionOverride', null,
      'servingLabel', null,
      'note', null
    );
  end if;

  if v_revision_id is null
     or v_revision_id is distinct from v_current_revision_id
     or v_revision_user_id is distinct from v_user
     or v_revision_food_id is distinct from p_food_id
     or v_revision_number is distinct from v_pointer_revision then
    raise exception 'Personal Override pointer integrity violation.' using errcode='23514';
  end if;

  return jsonb_build_object(
    'foodId', p_food_id,
    'hasOverride', true,
    'revisionId', v_revision_id,
    'pointerRevision', v_pointer_revision,
    'isDeleted', v_is_deleted,
    'nutritionOverride', v_nutrition_override,
    'servingLabel', v_serving_label,
    'note', v_note
  );
end
$function$;

revoke all on function public.food_catalog_get_current_personal_override_v1(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.food_catalog_get_current_personal_override_v1(uuid)
to authenticated;

commit;
