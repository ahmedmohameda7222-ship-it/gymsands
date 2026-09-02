import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateGenerationFoodSelection,
  validateGenerationRedirectSelection,
  type GenerationLifecycle,
} from "@/lib/food-catalog/domain/generations";
import type { FoodVerificationScope } from "@/lib/food-catalog/domain/verification";
import type {
  StoredActivationAuthority,
  StoredGenerationFood,
  StoredGenerationRedirect,
  StoredGenerationSelections,
} from "./generation-contracts";
import type {
  FoodCatalogGenerationValidationReadStore,
  StoredGenerationValidationHydration,
} from "./generation-store";
import { createSupabaseFoodCatalogGenerationReadStore } from "./supabase-generation-read-store";

const GENERATION_ENUMERATION_PAGE_SIZE = 1000;
const SELECTED_FACT_BATCH_SIZE = 500;
const VERIFICATION_SCOPES = new Set<FoodVerificationScope>([
  "identity",
  "nutrition",
  "serving",
  "barcode",
  "localization",
]);
const VERIFICATION_STATES = new Set(["verified", "revoked"] as const);
const ASSIGNMENT_ACTIONS = new Set(["assign", "remove"] as const);
const ACTIVATION_ELIGIBILITY = new Set(["eligible", "rejected"] as const);

function rows(value: unknown, context: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`Food Catalog Plan 3 validation read: ${context} result must be an array.`);
  }
  return value.map((row) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new Error(`Food Catalog Plan 3 validation read: ${context} row is invalid.`);
    }
    return row as Record<string, unknown>;
  });
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Food Catalog Plan 3 validation read: ${label} must be nonblank.`);
  }
  return value;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Food Catalog Plan 3 validation read: ${label} must be boolean.`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label);
}

function throwDbError(context: string, error: { message?: string } | null): void {
  if (error) {
    throw new Error(`Food Catalog Plan 3 validation read: ${context} failed: ${error.message ?? "database error"}`);
  }
}

function mapFood(value: Record<string, unknown>): StoredGenerationFood {
  const generationId = requiredString(value.generation_id, "generation Food generation_id");
  const selection = validateGenerationFoodSelection({
    foodId: requiredString(value.food_id, "generation Food food_id"),
    lifecycle: requiredString(value.lifecycle, "generation Food lifecycle") as GenerationLifecycle,
    nutritionRevisionId: nullableString(value.nutrition_revision_id, "generation Food nutrition_revision_id"),
    activationSetId: nullableString(value.activation_set_id, "generation Food activation_set_id"),
    activationSetMemberId: nullableString(value.activation_set_member_id, "generation Food activation_set_member_id"),
    activationGrantEventId: nullableString(value.activation_grant_event_id, "generation Food activation_grant_event_id"),
  });
  return { generationId, ...selection };
}

function mapRedirect(value: Record<string, unknown>): StoredGenerationRedirect {
  const generationId = requiredString(value.generation_id, "generation redirect generation_id");
  const redirect = validateGenerationRedirectSelection({
    sourceFoodId: requiredString(value.source_food_id, "generation redirect source_food_id"),
    targetFoodId: requiredString(value.target_food_id, "generation redirect target_food_id"),
  });
  return { generationId, ...redirect };
}

function emptySelections(): StoredGenerationSelections {
  return {
    servingOptionIds: [],
    nameFactIds: [],
    taxonomyAssignmentIds: [],
    marketAssignmentIds: [],
    verification: [],
  };
}

async function readPagedGenerationRows(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  generationId: string,
  orderColumns: readonly string[],
  context: string,
): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += GENERATION_ENUMERATION_PAGE_SIZE) {
    let query = supabase.from(table).select(columns).eq("generation_id", generationId);
    for (const column of orderColumns) {
      query = query.order(column, { ascending: true });
    }
    const result = await query.range(offset, offset + GENERATION_ENUMERATION_PAGE_SIZE - 1);
    throwDbError(context, result.error);
    const page = rows(result.data, context);
    allRows.push(...page);
    if (page.length < GENERATION_ENUMERATION_PAGE_SIZE) return allRows;
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

async function readSelectedRowsById(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  ids: readonly string[],
  context: string,
): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = [];
  const normalizedIds = uniqueSorted(ids);
  for (let offset = 0; offset < normalizedIds.length; offset += SELECTED_FACT_BATCH_SIZE) {
    const batch = normalizedIds.slice(offset, offset + SELECTED_FACT_BATCH_SIZE);
    const result = await supabase
      .from(table)
      .select(columns)
      .in("id", batch)
      .order("id", { ascending: true });
    throwDbError(context, result.error);
    allRows.push(...rows(result.data, context));
  }
  return allRows;
}

