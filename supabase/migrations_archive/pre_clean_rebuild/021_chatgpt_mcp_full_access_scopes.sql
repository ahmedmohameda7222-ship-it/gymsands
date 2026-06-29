-- RETIRED: blanket FitLife admin/all grants are unsafe and are intentionally
-- not applied. 202606290001_germany_privacy_security_hardening.sql performs the only
-- supported legacy migration: safe section scopes become canonical plaivra.*
-- scopes and blanket/admin/full scopes are dropped unless the user separately
-- saved canonical access_mode='full'.

do $$
begin
  raise notice 'Skipped retired blanket ChatGPT MCP scope migration.';
end;
$$;
