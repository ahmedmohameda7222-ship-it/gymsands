begin;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then raise exception '%', p_message; end if;
end
$assert$;

create function pg_temp.assert_v1_rejects_advanced(p_mapping_set_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, sort_order)
    values (p_mapping_set_id, 'pectoralis.upper', 'primary', 1.00, 99);
  exception when check_violation then return;
  end;
  raise exception 'v1_rejects_advanced failed';
end
$assert$;

create function pg_temp.assert_v2_rejects_broad(p_mapping_set_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, sort_order)
    values (p_mapping_set_id, 'pectoralis_major', 'primary', 1.00, 99);
  exception when check_violation then return;
  end;
  raise exception 'v2_rejects_broad failed';
end
$assert$;

create function pg_temp.assert_unknown_schema_rejected(p_exercise_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.exercise_muscle_mapping_sets(exercise_id, mapping_version, source, schema_version, checksum)
    values (p_exercise_id, 99, 'phase4a_verification', 'exercise_muscle_mapping_unknown', repeat('0', 64));
  exception when check_violation then return;
  end;
  raise exception 'unknown schema rejection failed';
end
$assert$;

create function pg_temp.assert_unknown_id_rejected(p_mapping_set_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, sort_order)
    values (p_mapping_set_id, 'invented.region', 'primary', 1.00, 98);
  exception when check_violation then return;
  end;
  raise exception 'unknown ID rejection failed';
end
$assert$;

create function pg_temp.assert_direct_publication_rejected(p_mapping_set_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    update public.exercise_muscle_mapping_sets set status = 'published', published_at = now() where id = p_mapping_set_id;
  exception when check_violation then return;
  end;
  raise exception 'global V2 direct publication/status bypass was not rejected';
end
$assert$;

create function pg_temp.assert_published_entry_immutable(p_entry_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    update public.exercise_muscle_mapping_entries set contribution = 0.75 where id = p_entry_id;
  exception when check_violation then return;
  end;
  raise exception 'published V2 mapping entry mutation succeeded';
end
$assert$;

create function pg_temp.assert_custom_published_entry_immutable(p_entry_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    update public.user_custom_exercise_mapping_entries set contribution = 0.75 where id = p_entry_id;
  exception when check_violation then return;
  end;
  raise exception 'published custom V2 mapping entry mutation succeeded';
end
$assert$;
grant execute on function pg_temp.assert_custom_published_entry_immutable(uuid) to authenticated;

create function pg_temp.assert_member_global_write_denied(p_exercise_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.exercise_muscle_mapping_sets(exercise_id, mapping_version, source, schema_version, checksum)
    values (p_exercise_id, 100, 'member_bypass', 'exercise_muscle_mapping_v2', repeat('0', 64));
  exception when insufficient_privilege then return;
  end;
  raise exception 'member global write remains denied proof failed';
end
$assert$;
grant execute on function pg_temp.assert_member_global_write_denied(uuid) to authenticated;

create function pg_temp.assert_cross_owner_custom_mutation_denied(p_mapping_set_id uuid)
returns void language plpgsql as $assert$
begin
  update public.user_custom_exercise_mapping_sets set checksum = repeat('f', 64) where id = p_mapping_set_id;
  if found then raise exception 'User A could mutate User B custom mapping'; end if;
end
$assert$;
grant execute on function pg_temp.assert_cross_owner_custom_mutation_denied(uuid) to authenticated;

create function pg_temp.assert_mixed_snapshot_rejected(p_snapshot_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    perform set_config('plaivra.session_snapshot_mutation_id', p_snapshot_id::text, true);
    update public.workout_session_muscle_snapshots set
      snapshot_schema_version = 'workout_session_muscle_snapshot_v2',
      taxonomy_version = 'advanced_visible_v1',
      mapping_schema_version = 'exercise_muscle_mapping_v2',
      calculation_engine_version = 'muscle_load_resistance_sets_v1',
      threshold_profile_version = 'advanced_exposure_v1',
      result_schema_version = 'advanced_muscle_exposure_result_v1',
      workload_model_version = 'resistance_sets_v1'
    where id = p_snapshot_id;
  exception when check_violation then return;
  end;
  raise exception 'mixed_snapshot_rejected failed';
end
$assert$;

select pg_temp.assert_true(
  not exists (
    select 1 from public.exercise_muscle_mapping_sets
    where schema_version = 'exercise_muscle_mapping_v2' and status in ('published', 'retired')
  ) and not exists (
    select 1 from public.user_custom_exercise_mapping_sets
    where schema_version = 'exercise_muscle_mapping_v2' and status in ('published', 'retired')
  ),
  'pre-existing V2 mapping publication detected'
);

select pg_temp.assert_true(
  to_regprocedure('private.advanced_muscle_taxonomy_display_order(text)') is not null
  and to_regprocedure('private.muscle_mapping_display_order(text,text)') is not null
  and exists (select 1 from pg_trigger where tgname = 'enforce_global_mapping_entry_schema' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgname = 'enforce_custom_mapping_entry_schema' and not tgisinternal),
  'new constraints and functions exist proof failed'
);

create temporary table phase4a_existing_snapshot_state on commit drop as
select id, to_jsonb(snapshot) as payload from public.workout_session_muscle_snapshots snapshot;

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('94000000-0000-4000-8000-000000000001'::uuid, 'authenticated', 'authenticated', 'phase4a-a@example.invalid', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('94000000-0000-4000-8000-000000000002'::uuid, 'authenticated', 'authenticated', 'phase4a-b@example.invalid', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.exercises(id, source, source_id, name, slug, is_approved, is_global)
values ('94000000-0000-4000-8000-000000000010'::uuid, 'manual', 'phase4a-verification', 'Phase 4A Verification Exercise', 'phase4a-verification-exercise', true, true);

-- v1_accepts_broad
insert into public.exercise_muscle_mapping_sets(id, exercise_id, mapping_version, source, schema_version, checksum)
values ('94000000-0000-4000-8000-000000000020'::uuid, '94000000-0000-4000-8000-000000000010'::uuid, 1, 'phase4a_verification', 'exercise_muscle_mapping_v1', repeat('0', 64));
insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, side_scope, sort_order)
values ('94000000-0000-4000-8000-000000000020'::uuid, 'pectoralis_major', 'primary', 1.00, 'bilateral', 1);
select pg_temp.assert_v1_rejects_advanced('94000000-0000-4000-8000-000000000020'::uuid); -- v1_rejects_advanced
select pg_temp.assert_unknown_id_rejected('94000000-0000-4000-8000-000000000020'::uuid);
update public.exercise_muscle_mapping_sets set checksum = private.exercise_muscle_mapping_checksum(id)
where id = '94000000-0000-4000-8000-000000000020'::uuid;
select pg_temp.assert_true(
  private.exercise_muscle_mapping_checksum('94000000-0000-4000-8000-000000000020'::uuid) = '2a72492e52317807ccc84784e8219fb3d0be2a56e135bd7ad3b42f34780a3776',
  'v1_checksum_unchanged failed'
);

-- v2_accepts_advanced
insert into public.exercise_muscle_mapping_sets(id, exercise_id, mapping_version, source, schema_version, checksum)
values ('94000000-0000-4000-8000-000000000021'::uuid, '94000000-0000-4000-8000-000000000010'::uuid, 2, 'phase4a_verification', 'exercise_muscle_mapping_v2', repeat('0', 64));
insert into public.exercise_muscle_mapping_entries(id, mapping_set_id, muscle_id, role, contribution, side_scope, sort_order)
values ('94000000-0000-4000-8000-000000000030'::uuid, '94000000-0000-4000-8000-000000000021'::uuid, 'pectoralis.upper', 'primary', 1.00, 'bilateral', 1);
select pg_temp.assert_v2_rejects_broad('94000000-0000-4000-8000-000000000021'::uuid); -- v2_rejects_broad
select pg_temp.assert_unknown_schema_rejected('94000000-0000-4000-8000-000000000010'::uuid);
update public.exercise_muscle_mapping_sets set checksum = private.exercise_muscle_mapping_checksum(id)
where id = '94000000-0000-4000-8000-000000000021'::uuid;
select pg_temp.assert_true(
  private.exercise_muscle_mapping_checksum('94000000-0000-4000-8000-000000000021'::uuid) = '8229200a5d7387390e070f63781f961e7b7baa8c5f2cd57eb1113d8a4e82ba2f'
  and private.exercise_muscle_mapping_checksum('94000000-0000-4000-8000-000000000021'::uuid)
    = private.exercise_muscle_mapping_checksum('94000000-0000-4000-8000-000000000021'::uuid),
  'v2_checksum_deterministic failed'
);
select pg_temp.assert_direct_publication_rejected('94000000-0000-4000-8000-000000000021'::uuid);

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.assert_member_global_write_denied('94000000-0000-4000-8000-000000000010'::uuid);
reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select public.publish_exercise_muscle_mapping_set('94000000-0000-4000-8000-000000000021'::uuid);
select pg_temp.assert_true(
  (select status = 'published' from public.exercise_muscle_mapping_sets where id = '94000000-0000-4000-8000-000000000021'::uuid),
  'atomic admin/service publication succeeds proof failed'
);
select pg_temp.assert_published_entry_immutable('94000000-0000-4000-8000-000000000030'::uuid);

insert into public.user_custom_exercises(id, user_id, name)
values ('94000000-0000-4000-8000-000000000040'::uuid, '94000000-0000-4000-8000-000000000001'::uuid, 'Phase 4A owner custom');
insert into public.user_custom_exercises(id, user_id, name)
values ('94000000-0000-4000-8000-000000000041'::uuid, '94000000-0000-4000-8000-000000000002'::uuid, 'Phase 4A other custom');

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into public.user_custom_exercise_mapping_sets(id, user_id, custom_exercise_id, mapping_version, schema_version, checksum)
values ('94000000-0000-4000-8000-000000000050'::uuid, '94000000-0000-4000-8000-000000000001'::uuid,
  '94000000-0000-4000-8000-000000000040'::uuid, 1, 'exercise_muscle_mapping_v2',
  '8229200a5d7387390e070f63781f961e7b7baa8c5f2cd57eb1113d8a4e82ba2f');
insert into public.user_custom_exercise_mapping_entries(id, mapping_set_id, muscle_id, role, contribution, side_scope, sort_order)
values ('94000000-0000-4000-8000-000000000060'::uuid, '94000000-0000-4000-8000-000000000050'::uuid,
  'pectoralis.upper', 'primary', 1.00, 'bilateral', 1);
select public.publish_user_custom_exercise_mapping_set('94000000-0000-4000-8000-000000000050'::uuid);
select pg_temp.assert_custom_published_entry_immutable('94000000-0000-4000-8000-000000000060'::uuid);
reset role;

insert into public.user_custom_exercise_mapping_sets(id, user_id, custom_exercise_id, mapping_version, schema_version, checksum)
values ('94000000-0000-4000-8000-000000000051'::uuid, '94000000-0000-4000-8000-000000000002'::uuid,
  '94000000-0000-4000-8000-000000000041'::uuid, 1, 'exercise_muscle_mapping_v2',
  '8229200a5d7387390e070f63781f961e7b7baa8c5f2cd57eb1113d8a4e82ba2f');
insert into public.user_custom_exercise_mapping_entries(mapping_set_id, muscle_id, role, contribution, side_scope, sort_order)
values ('94000000-0000-4000-8000-000000000051'::uuid, 'pectoralis.upper', 'primary', 1.00, 'bilateral', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.assert_true(
  not exists (select 1 from public.user_custom_exercise_mapping_sets where id = '94000000-0000-4000-8000-000000000051'::uuid),
  'User A could read User B custom mapping'
);
select pg_temp.assert_cross_owner_custom_mutation_denied('94000000-0000-4000-8000-000000000051'::uuid);
reset role;

insert into public.workout_sessions(id, user_id, workout_name, status, completed_at)
values ('94000000-0000-4000-8000-000000000070'::uuid, '94000000-0000-4000-8000-000000000001'::uuid, 'Phase 4A V1', 'completed', now());
insert into public.workout_sessions(id, user_id, workout_name, status, completed_at)
values ('94000000-0000-4000-8000-000000000071'::uuid, '94000000-0000-4000-8000-000000000001'::uuid, 'Phase 4A V2', 'completed', now());
insert into public.workout_sessions(id, user_id, workout_name, status, completed_at)
values ('94000000-0000-4000-8000-000000000072'::uuid, '94000000-0000-4000-8000-000000000001'::uuid, 'Phase 4A mixed', 'completed', now());

-- valid V1 snapshot bundle and defaults_remain_v1
select pg_temp.assert_true(
  (select snapshot_schema_version = 'workout_session_muscle_snapshot_v1'
    and mapping_schema_version = 'exercise_muscle_mapping_v1'
    and calculation_engine_version = 'muscle_load_resistance_sets_v1'
   from public.workout_session_muscle_snapshots where workout_session_id = '94000000-0000-4000-8000-000000000070'::uuid),
  'defaults_remain_v1 failed'
);

-- valid V2 snapshot bundle
select set_config('plaivra.session_snapshot_mutation_id', (
  select id::text from public.workout_session_muscle_snapshots where workout_session_id = '94000000-0000-4000-8000-000000000071'::uuid
), true);
update public.workout_session_muscle_snapshots set
  snapshot_schema_version = 'workout_session_muscle_snapshot_v2',
  taxonomy_version = 'advanced_visible_v1', mapping_schema_version = 'exercise_muscle_mapping_v2',
  calculation_engine_version = 'muscle_load_resistance_sets_v2', threshold_profile_version = 'advanced_exposure_v1',
  result_schema_version = 'advanced_muscle_exposure_result_v1', workload_model_version = 'resistance_sets_v1'
where workout_session_id = '94000000-0000-4000-8000-000000000071'::uuid;
select pg_temp.assert_mixed_snapshot_rejected((
  select id from public.workout_session_muscle_snapshots where workout_session_id = '94000000-0000-4000-8000-000000000072'::uuid
)); -- mixed_snapshot_rejected

select pg_temp.assert_true(
  not exists (
    select 1 from phase4a_existing_snapshot_state before
    join public.workout_session_muscle_snapshots current using (id)
    where before.payload is distinct from to_jsonb(current)
  ),
  'historical rows were rewritten'
);

select pg_temp.assert_true(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('exercise_muscle_mapping_sets', 'exercise_muscle_mapping_entries',
        'user_custom_exercise_mapping_sets', 'user_custom_exercise_mapping_entries',
        'workout_session_muscle_snapshots', 'workout_session_muscle_snapshot_items')
      and column_name ~ '(svg|path_data|visual_geometry)'
  ),
  'no_visual_payload_in_database failed'
);

rollback;
