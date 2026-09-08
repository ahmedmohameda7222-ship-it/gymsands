\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.plan6_report_privacy_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception 'Plan 6 report-privacy assertion failed: %',p_message;
  end if;
end
$$;

create or replace function pg_temp.plan6_report_privacy_rejected(p_sql text,p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 6 report-privacy expected rejection did not occur: %',p_message;
  exception when others then
    if sqlerrm like 'Plan 6 report-privacy expected rejection did not occur:%' then raise; end if;
  end;
end
$$;

create or replace function pg_temp.plan6_report_member_payload_exists(p_report_id uuid,p_user_id uuid)
returns boolean language plpgsql as $$
declare v_exists boolean;
begin
  if to_regclass('public.food_catalog_correction_report_member_payloads') is not null then
    execute 'select exists(select 1 from public.food_catalog_correction_report_member_payloads where report_id=$1 and reporter_user_id=$2)'
      into v_exists using p_report_id,p_user_id;
  else
    execute 'select exists(select 1 from public.food_catalog_correction_reports where id=$1 and reporter_user_id=$2 and description is not null and evidence is not null)'
      into v_exists using p_report_id,p_user_id;
  end if;
  return coalesce(v_exists,false);
end
$$;

grant execute on function pg_temp.plan6_report_privacy_assert(boolean,text) to public;
grant execute on function pg_temp.plan6_report_privacy_rejected(text,text) to public;
grant execute on function pg_temp.plan6_report_member_payload_exists(uuid,uuid) to public;

\set reporter_id '6c000000-0000-4000-8000-000000000001'
\set stale_id '6c000000-0000-4000-8000-000000000002'
\set owner_id '6c000000-0000-4000-8000-000000000003'
\set owner_principal '6c000000-0000-4000-8000-000000000103'
\set food_id '6c000000-0000-4000-8000-000000000201'

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
(:'reporter_id','authenticated','authenticated','plan6-report-owner@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
(:'stale_id','authenticated','authenticated','plan6-report-stale@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
(:'owner_id','authenticated','authenticated','plan6-report-governor@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());

insert into public.food_items(id,food_name,is_global,lifecycle_status)
values(:'food_id','Plan 6 correction-report privacy Food',true,'active');

-- Rollback-only real Owner fixture for proving an applied correction survives
-- deletion of the original member reporter.
do $fixture$
begin
  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='food_catalog_governance_principals' and column_name='human_user_id'
  ) then
    execute $sql$
      insert into public.food_catalog_governance_principals(id,principal_type,subject_id,human_user_id,role_class)
      values('6c000000-0000-4000-8000-000000000103','human','6c000000-0000-4000-8000-000000000003','6c000000-0000-4000-8000-000000000003'::uuid,'owner')
    $sql$;
  else
    insert into public.food_catalog_governance_principals(id,principal_type,subject_id,role_class)
    values('6c000000-0000-4000-8000-000000000103','human','6c000000-0000-4000-8000-000000000003','owner');
  end if;
end
$fixture$;
insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason)
select :'owner_principal'::uuid,capability,'report-privacy-verifier'
from unnest(array[
  'food.correction.review','food.correction.approve','food.correction.apply','food.nutrition.correct'
]::text[]) capability;

-- A. Member submits both an open intake report and a report that will later back
-- a canonical correction. The member payload must initially exist.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'reporter_id',true);
select (public.food_catalog_report_correction(
  :'food_id','other','privacy:open','Member open report private text',
  '{"member_note":"private open payload"}'::jsonb,'plan6-v1'
))->>'caseId' as open_case \gset
select (public.food_catalog_report_correction(
  :'food_id','missing_nutrition','privacy:applied','Member applied report private text',
  '{"member_note":"private applied payload"}'::jsonb,'plan6-v1'
))->>'caseId' as applied_case \gset
reset role;

select id as open_report
from public.food_catalog_correction_reports where case_id=:'open_case'::uuid order by created_at,id limit 1 \gset
select id as applied_report
from public.food_catalog_correction_reports where case_id=:'applied_case'::uuid order by created_at,id limit 1 \gset
select pg_temp.plan6_report_privacy_assert(
  pg_temp.plan6_report_member_payload_exists(:'open_report'::uuid,:'reporter_id'::uuid)
  and pg_temp.plan6_report_member_payload_exists(:'applied_report'::uuid,:'reporter_id'::uuid),
  'member report payload was not persisted before deletion'
);

-- D. Turn one case into an applied canonical Nutrition correction. Approval uses
-- the separate governed authority snapshot; member payload is not permanent
-- canonical approval evidence.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_id',true);
select public.food_catalog_transition_correction_case(
  '6c000000-0000-4000-8000-000000000301',:'applied_case','reported',0,'under_review','review privacy fixture'
);
select public.food_catalog_transition_correction_case(
  '6c000000-0000-4000-8000-000000000302',:'applied_case','under_review',1,'approved','approve privacy fixture',
  'nutrition_revision','',0,null
);
select (public.food_catalog_apply_nutrition_correction(
  '6c000000-0000-4000-8000-000000000303',:'applied_case',:'food_id',2,0,null,
  25,null,null,null,null,null,null,null,100,'g',null,'plan6-report-privacy','apply independent canonical correction',null
))->>'nutritionRevisionId' as applied_nutrition_revision \gset
reset role;

select pg_temp.plan6_report_privacy_assert(
  (select state='applied' from public.food_catalog_correction_cases where id=:'applied_case'::uuid)
  and exists(select 1 from public.food_nutrition_revisions where id=:'applied_nutrition_revision'::uuid),
  'canonical correction fixture did not become applied before reporter deletion'
);

-- B/C. Canonical account purge removes member-owned payload for both open and
-- applied reports, while retaining global Case/report metadata and governance.
update public.account_access_states
set state='deletion_processing',reason_code='plan6-report-privacy-purge',disabled_at=clock_timestamp()
where user_id=:'reporter_id'::uuid;
insert into public.account_deletion_jobs(
  id,user_id,subject_hash,idempotency_key_hash,state,stage,attempt_count,locked_at,created_at,updated_at
) values(
  '6c000000-0000-4000-8000-000000000401',:'reporter_id'::uuid,
  'plan6-report-privacy-subject','plan6-report-privacy-idempotency',
  'processing','deleting_database',1,clock_timestamp(),clock_timestamp(),clock_timestamp()
);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.purge_account_application_data_atomic(:'reporter_id'::uuid);
reset role;

select pg_temp.plan6_report_privacy_assert(
  exists(select 1 from public.food_catalog_correction_cases where id=:'open_case'::uuid)
  and exists(select 1 from public.food_catalog_correction_cases where id=:'applied_case'::uuid)
  and exists(select 1 from public.food_catalog_correction_reports where id=:'open_report'::uuid)
  and exists(select 1 from public.food_catalog_correction_reports where id=:'applied_report'::uuid),
  'privacy deletion removed global correction Case/report metadata'
);
select pg_temp.plan6_report_privacy_assert(
  not pg_temp.plan6_report_member_payload_exists(:'open_report'::uuid,:'reporter_id'::uuid)
  and not pg_temp.plan6_report_member_payload_exists(:'applied_report'::uuid,:'reporter_id'::uuid),
  'canonical account purge left attributable correction-report member payload behind'
);
select pg_temp.plan6_report_privacy_assert(
  (select state='applied' from public.food_catalog_correction_cases where id=:'applied_case'::uuid)
  and exists(select 1 from public.food_nutrition_revisions where id=:'applied_nutrition_revision'::uuid)
  and exists(select 1 from public.food_catalog_governance_audit_events where operation_id='6c000000-0000-4000-8000-000000000303'::uuid)
  and exists(select 1 from public.food_catalog_governance_outbox where operation_id='6c000000-0000-4000-8000-000000000303'::uuid),
  'reporter deletion rewrote applied canonical Food/governance history'
);

-- F. Stale authenticated intake after deletion_processing begins must fail before
-- creating a Case, report metadata, or member payload.
update public.account_access_states
set state='deletion_processing',reason_code='plan6-report-stale',disabled_at=clock_timestamp()
where user_id=:'stale_id'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'stale_id',true);
select pg_temp.plan6_report_privacy_rejected(format(
  'select public.food_catalog_report_correction(%L::uuid,%L,%L,%L,%L::jsonb,%L)',
  :'food_id','other','privacy:stale','stale private description','{"member_note":"stale"}','plan6-v1'
),'deletion_processing member report rejected before payload creation');
reset role;
select pg_temp.plan6_report_privacy_assert(
  not exists(select 1 from public.food_catalog_correction_cases where issue_key=lower(:'food_id'||'|other|privacy:stale')),
  'stale deletion-processing report created global intake state'
);

rollback;
