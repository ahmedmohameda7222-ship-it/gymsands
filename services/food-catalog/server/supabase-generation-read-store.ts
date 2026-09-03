import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateFoodMarketAssignment } from "@/lib/food-catalog/domain/markets";
import { validateFoodNameFact } from "@/lib/food-catalog/domain/names";
import { validateFoodNutritionRevision } from "@/lib/food-catalog/domain/nutrition";
import { validateFoodServingOption } from "@/lib/food-catalog/domain/servings";
import { validateFoodTaxonomyAssignment } from "@/lib/food-catalog/domain/taxonomy";
import {
  validateFoodVerificationAssertion,
  type FoodVerificationScope,
} from "@/lib/food-catalog/domain/verification";
import {
  validateControlPlaneActorContext,
  validateGenerationFoodSelection,
  validateGenerationRedirectSelection,
  validateGenerationValidationFinding,
  validateGenerationVerificationSelection,
  type GenerationEventType,
  type GenerationFindingSeverity,
  type GenerationLifecycle,
} from "@/lib/food-catalog/domain/generations";
import type { ActivationEligibility } from "@/lib/food-catalog/domain/activation";
import type {
  StoredFoodMarketAssignment,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
  StoredFoodTaxonomyAssignment,
  StoredFoodVerificationAssertion,
} from "./contracts";
import type {
  StoredActivationAuthority,
  StoredCatalogGeneration,
  StoredCurrentGenerationPointer,
  StoredGenerationEvent,
  StoredGenerationFood,
  StoredGenerationRedirect,
  StoredGenerationSelections,
  StoredGenerationValidationFinding,
  StoredGenerationValidationReport,
} from "./generation-contracts";
import type { FoodCatalogGenerationReadStore } from "./generation-store";

const SHA256 = /^[0-9a-f]{64}$/;
const GENERATION_EVENTS = new Set<GenerationEventType>(["created", "validated", "promote", "rollback", "revoke"]);
const ACTIVATION_ELIGIBILITY = new Set<ActivationEligibility>(["eligible", "rejected"]);

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Food Catalog Plan 3 read: ${context} row is invalid.`);
  }
  return value as Record<string, unknown>;
}

function rows(value: unknown, context: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`Food Catalog Plan 3 read: ${context} result must be an array.`);
  }
  return value.map((row) => asRecord(row, context));
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Food Catalog Plan 3 read: ${field} must be a nonblank string.`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredString(value, field);
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Food Catalog Plan 3 read: ${field} must be boolean.`);
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Food Catalog Plan 3 read: ${field} must be a finite number.`);
  }
  return value;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  return requiredNumber(value, field);
}

function requiredInteger(value: unknown, field: string, minimum = 0): number {
  const number = requiredNumber(value, field);
  if (!Number.isInteger(number) || number < minimum) {
    throw new Error(`Food Catalog Plan 3 read: ${field} must be an integer >= ${minimum}.`);
  }
  return number;
}

function nullablePositiveInteger(value: unknown, field: string): number | null {
  if (value === null) return null;
  return requiredInteger(value, field, 1);
}

function requiredChecksum(value: unknown, field: string): string {
  const checksum = requiredString(value, field);
  if (!SHA256.test(checksum)) {
    throw new Error(`Food Catalog Plan 3 read: ${field} checksum must be lowercase SHA-256 hex.`);
  }
  return checksum;
}

function nullableChecksum(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredChecksum(value, field);
}

function throwDbError(context: string, error: { message?: string } | null): void {
  if (error) {
    throw new Error(`Food Catalog Plan 3 read: ${context} failed: ${error.message ?? "database error"}`);
  }
}

function validatePersisted<T>(context: string, validate: () => T): T {
  try {
    return validate();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Food Catalog Plan 3 read:")) throw error;
    const message = error instanceof Error ? error.message : "persisted value is invalid";
    throw new Error(`Food Catalog Plan 3 read: ${context}: ${message}`);
  }
}

