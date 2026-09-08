\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.plan6_live_owner_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception 'Plan 6 live-owner assertion failed: %',p_message;
  end if;
end
$$;

create or replace function pg_temp.plan6_live_owner_rejected(p_sql text,p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 6 live-owner expected rejection did not occur: %',p_message;
  exception when others then
    if sqlerrm like 'Plan 6 live-owner expected rejection did not occur:%' then raise; end if;
  end;
end
$$;

grant execute on function pg_temp.plan6_live_owner_assert(boolean,text) to public;
grant execute on function pg_temp.plan6_live_owner_rejected(text,text) to public;

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('6b000000-0000-4000-8000-000000000001','authenticated','authenticated','plan6-live-owner-a@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
('6b000000-0000-4000-8000-000000000002','authenticated','authenticated','plan6-live-owner-b@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
('6b000000-0000-4000-8000-000000000003','authenticated','authenticated','plan6-disabled-owner@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());

select pg_temp.plan6_live_owner_assert(
  (select count(*)=3 from public.account_access_states where user_id in (
    '6b000000-0000-4000-8000-000000000001'::uuid,
    '6b000000-0000-4000-8000-000000000002'::uuid,
    '6b000000-0000-4000-8000-000000000003'::uuid
  ) and state='active' and disabled_at is null),
  'Auth fixtures did not receive active canonical account access state'
);

-- Build two real usable Owner fixtures without assuming whether the final schema
-- has already added the explicit human_user_id column.
do $fixture$
begin
  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='food_catalog_governance_principals' and column_name='human_user_id'
  ) then
    execute $sql$
      insert into public.food_catalog_governance_principals(id,principal_type,subject_id,human_user_id,role_class)
      values
      ('6b000000-0000-4000-8000-000000000101','human','6b000000-0000-4000-8000-000000000001','6b000000-0000-4000-8000-000000000001'::uuid,'owner'),
      ('6b000000-0000-4000-8000-000000000102','human','6b000000-0000-4000-8000-000000000002','6b000000-0000-4000-8000-000000000002'::uuid,'owner')
    $sql$;
  else
    insert into public.food_catalog_governance_principals(id,principal_type,subject_id,role_class) values
      ('6b000000-0000-4000-8000-000000000101','human','6b000000-0000-4000-8000-000000000001','owner'),
      ('6b000000-0000-4000-8000-000000000102','human','6b000000-0000-4000-8000-000000000002','owner');
  end if;
end
$fixture$;

insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason) values
('6b000000-0000-4000-8000-000000000101','food.governance.manage_principals','live-owner-verifier'),
('6b000000-0000-4000-8000-000000000102','food.governance.manage_principals','live-owner-verifier');

-- A human principal may never be arbitrary text. This is the causal RED for the
-- reviewed ghost-owner acceptance defect.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','6b000000-0000-4000-8000-000000000001',true);
select pg_temp.plan6_live_owner_rejected($sql$
  select public.food_catalog_manage_governance_principal(
    '6b000000-0000-4000-8000-000000000201','human','ghost-owner','owner',
    array['food.governance.manage_principals']::text[],'reject arbitrary text owner',null
  )
$sql$,'arbitrary text human Owner rejected');
select pg_temp.plan6_live_owner_rejected($sql$
  select public.food_catalog_manage_governance_principal(
    '6b000000-0000-4000-8000-000000000202','human','6b000000-0000-4000-8000-000000000099','owner',
    array['food.governance.manage_principals']::text[],'reject nonexistent auth owner',null
  )
$sql$,'nonexistent Auth UUID Owner rejected');
reset role;

update public.account_access_states
set state='disabled',disabled_at=clock_timestamp(),reason_code='plan6-live-owner-disabled'
where user_id='6b000000-0000-4000-8000-000000000003'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','6b000000-0000-4000-8000-000000000001',true);
select pg_temp.plan6_live_owner_rejected($sql$
  select public.food_catalog_manage_governance_principal(
    '6b000000-0000-4000-8000-000000000203','human','6b000000-0000-4000-8000-000000000003','owner',
    array['food.governance.manage_principals']::text[],'reject disabled auth owner',null
  )
$sql$,'disabled Auth account cannot become Owner');
reset role;

-- A stale JWT for a disabled Owner is not governance authority.
update public.account_access_states
set state='disabled',disabled_at=clock_timestamp(),reason_code='plan6-live-owner-stale-jwt'
where user_id='6b000000-0000-4000-8000-000000000001'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','6b000000-0000-4000-8000-000000000001',true);
select pg_temp.plan6_live_owner_rejected($sql$
  select public.food_catalog_manage_governance_principal(
    '6b000000-0000-4000-8000-000000000204','human','6b000000-0000-4000-8000-000000000002','owner',
    array['food.governance.manage_principals']::text[],'stale JWT must fail',null
  )
$sql$,'disabled Owner stale JWT cannot govern');
reset role;

-- A disabled human may not satisfy the recovery predicate. Owner B cannot revoke
-- itself while the only other nominal Owner is disabled.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','6b000000-0000-4000-8000-000000000002',true);
select pg_temp.plan6_live_owner_rejected($sql$
  select public.food_catalog_revoke_governance_capability(
    '6b000000-0000-4000-8000-000000000205',
    '6b000000-0000-4000-8000-000000000102',
    'food.governance.manage_principals','disabled Owner must not count as recovery'
  )
$sql$,'disabled human Owner is excluded from recovery set');
reset role;

-- Restore A. Two valid Owners still allow safe revocation of B.
update public.account_access_states
set state='active',disabled_at=null,reason_code=null
where user_id='6b000000-0000-4000-8000-000000000001'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','6b000000-0000-4000-8000-000000000002',true);
select public.food_catalog_revoke_governance_capability(
  '6b000000-0000-4000-8000-000000000206',
  '6b000000-0000-4000-8000-000000000102',
  'food.governance.manage_principals','safe two-owner revocation'
);
reset role;
select pg_temp.plan6_live_owner_assert(
  exists(
    select 1
    from public.food_catalog_governance_principals p
    join auth.users u on u.id=coalesce(
      case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='food_catalog_governance_principals' and column_name='human_user_id') then null else p.subject_id::uuid end,
      p.subject_id::uuid
    )
    join public.account_access_states s on s.user_id=u.id and s.state='active' and s.disabled_at is null
    join public.food_catalog_governance_capability_assignments a on a.principal_id=p.id and a.capability='food.governance.manage_principals' and a.revoked_at is null
    where p.id='6b000000-0000-4000-8000-000000000101'::uuid and p.active and p.revoked_at is null
  ),
  'safe revocation did not preserve a usable Owner'
);

-- Re-grant B directly as rollback-only database-owner fixture for deletion tests.
insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason)
values('6b000000-0000-4000-8000-000000000102','food.governance.manage_principals','live-owner-delete-fixture');

