select state, count(*) as account_count
from public.account_access_states
group by state
order by state;

select state, stage, count(*) as job_count
from public.account_deletion_jobs
group by state, stage
order by state, stage;

select count(*) as active_legal_hold_count
from public.privacy_deletion_legal_holds
where released_at is null;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('claim_account_deletion_jobs', 'cleanup_privacy_retention_artifacts')
order by routine_name;
