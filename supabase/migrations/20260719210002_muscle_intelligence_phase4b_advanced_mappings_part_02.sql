begin;

create or replace function private.phase4b_publish_reviewed_advanced_mapping_part(
  p_payload jsonb,
  p_part integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mapping jsonb;
  v_entry jsonb;
  v_exercise_id uuid;
  v_mapping_set_id uuid;
  v_slug text;
  v_checksum text;
  v_entry_order integer;
begin
  if p_part < 2 or p_part > 6 or jsonb_array_length(p_payload -> 'mappings') <> 10 then
    raise exception 'Invalid Phase 4B advanced mapping registry part.';
  end if;
  if to_regprocedure('public.publish_exercise_muscle_mapping_set(uuid)') is null
     or to_regprocedure('private.exercise_muscle_mapping_checksum(uuid)') is null
     or to_regprocedure('private.advanced_muscle_taxonomy_display_order(text)') is null then
    raise exception 'Muscle Intelligence Phase 4A must exist before Phase 4B.';
  end if;

  for v_mapping in select value from jsonb_array_elements(p_payload -> 'mappings')
  loop
    v_slug := v_mapping ->> 'slug';
    v_exercise_id := (v_mapping ->> 'exercise_id')::uuid;
    v_mapping_set_id := (v_mapping ->> 'mapping_set_id')::uuid;
    v_checksum := v_mapping ->> 'checksum';

    if not exists (
      select 1 from public.exercises exercise
      where exercise.id = v_exercise_id and exercise.slug = v_slug
        and exercise.source = 'plaivra_curated'
        and exercise.source_id = 'plaivra_curated:v1:' || v_slug
        and exercise.is_global and exercise.is_approved
    ) then raise exception 'Canonical curated exercise identity mismatch for %.', v_slug; end if;

    if not exists (
      select 1 from public.exercise_muscle_mapping_sets mapping
      where mapping.exercise_id = v_exercise_id
        and mapping.schema_version = 'exercise_muscle_mapping_v1'
        and mapping.mapping_version = 1 and mapping.status = 'published'
    ) then raise exception 'Published V1 mapping is required for %.', v_slug; end if;

    if exists (
      select 1 from public.exercise_muscle_mapping_sets mapping
      where mapping.id = v_mapping_set_id
         or (mapping.exercise_id = v_exercise_id and mapping.mapping_version = 2)
    ) then raise exception 'Phase 4B mapping identity already exists for %.', v_slug; end if;

    insert into public.exercise_muscle_mapping_sets (
      id, exercise_id, mapping_version, status, source, schema_version, checksum
    ) values (
      v_mapping_set_id, v_exercise_id, 2, 'draft', 'plaivra_reviewed_phase4b',
      'exercise_muscle_mapping_v2', v_checksum
    );

    v_entry_order := 0;
    for v_entry in select value from jsonb_array_elements(v_mapping -> 'entries')
    loop
      v_entry_order := v_entry_order + 1;
      insert into public.exercise_muscle_mapping_entries (
        mapping_set_id, muscle_id, role, contribution, side_scope, sort_order
      ) values (
        v_mapping_set_id, v_entry ->> 0, v_entry ->> 1,
        (v_entry ->> 2)::numeric, 'bilateral', v_entry_order
      );
    end loop;

    if v_entry_order = 0 or private.exercise_muscle_mapping_checksum(v_mapping_set_id) is distinct from v_checksum then
      raise exception 'Phase 4B checksum or entry validation failed for %.', v_slug;
    end if;
  end loop;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  for v_mapping_set_id in
    select (value ->> 'mapping_set_id')::uuid from jsonb_array_elements(p_payload -> 'mappings')
  loop
    perform public.publish_exercise_muscle_mapping_set(v_mapping_set_id);
  end loop;

  if (
    select count(*) from public.exercise_muscle_mapping_sets
    where schema_version = 'exercise_muscle_mapping_v2'
      and mapping_version = 2 and status = 'published'
      and source = 'plaivra_reviewed_phase4b'
  ) <> p_part * 10 then
    raise exception 'Phase 4B cumulative V2 publication count mismatch after part %.', p_part;
  end if;
  if (
    select count(*) from public.exercise_muscle_mapping_sets mapping
    join public.exercises exercise on exercise.id = mapping.exercise_id
    where exercise.source = 'plaivra_curated'
      and mapping.schema_version = 'exercise_muscle_mapping_v1'
      and mapping.mapping_version = 1 and mapping.status = 'published'
  ) <> 60 then raise exception 'Phase 4B must preserve all 60 published curated V1 mappings.'; end if;
  if exists (
    select 1 from public.workout_session_muscle_snapshots
    where mapping_schema_version = 'exercise_muscle_mapping_v2'
  ) then raise exception 'Phase 4B must not create or cut over V2 workout-session snapshots.'; end if;
end
$function$;

revoke all on function private.phase4b_publish_reviewed_advanced_mapping_part(jsonb, integer)
  from public, anon, authenticated;

select private.phase4b_publish_reviewed_advanced_mapping_part($json${"part":2,"mappings":[{"slug":"cable-crunch","exercise_id":"1cee817a-9735-5d5f-9c63-882b9faac72c","mapping_set_id":"ee39c14c-c8c4-58e6-a87f-5fc64b96c121","checksum":"dc8a0b32c9bb6752a54e384df3835464e1d445a8550e5d556007379b06fdd677","entries":[["rectus_abdominis.upper","primary",1],["rectus_abdominis.middle","primary",1],["rectus_abdominis.lower","primary",1],["oblique.external_upper","secondary",0.25],["oblique.external_lower","secondary",0.25]]},{"slug":"cable-curl","exercise_id":"3d92f7ae-f143-5f92-a540-a6b634a9c416","mapping_set_id":"0f45a0d5-1fab-56a7-8f51-468a5753814b","checksum":"7cf9596fc44dc5b88c73312cdabd9704bc5c9c92184d92b02bce77545a9951f3","entries":[["biceps.long_head","primary",1],["biceps.short_head","primary",1],["brachialis","secondary",0.5],["brachioradialis","secondary",0.25],["forearm.flexor_mass","secondary",0.25]]},{"slug":"cable-external-rotation","exercise_id":"576c2215-965a-55a2-a11f-a59bd409e35b","mapping_set_id":"78e8ecaa-e4ea-5998-a9a0-c6539f2d97fd","checksum":"4ea9bcbbe8c3fc84e426bfc1501eb855c229736c856661a9082f1649b4ac2443","entries":[["trapezius.middle","stabilizer",0],["trapezius.lower","stabilizer",0],["deltoid.posterior","secondary",0.25],["infraspinatus","primary",1],["teres_minor","primary",1]]},{"slug":"cable-face-pull","exercise_id":"9ab20fb0-f34c-55cc-afd9-530f9ddcee29","mapping_set_id":"784ba07a-db50-56c0-8a5c-8bcee022b883","checksum":"fa53a23e7ae61c5abc3759166b3dca68f50f89eb68fa13f18b3d320be03a635c","entries":[["trapezius.upper","secondary",0.25],["trapezius.middle","primary",0.75],["trapezius.lower","secondary",0.5],["deltoid.posterior","primary",0.75],["infraspinatus","secondary",0.5],["teres_minor","secondary",0.5],["biceps.long_head","secondary",0.25],["biceps.short_head","secondary",0.25],["brachialis","secondary",0.25],["brachioradialis","secondary",0.25],["forearm.flexor_mass","secondary",0.25]]},{"slug":"cable-triceps-pushdown","exercise_id":"8dba454f-bc01-5f28-9c9a-23e90b054b56","mapping_set_id":"fea166a3-5c25-5687-98ee-5d2945edc395","checksum":"870e6013e59121545aeaae9670ef027a4191e7f31c5fe7e9ed895cfdf8384443","entries":[["triceps.long_head","primary",0.75],["triceps.lateral_head","primary",1],["triceps.medial_head","primary",1]]},{"slug":"cable-wood-chop","exercise_id":"245bde5b-cabb-51b2-8342-eaaec6dbf1b7","mapping_set_id":"4a003329-520b-55cc-80cc-fedf22046dc9","checksum":"6c3e7e822e8a584279b05a94ddb5f5609945df2e246154b399310d47f45537e7","entries":[["serratus.anterior","secondary",0.25],["rectus_abdominis.upper","secondary",0.5],["rectus_abdominis.middle","secondary",0.5],["rectus_abdominis.lower","secondary",0.5],["oblique.external_upper","primary",1],["oblique.external_lower","primary",1],["spinal_erectors.upper","secondary",0.25],["spinal_erectors.lower","secondary",0.25]]},{"slug":"chest-supported-dumbbell-row","exercise_id":"69b69cba-1765-5792-84a8-0697074942e9","mapping_set_id":"746e14fe-357c-50d9-9f68-f5a61c3e2be4","checksum":"a07fc1fdceb5b706cd0ddcb609abd941260f74db3949a7dfc4043d9e14d5ed0d","entries":[["trapezius.middle","primary",1],["trapezius.lower","primary",0.75],["deltoid.posterior","secondary",0.5],["infraspinatus","secondary",0.25],["teres_minor","secondary",0.25],["teres_major","secondary",0.5],["latissimus.upper","secondary",0.5],["latissimus.middle","primary",0.75],["latissimus.lower","secondary",0.5],["latissimus.outer","primary",0.75],["biceps.long_head","secondary",0.5],["biceps.short_head","secondary",0.5],["brachialis","secondary",0.5]]},{"slug":"chin-up","exercise_id":"54a2f2a4-fd94-5622-8df6-34e848d8e2fc","mapping_set_id":"f140fe48-7335-5fdd-9131-726e5853106c","checksum":"60fe27d7e494a778f66e7b96ca8b33fd05adca8c674f5cd6aba9a51c48c33c00","entries":[["trapezius.middle","secondary",0.5],["trapezius.lower","secondary",0.5],["teres_major","secondary",0.5],["latissimus.upper","primary",0.75],["latissimus.middle","primary",0.75],["latissimus.lower","secondary",0.5],["latissimus.outer","primary",0.75],["biceps.long_head","primary",1],["biceps.short_head","primary",1],["brachialis","primary",0.75],["brachioradialis","secondary",0.5],["forearm.flexor_mass","secondary",0.25]]},{"slug":"close-grip-barbell-bench-press","exercise_id":"733ef1a6-2e80-5f8e-8cdc-5bd637217b11","mapping_set_id":"abb153af-530d-5f26-824a-d85a88ae5026","checksum":"5b5619ad8a6ba4d6988f5c6a517a87ed60786f32fef7bd2b4416b6e0ba9165e8","entries":[["deltoid.anterior","secondary",0.5],["pectoralis.upper","secondary",0.5],["pectoralis.middle","primary",0.75],["pectoralis.lower","primary",0.75],["pectoralis.outer","secondary",0.25],["triceps.long_head","primary",0.75],["triceps.lateral_head","primary",1],["triceps.medial_head","primary",1]]},{"slug":"conventional-deadlift","exercise_id":"1b731b32-5bff-5c73-b255-79f130c4e233","mapping_set_id":"298cf547-8206-57ad-a24c-6ce29ddcc583","checksum":"3744673685c0e179ebc5d26ac75525c869d4bcf538f835369357541f58fd259c","entries":[["trapezius.upper","secondary",0.25],["trapezius.middle","secondary",0.25],["forearm.flexor_mass","secondary",0.25],["forearm.extensor_mass","secondary",0.25],["spinal_erectors.upper","primary",0.75],["spinal_erectors.lower","primary",0.75],["gluteus_maximus.upper","primary",0.75],["gluteus_maximus.middle","primary",0.75],["gluteus_maximus.lower","primary",0.75],["quadriceps.rectus_femoris","secondary",0.25],["quadriceps.vastus_lateralis","secondary",0.5],["quadriceps.vastus_medialis","secondary",0.5],["hamstrings.biceps_femoris_long_head","primary",0.75],["hamstrings.biceps_femoris_short_head","secondary",0.25],["hamstrings.semitendinosus","primary",0.75],["hamstrings.semimembranosus","primary",0.75]]}]}$json$::jsonb, 2);

commit;
