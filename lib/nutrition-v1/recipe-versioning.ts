export type RecipeDraftIngredientFact = {
  ingredient_name: string;
  quantity?: number | null;
  unit?: string | null;
};

export type RecipeDraftInstructionFact = {
  instruction: string;
};

export type RecipeDraftReadinessInput = {
  name?: string | null;
  servings?: number | null;
  ingredients?: readonly RecipeDraftIngredientFact[];
  instructions?: readonly RecipeDraftInstructionFact[];
};

export type RecipeDraftMissingField = "name" | "servings" | "ingredient" | "instruction";

type RecipeGraphChild = {
  id: string;
  [key: string]: unknown;
};

type RecipeGraphInstruction = RecipeGraphChild & {
  dependency_action_ids?: readonly string[];
  ingredient_refs?: unknown;
  equipment_refs?: unknown;
};

function remapOpaqueReference(value: unknown, idMap: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return idMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remapOpaqueReference(item, idMap));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, remapOpaqueReference(item, idMap)]),
    );
  }
  return value;
}

function allocateFreshIds<T extends RecipeGraphChild>(
  items: readonly T[],
  nextId: () => string,
  label: string,
) {
  const idMap = new Map<string, string>();
  const cloned = items.map((item) => {
    if (idMap.has(item.id)) throw new Error(`Recipe ${label} graph contains duplicate child id ${item.id}.`);
    const id = nextId();
    if (!id?.trim()) throw new Error(`Recipe ${label} graph clone produced an invalid child id.`);
    idMap.set(item.id, id);
    return { ...item, id };
  });
  if (new Set(cloned.map((item) => item.id)).size !== cloned.length) {
    throw new Error(`Recipe ${label} graph clone produced duplicate child ids.`);
  }
  return { cloned, idMap };
}

export function clonePublishedRecipeGraphForDraft<
  TIngredient extends RecipeGraphChild,
  TEquipment extends RecipeGraphChild,
  TInstruction extends RecipeGraphInstruction,
>(
  graph: {
    ingredients: readonly TIngredient[];
    equipment: readonly TEquipment[];
    instructions: readonly TInstruction[];
  },
  nextId: () => string,
) {
  const ingredients = allocateFreshIds(graph.ingredients, nextId, "ingredient");
  const equipment = allocateFreshIds(graph.equipment, nextId, "equipment");
  const instructions = allocateFreshIds(graph.instructions, nextId, "action");

  const remappedInstructions = instructions.cloned.map((instruction) => {
    const dependencyActionIds = (instruction.dependency_action_ids ?? []).map((dependencyId) => {
      const remapped = instructions.idMap.get(dependencyId);
      if (!remapped) {
        throw new Error(`Recipe action dependency ${dependencyId} does not resolve inside the published Recipe graph.`);
      }
      return remapped;
    });

    return {
      ...instruction,
      dependency_action_ids: dependencyActionIds,
      ingredient_refs: remapOpaqueReference(instruction.ingredient_refs ?? [], ingredients.idMap),
      equipment_refs: remapOpaqueReference(instruction.equipment_refs ?? [], equipment.idMap),
    };
  });

  return {
    ingredients: ingredients.cloned,
    equipment: equipment.cloned,
    instructions: remappedInstructions,
  };
}

export function evaluateRecipeDraftReadiness(input: RecipeDraftReadinessInput): {
  ready: boolean;
  missing: RecipeDraftMissingField[];
} {
  const missing: RecipeDraftMissingField[] = [];
  if (!input.name?.trim()) missing.push("name");
  if (typeof input.servings !== "number" || !Number.isFinite(input.servings) || input.servings <= 0) missing.push("servings");
  if (!input.ingredients?.some((item) => item.ingredient_name?.trim())) missing.push("ingredient");
  if (!input.instructions?.some((item) => item.instruction?.trim())) missing.push("instruction");
  return { ready: missing.length === 0, missing };
}

export function assertRecipeDraftReady(input: RecipeDraftReadinessInput) {
  const readiness = evaluateRecipeDraftReadiness(input);
  if (!readiness.ready) {
    throw new Error(`Recipe Working Draft is not ready: missing ${readiness.missing.join(", ")}.`);
  }
  return readiness;
}

export function nextRecipeVersionNumber(versions: readonly { version_number: number }[]) {
  const highest = versions.reduce((max, item) => {
    const value = Number(item.version_number);
    return Number.isInteger(value) && value > max ? value : max;
  }, 0);
  return highest + 1;
}
