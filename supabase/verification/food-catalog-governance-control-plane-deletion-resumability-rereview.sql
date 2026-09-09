\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.plan6_deletion_resumability_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception 'Plan 6 deletion-resumability assertion failed: %',p_message;
  end if;
end
$$;

grant execute on function pg_temp.plan6_deletion_resumability_assert(boolean,text) to public;

select pg_temp.plan6_deletion_resumability_assert(
  to_regprocedure('public.food_catalog_purge_account_application_data_for_deletion_job(uuid,uuid)') is not null,
  'job-bound canonical purge checkpoint RPC is missing'
);

select pg_temp.plan6_deletion_resumability_assert(
  exists(
    select 1
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public'
      and t.relname='account_deletion_jobs'
      and c.contype='c'
      and pg_get_constraintdef(c.oid) like '%deleting_auth%'
  ),
  'account deletion stage authority does not include deleting_auth checkpoint'
);

\set member_id '6f000000-0000-4000-8000-000000000001'

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(
  :'member_id','authenticated','authenticated','plan6-resumable-member@example.test','',
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()
);

insert into public.account_access_states(user_id,state,reason_code,disabled_at)
values(:'member_id','active','plan6-resumability-fixture',null)
on conflict(user_id) do update
set state='active',reason_code='plan6-resumability-fixture',disabled_at=null,updated_at=clock_timestamp();

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.food_catalog_queue_account_deletion(
  :'member_id'::uuid,
  null,
  'plan6-resumable-subject',
  'plan6-resumable-idempotency',
  clock_timestamp(),
  '2026-07-1',
  null,
  '{"request_source":"deletion-resumability-verifier"}'::jsonb
) as queued \gset

select public.food_catalog_begin_account_deletion(
  :'member_id'::uuid,
  ((:'queued')::jsonb->>'jobId')::uuid
);
reset role;

select pg_temp.plan6_deletion_resumability_assert(
  (select state='deletion_pending' and disabled_at is not null
   from public.account_access_states where user_id=:'member_id'::uuid),
  'job-bound begin did not establish irreversible deletion state'
);

update public.account_deletion_jobs
set state='processing',stage='deleting_database',attempt_count=6,locked_at=clock_timestamp(),created_at='2000-01-01T00:00:00Z'
where id=((:'queued')::jsonb->>'jobId')::uuid;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.food_catalog_purge_account_application_data_for_deletion_job(
  :'member_id'::uuid,
  ((:'queued')::jsonb->>'jobId')::uuid
) as purge_checkpoint \gset
reset role;

select pg_temp.plan6_deletion_resumability_assert(
  exists(
    select 1 from public.account_deletion_jobs
    where id=((:'queued')::jsonb->>'jobId')::uuid
      and user_id=:'member_id'::uuid
      and state='processing'
      and stage='deleting_auth'
      and coalesce((evidence->>'application_data_purge_checkpointed')::boolean,false)
  ),
  'canonical purge did not atomically persist the deleting_auth checkpoint'
);

update public.account_deletion_jobs
set state='retry_scheduled',next_attempt_at=clock_timestamp(),locked_at=null,last_error_code='transient-auth-provider-fixture'
where id=((:'queued')::jsonb->>'jobId')::uuid;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select id::text as claimed_job_id,state as claimed_state,stage as claimed_stage,attempt_count as claimed_attempt_count
from public.claim_account_deletion_jobs(1)
where id=((:'queued')::jsonb->>'jobId')::uuid
\gset
reset role;

select pg_temp.plan6_deletion_resumability_assert(
  :'claimed_job_id'=((:'queued')::jsonb->>'jobId')
  and :'claimed_state'='processing'
  and :'claimed_stage'='deleting_auth'
  and :'claimed_attempt_count'::integer=7,
  'maintenance worker could not reclaim the post-purge deletion job after retry threshold exhaustion'
);

-- Repeated begin remains job-bound and idempotent after the account is already inaccessible.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.food_catalog_begin_account_deletion(
  :'member_id'::uuid,
  ((:'queued')::jsonb->>'jobId')::uuid
);
reset role;

select pg_temp.plan6_deletion_resumability_assert(
  (select state='deletion_pending' from public.account_access_states where user_id=:'member_id'::uuid)
  and exists(
    select 1 from public.account_deletion_jobs
    where id=((:'queued')::jsonb->>'jobId')::uuid and state='processing' and stage='deleting_auth'
  ),
  'repeated begin changed the durable resume checkpoint or lost job-bound authority'
);

rollback;
