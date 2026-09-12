import {
  isMigrationReplayLocalSystemKitchenRow,
  isMigrationReplayLocalSystemSubcategoryRow,
  remapCanonicalRowReferences,
  replayLocalReferenceIds,
} from "./replay-local-reference-runtime.mjs";

function parseCanonicalRow(line) {
  const parsed = JSON.parse(line);
  if (!Array.isArray(parsed)) throw new Error("Replay-local comparison row must be a canonical tuple array.");
  const map = new Map();
  for (const tuple of parsed) {
    if (!Array.isArray(tuple) || tuple.length !== 3) throw new Error("Replay-local comparison row has a malformed tuple.");
    const [column, pgType, text] = tuple;
    if (typeof column !== "string" || typeof pgType !== "string" || (text !== null && typeof text !== "string")) {
      throw new Error("Replay-local comparison row has an invalid typed tuple.");
    }
    if (map.has(column)) throw new Error(`Replay-local comparison row duplicates ${column}.`);
    map.set(column, { column, pgType, text });
  }
  return { parsed, map };
}

function filtered(line, omittedColumns) {
  const omitted = new Set(omittedColumns);
  return JSON.stringify(parseCanonicalRow(line).parsed.filter(([column]) => !omitted.has(column)));
}

function scalarText(line, column) {
  const scalar = parseCanonicalRow(line).map.get(column);
  if (!scalar || scalar.text === null) throw new Error(`Replay-local comparison requires non-null ${column}.`);
  return scalar.text;
}

function exactOne(candidates, label) {
  if (candidates.length !== 1) throw new Error(`${label} must resolve to exactly one target row; observed ${candidates.length}.`);
  return candidates[0];
}

function assertNoDuplicateIds(rows, relation) {
  const ids = new Set();
  for (const row of rows) {
    const id = scalarText(row, "id");
    if (ids.has(id)) throw new Error(`Duplicate ${relation} ID ${id}.`);
    ids.add(id);
  }
}

export function prepareReplayLocalReferenceComparison({
  sourceKitchenRows,
  targetKitchenRows,
  sourceSubcategoryRows,
  targetSubcategoryRows,
  sourceFoodRows,
}) {
  assertNoDuplicateIds(sourceKitchenRows, "source food_kitchens");
  assertNoDuplicateIds(targetKitchenRows, "target food_kitchens");
  assertNoDuplicateIds(sourceSubcategoryRows, "source food_subcategories");
  assertNoDuplicateIds(targetSubcategoryRows, "target food_subcategories");

  const kitchenMap = new Map();
  const consumedTargetKitchens = new Set();
  const targetKitchenById = new Map(targetKitchenRows.map((row) => [scalarText(row, "id"), row]));

  for (const sourceRow of sourceKitchenRows) {
    const sourceId = scalarText(sourceRow, "id");
    if (isMigrationReplayLocalSystemKitchenRow(sourceRow)) {
      const name = scalarText(sourceRow, "name");
      const targetRow = exactOne(
        targetKitchenRows.filter((row) => isMigrationReplayLocalSystemKitchenRow(row) && scalarText(row, "name") === name),
        `Migration system kitchen ${name}`,
      );
      const targetId = scalarText(targetRow, "id");
      if (filtered(sourceRow, ["id", "created_at", "updated_at"]) !== filtered(targetRow, ["id", "created_at", "updated_at"])) {
        throw new Error(`Migration system kitchen semantic mismatch for ${name}.`);
      }
      kitchenMap.set(sourceId, targetId);
      consumedTargetKitchens.add(targetId);
      continue;
    }

    const targetRow = targetKitchenById.get(sourceId);
    if (!targetRow || sourceRow !== targetRow) throw new Error(`Exact runtime/user kitchen mismatch for ${sourceId}.`);
    consumedTargetKitchens.add(sourceId);
  }
  if (consumedTargetKitchens.size !== targetKitchenRows.length) throw new Error("Unexpected restored food_kitchens row outside declared replay-local semantics.");

  const subcategoryMap = new Map();
  const consumedTargetSubcategories = new Set();
  const targetSubcategoryById = new Map(targetSubcategoryRows.map((row) => [scalarText(row, "id"), row]));

  for (const sourceRow of sourceSubcategoryRows) {
    const ids = replayLocalReferenceIds(sourceRow);
    const mappedKitchenId = typeof ids.kitchenId === "string" ? kitchenMap.get(ids.kitchenId) : undefined;
    if (mappedKitchenId && isMigrationReplayLocalSystemSubcategoryRow(sourceRow)) {
      const name = scalarText(sourceRow, "name");
      const targetRow = exactOne(
        targetSubcategoryRows.filter((row) => {
          const target = parseCanonicalRow(row).map;
          return target.get("kitchen_id")?.text === mappedKitchenId
            && target.get("name")?.text === name
            && isMigrationReplayLocalSystemSubcategoryRow(row);
        }),
        `Migration system subcategory ${name}`,
      );
      const targetId = scalarText(targetRow, "id");
      if (filtered(sourceRow, ["id", "kitchen_id", "created_at", "updated_at"]) !== filtered(targetRow, ["id", "kitchen_id", "created_at", "updated_at"])) {
        throw new Error(`Migration system subcategory semantic mismatch for ${name}.`);
      }
      subcategoryMap.set(ids.id, targetId);
      consumedTargetSubcategories.add(targetId);
      continue;
    }

    const targetRow = targetSubcategoryById.get(ids.id);
    const comparableSource = mappedKitchenId
      ? remapCanonicalRowReferences(sourceRow, { kitchen_id: mappedKitchenId })
      : sourceRow;
    if (!targetRow || comparableSource !== targetRow) throw new Error(`Exact runtime subcategory mismatch for ${ids.id}.`);
    consumedTargetSubcategories.add(ids.id);
  }
  if (consumedTargetSubcategories.size !== targetSubcategoryRows.length) throw new Error("Unexpected restored food_subcategories row outside declared replay-local semantics.");

  const foodItemSourceRows = sourceFoodRows.map((row) => {
    const parsed = parseCanonicalRow(row).map;
    const replacements = {};
    const kitchenId = parsed.get("kitchen_id")?.text;
    const subcategoryId = parsed.get("subcategory_id")?.text;
    if (typeof kitchenId === "string" && kitchenMap.has(kitchenId)) replacements.kitchen_id = kitchenMap.get(kitchenId);
    if (typeof subcategoryId === "string" && subcategoryMap.has(subcategoryId)) replacements.subcategory_id = subcategoryMap.get(subcategoryId);
    return Object.keys(replacements).length ? remapCanonicalRowReferences(row, replacements) : row;
  });

  return Object.freeze({
    kitchenResult: Object.freeze({ relation: "food_kitchens", rowCount: sourceKitchenRows.length, exact: true, transientNeutralized: true }),
    subcategoryResult: Object.freeze({ relation: "food_subcategories", rowCount: sourceSubcategoryRows.length, exact: true, transientNeutralized: true }),
    foodItemSourceRows: Object.freeze(foodItemSourceRows),
    mappingCounts: Object.freeze({ foodKitchens: kitchenMap.size, foodSubcategories: subcategoryMap.size }),
  });
}
