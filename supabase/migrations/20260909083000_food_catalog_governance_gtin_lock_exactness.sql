-- Forward-only Production exactness correction for Food Catalog Plan 6.
-- The applied Plan 6 migration used an equivalent direct Food row lock in the
-- UPDATE branch of the GTIN serialization trigger. Restore the reviewed
-- canonical helper path without rewriting the already-applied migration.
-- This migration does not populate Foods, ingest providers, activate Foods,
-- create/promote Catalog Generations, move the current pointer, or mutate
-- derived SearchDocuments.

create or replace function private.food_catalog_serialize_gtin_write()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_old text; v_new text; v_food uuid; v_gtin text;
begin
  if tg_op='INSERT' then
    perform private.food_catalog_lock_food_authority(new.food_id);
    perform private.food_catalog_lock_gtin_authority(new.gtin);
    return new;
  elsif tg_op='DELETE' then
    perform private.food_catalog_lock_food_authority(old.food_id);
    perform private.food_catalog_lock_gtin_authority(old.gtin);
    return old;
  end if;

  for v_food in
    select distinct x from unnest(array[old.food_id,new.food_id]) as t(x)
    where x is not null order by x
  loop
    perform private.food_catalog_lock_food_authority(v_food);
  end loop;

  v_old:=btrim(coalesce(old.gtin,''));
  v_new:=btrim(coalesce(new.gtin,''));
  for v_gtin in
    select distinct x from unnest(array[v_old,v_new]) as t(x)
    where length(x)>0 order by x
  loop
    perform private.food_catalog_lock_gtin_authority(v_gtin);
  end loop;
  return new;
end
$function$;
