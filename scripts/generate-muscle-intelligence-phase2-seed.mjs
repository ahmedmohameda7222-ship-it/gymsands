import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const registryPath = "data/muscle-intelligence/v1/registry.json";
const outputPath = "supabase/migrations/20260717051011_muscle_intelligence_phase2_curated_seed.sql";
const registry = JSON.parse(readFileSync(registryPath, "utf8"));

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const nullable = (value) => value == null ? "null" : quote(value);
const textArray = (values) => values.length ? `array[${values.map(quote).join(", ")}]::text[]` : "'{}'::text[]";
const tuples = (values) => values.map((value) => `  (${value.join(", ")})`).join(",\n");
const normalizeAlias = (value) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
const exerciseBySlug = new Map(registry.exercises.map((exercise) => [exercise.slug, exercise]));
const targetIds = registry.exercises.map((exercise) => quote(exercise.exercise_id)).join(", ");
const targetMappingIds = registry.exercises.map((exercise) => quote(exercise.mapping_set_id)).join(", ");

const exerciseRows = registry.exercises.map((exercise) => [
  quote(exercise.exercise_id), quote(exercise.source), quote(exercise.source_id), quote(exercise.name), quote(exercise.slug),
  quote(exercise.primary_muscle), textArray(exercise.secondary_muscles), textArray(exercise.equipment), quote(exercise.difficulty),
  quote(exercise.mechanics), quote(exercise.movement_pattern), quote(exercise.force_type), quote(JSON.stringify(exercise.instructions)),
  "true", "true"
]);
const localizationRows = registry.exercises.flatMap((exercise) => Object.entries(exercise.localizations).map(([locale, localization]) => [
  quote(exercise.exercise_id), quote(locale), quote(localization.name)
]));
const aliasRows = registry.exercises.flatMap((exercise) => exercise.aliases.map((alias) => [
  quote(exercise.exercise_id), quote(alias.locale), quote(alias.alias), quote(normalizeAlias(alias.alias)), quote(alias.alias_type), String(alias.searchable)
]));
const relationshipRows = registry.relationships.map((relationship) => [
  quote(relationship.relationship_id), quote(exerciseBySlug.get(relationship.source_slug).exercise_id),
  quote(exerciseBySlug.get(relationship.target_slug).exercise_id), quote(relationship.relationship_type),
  quote(relationship.rationale), quote(relationship.prescription_transfer), relationship.sort_order
]);
const sourceRows = Object.entries(registry.evidence).map(([key, source]) => [
  quote(key), nullable(source.PMID), nullable(source.DOI), quote(source.type), quote(source.note)
]);
const providerRows = registry.exercises.filter((exercise) => exercise.provider_decision.status === "verified_exact_match").map((exercise) => [
  quote(exercise.exercise_id), quote(exercise.provider_decision.provider), quote(exercise.provider_decision.provider_activity_id),
  quote(exercise.provider_decision.provider_slug), quote(exercise.provider_decision.provider_version), quote("verified"),
  quote(`${exercise.provider_decision.evidence_snapshot_date}T00:00:00Z`)
]);
const mappingRows = registry.exercises.map((exercise) => [
  quote(exercise.mapping_set_id), quote(exercise.exercise_id), exercise.mapping_version, quote("draft"), quote(exercise.mapping_source),
  quote(exercise.mapping_schema_version), quote(exercise.mapping_checksum)
]);
const mappingEntryRows = registry.exercises.flatMap((exercise) => exercise.entries.map((entry) => [
  quote(exercise.mapping_set_id), quote(entry.muscle_id), quote(entry.role), Number(entry.contribution).toFixed(2), quote(entry.side_scope), entry.sort_order
]));
const evidenceRows = registry.exercises.flatMap((exercise) => exercise.evidence_codes.map((sourceKey) => [
  quote(exercise.mapping_set_id), quote(sourceKey), textArray(exercise.research_limitations), quote(registry.registry_version)
]));
const reviewRows = registry.exercises.map((exercise) => [
  quote(exercise.mapping_set_id), quote(exercise.review_status), quote(exercise.review_rationale), quote(registry.registry_version),
  quote(registry.activity_catalog_snapshot.snapshot_date)
]);

