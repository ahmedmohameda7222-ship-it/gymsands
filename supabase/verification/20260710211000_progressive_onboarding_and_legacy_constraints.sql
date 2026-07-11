select count(*) as invalid_setup_stage_count
from public.onboarding_answers
where setup_stage not between 0 and 4;

select first_useful_job, count(*) as account_count
from public.onboarding_answers
group by first_useful_job
order by first_useful_job;

select
  count(*) filter (where legacy_context_notes is not null) as retained_legacy_note_rows,
  count(*) as canonical_constraint_rows
from public.user_fitness_constraints;
