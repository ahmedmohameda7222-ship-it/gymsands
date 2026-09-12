const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function uuid(value, label, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${label} must be a UUID.`);
  return value.toLowerCase();
}
function identifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(`${label} must be a safe SQL identifier.`);
  return value;
}
function transientSql(rules) {
  return rules.map((rule) => {
    const relation = identifier(rule.relation, "transient relation");
    if (!Array.isArray(rule.fields) || rule.fields.length === 0) throw new Error(`Transient relation ${relation} must declare fields.`);
    const fields = rule.fields.map((field) => identifier(field, `${relation} transient field`));
    return `  IF EXISTS (SELECT 1 FROM public."${relation}" WHERE ${fields.map((field) => `"${field}" IS NOT NULL`).join(" OR ")}) THEN\n    RAISE EXCEPTION 'Plan7 pre-pointer transient authority remains in ${relation}';\n  END IF;`;
  }).join("\n");
}

export function buildPrePointerVerificationSql({ currentGenerationId, currentEventId, currentValidationReportId, transientRules = [] }) {
  if (currentGenerationId == null) {
    if (currentEventId != null || currentValidationReportId != null) throw new Error("Null current generation requires null event/report pointer identities.");
    return "SELECT true;";
  }
  const generation = uuid(currentGenerationId, "current generation");
  const event = uuid(currentEventId, "current event");
  const report = uuid(currentValidationReportId, "current validation report");
  return `DO $plan7_pre_pointer$
DECLARE
  v_generation_checksum text;
BEGIN
  SELECT composition_checksum_sha256 INTO v_generation_checksum
  FROM public.food_catalog_generations
  WHERE id='${generation}'::uuid AND sealed_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan7 current generation is missing or unsealed'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.food_catalog_generation_foods WHERE generation_id='${generation}'::uuid) THEN
    RAISE EXCEPTION 'Plan7 current generation composition is empty';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.food_catalog_generation_foods gf
    LEFT JOIN public.food_items f ON f.id=gf.food_id
    LEFT JOIN public.food_nutrition_revisions nr ON nr.id=gf.nutrition_revision_id AND nr.food_id=gf.food_id
    WHERE gf.generation_id='${generation}'::uuid
      AND (f.id IS NULL OR (gf.nutrition_revision_id IS NOT NULL AND nr.id IS NULL))
  ) THEN RAISE EXCEPTION 'Plan7 generation Food/nutrition composition is semantically incomplete'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.food_catalog_generation_names gn
    LEFT JOIN public.food_names n ON n.id=gn.name_fact_id AND n.food_id=gn.food_id
    WHERE gn.generation_id='${generation}'::uuid AND n.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.food_catalog_generation_servings gs
    LEFT JOIN public.food_serving_options s ON s.id=gs.serving_option_id AND s.food_id=gs.food_id
    WHERE gs.generation_id='${generation}'::uuid AND s.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.food_catalog_generation_taxonomy gt
    LEFT JOIN public.food_taxonomy_assignments a ON a.id=gt.taxonomy_assignment_id AND a.food_id=gt.food_id AND a.assignment_action='assign'
    WHERE gt.generation_id='${generation}'::uuid AND a.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.food_catalog_generation_markets gm
    LEFT JOIN public.food_market_assignments a ON a.id=gm.market_assignment_id AND a.food_id=gm.food_id AND a.assignment_action='assign'
    WHERE gm.generation_id='${generation}'::uuid AND a.id IS NULL
  ) THEN RAISE EXCEPTION 'Plan7 selected generation facts are semantically incomplete'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.food_catalog_generation_validation_reports r
    WHERE r.id='${report}'::uuid AND r.generation_id='${generation}'::uuid
      AND r.generation_checksum_sha256=v_generation_checksum
      AND r.blocker_count = 0 AND r.error_count = 0
  ) THEN RAISE EXCEPTION 'Plan7 validation report/checksum/blocker gate failed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.food_catalog_generation_events e
    WHERE e.id='${event}'::uuid AND e.event_type='promote'
      AND e.to_generation_id='${generation}'::uuid
      AND e.validation_report_id='${report}'::uuid
      AND e.generation_checksum_sha256=v_generation_checksum
  ) THEN RAISE EXCEPTION 'Plan7 promotion event linkage/checksum gate failed'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.food_catalog_governance_policy_pointer p
    JOIN public.food_catalog_governance_policy_versions v ON v.policy_version=p.current_policy_version
    WHERE p.singleton
  ) THEN RAISE EXCEPTION 'Plan7 governance policy linkage is missing'; END IF;

  IF EXISTS (
    WITH RECURSIVE redirect_walk(source_food_id,target_food_id,path,cycle) AS (
      SELECT r.source_food_id,r.target_food_id,ARRAY[r.source_food_id]::uuid[],false
      FROM public.food_catalog_generation_redirects r WHERE r.generation_id='${generation}'::uuid
      UNION ALL
      SELECT w.source_food_id,r.target_food_id,w.path || r.source_food_id,r.source_food_id=ANY(w.path)
      FROM redirect_walk w
      JOIN public.food_catalog_generation_redirects r ON r.generation_id='${generation}'::uuid AND r.source_food_id=w.target_food_id
      WHERE NOT w.cycle
    ) SELECT 1 FROM redirect_walk WHERE cycle
  ) OR EXISTS (
    SELECT 1 FROM public.food_catalog_generation_redirects r
    LEFT JOIN public.food_items source ON source.id=r.source_food_id
    LEFT JOIN public.food_catalog_generation_foods target ON target.generation_id=r.generation_id AND target.food_id=r.target_food_id AND target.lifecycle='active'
    WHERE r.generation_id='${generation}'::uuid AND (source.id IS NULL OR target.food_id IS NULL)
  ) THEN RAISE EXCEPTION 'Plan7 redirect topology is cyclic or has a missing canonical target'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.food_catalog_governance_principals p
    LEFT JOIN auth.users u ON u.id=p.human_user_id
    LEFT JOIN public.profiles profile ON profile.id=p.human_user_id
    LEFT JOIN public.account_access_states access ON access.user_id=p.human_user_id AND access.state='active' AND access.disabled_at IS NULL
    WHERE p.principal_type='human' AND p.active AND p.revoked_at IS NULL
      AND (p.human_user_id IS NULL OR u.id IS NULL OR profile.id IS NULL OR access.user_id IS NULL)
  ) THEN RAISE EXCEPTION 'Plan7 governance principal owner mapping is incomplete'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='food_favorites')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='food_personal_corrections')
     OR NOT EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname='food_catalog_search_documents' AND c.relrowsecurity
     ) THEN RAISE EXCEPTION 'Plan7 RLS policy metadata baseline is incomplete'; END IF;
${transientSql(transientRules)}
END
$plan7_pre_pointer$;`;
}
