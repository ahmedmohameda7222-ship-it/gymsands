-- Owner-only, read-only launch eligibility report.
-- Run through an authenticated administrative database session. Do not expose
-- this query through member APIs and do not commit its output.

with current_age_consent as (
  select distinct on (user_id)
    user_id,
    granted,
    revoked_at,
    granted_at
  from public.user_consents
  where consent_type = 'age_16'
  order by user_id, created_at desc
), classified as (
  select
    p.id as user_id,
    oa.age,
    ac.granted_at as age_confirmation_at,
    case
      when oa.age is not null and oa.age < 16 then 'conflict_under_16'
      when ac.user_id is null or ac.granted is not true or ac.revoked_at is not null then 'missing_confirmation'
      when oa.age is null then 'missing_age'
      else 'eligible'
    end as eligibility_status
  from public.profiles p
  left join public.onboarding_answers oa on oa.user_id = p.id
  left join current_age_consent ac on ac.user_id = p.id
)
select
  eligibility_status,
  count(*) as account_count
from classified
group by eligibility_status
order by eligibility_status;

-- For an owner-reviewed CSV with user identifiers, run this second statement
-- in the same secured session by replacing the summary SELECT above with:
-- select user_id, age, age_confirmation_at, eligibility_status
-- from classified
-- order by eligibility_status, user_id;