-- Canonical deletion start deactivates one of two Owners under the recovery lock.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.food_catalog_begin_account_deletion('6b000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.plan6_live_owner_assert(
  (select not active and revoked_at is not null from public.food_catalog_governance_principals where id='6b000000-0000-4000-8000-000000000101'::uuid)
  and (select state='deletion_pending' from public.account_access_states where user_id='6b000000-0000-4000-8000-000000000001'::uuid),
  'deleting one of two Owners did not deactivate governance authority and move account to deletion_pending'
);

-- Deleted/deleting Owner stale JWT remains unusable.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','6b000000-0000-4000-8000-000000000001',true);
select pg_temp.plan6_live_owner_rejected($sql$
  select public.food_catalog_manage_governance_principal(
    '6b000000-0000-4000-8000-000000000207','human','6b000000-0000-4000-8000-000000000002','owner',
    array['food.governance.manage_principals']::text[],'deleted Owner stale JWT',null
  )
$sql$,'deletion_pending Owner stale JWT cannot govern');
reset role;

-- The final usable recovery Owner cannot begin deletion. Failure must roll back
-- both principal deactivation and the account-access transition.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.plan6_live_owner_rejected($sql$
  select public.food_catalog_begin_account_deletion('6b000000-0000-4000-8000-000000000002')
$sql$,'final usable Owner account deletion blocked');
reset role;
select pg_temp.plan6_live_owner_assert(
  (select active and revoked_at is null from public.food_catalog_governance_principals where id='6b000000-0000-4000-8000-000000000102'::uuid)
  and (select state='active' and disabled_at is null from public.account_access_states where user_id='6b000000-0000-4000-8000-000000000002'::uuid),
  'failed final-Owner deletion changed usable recovery authority'
);

rollback;
