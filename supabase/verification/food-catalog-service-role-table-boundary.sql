\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.plan3_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

do $block$
declare
  v_table text;
  v_privilege text;
  v_tables constant text[] := array[
    'food_catalog_control_operations',
    'food_catalog_activation_sets',
    'food_catalog_activation_set_members',
    'food_catalog_activation_events',
    'food_catalog_generations',
    'food_catalog_generation_foods',
    'food_catalog_generation_servings',
    'food_catalog_generation_names',
    'food_catalog_generation_taxonomy',
    'food_catalog_generation_markets',
    'food_catalog_generation_verification',
    'food_catalog_generation_redirects',
    'food_catalog_generation_validation_reports',
    'food_catalog_generation_validation_findings',
    'food_catalog_generation_events',
    'food_catalog_current_generation'
  ];
  v_forbidden_privileges constant text[] := array[
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER'
  ];
begin
  foreach v_table in array v_tables loop
    perform pg_temp.plan3_assert(
      has_table_privilege('service_role', format('public.%I', v_table), 'SELECT'),
      format('service_role lost required SELECT privilege on public.%I.', v_table)
    );

    foreach v_privilege in array v_forbidden_privileges loop
      perform pg_temp.plan3_assert(
        not has_table_privilege('service_role', format('public.%I', v_table), v_privilege),
        format(
          'service_role retained forbidden direct %s privilege on public.%I; Plan 3 mutations must go through command RPCs.',
          v_privilege,
          v_table
        )
      );
    end loop;
  end loop;
end
$block$;

rollback;
