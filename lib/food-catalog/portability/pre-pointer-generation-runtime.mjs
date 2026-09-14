import { spawnSync } from "node:child_process";
import { validateGenerationSemanticSnapshot } from "../generation-validation-core.ts";
import { computeGenerationCompositionChecksum } from "../generation-composition.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;

function uuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${label} must be a UUID.`);
  return value.toLowerCase();
}
function checksum(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be lowercase SHA-256 hex.`);
  return value;
}
function runPsql(databaseUrl, sql, { tuplesOnly = false } = {}) {
  const args = [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"];
  if (tuplesOnly) args.push("-A", "-t");
  const result = spawnSync("psql", args, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Plan7 pre-pointer SQL failed: ${(result.stderr ?? "").trim()}`);
  return (result.stdout ?? "").trim();
}
function queryJson(databaseUrl, sql) {
  const text = runPsql(databaseUrl, sql, { tuplesOnly: true });
  if (!text) throw new Error("Plan7 pre-pointer query returned no JSON payload.");
  return JSON.parse(text);
}
function jsonArray(databaseUrl, sql) {
  const value = queryJson(databaseUrl, sql);
  if (!Array.isArray(value)) throw new Error("Plan7 pre-pointer query must return a JSON array.");
  return value;
}

export function buildStoredValidationAuthoritySql({ generationId, eventId, reportId, expectedChecksum }) {
  const generation = uuid(generationId, "current generation");
  const event = uuid(eventId, "current promotion event");
  const report = uuid(reportId, "current validation report");
  const expected = checksum(expectedChecksum, "artifact generation composition checksum");
  return `DO $plan7_validation_authority$
DECLARE
  v_generation_checksum text;
  v_generation_policy text;
  v_blockers integer;
  v_errors integer;
  v_warnings integer;
  v_info integer;
BEGIN
  SELECT composition_checksum_sha256, generation_policy_version
    INTO v_generation_checksum, v_generation_policy
  FROM public.food_catalog_generations
  WHERE id='${generation}'::uuid AND sealed_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan7 canonical generation authority is missing or unsealed'; END IF;
  IF v_generation_checksum <> '${expected}' THEN RAISE EXCEPTION 'Plan7 stored generation checksum differs from portable canonical authority'; END IF;

  SELECT
    count(*) FILTER (WHERE blocking),
    count(*) FILTER (WHERE severity='error'),
    count(*) FILTER (WHERE severity='warning'),
    count(*) FILTER (WHERE severity='info')
  INTO v_blockers, v_errors, v_warnings, v_info
  FROM public.food_catalog_generation_validation_findings
  WHERE report_id='${report}'::uuid;

  IF v_blockers <> 0 THEN RAISE EXCEPTION 'Plan7 stored validation findings contain blockers'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.food_catalog_generation_validation_reports r
    WHERE r.id='${report}'::uuid
      AND r.generation_id='${generation}'::uuid
      AND r.generation_checksum_sha256=v_generation_checksum
      AND r.policy_version=v_generation_policy
      AND r.blocker_count=v_blockers
      AND r.error_count=v_errors
      AND r.warning_count=v_warnings
      AND r.info_count=v_info
      AND r.blocker_count=0
      AND r.error_count=0
  ) THEN RAISE EXCEPTION 'Plan7 validation report linkage or stored finding counts are inconsistent'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.food_catalog_generation_events e
    WHERE e.id='${event}'::uuid
      AND e.event_type='promote'
      AND e.to_generation_id='${generation}'::uuid
      AND e.validation_report_id='${report}'::uuid
      AND e.generation_checksum_sha256=v_generation_checksum
  ) THEN RAISE EXCEPTION 'Plan7 promotion event linkage/checksum authority is inconsistent'; END IF;
END
$plan7_validation_authority$;`;
}

export function loadCanonicalGenerationValidationSnapshot(databaseUrl, generationId) {
  const generation = uuid(generationId, "current generation");
  const generationRow = queryJson(databaseUrl, `SELECT jsonb_build_object('id',id::text,'compositionSchemaVersion',composition_schema_version,'generationPolicyVersion',generation_policy_version,'activationPolicyVersion',activation_policy_version,'trustPolicyVersion',trust_policy_version,'projectionVersion',projection_version,'compositionChecksumSha256',composition_checksum_sha256,'sealedAt',sealed_at::text)::text FROM public.food_catalog_generations WHERE id='${generation}'::uuid;`);
  const foods = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('generationId',generation_id::text,'foodId',food_id::text,'lifecycle',lifecycle,'nutritionRevisionId',nutrition_revision_id::text,'activationSetId',activation_set_id::text,'activationSetMemberId',activation_set_member_id::text,'activationGrantEventId',activation_grant_event_id::text) ORDER BY food_id),'[]'::jsonb)::text FROM public.food_catalog_generation_foods WHERE generation_id='${generation}'::uuid;`);
  const servingSelections = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('foodId',food_id::text,'id',serving_option_id::text) ORDER BY food_id,serving_option_id),'[]'::jsonb)::text FROM public.food_catalog_generation_servings WHERE generation_id='${generation}'::uuid;`);
  const nameSelections = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('foodId',food_id::text,'id',name_fact_id::text) ORDER BY food_id,name_fact_id),'[]'::jsonb)::text FROM public.food_catalog_generation_names WHERE generation_id='${generation}'::uuid;`);
  const taxonomySelections = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('foodId',food_id::text,'id',taxonomy_assignment_id::text) ORDER BY food_id,taxonomy_assignment_id),'[]'::jsonb)::text FROM public.food_catalog_generation_taxonomy WHERE generation_id='${generation}'::uuid;`);
  const marketSelections = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('foodId',food_id::text,'id',market_assignment_id::text) ORDER BY food_id,market_assignment_id),'[]'::jsonb)::text FROM public.food_catalog_generation_markets WHERE generation_id='${generation}'::uuid;`);
  const verificationSelections = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('foodId',food_id::text,'scope',assertion_scope,'assertionId',assertion_id::text) ORDER BY food_id,assertion_scope),'[]'::jsonb)::text FROM public.food_catalog_generation_verification WHERE generation_id='${generation}'::uuid;`);
  const selectionsByFoodId = Object.fromEntries(foods.map((food) => [food.foodId, { servingOptionIds: [], nameFactIds: [], taxonomyAssignmentIds: [], marketAssignmentIds: [], verification: [] }]));
  for (const row of servingSelections) selectionsByFoodId[row.foodId]?.servingOptionIds.push(row.id);
  for (const row of nameSelections) selectionsByFoodId[row.foodId]?.nameFactIds.push(row.id);
  for (const row of taxonomySelections) selectionsByFoodId[row.foodId]?.taxonomyAssignmentIds.push(row.id);
  for (const row of marketSelections) selectionsByFoodId[row.foodId]?.marketAssignmentIds.push(row.id);
  for (const row of verificationSelections) selectionsByFoodId[row.foodId]?.verification.push(row);

  const nutritionRevisions = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('id',nr.id::text,'foodId',nr.food_id::text) ORDER BY nr.id),'[]'::jsonb)::text FROM public.food_catalog_generation_foods gf JOIN public.food_nutrition_revisions nr ON nr.id=gf.nutrition_revision_id WHERE gf.generation_id='${generation}'::uuid AND gf.nutrition_revision_id IS NOT NULL;`);
  const servingOptions = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id::text,'foodId',s.food_id::text) ORDER BY s.id),'[]'::jsonb)::text FROM public.food_catalog_generation_servings gs JOIN public.food_serving_options s ON s.id=gs.serving_option_id WHERE gs.generation_id='${generation}'::uuid;`);
  const names = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id::text,'foodId',n.food_id::text,'role',n.name_role) ORDER BY n.id),'[]'::jsonb)::text FROM public.food_catalog_generation_names gn JOIN public.food_names n ON n.id=gn.name_fact_id WHERE gn.generation_id='${generation}'::uuid;`);
  const taxonomyAssignments = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'foodId',a.food_id::text,'action',a.assignment_action) ORDER BY a.id),'[]'::jsonb)::text FROM public.food_catalog_generation_taxonomy gt JOIN public.food_taxonomy_assignments a ON a.id=gt.taxonomy_assignment_id WHERE gt.generation_id='${generation}'::uuid;`);
  const marketAssignments = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'foodId',a.food_id::text,'action',a.assignment_action) ORDER BY a.id),'[]'::jsonb)::text FROM public.food_catalog_generation_markets gm JOIN public.food_market_assignments a ON a.id=gm.market_assignment_id WHERE gm.generation_id='${generation}'::uuid;`);
  const verificationAssertions = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'foodId',a.food_id::text,'scope',a.assertion_scope,'state',a.assertion_state) ORDER BY a.id),'[]'::jsonb)::text FROM public.food_catalog_generation_verification gv JOIN public.food_verification_assertions a ON a.id=gv.assertion_id WHERE gv.generation_id='${generation}'::uuid;`);
  const activationAuthorities = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('activationSetId',s.id::text,'activationSetMemberId',m.id::text,'foodId',m.food_id::text,'activationPolicyVersion',s.activation_policy_version,'eligibility',m.eligibility,'sourceLegalAccepted',m.source_legal_accepted,'grantEventId',g.id::text,'grantCreatedAt',g.created_at::text,'invalidatedAt',i.created_at::text) ORDER BY m.id),'[]'::jsonb)::text FROM public.food_catalog_generation_foods gf JOIN public.food_catalog_activation_set_members m ON m.id=gf.activation_set_member_id AND m.activation_set_id=gf.activation_set_id JOIN public.food_catalog_activation_sets s ON s.id=gf.activation_set_id JOIN public.food_catalog_activation_events g ON g.id=gf.activation_grant_event_id AND g.activation_set_id=gf.activation_set_id AND g.event_type='grant' LEFT JOIN public.food_catalog_activation_events i ON i.target_grant_event_id=g.id AND i.activation_set_id=g.activation_set_id AND i.event_type='invalidate' WHERE gf.generation_id='${generation}'::uuid AND gf.lifecycle='active';`);
  const redirects = jsonArray(databaseUrl, `SELECT coalesce(jsonb_agg(jsonb_build_object('generationId',generation_id::text,'sourceFoodId',source_food_id::text,'targetFoodId',target_food_id::text) ORDER BY source_food_id),'[]'::jsonb)::text FROM public.food_catalog_generation_redirects WHERE generation_id='${generation}'::uuid;`);
  return { generation: generationRow, foods, redirects, selectionsByFoodId, nutritionRevisions, servingOptions, names, taxonomyAssignments, marketAssignments, verificationAssertions, activationAuthorities };
}

export function verifyCanonicalPrePointerGeneration({ databaseUrl, generationId, eventId, reportId, expectedChecksum }) {
  const expected = checksum(expectedChecksum, "artifact generation composition checksum");
  const snapshot = loadCanonicalGenerationValidationSnapshot(databaseUrl, generationId);
  const semantic = validateGenerationSemanticSnapshot(snapshot, expected);
  if (semantic.blockerCount !== 0) {
    const reasons = [...new Set(semantic.findings.filter((finding) => finding.blocking).map((finding) => finding.reasonCode))].join(",");
    throw new Error(`Plan7 canonical Plan3 generation validation failed before pointer restore: ${reasons}`);
  }
  if (semantic.recomputedChecksum !== expected) throw new Error("Plan7 canonical Plan3 recomputed checksum differs from portable canonical authority.");
  runPsql(databaseUrl, buildStoredValidationAuthoritySql({ generationId, eventId, reportId, expectedChecksum: expected }));
  return Object.freeze({ verified: true, recomputedChecksum: semantic.recomputedChecksum, blockerCount: semantic.blockerCount, verificationStateCount: semantic.verificationStates.length });
}

export { computeGenerationCompositionChecksum };