function mapGeneration(value: unknown): StoredCatalogGeneration {
  const row = asRecord(value, "generation");
  return {
    id: requiredString(row.id, "generation id"),
    baseGenerationId: nullableString(row.base_generation_id, "generation base_generation_id"),
    generationOrdinal: nullablePositiveInteger(row.generation_ordinal, "generation generation_ordinal"),
    compositionSchemaVersion: requiredString(row.composition_schema_version, "generation composition_schema_version"),
    generationPolicyVersion: requiredString(row.generation_policy_version, "generation generation_policy_version"),
    activationPolicyVersion: requiredString(row.activation_policy_version, "generation activation_policy_version"),
    trustPolicyVersion: requiredString(row.trust_policy_version, "generation trust_policy_version"),
    projectionVersion: requiredString(row.projection_version, "generation projection_version"),
    changeManifestChecksumSha256: requiredChecksum(row.change_manifest_checksum_sha256, "generation change_manifest_checksum_sha256"),
    compositionChecksumSha256: requiredChecksum(row.composition_checksum_sha256, "generation composition_checksum_sha256"),
    authorityReference: requiredString(row.authority_reference, "generation authority_reference"),
    createdAt: requiredString(row.created_at, "generation created_at"),
    sealedAt: requiredString(row.sealed_at, "generation sealed_at"),
  };
}

function mapGenerationFood(value: unknown): StoredGenerationFood {
  const row = asRecord(value, "generation Food");
  const generationId = requiredString(row.generation_id, "generation Food generation_id");
  const selection = validatePersisted("generation Food", () => validateGenerationFoodSelection({
    foodId: requiredString(row.food_id, "generation Food food_id"),
    lifecycle: requiredString(row.lifecycle, "generation Food lifecycle") as GenerationLifecycle,
    nutritionRevisionId: nullableString(row.nutrition_revision_id, "generation Food nutrition_revision_id"),
    activationSetId: nullableString(row.activation_set_id, "generation Food activation_set_id"),
    activationSetMemberId: nullableString(row.activation_set_member_id, "generation Food activation_set_member_id"),
    activationGrantEventId: nullableString(row.activation_grant_event_id, "generation Food activation_grant_event_id"),
  }));
  return { generationId, ...selection };
}

function mapRedirect(value: unknown): StoredGenerationRedirect {
  const row = asRecord(value, "generation redirect");
  const generationId = requiredString(row.generation_id, "generation redirect generation_id");
  const redirect = validatePersisted("generation redirect", () => validateGenerationRedirectSelection({
    sourceFoodId: requiredString(row.source_food_id, "generation redirect source_food_id"),
    targetFoodId: requiredString(row.target_food_id, "generation redirect target_food_id"),
  }));
  return { generationId, ...redirect };
}

function mapNutrition(value: unknown): StoredFoodNutritionRevision {
  const row = asRecord(value, "nutrition");
  const fact = validatePersisted("nutrition", () => validateFoodNutritionRevision({
    foodId: requiredString(row.food_id, "nutrition food_id"),
    revisionNumber: requiredNumber(row.revision_number, "nutrition revision_number"),
    calories: nullableNumber(row.calories, "nutrition calories"),
    protein_g: nullableNumber(row.protein_g, "nutrition protein_g"),
    carbs_g: nullableNumber(row.carbs_g, "nutrition carbs_g"),
    fat_g: nullableNumber(row.fat_g, "nutrition fat_g"),
    saturated_fat_g: nullableNumber(row.saturated_fat_g, "nutrition saturated_fat_g"),
    fiber_g: nullableNumber(row.fiber_g, "nutrition fiber_g"),
    sugars_g: nullableNumber(row.sugars_g, "nutrition sugars_g"),
    sodium_mg: nullableNumber(row.sodium_mg, "nutrition sodium_mg"),
    basisAmount: requiredNumber(row.basis_amount, "nutrition basis_amount"),
    basisUnit: requiredString(row.basis_unit, "nutrition basis_unit") as "g" | "ml",
    nutrientMappingVersion: requiredString(row.nutrient_mapping_version, "nutrition nutrient_mapping_version"),
    sourceRecordId: nullableString(row.source_record_id, "nutrition source_record_id"),
  }));
  return { ...fact, id: requiredString(row.id, "nutrition id"), createdAt: requiredString(row.created_at, "nutrition created_at") };
}

