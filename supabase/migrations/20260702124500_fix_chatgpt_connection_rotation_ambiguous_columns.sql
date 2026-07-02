-- P0 hotfix: prevent PL/pgSQL output-column ambiguity in ChatGPT connection rotation.
-- The function returns an is_active column, so unqualified is_active references
-- inside the UPDATE can be ambiguous. Qualify table columns with alias c.

create or replace function public.rotate_chatgpt_connection(
  p_user_id uuid,
  p_token_hash text,
  p_scopes text[]
)
returns table(id uuid, scopes text[], is_active boolean, created_at timestamp with time zone)
language plpgsql
set search_path to ''
as $$
declare
  created_connection public.chatgpt_connections;
begin
  if p_user_id is null or p_token_hash is null or length(p_token_hash) < 32 then
    raise exception 'invalid connection rotation input';
  end if;

  if p_scopes is null or cardinality(p_scopes) = 0 then
    raise exception 'saved AI permission scopes are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  update public.chatgpt_connections as c
  set is_active = false,
      revoked_at = coalesce(c.revoked_at, statement_timestamp()),
      updated_at = statement_timestamp()
  where c.user_id = p_user_id
    and c.is_active = true;

  insert into public.chatgpt_connections (user_id, token_hash, scopes, is_active)
  values (p_user_id, p_token_hash, p_scopes, true)
  returning * into created_connection;

  return query
  select
    created_connection.id,
    created_connection.scopes,
    created_connection.is_active,
    created_connection.created_at;
end;
$$;

grant execute on function public.rotate_chatgpt_connection(uuid, text, text[]) to service_role;