async function readActivationInvalidations(
  supabase: SupabaseClient,
  grantIds: readonly string[],
): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = [];
  const normalizedIds = uniqueSorted(grantIds);
  for (let offset = 0; offset < normalizedIds.length; offset += SELECTED_FACT_BATCH_SIZE) {
    const batch = normalizedIds.slice(offset, offset + SELECTED_FACT_BATCH_SIZE);
    const result = await supabase
      .from("food_catalog_activation_events")
      .select("target_grant_event_id,created_at")
      .eq("event_type", "invalidate")
      .in("target_grant_event_id", batch)
      .order("target_grant_event_id", { ascending: true });
    throwDbError("activation invalidations", result.error);
    allRows.push(...rows(result.data, "activation invalidations"));
  }
  return allRows;
}

async function readValidationHydration(
  supabase: SupabaseClient,
  generationId: string,
  foods: readonly StoredGenerationFood[],
): Promise<StoredGenerationValidationHydration> {
  const foodIds = new Set<string>();
  const selectionsByFoodId: Record<string, StoredGenerationSelections> = {};
  for (const food of foods) {
    if (food.generationId !== generationId) {
      throw new Error("Food Catalog Plan 3 validation read: generation Food escaped exact generation scope.");
    }
    foodIds.add(food.foodId);
    selectionsByFoodId[food.foodId] = emptySelections();
  }

  const [servingSelections, nameSelections, taxonomySelections, marketSelections, verificationSelections] = await Promise.all([
    readPagedGenerationRows(supabase, "food_catalog_generation_servings", "food_id,serving_option_id", generationId, ["food_id", "serving_option_id"], "generation servings"),
    readPagedGenerationRows(supabase, "food_catalog_generation_names", "food_id,name_fact_id", generationId, ["food_id", "name_fact_id"], "generation names"),
    readPagedGenerationRows(supabase, "food_catalog_generation_taxonomy", "food_id,taxonomy_assignment_id", generationId, ["food_id", "taxonomy_assignment_id"], "generation taxonomy"),
    readPagedGenerationRows(supabase, "food_catalog_generation_markets", "food_id,market_assignment_id", generationId, ["food_id", "market_assignment_id"], "generation markets"),
    readPagedGenerationRows(supabase, "food_catalog_generation_verification", "food_id,assertion_scope,assertion_id", generationId, ["food_id", "assertion_scope"], "generation verification"),
  ]);

  const selectionFor = (foodId: string, context: string): StoredGenerationSelections => {
    if (!foodIds.has(foodId)) {
      throw new Error(`Food Catalog Plan 3 validation read: ${context} escaped generation Food scope.`);
    }
    return selectionsByFoodId[foodId];
  };

  for (const row of servingSelections) {
    const foodId = requiredString(row.food_id, "generation serving food_id");
    selectionFor(foodId, "generation serving").servingOptionIds.push(requiredString(row.serving_option_id, "generation serving serving_option_id"));
  }
  for (const row of nameSelections) {
    const foodId = requiredString(row.food_id, "generation name food_id");
    selectionFor(foodId, "generation name").nameFactIds.push(requiredString(row.name_fact_id, "generation name name_fact_id"));
  }
  for (const row of taxonomySelections) {
    const foodId = requiredString(row.food_id, "generation taxonomy food_id");
    selectionFor(foodId, "generation taxonomy").taxonomyAssignmentIds.push(requiredString(row.taxonomy_assignment_id, "generation taxonomy taxonomy_assignment_id"));
  }
  for (const row of marketSelections) {
    const foodId = requiredString(row.food_id, "generation market food_id");
    selectionFor(foodId, "generation market").marketAssignmentIds.push(requiredString(row.market_assignment_id, "generation market market_assignment_id"));
  }
  for (const row of verificationSelections) {
    const foodId = requiredString(row.food_id, "generation verification food_id");
    const scope = requiredString(row.assertion_scope, "generation verification assertion_scope") as FoodVerificationScope;
    if (!VERIFICATION_SCOPES.has(scope)) {
      throw new Error("Food Catalog Plan 3 validation read: generation verification scope is invalid.");
    }
    selectionFor(foodId, "generation verification").verification.push({
      foodId,
      scope,
      assertionId: requiredString(row.assertion_id, "generation verification assertion_id"),
    });
  }

  const nutritionIds = foods.flatMap((food) => food.nutritionRevisionId === null ? [] : [food.nutritionRevisionId]);
  const servingIds = servingSelections.map((row) => requiredString(row.serving_option_id, "generation serving serving_option_id"));
  const nameIds = nameSelections.map((row) => requiredString(row.name_fact_id, "generation name name_fact_id"));
  const taxonomyIds = taxonomySelections.map((row) => requiredString(row.taxonomy_assignment_id, "generation taxonomy taxonomy_assignment_id"));
  const marketIds = marketSelections.map((row) => requiredString(row.market_assignment_id, "generation market market_assignment_id"));
  const assertionIds = verificationSelections.map((row) => requiredString(row.assertion_id, "generation verification assertion_id"));

  const [nutritionRows, servingRows, nameRows, taxonomyRows, marketRows, assertionRows] = await Promise.all([
    readSelectedRowsById(supabase, "food_nutrition_revisions", "id,food_id", nutritionIds, "selected nutrition revisions"),
    readSelectedRowsById(supabase, "food_serving_options", "id,food_id", servingIds, "selected serving options"),
    readSelectedRowsById(supabase, "food_names", "id,food_id,name_role", nameIds, "selected names"),
    readSelectedRowsById(supabase, "food_taxonomy_assignments", "id,food_id,assignment_action", taxonomyIds, "selected taxonomy assignments"),
    readSelectedRowsById(supabase, "food_market_assignments", "id,food_id,assignment_action", marketIds, "selected market assignments"),
    readSelectedRowsById(supabase, "food_verification_assertions", "id,food_id,assertion_scope,assertion_state", assertionIds, "selected verification assertions"),
  ]);

  const activeFoods = foods.filter((food) => food.lifecycle === "active");
  const activationMemberIds = activeFoods.map((food) => food.activationSetMemberId as string);
  const activationSetIds = activeFoods.map((food) => food.activationSetId as string);
  const activationGrantIds = activeFoods.map((food) => food.activationGrantEventId as string);
  const [memberRows, setRows, grantRows, invalidationRows] = await Promise.all([
    readSelectedRowsById(supabase, "food_catalog_activation_set_members", "id,activation_set_id,food_id,eligibility,source_legal_accepted", activationMemberIds, "activation members"),
    readSelectedRowsById(supabase, "food_catalog_activation_sets", "id,activation_policy_version", activationSetIds, "activation sets"),
    readSelectedRowsById(supabase, "food_catalog_activation_events", "id,activation_set_id,event_type,created_at", activationGrantIds, "activation grants"),
    readActivationInvalidations(supabase, activationGrantIds),
  ]);

  const memberById = new Map(memberRows.map((row) => [requiredString(row.id, "activation member id"), row]));
  const setById = new Map(setRows.map((row) => [requiredString(row.id, "activation set id"), row]));
  const grantById = new Map(grantRows.map((row) => [requiredString(row.id, "activation grant id"), row]));
  const invalidationByGrantId = new Map(invalidationRows.map((row) => [
    requiredString(row.target_grant_event_id, "activation invalidation target_grant_event_id"),
    requiredString(row.created_at, "activation invalidation created_at"),
  ]));

  const activationAuthorities: StoredActivationAuthority[] = [];
  for (const food of activeFoods) {
    const member = memberById.get(food.activationSetMemberId as string);
    const set = setById.get(food.activationSetId as string);
    const grant = grantById.get(food.activationGrantEventId as string);
    if (!member || !set || !grant) continue;
    const memberSetId = requiredString(member.activation_set_id, "activation member activation_set_id");
    const grantSetId = requiredString(grant.activation_set_id, "activation grant activation_set_id");
    if (memberSetId !== food.activationSetId || grantSetId !== memberSetId) continue;
    if (requiredString(grant.event_type, "activation grant event_type") !== "grant") {
      throw new Error("Food Catalog Plan 3 validation read: activation authority event is not a grant.");
    }
    const eligibility = requiredString(member.eligibility, "activation member eligibility") as "eligible" | "rejected";
    if (!ACTIVATION_ELIGIBILITY.has(eligibility)) {
      throw new Error("Food Catalog Plan 3 validation read: activation member eligibility is invalid.");
    }
    activationAuthorities.push({
      activationSetId: memberSetId,
      activationSetMemberId: requiredString(member.id, "activation member id"),
      foodId: requiredString(member.food_id, "activation member food_id"),
      activationPolicyVersion: requiredString(set.activation_policy_version, "activation set activation_policy_version"),
      eligibility,
      sourceLegalAccepted: requiredBoolean(member.source_legal_accepted, "activation member source_legal_accepted"),
      grantEventId: requiredString(grant.id, "activation grant id"),
      grantCreatedAt: requiredString(grant.created_at, "activation grant created_at"),
      invalidatedAt: invalidationByGrantId.get(food.activationGrantEventId as string) ?? null,
    });
  }

  return {
    selectionsByFoodId,
    nutritionRevisions: nutritionRows.map((row) => ({
      id: requiredString(row.id, "selected nutrition id"),
      foodId: requiredString(row.food_id, "selected nutrition food_id"),
    })),
    servingOptions: servingRows.map((row) => ({
      id: requiredString(row.id, "selected serving id"),
      foodId: requiredString(row.food_id, "selected serving food_id"),
    })),
    names: nameRows.map((row) => ({
      id: requiredString(row.id, "selected name id"),
      foodId: requiredString(row.food_id, "selected name food_id"),
      role: requiredString(row.name_role, "selected name role") as never,
    })),
    taxonomyAssignments: taxonomyRows.map((row) => {
      const action = requiredString(row.assignment_action, "selected taxonomy assignment_action") as "assign" | "remove";
      if (!ASSIGNMENT_ACTIONS.has(action)) throw new Error("Food Catalog Plan 3 validation read: taxonomy assignment action is invalid.");
      return {
        id: requiredString(row.id, "selected taxonomy id"),
        foodId: requiredString(row.food_id, "selected taxonomy food_id"),
        action,
      };
    }),
    marketAssignments: marketRows.map((row) => {
      const action = requiredString(row.assignment_action, "selected market assignment_action") as "assign" | "remove";
      if (!ASSIGNMENT_ACTIONS.has(action)) throw new Error("Food Catalog Plan 3 validation read: market assignment action is invalid.");
      return {
        id: requiredString(row.id, "selected market id"),
        foodId: requiredString(row.food_id, "selected market food_id"),
        action,
      };
    }),
    verificationAssertions: assertionRows.map((row) => {
      const scope = requiredString(row.assertion_scope, "selected verification assertion_scope") as FoodVerificationScope;
      if (!VERIFICATION_SCOPES.has(scope)) throw new Error("Food Catalog Plan 3 validation read: verification assertion scope is invalid.");
      const state = requiredString(row.assertion_state, "selected verification assertion_state") as "verified" | "revoked";
      if (!VERIFICATION_STATES.has(state)) throw new Error("Food Catalog Plan 3 validation read: verification assertion state is invalid.");
      return {
        id: requiredString(row.id, "selected verification id"),
        foodId: requiredString(row.food_id, "selected verification food_id"),
        scope,
        state,
      };
    }),
    activationAuthorities,
  };
}

