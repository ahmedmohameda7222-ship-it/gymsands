import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateFoodMergeEvent } from "@/lib/food-catalog/domain/identity";
import { validateFoodMarketAssignment } from "@/lib/food-catalog/domain/markets";
import { validateFoodNameFact } from "@/lib/food-catalog/domain/names";
import { validateFoodNutritionRevision } from "@/lib/food-catalog/domain/nutrition";
import { validateFoodServingOption } from "@/lib/food-catalog/domain/servings";
import { validateFoodTaxonomyAssignment } from "@/lib/food-catalog/domain/taxonomy";
import { validateFoodVerificationAssertion } from "@/lib/food-catalog/domain/verification";
import type {
  FoodCatalogLifecycle,
  FoodCatalogRootRecord,
  StoredFoodMarketAssignment,
  StoredFoodMergeEvent,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
  StoredFoodTaxonomyAssignment,
  StoredFoodVerificationAssertion,
} from "./contracts";
import type { FoodCatalogReadStore } from "./store";

const LIFECYCLES = new Set<FoodCatalogLifecycle>([
  "draft",
  "active",
  "deprecated",
  "withdrawn",
  "merged",
]);

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Food Catalog V2 read: ${context} row is invalid.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Food Catalog V2 read: ${field} must be a nonblank string.`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredString(value, field);
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Food Catalog V2 read: ${field} must be a finite number.`);
  }
  return value;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  return requiredNumber(value, field);
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Food Catalog V2 read: ${field} must be boolean.`);
  }
  return value;
}

function rows(data: unknown, context: string): Record<string, unknown>[] {
  if (!Array.isArray(data)) throw new Error(`Food Catalog V2 read: ${context} result must be an array.`);
  return data.map((value) => asRecord(value, context));
}

function throwDbError(context: string, error: { message?: string } | null): void {
  if (error) throw new Error(`Food Catalog V2 read: ${context} failed: ${error.message ?? "database error"}`);
}

function validatePersisted<T>(context: string, validate: () => T): T {
  try {
    return validate();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Food Catalog V2 read:")) throw error;
    const message = error instanceof Error ? error.message : "persisted value is invalid";
    throw new Error(`Food Catalog V2 read: ${context}: ${message}`);
  }
}

function mapNutrition(rowValue: unknown): StoredFoodNutritionRevision {
  const row = asRecord(rowValue, "nutrition");
  const value = validatePersisted("nutrition", () => validateFoodNutritionRevision({
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
  return { ...value, id: requiredString(row.id, "nutrition id"), createdAt: requiredString(row.created_at, "nutrition created_at") };
}

function mapServing(rowValue: unknown): StoredFoodServingOption {
  const row = asRecord(rowValue, "serving");
  const value = validatePersisted("serving", () => validateFoodServingOption({
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
  return { ...value, id: requiredString(row.id, "serving id"), createdAt: requiredString(row.created_at, "serving created_at") };
}

function mapName(rowValue: unknown): StoredFoodNameFact {
  const row = asRecord(rowValue, "name");
  const value = validatePersisted("name", () => validateFoodNameFact({
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
  return { ...value, id: requiredString(row.id, "name id"), createdAt: requiredString(row.created_at, "name created_at") };
}

function mapTaxonomy(rowValue: unknown): StoredFoodTaxonomyAssignment {
  const row = asRecord(rowValue, "taxonomy assignment");
  const value = validatePersisted("taxonomy assignment", () => validateFoodTaxonomyAssignment({
    foodId: requiredString(row.food_id, "taxonomy food_id"),
    nodeCode: requiredString(row.node_code, "taxonomy node_code"),
    sourceRecordId: nullableString(row.source_record_id, "taxonomy source_record_id"),
    action: requiredString(row.assignment_action, "taxonomy assignment_action") as never,
    policyVersion: requiredString(row.policy_version, "taxonomy policy_version"),
  }));
  return { ...value, id: requiredString(row.id, "taxonomy id"), createdAt: requiredString(row.created_at, "taxonomy created_at") };
}

function mapMarket(rowValue: unknown): StoredFoodMarketAssignment {
  const row = asRecord(rowValue, "market assignment");
  const value = validatePersisted("market assignment", () => validateFoodMarketAssignment({
    foodId: requiredString(row.food_id, "market food_id"),
    scopeCode: requiredString(row.scope_code, "market scope_code"),
    relevance: requiredString(row.relevance_level, "market relevance_level") as never,
    sourceRecordId: nullableString(row.source_record_id, "market source_record_id"),
    action: requiredString(row.assignment_action, "market assignment_action") as never,
    policyVersion: requiredString(row.policy_version, "market policy_version"),
  }));
  return { ...value, id: requiredString(row.id, "market id"), createdAt: requiredString(row.created_at, "market created_at") };
}

function mapVerification(rowValue: unknown): StoredFoodVerificationAssertion {
  const row = asRecord(rowValue, "verification assertion");
  const value = validatePersisted("verification assertion", () => validateFoodVerificationAssertion({
    foodId: requiredString(row.food_id, "verification food_id"),
    scope: requiredString(row.assertion_scope, "verification assertion_scope") as never,
    state: requiredString(row.assertion_state, "verification assertion_state") as never,
    policyVersion: requiredString(row.policy_version, "verification policy_version"),
    sourceRecordId: nullableString(row.source_record_id, "verification source_record_id"),
    supersedesAssertionId: nullableString(row.supersedes_assertion_id, "verification supersedes_assertion_id"),
    reasonCode: requiredString(row.reason_code, "verification reason_code"),
    authorityReference: requiredString(row.authority_reference, "verification authority_reference"),
  }));
  return { ...value, id: requiredString(row.id, "verification id"), createdAt: requiredString(row.created_at, "verification created_at") };
}

function mapMerge(rowValue: unknown): StoredFoodMergeEvent {
  const row = asRecord(rowValue, "merge event");
  const value = validatePersisted("merge event", () => validateFoodMergeEvent({
    sourceFoodId: requiredString(row.source_food_id, "merge source_food_id"),
    targetFoodId: requiredString(row.target_food_id, "merge target_food_id"),
    policyVersion: requiredString(row.policy_version, "merge policy_version"),
    reasonCode: requiredString(row.reason_code, "merge reason_code"),
    evidenceReference: nullableString(row.evidence_reference, "merge evidence_reference"),
    authorityReference: requiredString(row.authority_reference, "merge authority_reference"),
  }));
  return { ...value, id: requiredString(row.id, "merge id"), createdAt: requiredString(row.created_at, "merge created_at") };
}

export function createSupabaseFoodCatalogReadStore(supabase: SupabaseClient): FoodCatalogReadStore {
  return {
    async readRoot(foodId) {
      const result = await supabase
        .from("food_items")
        .select("id,lifecycle_status,merged_into_food_id")
        .eq("id", foodId)
        .maybeSingle();
      throwDbError("root", result.error);
      if (result.data === null) return null;
      const row = asRecord(result.data, "root");
      const lifecycle = requiredString(row.lifecycle_status, "root lifecycle_status") as FoodCatalogLifecycle;
      if (!LIFECYCLES.has(lifecycle)) throw new Error("Food Catalog V2 read: root lifecycle is invalid.");
      return {
        id: requiredString(row.id, "root id"),
        lifecycleStatus: lifecycle,
        mergedIntoFoodId: nullableString(row.merged_into_food_id, "root merged_into_food_id"),
      } satisfies FoodCatalogRootRecord;
    },

    async readNutritionRevisions(foodId) {
      const result = await supabase
        .from("food_nutrition_revisions")
        .select("id,food_id,revision_number,calories,protein_g,carbs_g,fat_g,saturated_fat_g,fiber_g,sugars_g,sodium_mg,basis_amount,basis_unit,nutrient_mapping_version,source_record_id,created_at")
        .eq("food_id", foodId)
        .order("revision_number", { ascending: true });
      throwDbError("nutrition revisions", result.error);
      return rows(result.data, "nutrition revisions").map(mapNutrition);
    },

    async readServingOptions(foodId) {
      const result = await supabase
        .from("food_serving_options")
        .select("id,food_id,label,amount,unit_code,gram_weight,source_record_id,source_portion_code,evidence_class,source_primary,created_at")
        .eq("food_id", foodId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      throwDbError("serving options", result.error);
      return rows(result.data, "serving options").map(mapServing);
    },

    async readNames(foodId) {
      const result = await supabase
        .from("food_names")
        .select("id,food_id,language_tag,name_role,name_text,normalized_text,script_code,origin,source_record_id,policy_version,created_at")
        .eq("food_id", foodId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      throwDbError("names", result.error);
      return rows(result.data, "names").map(mapName);
    },

    async readTaxonomyAssignments(foodId) {
      const result = await supabase
        .from("food_taxonomy_assignments")
        .select("id,food_id,node_code,source_record_id,assignment_action,policy_version,created_at")
        .eq("food_id", foodId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      throwDbError("taxonomy assignments", result.error);
      return rows(result.data, "taxonomy assignments").map(mapTaxonomy);
    },

    async readMarketAssignments(foodId) {
      const result = await supabase
        .from("food_market_assignments")
        .select("id,food_id,scope_code,relevance_level,source_record_id,assignment_action,policy_version,created_at")
        .eq("food_id", foodId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      throwDbError("market assignments", result.error);
      return rows(result.data, "market assignments").map(mapMarket);
    },

    async readVerificationAssertions(foodId) {
      const result = await supabase
        .from("food_verification_assertions")
        .select("id,food_id,assertion_scope,assertion_state,policy_version,source_record_id,supersedes_assertion_id,reason_code,authority_reference,created_at")
        .eq("food_id", foodId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      throwDbError("verification assertions", result.error);
      return rows(result.data, "verification assertions").map(mapVerification);
    },

    async readMergeEvents(foodId) {
      const result = await supabase
        .from("food_merge_events")
        .select("id,source_food_id,target_food_id,policy_version,reason_code,evidence_reference,authority_reference,created_at")
        .or(`source_food_id.eq.${foodId},target_food_id.eq.${foodId}`)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      throwDbError("merge events", result.error);
      return rows(result.data, "merge events").map(mapMerge);
    },
  };
}
