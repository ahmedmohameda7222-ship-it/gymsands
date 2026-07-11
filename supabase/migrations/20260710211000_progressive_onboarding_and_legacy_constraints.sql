-- Additive launch migration: resumable progressive onboarding and safe retention
-- of user-authored functional notes from the legacy onboarding flow.

alter table public.onboarding_answers
  add column if not exists setup_stage integer not null default 0,
  add column if not exists first_useful_job text not null default 'training_plan',
  add column if not exists completed_at timestamptz;

alter table public.onboarding_answers
  drop constraint if exists onboarding_answers_setup_stage_check,
  add constraint onboarding_answers_setup_stage_check
    check (setup_stage between 0 and 4) not valid,
  drop constraint if exists onboarding_answers_first_useful_job_check,
  add constraint onboarding_answers_first_useful_job_check
    check (first_useful_job in ('training_plan', 'nutrition_plan', 'daily_execution')) not valid;

alter table public.user_fitness_constraints
  add column if not exists legacy_context_notes text;

comment on column public.user_fitness_constraints.legacy_context_notes is
  'User-authored free text retained from the earlier onboarding flow. It is data, not a diagnosis or clinical risk classification.';

insert into public.user_fitness_constraints (user_id, legacy_context_notes)
select
  answers.user_id,
  concat_ws(
    E'\n\n',
    nullif('Earlier limitation notes: ' || btrim(coalesce(answers.injuries_limitations, '')), 'Earlier limitation notes: '),
    nullif('Earlier workout constraints: ' || btrim(coalesce(answers.workout_constraints, '')), 'Earlier workout constraints: '),
    nullif('Earlier coaching notes: ' || btrim(coalesce(answers.coaching_notes, '')), 'Earlier coaching notes: ')
  )
from public.onboarding_answers answers
where nullif(btrim(coalesce(answers.injuries_limitations, '')), '') is not null
   or nullif(btrim(coalesce(answers.workout_constraints, '')), '') is not null
   or nullif(btrim(coalesce(answers.coaching_notes, '')), '') is not null
on conflict (user_id) do update
set legacy_context_notes = case
  when nullif(btrim(coalesce(public.user_fitness_constraints.legacy_context_notes, '')), '') is null
    then excluded.legacy_context_notes
  else public.user_fitness_constraints.legacy_context_notes
end;

create index if not exists onboarding_answers_incomplete_user_idx
  on public.onboarding_answers (user_id, setup_stage)
  where completed_at is null;

-- In the previous application, an onboarding_answers row was only written by
-- the final Save action. Preserve that completion state instead of forcing
-- established accounts through onboarding again. New drafts explicitly write
-- completed_at = null and their current setup_stage.
update public.onboarding_answers
set
  setup_stage = 4,
  completed_at = coalesce(completed_at, updated_at, created_at, now())
where completed_at is null
  and (age is null or age between 16 and 100);