function mapServing(value: unknown): StoredFoodServingOption {
  const row = asRecord(value, "serving");
  const fact = validatePersisted("serving", () => validateFoodServingOption({
    foodId: requiredString(row.food_id, "serving food_id"),
    label: requiredString(row.label, "serving label"),
    amount: requiredNumber(row.amount, "serving amount"),
    unitCode: requiredString(row.unit_code, "serving unit_code"),
    gramWeight: nullableNumber(row.gram_weight, "serving gram_weight"),
    sourceRecordId: nullableString(row.source_record_id, "serving source_record_id"),
    sourcePortionCode: nullableString(row.source_portion_code, "serving source_portion_code"),
    evidenceClass: requiredString(row.evidence_class, "serving evidence_class") as "exact_source" | "source_estimated",
    sourcePrimary: requiredBoolean(row.source_primary, "serving source_primary"),
  }));
  return { ...fact, id: requiredString(row.id, "serving id"), createdAt: requiredString(row.created_at, "serving created_at") };
}

function mapName(value: unknown): StoredFoodNameFact {
  const row = asRecord(value, "name");
  const fact = validatePersisted("name", () => validateFoodNameFact({
    foodId: requiredString(row.food_id, "name food_id"),
    languageTag: requiredString(row.language_tag, "name language_tag"),
    role: requiredString(row.name_role, "name name_role") as never,
    text: requiredString(row.name_text, "name name_text"),
    normalizedText: requiredString(row.normalized_text, "name normalized_text"),
    scriptCode: nullableString(row.script_code, "name script_code"),
    origin: requiredString(row.origin, "name origin") as never,
    sourceRecordId: nullableString(row.source_record_id, "name source_record_id"),
    policyVersion: requiredString(row.policy_version, "name policy_version"),
  }));
  return { ...fact, id: requiredString(row.id, "name id"), createdAt: requiredString(row.created_at, "name created_at") };
}

function mapTaxonomy(value: unknown): StoredFoodTaxonomyAssignment {
  const row = asRecord(value, "taxonomy assignment");
  const fact = validatePersisted("taxonomy assignment", () => validateFoodTaxonomyAssignment({
    foodId: requiredString(row.food_id, "taxonomy food_id"),
    nodeCode: requiredString(row.node_code, "taxonomy node_code"),
    sourceRecordId: nullableString(row.source_record_id, "taxonomy source_record_id"),
    action: requiredString(row.assignment_action, "taxonomy assignment_action") as never,
    policyVersion: requiredString(row.policy_version, "taxonomy policy_version"),
  }));
  return { ...fact, id: requiredString(row.id, "taxonomy id"), createdAt: requiredString(row.created_at, "taxonomy created_at") };
}

function mapMarket(value: unknown): StoredFoodMarketAssignment {
  const row = asRecord(value, "market assignment");
  const fact = validatePersisted("market assignment", () => validateFoodMarketAssignment({
    foodId: requiredString(row.food_id, "market food_id"),
    scopeCode: requiredString(row.scope_code, "market scope_code"),
    relevance: requiredString(row.relevance_level, "market relevance_level") as never,
    sourceRecordId: nullableString(row.source_record_id, "market source_record_id"),
    action: requiredString(row.assignment_action, "market assignment_action") as never,
    policyVersion: requiredString(row.policy_version, "market policy_version"),
  }));
  return { ...fact, id: requiredString(row.id, "market id"), createdAt: requiredString(row.created_at, "market created_at") };
}

