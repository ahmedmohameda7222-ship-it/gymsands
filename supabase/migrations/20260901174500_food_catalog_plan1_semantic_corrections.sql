begin;

-- Food Catalog Intelligence Plan 1 semantic QA corrections only.
-- This migration adds provenance constraints and performs no Food population.

alter table public.food_serving_options
  add constraint food_serving_options_source_backed_weight_check
  check (
    unit_code in ('g', 'ml')
    or (
      gram_weight is not null
      and source_record_id is not null
    )
  );

alter table public.food_names
  add constraint food_names_source_provenance_check
  check (
    (origin <> 'source' and name_role <> 'source_name')
    or source_record_id is not null
  );

commit;
