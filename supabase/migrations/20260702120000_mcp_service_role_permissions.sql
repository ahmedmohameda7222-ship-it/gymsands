-- Phase 8 hotfix: allow backend service-role reads of saved AI permission settings.
-- Required for POST /api/mcp/connections to resolve saved Full Access / Custom Access scopes.

grant select on table public.user_ai_permission_settings to service_role;