function mapVerification(value: unknown): StoredFoodVerificationAssertion {
  const row = asRecord(value, "verification assertion");
  const fact = validatePersisted("verification assertion", () => validateFoodVerificationAssertion({
    foodId: requiredString(row.food_id, "verification food_id"),
    scope: requiredString(row.assertion_scope, "verification assertion_scope") as never,
    state: requiredString(row.assertion_state, "verification assertion_state") as never,
    policyVersion: requiredString(row.policy_version, "verification policy_version"),
    sourceRecordId: nullableString(row.source_record_id, "verification source_record_id"),
    supersedesAssertionId: nullableString(row.supersedes_assertion_id, "verification supersedes_assertion_id"),
    reasonCode: requiredString(row.reason_code, "verification reason_code"),
    authorityReference: requiredString(row.authority_reference, "verification authority_reference"),
  }));
  return { ...fact, id: requiredString(row.id, "verification id"), createdAt: requiredString(row.created_at, "verification created_at") };
}

function mapGenerationEvent(value: unknown): StoredGenerationEvent {
  const row = asRecord(value, "generation event");
  const eventType = requiredString(row.event_type, "generation event event_type") as GenerationEventType;
  if (!GENERATION_EVENTS.has(eventType)) {
    throw new Error("Food Catalog Plan 3 read: generation event event_type is invalid.");
  }
  const actor = validatePersisted("generation event actor", () => validateControlPlaneActorContext({
    principalId: requiredString(row.principal_id, "generation event principal_id"),
    principalType: requiredString(row.principal_type, "generation event principal_type") as never,
    authorityReference: requiredString(row.authority_reference, "generation event authority_reference"),
    reasonCode: requiredString(row.reason_code, "generation event reason_code"),
    policyVersion: requiredString(row.policy_version, "generation event policy_version"),
  }));
  return {
    id: requiredString(row.id, "generation event id"),
    operationId: requiredString(row.operation_id, "generation event operation_id"),
    eventType,
    fromGenerationId: nullableString(row.from_generation_id, "generation event from_generation_id"),
    toGenerationId: nullableString(row.to_generation_id, "generation event to_generation_id"),
    revokedGenerationId: nullableString(row.revoked_generation_id, "generation event revoked_generation_id"),
    generationChecksumSha256: nullableChecksum(row.generation_checksum_sha256, "generation event generation_checksum_sha256"),
    validationReportId: nullableString(row.validation_report_id, "generation event validation_report_id"),
    actor,
    reasonCode: actor.reasonCode,
    authorityReference: actor.authorityReference,
    policyVersion: actor.policyVersion,
    createdAt: requiredString(row.created_at, "generation event created_at"),
  };
}

function mapValidationReport(value: unknown): StoredGenerationValidationReport {
  const row = asRecord(value, "generation validation report");
  return {
    id: requiredString(row.id, "generation validation report id"),
    generationId: requiredString(row.generation_id, "generation validation report generation_id"),
    generationChecksumSha256: requiredChecksum(row.generation_checksum_sha256, "generation validation report generation_checksum_sha256"),
    validatorSetVersion: requiredString(row.validator_set_version, "generation validation report validator_set_version"),
    policyVersion: requiredString(row.policy_version, "generation validation report policy_version"),
    reportChecksumSha256: requiredChecksum(row.report_checksum_sha256, "generation validation report report_checksum_sha256"),
    blockerCount: requiredInteger(row.blocker_count, "generation validation report blocker_count"),
    errorCount: requiredInteger(row.error_count, "generation validation report error_count"),
    warningCount: requiredInteger(row.warning_count, "generation validation report warning_count"),
    infoCount: requiredInteger(row.info_count, "generation validation report info_count"),
    createdAt: requiredString(row.created_at, "generation validation report created_at"),
  };
}

function mapValidationFinding(value: unknown): StoredGenerationValidationFinding {
  const row = asRecord(value, "generation validation finding");
  const finding = validatePersisted("generation validation finding", () => validateGenerationValidationFinding({
    reasonCode: requiredString(row.reason_code, "generation validation finding reason_code"),
    foodId: nullableString(row.food_id, "generation validation finding food_id"),
    severity: requiredString(row.severity, "generation validation finding severity") as GenerationFindingSeverity,
    blocking: requiredBoolean(row.blocking, "generation validation finding blocking"),
    evidenceReference: nullableString(row.evidence_reference, "generation validation finding evidence_reference"),
    validatorPolicyVersion: requiredString(row.validator_policy_version, "generation validation finding validator_policy_version"),
    details: row.details,
  }));
  return {
    id: requiredString(row.id, "generation validation finding id"),
    reportId: requiredString(row.report_id, "generation validation finding report_id"),
    ...finding,
  };
}