const sql = `begin;

create temporary table phase2_curated_seed_counts on commit drop as
select
  (select count(*) from public.exercises where source is distinct from 'plaivra_curated') as non_target_exercises,
  (select count(*) from public.exercise_muscle_mapping_sets where id not in (${targetMappingIds})) as non_target_mapping_sets,
  (select count(*) from public.user_workout_plans) as user_plans,
  (select count(*) from public.workout_sessions) as workout_sessions,
  (select count(*) from public.exercise_logs) as exercise_logs,
  (select count(*) from public.user_exercise_logs) as user_exercise_logs,
  (select count(*) from public.user_custom_exercises) as custom_exercises,
  (select count(*) from public.user_custom_exercise_mapping_sets) as custom_mapping_sets;

do $preconditions$
begin
  if exists (select 1 from public.exercises where source = 'plaivra_legacy_workouts')
     or exists (select 1 from public.workouts where notes ilike 'Real FitLife exercise library seed%')
     or exists (select 1 from public.exercise_library where notes ilike 'Real FitLife exercise library seed%') then
    raise exception 'The retired legacy target catalog must remain empty before Phase 2 seeding.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.exercises
    where id in (${targetIds})
       or slug in (${registry.exercises.map((exercise) => quote(exercise.slug)).join(", ")})
       or (source = 'plaivra_curated' and source_id in (${registry.exercises.map((exercise) => quote(exercise.source_id)).join(", ")}))
  ) then
    raise exception 'A Phase 2 deterministic exercise identity already exists.' using errcode = '23505';
  end if;
end
$preconditions$;

insert into public.exercises(
  id, source, source_id, name, slug, primary_muscle, secondary_muscles, equipment, difficulty,
  mechanics, movement_pattern, force_type, instructions, is_approved, is_global
) values
${tuples(exerciseRows)};

insert into public.exercise_localizations(exercise_id, locale, name) values
${tuples(localizationRows)};

insert into public.exercise_aliases(exercise_id, locale, alias, normalized_alias, alias_type, searchable) values
${tuples(aliasRows)};

insert into public.exercise_relationships(
  id, source_exercise_id, target_exercise_id, relationship_type, rationale, prescription_transfer, sort_order
) values
${tuples(relationshipRows)};

insert into public.exercise_research_sources(source_key, pmid, doi, evidence_type, note) values
${tuples(sourceRows)};

insert into public.exercise_provider_links(
  exercise_id, provider, provider_activity_id, provider_slug, provider_version, verification_status, verified_at
) values
${tuples(providerRows)};

insert into public.exercise_muscle_mapping_sets(
  id, exercise_id, mapping_version, status, source, schema_version, checksum
) values
${tuples(mappingRows)};

insert into public.exercise_muscle_mapping_entries(
  mapping_set_id, muscle_id, role, contribution, side_scope, sort_order
) values
${tuples(mappingEntryRows)};

insert into public.exercise_mapping_evidence(mapping_set_id, source_key, research_limitations, registry_version) values
${tuples(evidenceRows)};

insert into public.exercise_mapping_reviews(
  mapping_set_id, review_status, review_rationale, registry_version, evidence_snapshot_date
) values
${tuples(reviewRows)};

do $publication$
declare
  target record;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  for target in
    select id, checksum from public.exercise_muscle_mapping_sets where id in (${targetMappingIds}) order by id
  loop
    if private.exercise_muscle_mapping_checksum(target.id) is distinct from target.checksum then
      raise exception 'Phase 2 checksum mismatch for mapping set %.', target.id using errcode = '23514';
    end if;
    perform public.publish_exercise_muscle_mapping_set(target.id);
  end loop;
end
$publication$;

do $postconditions$
declare
  before_counts phase2_curated_seed_counts%rowtype;
begin
  select * into before_counts from phase2_curated_seed_counts;
  if (select count(*) from public.exercises where id in (${targetIds})) <> 60
     or (select count(*) from public.exercise_localizations where exercise_id in (${targetIds})) <> 180
     or (select count(*) from public.exercise_aliases where exercise_id in (${targetIds})) <> 180
     or (select count(*) from public.exercise_relationships where source_exercise_id in (${targetIds})) <> 32
     or (select count(*) from public.exercise_provider_links where exercise_id in (${targetIds})) <> 9
     or (select count(*) from public.exercise_muscle_mapping_sets where id in (${targetMappingIds})) <> 60
     or (select count(*) from public.exercise_muscle_mapping_entries where mapping_set_id in (${targetMappingIds})) <> 180
     or (select count(*) from public.exercise_mapping_reviews where mapping_set_id in (${targetMappingIds})) <> 60
     or (select count(*) from public.exercise_mapping_evidence where mapping_set_id in (${targetMappingIds})) <> ${evidenceRows.length} then
    raise exception 'Phase 2 curated registry row-count verification failed.' using errcode = '23514';
  end if;
  if (select count(*) from public.exercise_muscle_mapping_sets where id in (${targetMappingIds}) and status = 'published') <> 60
     or exists (select 1 from public.exercise_muscle_mapping_sets where id in (${targetMappingIds}) and status = 'draft') then
    raise exception 'Phase 2 requires exactly 60 published mappings and zero target drafts.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.exercise_muscle_mapping_sets mapping_set
    where mapping_set.id in (${targetMappingIds})
      and private.exercise_muscle_mapping_checksum(mapping_set.id) is distinct from mapping_set.checksum
  ) then
    raise exception 'Published Phase 2 checksum verification failed.' using errcode = '23514';
  end if;
  if (select count(*) from public.exercises where source is distinct from 'plaivra_curated') <> before_counts.non_target_exercises
     or (select count(*) from public.exercise_muscle_mapping_sets where id not in (${targetMappingIds})) <> before_counts.non_target_mapping_sets
     or (select count(*) from public.user_workout_plans) <> before_counts.user_plans
     or (select count(*) from public.workout_sessions) <> before_counts.workout_sessions
     or (select count(*) from public.exercise_logs) <> before_counts.exercise_logs
     or (select count(*) from public.user_exercise_logs) <> before_counts.user_exercise_logs
     or (select count(*) from public.user_custom_exercises) <> before_counts.custom_exercises
     or (select count(*) from public.user_custom_exercise_mapping_sets) <> before_counts.custom_mapping_sets then
    raise exception 'Phase 2 modified non-target or user-owned data.' using errcode = '23514';
  end if;
end
$postconditions$;

commit;
`;

if (process.argv.includes("--check")) {
  if (readFileSync(outputPath, "utf8") !== sql) {
    console.error(`${outputPath} is not synchronized with ${registryPath}.`);
    process.exit(1);
  }
  console.log(`Phase 2 seed is synchronized: 60 exercises, 180 localizations, 180 aliases, 32 relationships, 9 provider links, 60 mappings.`);
} else {
  writeFileSync(outputPath, sql, "utf8");
  console.log(`Generated ${outputPath}.`);
}
