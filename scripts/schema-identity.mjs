const FOOD_CATALOG_RELATION_PREDICATE = `(
      c.relname LIKE 'food_%'
      OR c.relname IN ('user_food_favorites','user_food_items','market_scopes','market_scope_memberships','release_schema_compatibility')
    )`;

export function buildFoodCatalogSchemaIdentitySql() {
  return `schema_identity AS (
  WITH relation_scope AS (
    SELECT
      c.oid,
      n.nspname,
      c.relname,
      c.relkind,
      c.relrowsecurity,
      c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p')
      AND ${FOOD_CATALOG_RELATION_PREDICATE}
  ), column_parts AS (
    SELECT
      'column'::text AS part_kind,
      r.nspname || '.' || r.relname || ':' || a.attnum::text || ':' || a.attname ||
      ':type=' || format_type(a.atttypid, a.atttypmod) ||
      ':notnull=' || a.attnotnull::text ||
      ':default=' || coalesce(pg_get_expr(d.adbin, d.adrelid, false), '') ||
      ':generated=' || coalesce(a.attgenerated::text, '') ||
      ':identity=' || coalesce(a.attidentity::text, '') AS part_identity
    FROM relation_scope r
    JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = r.oid AND d.adnum = a.attnum
  ), relation_parts AS (
    SELECT
      'relation'::text AS part_kind,
      r.nspname || '.' || r.relname ||
      ':kind=' || r.relkind::text ||
      ':rls=' || r.relrowsecurity::text ||
      ':force_rls=' || r.relforcerowsecurity::text AS part_identity
    FROM relation_scope r
  ), constraint_parts AS (
    SELECT
      'constraint'::text AS part_kind,
      r.nspname || '.' || r.relname || ':' || con.conname ||
      ':type=' || con.contype::text ||
      ':deferrable=' || con.condeferrable::text ||
      ':deferred=' || con.condeferred::text ||
      ':validated=' || con.convalidated::text ||
      ':definition=' || pg_get_constraintdef(con.oid, false) AS part_identity
    FROM pg_constraint con
    JOIN relation_scope r ON r.oid = con.conrelid
  ), policy_parts AS (
    SELECT
      'policy'::text AS part_kind,
      p.schemaname || '.' || p.tablename || ':' || p.policyname ||
      ':permissive=' || p.permissive::text ||
      ':roles=' || coalesce((
        SELECT string_agg(role_name, ',' ORDER BY role_name COLLATE "C")
        FROM unnest(p.roles) AS role_name
      ), '') ||
      ':cmd=' || p.cmd ||
      ':qual=' || coalesce(p.qual, '') ||
      ':with_check=' || coalesce(p.with_check, '') AS part_identity
    FROM pg_policies p
    JOIN relation_scope r ON r.nspname = p.schemaname AND r.relname = p.tablename
  ), trigger_parts AS (
    SELECT
      'trigger'::text AS part_kind,
      r.nspname || '.' || r.relname || ':' || t.tgname ||
      ':enabled=' || t.tgenabled::text ||
      ':definition=' || pg_get_triggerdef(t.oid, false) AS part_identity
    FROM pg_trigger t
    JOIN relation_scope r ON r.oid = t.tgrelid
    WHERE NOT t.tgisinternal
  ), function_scope AS (
    SELECT
      p.oid,
      n.nspname,
      p.proname,
      p.prokind,
      p.proowner,
      p.proacl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prokind IN ('f','p')
      AND (
        (n.nspname = 'public' AND (p.proname LIKE 'food_%' OR p.proname LIKE '%food_catalog%'))
        OR (n.nspname = 'private' AND p.proname LIKE 'food_catalog_%')
      )
  ), function_parts AS (
    SELECT
      'function'::text AS part_kind,
      f.nspname || '.' || f.proname || '(' || pg_get_function_identity_arguments(f.oid) || ')' ||
      ':kind=' || f.prokind::text ||
      ':definition=' || pg_get_functiondef(f.oid) AS part_identity
    FROM function_scope f
  ), function_acl_parts AS (
    SELECT
      'function_acl'::text AS part_kind,
      f.nspname || '.' || f.proname || '(' || pg_get_function_identity_arguments(f.oid) || ')' ||
      ':grantor=' || coalesce(grantor.rolname, acl.grantor::text) ||
      ':grantee=' || coalesce(grantee.rolname, 'PUBLIC') ||
      ':privilege=' || acl.privilege_type ||
      ':grantable=' || acl.is_grantable::text AS part_identity
    FROM function_scope f
    CROSS JOIN LATERAL aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) acl
    LEFT JOIN pg_roles grantor ON grantor.oid = acl.grantor
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
  ), identity_parts AS (
    SELECT * FROM column_parts
    UNION ALL SELECT * FROM relation_parts
    UNION ALL SELECT * FROM constraint_parts
    UNION ALL SELECT * FROM policy_parts
    UNION ALL SELECT * FROM trigger_parts
    UNION ALL SELECT * FROM function_parts
    UNION ALL SELECT * FROM function_acl_parts
  )
  SELECT coalesce(
    string_agg(
      part_kind || ':' || part_identity,
      E'\\n' ORDER BY part_kind COLLATE "C", part_identity COLLATE "C"
    ),
    ''
  ) AS identity_input
  FROM identity_parts
)`;
}
