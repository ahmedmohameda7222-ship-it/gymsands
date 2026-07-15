from pathlib import Path

path = Path("supabase/verification/train-phase2a-program-architecture.sql")
text = path.read_text(encoding="utf-8")
old = """select day.id as owner_legacy_day_id, exercise.id as owner_legacy_exercise_id
from public.user_workout_plan_days day
join public.user_workout_plan_exercises exercise on exercise.plan_day_id = day.id
where day.plan_id = :'owner_plan_id'::uuid
order by day.day_number, exercise.sort_order
limit 1
\\gset

insert into public.user_workout_plan_week_templates(plan_id, name, sort_order, source)
"""
new = """-- Legacy source IDs are test-fixture setup data. Read them as the verification
-- owner, then immediately restore the authenticated member context before
-- exercising the Phase 2A RLS policies and table-specific integrity triggers.
reset role;
select day.id as owner_legacy_day_id, exercise.id as owner_legacy_exercise_id
from public.user_workout_plan_days day
join public.user_workout_plan_exercises exercise on exercise.plan_day_id = day.id
where day.plan_id = :'owner_plan_id'::uuid
order by day.day_number, exercise.sort_order
limit 1
\\gset

set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.user_workout_plan_week_templates(plan_id, name, sort_order, source)
"""
if text.count(old) != 1:
    raise SystemExit("Expected one legacy-source verification query block.")
path.write_text(text.replace(old, new), encoding="utf-8")
