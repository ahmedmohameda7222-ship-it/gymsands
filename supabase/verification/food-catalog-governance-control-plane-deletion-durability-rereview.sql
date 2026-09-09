\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.plan6_deletion_durability_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception 'Plan 6 deletion-durability assertion failed: %',p_message;
  end if;
end
$$;

create or replace function pg_temp.plan6_deletion_durability_rejected(p_sql text,p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 6 deletion-durability expected rejection did not occur: %',p_message;
  exception when others then
    if sqlerrm like 'Plan 6 deletion-durability expected rejection did not occur:%' then raise; end if;
  end;
end
$$;

grant execute on function pg_temp.plan6_deletion_durability_assert(boolean,text) to public;
grant execute on function pg_temp.plan6_deletion_durability_rejected(text,text) to public;

\set owner_a '6e000000-0000-4000-8000-000000000001'
\set owner_b '6e000000-0000-4000-8000-000000000002'
\set member_id '6e000000-0000-4000-8000-000000000003'
\set owner_a_principal '6e000000-0000-4000-8000-000000000101'
\set owner_b_principal '6e000000-0000-4000-8000-000000000102'

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
(:'owner_a','authenticated','authenticated','plan6-durable-owner-a@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
(:'owner_b','authenticated','authenticated','plan6-durable-owner-b@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
(:'member_id','authenticated','authenticated','plan6-durable-member@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());

insert into public.account_access_states(user_id,state,reason_code,disabled_at) values
(:'owner_a','active','plan6-durability-fixture',null),
(:'owner_b','active','plan6-durability-fixture',null),
(:'member_id','active','plan6-durability-fixture',null)
on conflict(user_id) do update set state='active',reason_code='plan6-durability-fixture',disabled_at=null,updated_at=clock_timestamp();

insert into public.food_catalog_governance_principals(id,principal_type,subject_id,human_user_id,role_class) values
(:'owner_a_principal','human',:'owner_a',:'owner_a','owner'),
(:'owner_b_principal','human',:'owner_b',:'owner_b','owner');
insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason) values
(:'owner_a_principal','food.governance.manage_principals','deletion-durability-verifier'),
(:'owner_b_principal','food.governance.manage_principals','deletion-durability-verifier');

-- 1. Final usable Owner rejection happens before any durable deletion/request state.
update public.account_access_states set state='disabled',disabled_at=clock_timestamp(),reason_code='make-owner-a-final' where user_id=:'owner_b'::uuid;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.plan6_deletion_durability_rejected(format(
  'select public.food_catalog_queue_account_deletion(%L::uuid,null,%L,%L,clock_timestamp(),%L,null,%L::jsonb)',
  :'owner_a','owner-a-final-subject','owner-a-final-idempotency','2026-07-1','{}'
),'final usable Owner cannot queue deletion');
reset role;
select pg_temp.plan6_deletion_durability_assert(
  (select state='active' and disabled_at is null from public.account_access_states where user_id=:'owner_a'::uuid)
  and (select active from public.food_catalog_governance_principals where id=:'owner_a_principal'::uuid)
  and not exists(select 1 from public.account_deletion_jobs where user_id=:'owner_a'::uuid)
  and not exists(select 1 from public.privacy_requests where user_id=:'owner_a'::uuid and request_type='deletion'),
  'final usable Owner rejection changed access/governance or created false deletion state'
);

-- Restore a second usable Owner, then prove durable authority exists before disable.
update public.account_access_states set state='active',disabled_at=null,reason_code='restore-owner-b' where user_id=:'owner_b'::uuid;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.food_catalog_queue_account_deletion(
  :'owner_a'::uuid,null,'owner-a-durable-subject','owner-a-durable-idempotency',clock_timestamp(),'2026-07-1',null,
  '{"request_source":"durability-verifier"}'::jsonb
) as owner_queue \gset
reset role;
select pg_temp.plan6_deletion_durability_assert(
  exists(select 1 from public.account_deletion_jobs where id=((:'owner_queue')::jsonb->>'jobId')::uuid and user_id=:'owner_a'::uuid and state='queued')
  and (select state='active' and disabled_at is null from public.account_access_states where user_id=:'owner_a'::uuid)
  and (select active from public.food_catalog_governance_principals where id=:'owner_a_principal'::uuid),
  'durable deletion job was not established before account/governance disable'
);

-- 4. Simulate job persistence failure after request creation inside the queue RPC.
create or replace function pg_temp.plan6_force_job_persist_failure() returns trigger language plpgsql as $$
begin
  if new.subject_hash='force-persist-failure' then raise exception 'rollback-only forced job persistence failure'; end if;
  return new;
end
$$;
create trigger plan6_force_job_persist_failure before insert on public.account_deletion_jobs
for each row execute function pg_temp.plan6_force_job_persist_failure();
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.plan6_deletion_durability_rejected(format(
  'select public.food_catalog_queue_account_deletion(%L::uuid,null,%L,%L,clock_timestamp(),%L,null,%L::jsonb)',
  :'member_id','force-persist-failure','member-persist-failure-idempotency','2026-07-1','{}'
),'job persistence failure rolls back queue transaction');
reset role;
drop trigger plan6_force_job_persist_failure on public.account_deletion_jobs;
select pg_temp.plan6_deletion_durability_assert(
  (select state='active' and disabled_at is null from public.account_access_states where user_id=:'member_id'::uuid)
  and not exists(select 1 from public.account_deletion_jobs where user_id=:'member_id'::uuid)
  and not exists(select 1 from public.privacy_requests where user_id=:'member_id'::uuid and idempotency_key_hash='member-persist-failure-idempotency'),
  'failed job persistence stranded account/request state'
);

-- Transition cannot run with invented/missing durable authority.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.plan6_deletion_durability_rejected(format(
  'select public.food_catalog_begin_account_deletion(%L::uuid,%L::uuid)',
  :'member_id','6e000000-0000-4000-8000-000000000999'
),'irreversible transition requires durable job');
reset role;
select pg_temp.plan6_deletion_durability_assert(
  (select state='active' and disabled_at is null from public.account_access_states where user_id=:'member_id'::uuid),
  'missing-job transition made account inaccessible'
);

-- 2/5. Legitimate transition is job-bound and leaves durable continuation authority.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.food_catalog_begin_account_deletion(
  :'owner_a'::uuid,((:'owner_queue')::jsonb->>'jobId')::uuid
);
reset role;
select pg_temp.plan6_deletion_durability_assert(
  exists(select 1 from public.account_deletion_jobs where id=((:'owner_queue')::jsonb->>'jobId')::uuid and user_id=:'owner_a'::uuid)
  and (select state='deletion_pending' and disabled_at is not null from public.account_access_states where user_id=:'owner_a'::uuid)
  and not (select active from public.food_catalog_governance_principals where id=:'owner_a_principal'::uuid),
  'legitimate deletion transition is not durably resumable after access disable'
);

-- Re-entry by the worker is idempotent and still requires the same durable job.
update public.account_deletion_jobs set state='retry_scheduled',stage='disabling_access',last_error_code='transient-worker-fixture' where id=((:'owner_queue')::jsonb->>'jobId')::uuid;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.food_catalog_begin_account_deletion(
  :'owner_a'::uuid,((:'owner_queue')::jsonb->>'jobId')::uuid
);
reset role;
select pg_temp.plan6_deletion_durability_assert(
  exists(select 1 from public.account_deletion_jobs where id=((:'owner_queue')::jsonb->>'jobId')::uuid and state='retry_scheduled')
  and (select state='deletion_pending' from public.account_access_states where user_id=:'owner_a'::uuid),
  'worker cannot resume durable deletion transition after transient failure without client authentication'
);

rollback;
