select singleton, version, migration_version, applied_at
from public.release_schema_compatibility
where singleton = true;

select to_regclass('public.release_schema_compatibility') is not null as marker_table_exists,
       to_regprocedure('public.consume_mcp_oauth_authorization_code(text,text,text,text,text)') is not null as oauth_atomic_consume_exists,
       to_regprocedure('public.claim_mcp_idempotency_key(uuid,uuid,text,text,text,integer,integer)') is not null as idempotency_claim_exists,
       to_regprocedure('public.claim_billing_events(integer,integer)') is not null as billing_claim_exists;
