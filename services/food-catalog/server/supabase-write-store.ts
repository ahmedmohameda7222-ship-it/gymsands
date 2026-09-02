import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateFoodMergeEvent } from "@/lib/food-catalog/domain/identity";
import { validateFoodMarketAssignment } from "@/lib/food-catalog/domain/markets";
import { validateFoodNameFact } from "@/lib/food-catalog/domain/names";
import { validateFoodNutritionRevision } from "@/lib/food-catalog/domain/nutrition";
import { validateFoodServingOption } from "@/lib/food-catalog/domain/servings";
import { validateFoodTaxonomyAssignment } from "@/lib/food-catalog/domain/taxonomy";
import { validateFoodVerificationAssertion } from "@/lib/food-catalog/domain/verification";
import type { FoodCatalogWriteStore } from "./store";

async function insertFact(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from(table).insert(payload);
  if (error) {
    throw new Error(`Food Catalog V2 write: ${table} insert failed: ${error.message}`);
  }
}

export function createSupabaseFoodCatalogWriteStore(
  supabase: SupabaseClient,
): FoodCatalogWriteStore {
  return {
    async appendNutritionRevision(value) {
      const validated = validateFoodNutritionRevision(value);
      await insertFact(supabase, "food_nutrition_revisions", {
        food_id: validated.foodId,
        revision_number: validated.revisionNumber,
        calories: validated.calories,
        protein_g: validated.protein_g,
        carbs_g: validated.carbs_g,
        fat_g: validated.fat_g,
        saturated_fat_g: validated.saturated_fat_g,
        fiber_g: validated.fiber_g,
        sugars_g: validated.sugars_g,
        sodium_mg: validated.sodium_mg,
        basis_amount: validated.basisAmount,
        basis_unit: validated.basisUnit,
        nutrient_mapping_version: validated.nutrientMappingVersion,
        source_record_id: validated.sourceRecordId,
      });
    },

    async appendServingOption(value) {
      const validated = validateFoodServingOption(value);
      await insertFact(supabase, "food_serving_options", {
        food_id: validated.foodId,
        label: validated.label,
        amount: validated.amount,
        unit_code: validated.unitCode,
        gram_weight: validated.gramWeight,
        source_record_id: validated.sourceRecordId,
        source_portion_code: validated.sourcePortionCode,
        evidence_class: validated.evidenceClass,
        source_primary: validated.sourcePrimary,
      });
    },

    async appendName(value) {
      const validated = validateFoodNameFact(value);
      await insertFact(supabase, "food_names", {
        food_id: validated.foodId,
        language_tag: validated.languageTag,
        name_role: validated.role,
        name_text: validated.text,
        normalized_text: validated.normalizedText,
        script_code: validated.scriptCode,
        origin: validated.origin,
        source_record_id: validated.sourceRecordId,
        policy_version: validated.policyVersion,
      });
    },

    async appendTaxonomyAssignment(value) {
      const validated = validateFoodTaxonomyAssignment(value);
      await insertFact(supabase, "food_taxonomy_assignments", {
        food_id: validated.foodId,
        node_code: validated.nodeCode,
        source_record_id: validated.sourceRecordId,
        assignment_action: validated.action,
        policy_version: validated.policyVersion,
      });
    },

    async appendMarketAssignment(value) {
      const validated = validateFoodMarketAssignment(value);
      await insertFact(supabase, "food_market_assignments", {
        food_id: validated.foodId,
        scope_code: validated.scopeCode,
        relevance_level: validated.relevance,
        source_record_id: validated.sourceRecordId,
        assignment_action: validated.action,
        policy_version: validated.policyVersion,
      });
    },

    async appendVerificationAssertion(value) {
      const validated = validateFoodVerificationAssertion(value);
      await insertFact(supabase, "food_verification_assertions", {
        food_id: validated.foodId,
        assertion_scope: validated.scope,
        assertion_state: validated.state,
        policy_version: validated.policyVersion,
        source_record_id: validated.sourceRecordId,
        supersedes_assertion_id: validated.supersedesAssertionId,
        reason_code: validated.reasonCode,
        authority_reference: validated.authorityReference,
      });
    },

    async appendMergeEvent(value) {
      const validated = validateFoodMergeEvent(value);
      await insertFact(supabase, "food_merge_events", {
        source_food_id: validated.sourceFoodId,
        target_food_id: validated.targetFoodId,
        policy_version: validated.policyVersion,
        reason_code: validated.reasonCode,
        evidence_reference: validated.evidenceReference,
        authority_reference: validated.authorityReference,
      });
    },
  };
}