export function createSupabaseFoodCatalogGenerationValidationReadStore(
  supabase: SupabaseClient,
): FoodCatalogGenerationValidationReadStore {
  const base = createSupabaseFoodCatalogGenerationReadStore(supabase);
  return {
    ...base,
    async readGenerationFoods(generationId) {
      const resultRows: StoredGenerationFood[] = [];
      for (let offset = 0; ; offset += GENERATION_ENUMERATION_PAGE_SIZE) {
        const result = await supabase
          .from("food_catalog_generation_foods")
          .select("generation_id,food_id,lifecycle,nutrition_revision_id,activation_set_id,activation_set_member_id,activation_grant_event_id")
          .eq("generation_id", generationId)
          .order("food_id", { ascending: true })
          .range(offset, offset + GENERATION_ENUMERATION_PAGE_SIZE - 1);
        throwDbError("generation Foods", result.error);
        const page = rows(result.data, "generation Foods");
        resultRows.push(...page.map(mapFood));
        if (page.length < GENERATION_ENUMERATION_PAGE_SIZE) return resultRows;
      }
    },
    async readGenerationRedirects(generationId) {
      const resultRows: StoredGenerationRedirect[] = [];
      for (let offset = 0; ; offset += GENERATION_ENUMERATION_PAGE_SIZE) {
        const result = await supabase
          .from("food_catalog_generation_redirects")
          .select("generation_id,source_food_id,target_food_id")
          .eq("generation_id", generationId)
          .order("source_food_id", { ascending: true })
          .range(offset, offset + GENERATION_ENUMERATION_PAGE_SIZE - 1);
        throwDbError("generation redirects", result.error);
        const page = rows(result.data, "generation redirects");
        resultRows.push(...page.map(mapRedirect));
        if (page.length < GENERATION_ENUMERATION_PAGE_SIZE) return resultRows;
      }
    },
    readGenerationValidationHydration(generationId, foods) {
      return readValidationHydration(supabase, generationId, foods);
    },
  };
}
