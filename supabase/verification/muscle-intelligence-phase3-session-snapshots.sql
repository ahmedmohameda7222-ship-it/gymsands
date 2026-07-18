-- Disposable Phase 3 verification. Run only after a clean local reset.
\set ON_ERROR_STOP on
\set member_id '47000000-0000-4000-8000-000000000007'
\set other_member_id '47000000-0000-4000-8000-000000000008'

begin;
\ir muscle-intelligence-phase3-session-snapshots/01-schema-plan-and-replacement.sql
\ir muscle-intelligence-phase3-session-snapshots/02-replacement-and-privacy.sql
\ir muscle-intelligence-phase3-session-snapshots/03-terminal-and-plan-lifecycle.sql
\ir muscle-intelligence-phase3-session-snapshots/04-direct-privacy-and-cleanup.sql
rollback;
