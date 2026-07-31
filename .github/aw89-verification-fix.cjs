const { readFileSync, writeFileSync } = require("node:fs");

const path = "supabase/verification/active-workout-aw2b-integration.sql";
const source = readFileSync(path, "utf8");
const before = `select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'a2b00000-0000-4000-8000-000000000104'::uuid,2,
  'pause','{"controller_device_id":"a2b00000-0000-4000-8000-000000000199"}'::jsonb
) as noop_response \\gset
select pg_temp.assert_true(
  (:'noop_response'::jsonb->>'outcome')='no_op'
  and (:'noop_response'::jsonb->>'revisionAfter')::bigint=2
  and (select revision=2 and updated_at=:'paused_updated_at'::timestamptz and controller_device_id is null from public.workout_session_execution_states where workout_session_id=:'session_id'::uuid),
  'Pause no-op advanced revision, changed updated_at, or wrote controller metadata.');`;
const after = `select public.apply_workout_session_execution_command_atomic(
  :'owner_id'::uuid,:'session_id'::uuid,'a2b00000-0000-4000-8000-000000000104'::uuid,2,
  'pause','{"controller_device_id":"a2b00000-0000-4000-8000-000000000199"}'::jsonb
) as controller_conflict_response \\gset
select pg_temp.assert_true(
  (:'controller_conflict_response'::jsonb->>'outcome')='controller_conflict'
  and (:'controller_conflict_response'::jsonb->>'reason')='controller_not_claimed'
  and (:'controller_conflict_response'::jsonb->>'revisionAfter')::bigint=2
  and (select revision=2 and updated_at=:'paused_updated_at'::timestamptz and controller_device_id is null from public.workout_session_execution_states where workout_session_id=:'session_id'::uuid)
  and (select count(*)=1 and min(outcome)='controller_conflict' from public.workout_session_execution_commands where workout_session_id=:'session_id'::uuid and command_id='a2b00000-0000-4000-8000-000000000104'::uuid),
  'Identity-bearing ordinary command bypassed claim_control or mutated the unclaimed session.');`;
const first = source.indexOf(before);
if (first < 0 || first !== source.lastIndexOf(before)) {
  throw new Error("Expected exactly one AW-2B pause no-op verification block.");
}
writeFileSync(path, source.replace(before, after), "utf8");
