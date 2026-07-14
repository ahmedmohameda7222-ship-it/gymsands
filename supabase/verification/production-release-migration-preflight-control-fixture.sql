-- Executable fixture for the real production preflight aggregate/control path.
-- The caller supplies only fixture_finding_count. SQL derives the integer
-- count, Boolean state, and readable evidence exactly as production does.

\set ON_ERROR_STOP on

\if :{?fixture_finding_count}
\else
  \echo 'Database preflight fixture requires fixture_finding_count.'
  select 1 / 0 as missing_fixture_finding_count;
\endif

begin read only;

with findings(issue_type, object_identity, details) as (
  select
    'behavior_test_finding'::text,
    format('fixture_%s', finding_number),
    format('Executable fail-closed fixture %s.', finding_number)
  from generate_series(1, :'fixture_finding_count'::integer) finding_number
)
select
  count(*)::integer as blocking_finding_count,
  (count(*) > 0) as has_blocking_findings,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'issue_type', issue_type,
        'object_identity', object_identity,
        'details', details
      )
      order by issue_type, object_identity
    ),
    '[]'::jsonb
  ) as blocking_findings
from findings
\gset preflight_

\ir production-release-migration-preflight-control.psql

rollback;