async function readSelectedFacts<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  foodId: string,
  ids: readonly string[],
  mapper: (value: unknown) => T,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const result = await supabase.from(table).select(columns).eq("food_id", foodId).in("id", [...ids]);
  throwDbError(table, result.error);
  return rows(result.data, table).map(mapper);
}

export function createSupabaseFoodCatalogGenerationReadStore(
  supabase: SupabaseClient,
): FoodCatalogGenerationReadStore {
  return {
    async readCurrentPointer() {
      const result = await supabase
        .from("food_catalog_current_generation")
        .select("current_generation_id,current_event_id,current_validation_report_id,pointer_revision")
        .eq("singleton_key", true)
        .maybeSingle();
      throwDbError("current generation pointer", result.error);
      if (result.data === null) throw new Error("Food Catalog Plan 3 read: singleton current generation pointer is missing.");
      const row = asRecord(result.data, "current generation pointer");
      const currentGenerationId = nullableString(row.current_generation_id, "current generation pointer current_generation_id");
      const currentEventId = nullableString(row.current_event_id, "current generation pointer current_event_id");
      const currentValidationReportId = nullableString(row.current_validation_report_id, "current generation pointer current_validation_report_id");
      if ((currentGenerationId === null) !== (currentEventId === null) || (currentGenerationId === null) !== (currentValidationReportId === null)) {
        throw new Error("Food Catalog Plan 3 read: current generation pointer references are inconsistent.");
      }
      return {
        currentGenerationId,
        currentEventId,
        currentValidationReportId,
        pointerRevision: requiredInteger(row.pointer_revision, "current generation pointer pointer_revision"),
      } satisfies StoredCurrentGenerationPointer;
    },

    async readGeneration(generationId) {
      const result = await supabase
        .from("food_catalog_generations")
        .select("id,base_generation_id,generation_ordinal,composition_schema_version,generation_policy_version,activation_policy_version,trust_policy_version,projection_version,change_manifest_checksum_sha256,composition_checksum_sha256,authority_reference,created_at,sealed_at")
        .eq("id", generationId)
        .maybeSingle();
      throwDbError("generation", result.error);
      return result.data === null ? null : mapGeneration(result.data);
    },

    async readGenerationFood(generationId, foodId) {
      const result = await supabase
        .from("food_catalog_generation_foods")
        .select("generation_id,food_id,lifecycle,nutrition_revision_id,activation_set_id,activation_set_member_id,activation_grant_event_id")
        .eq("generation_id", generationId)
        .eq("food_id", foodId)
        .maybeSingle();
      throwDbError("generation Food", result.error);
      return result.data === null ? null : mapGenerationFood(result.data);
    },

    async readGenerationRedirect(generationId, sourceFoodId) {
      const result = await supabase
        .from("food_catalog_generation_redirects")
        .select("generation_id,source_food_id,target_food_id")
        .eq("generation_id", generationId)
        .eq("source_food_id", sourceFoodId)
        .maybeSingle();
      throwDbError("generation redirect", result.error);
      return result.data === null ? null : mapRedirect(result.data);
    },

    async readGenerationSelections(generationId, foodId) {
      const [servings, names, taxonomy, markets, verification] = await Promise.all([
        supabase.from("food_catalog_generation_servings").select("serving_option_id").eq("generation_id", generationId).eq("food_id", foodId),
        supabase.from("food_catalog_generation_names").select("name_fact_id").eq("generation_id", generationId).eq("food_id", foodId),
        supabase.from("food_catalog_generation_taxonomy").select("taxonomy_assignment_id").eq("generation_id", generationId).eq("food_id", foodId),
        supabase.from("food_catalog_generation_markets").select("market_assignment_id").eq("generation_id", generationId).eq("food_id", foodId),
        supabase.from("food_catalog_generation_verification").select("food_id,assertion_scope,assertion_id").eq("generation_id", generationId).eq("food_id", foodId),
      ]);
      throwDbError("generation servings", servings.error);
      throwDbError("generation names", names.error);
      throwDbError("generation taxonomy", taxonomy.error);
      throwDbError("generation markets", markets.error);
      throwDbError("generation verification", verification.error);
      return {
        servingOptionIds: rows(servings.data, "generation servings").map((row) => requiredString(row.serving_option_id, "generation serving serving_option_id")),
        nameFactIds: rows(names.data, "generation names").map((row) => requiredString(row.name_fact_id, "generation name name_fact_id")),
        taxonomyAssignmentIds: rows(taxonomy.data, "generation taxonomy").map((row) => requiredString(row.taxonomy_assignment_id, "generation taxonomy taxonomy_assignment_id")),
        marketAssignmentIds: rows(markets.data, "generation markets").map((row) => requiredString(row.market_assignment_id, "generation market market_assignment_id")),
        verification: rows(verification.data, "generation verification").map((row) => validatePersisted("generation verification", () => validateGenerationVerificationSelection({
          foodId: requiredString(row.food_id, "generation verification food_id"),
          scope: requiredString(row.assertion_scope, "generation verification assertion_scope") as FoodVerificationScope,
          assertionId: requiredString(row.assertion_id, "generation verification assertion_id"),
        }))),
      } satisfies StoredGenerationSelections;
    },

    async readNutritionRevision(foodId, revisionId) {
      const result = await supabase
        .from("food_nutrition_revisions")
        .select("id,food_id,revision_number,calories,protein_g,carbs_g,fat_g,saturated_fat_g,fiber_g,sugars_g,sodium_mg,basis_amount,basis_unit,nutrient_mapping_version,source_record_id,created_at")
        .eq("food_id", foodId)
        .eq("id", revisionId)
        .maybeSingle();
      throwDbError("nutrition revision", result.error);
      return result.data === null ? null : mapNutrition(result.data);
    },

    readServingOptions(foodId, ids) {
      return readSelectedFacts(
        supabase,
        "food_serving_options",
        "id,food_id,label,amount,unit_code,gram_weight,source_record_id,source_portion_code,evidence_class,source_primary,created_at",
        foodId,
        ids,
        mapServing,
      );
    },

    readNames(foodId, ids) {
      return readSelectedFacts(
        supabase,
        "food_names",
        "id,food_id,language_tag,name_role,name_text,normalized_text,script_code,origin,source_record_id,policy_version,created_at",
        foodId,
        ids,
        mapName,
      );
    },

    readTaxonomyAssignments(foodId, ids) {
      return readSelectedFacts(
        supabase,
        "food_taxonomy_assignments",
        "id,food_id,node_code,source_record_id,assignment_action,policy_version,created_at",
        foodId,
        ids,
        mapTaxonomy,
      );
    },

    readMarketAssignments(foodId, ids) {
      return readSelectedFacts(
        supabase,
        "food_market_assignments",
        "id,food_id,scope_code,relevance_level,source_record_id,assignment_action,policy_version,created_at",
        foodId,
        ids,
        mapMarket,
      );
    },

    async readVerificationAssertions(foodId, selections) {
      if (selections.length === 0) return [];
      const ids = selections.map((selection) => selection.assertionId);
      const result = await supabase
        .from("food_verification_assertions")
        .select("id,food_id,assertion_scope,assertion_state,policy_version,source_record_id,supersedes_assertion_id,reason_code,authority_reference,created_at")
        .eq("food_id", foodId)
        .in("id", ids);
      throwDbError("verification assertions", result.error);
      const mapped = rows(result.data, "verification assertions").map(mapVerification);
      const byId = new Map(mapped.map((assertion) => [assertion.id, assertion]));
      return selections.map((selection) => {
        const assertion = byId.get(selection.assertionId);
        if (!assertion) {
          throw new Error(`Food Catalog Plan 3 read: selected verification assertion ${selection.assertionId} is missing.`);
        }
        if (assertion.scope !== selection.scope) {
          throw new Error("Food Catalog Plan 3 read: selected verification assertion scope does not match generation authority.");
        }
        return assertion;
      });
    },

    async readActivationAuthority(memberId, grantEventId) {
      const memberResult = await supabase
        .from("food_catalog_activation_set_members")
        .select("id,activation_set_id,food_id,eligibility,source_legal_accepted")
        .eq("id", memberId)
        .maybeSingle();
      throwDbError("activation member", memberResult.error);
      if (memberResult.data === null) return null;
      const member = asRecord(memberResult.data, "activation member");
      const activationSetId = requiredString(member.activation_set_id, "activation member activation_set_id");
      const eligibility = requiredString(member.eligibility, "activation member eligibility") as ActivationEligibility;
      if (!ACTIVATION_ELIGIBILITY.has(eligibility)) {
        throw new Error("Food Catalog Plan 3 read: activation member eligibility is invalid.");
      }

      const [setResult, grantResult, invalidationResult] = await Promise.all([
        supabase.from("food_catalog_activation_sets").select("id,activation_policy_version").eq("id", activationSetId).maybeSingle(),
        supabase.from("food_catalog_activation_events").select("id,activation_set_id,event_type,created_at").eq("id", grantEventId).eq("activation_set_id", activationSetId).maybeSingle(),
        supabase.from("food_catalog_activation_events").select("created_at").eq("event_type", "invalidate").eq("target_grant_event_id", grantEventId).maybeSingle(),
      ]);
      throwDbError("activation set", setResult.error);
      throwDbError("activation grant", grantResult.error);
      throwDbError("activation invalidation", invalidationResult.error);
      if (setResult.data === null || grantResult.data === null) return null;
      const set = asRecord(setResult.data, "activation set");
      const grant = asRecord(grantResult.data, "activation grant");
      if (requiredString(grant.event_type, "activation grant event_type") !== "grant") {
        throw new Error("Food Catalog Plan 3 read: activation authority event is not a grant.");
      }
      const invalidation = invalidationResult.data === null ? null : asRecord(invalidationResult.data, "activation invalidation");
      return {
        activationSetId,
        activationSetMemberId: requiredString(member.id, "activation member id"),
        foodId: requiredString(member.food_id, "activation member food_id"),
        activationPolicyVersion: requiredString(set.activation_policy_version, "activation set activation_policy_version"),
        eligibility,
        sourceLegalAccepted: requiredBoolean(member.source_legal_accepted, "activation member source_legal_accepted"),
        grantEventId: requiredString(grant.id, "activation grant id"),
        grantCreatedAt: requiredString(grant.created_at, "activation grant created_at"),
        invalidatedAt: invalidation === null ? null : requiredString(invalidation.created_at, "activation invalidation created_at"),
      } satisfies StoredActivationAuthority;
    },

    async readGenerationEvent(eventId) {
      const result = await supabase
        .from("food_catalog_generation_events")
        .select("id,operation_id,event_type,from_generation_id,to_generation_id,revoked_generation_id,generation_checksum_sha256,validation_report_id,principal_id,principal_type,authority_reference,reason_code,policy_version,created_at")
        .eq("id", eventId)
        .maybeSingle();
      throwDbError("generation event", result.error);
      return result.data === null ? null : mapGenerationEvent(result.data);
    },

    async readValidationReport(reportId) {
      const result = await supabase
        .from("food_catalog_generation_validation_reports")
        .select("id,generation_id,generation_checksum_sha256,validator_set_version,policy_version,report_checksum_sha256,blocker_count,error_count,warning_count,info_count,created_at")
        .eq("id", reportId)
        .maybeSingle();
      throwDbError("generation validation report", result.error);
      return result.data === null ? null : mapValidationReport(result.data);
    },

    async readValidationFindings(reportId) {
      const result = await supabase
        .from("food_catalog_generation_validation_findings")
        .select("id,report_id,finding_ordinal,reason_code,food_id,severity,blocking,evidence_reference,validator_policy_version,details,created_at")
        .eq("report_id", reportId);
      throwDbError("generation validation findings", result.error);
      return rows(result.data, "generation validation findings").map(mapValidationFinding);
    },
  };
}
