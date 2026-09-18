import {
  isPlan7MigrationSystemKitchenName,
  isPlan7MigrationSystemSubcategoryName,
} from "./replay-local-references.ts";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;
const SAFE_TYPE = /^[a-zA-Z0-9_." \[\](),]+$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ALLOWED_REFERENCE_COLUMNS = new Set(["kitchen_id", "subcategory_id"]);

function qid(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(`Unsafe PostgreSQL identifier ${String(value)}.`);
  return `"${value}"`;
}

function safeType(value) {
  if (typeof value !== "string" || !SAFE_TYPE.test(value) || /;|--|\/\*/u.test(value)) {
    throw new Error(`Unsafe PostgreSQL target type ${String(value)}.`);
  }
  return value;
}

function parseCanonicalRow(line) {
  let parsed;
  try { parsed = JSON.parse(line); } catch { throw new Error("Canonical replay-local reference row is not valid JSON."); }
  if (!Array.isArray(parsed)) throw new Error("Canonical replay-local reference row must be an array.");
  const map = new Map();
  for (const tuple of parsed) {
    if (!Array.isArray(tuple) || tuple.length !== 3) throw new Error("Malformed canonical replay-local reference tuple.");
    const [column, pgType, text] = tuple;
    if (typeof column !== "string" || !IDENTIFIER.test(column) || typeof pgType !== "string" || !pgType.trim() || (text !== null && typeof text !== "string")) {
      throw new Error("Malformed canonical replay-local reference scalar.");
    }
    if (map.has(column)) throw new Error(`Duplicate canonical replay-local reference column ${column}.`);
    map.set(column, { column, pgType, text });
  }
  return { parsed, map };
}

function requireScalar(map, column) {
  const scalar = map.get(column);
  if (!scalar) throw new Error(`Replay-local reference row is missing ${column}.`);
  return scalar;
}

function typedExpression(scalar, targetType) {
  const type = safeType(targetType);
  if (scalar.text === null) return `NULL::${type}`;
  const hex = Buffer.from(scalar.text, "utf8").toString("hex");
  return `convert_from(decode('${hex}','hex'),'UTF8')::${type}`;
}

function exactTextExpression(text, targetType) {
  const hex = Buffer.from(text, "utf8").toString("hex");
  return `convert_from(decode('${hex}','hex'),'UTF8')::${safeType(targetType)}`;
}

function validateColumns(map, targetColumns, required) {
  for (const column of required) {
    if (!Object.hasOwn(targetColumns, column)) throw new Error(`Replay-local target is missing ${column}.`);
    requireScalar(map, column);
  }
}

export function isMigrationReplayLocalSystemKitchenRow(canonicalRow) {
  const { map } = parseCanonicalRow(canonicalRow);
  return requireScalar(map, "user_id").text === null
    && requireScalar(map, "is_system").text === "true"
    && typeof requireScalar(map, "name").text === "string"
    && isPlan7MigrationSystemKitchenName(requireScalar(map, "name").text);
}

export function isMigrationReplayLocalSystemSubcategoryRow(canonicalRow) {
  const { map } = parseCanonicalRow(canonicalRow);
  const name = requireScalar(map, "name").text;
  return typeof name === "string" && isPlan7MigrationSystemSubcategoryName(name);
}

export function buildReplayLocalSystemKitchenLookupSql({ targetColumns, canonicalRow }) {
  const { map } = parseCanonicalRow(canonicalRow);
  validateColumns(map, targetColumns, ["id", "user_id", "name", "is_system"]);
  if (!isMigrationReplayLocalSystemKitchenRow(canonicalRow)) throw new Error("Kitchen row is not a known Git-migration replay-local system reference.");
  const name = requireScalar(map, "name");
  return `SELECT id::text FROM public.${qid("food_kitchens")} WHERE is_system IS TRUE AND user_id IS NULL AND name IS NOT DISTINCT FROM ${typedExpression(name, targetColumns.name)} ORDER BY id;`;
}

export function buildReplayLocalSystemSubcategoryLookupSql({ targetColumns, canonicalRow, targetKitchenId }) {
  const { map } = parseCanonicalRow(canonicalRow);
  validateColumns(map, targetColumns, ["id", "kitchen_id", "name"]);
  if (!isMigrationReplayLocalSystemSubcategoryRow(canonicalRow)) throw new Error("Subcategory row is not a known Git-migration replay-local reference.");
  if (typeof targetKitchenId !== "string" || !UUID.test(targetKitchenId)) throw new Error("Mapped replay-local target kitchen ID must be a UUID.");
  const name = requireScalar(map, "name");
  return `SELECT id::text FROM public.${qid("food_subcategories")} WHERE kitchen_id IS NOT DISTINCT FROM ${exactTextExpression(targetKitchenId, targetColumns.kitchen_id)} AND name IS NOT DISTINCT FROM ${typedExpression(name, targetColumns.name)} ORDER BY id;`;
}

export function remapCanonicalRowReferences(canonicalRow, replacements) {
  const { parsed, map } = parseCanonicalRow(canonicalRow);
  const replacementEntries = Object.entries(replacements ?? {});
  for (const [column, targetId] of replacementEntries) {
    if (!ALLOWED_REFERENCE_COLUMNS.has(column)) throw new Error(`Only declared replay-local reference column values may be remapped; received ${column}.`);
    if (typeof targetId !== "string" || !UUID.test(targetId)) throw new Error(`Mapped replay-local reference ${column} must be a UUID.`);
    const scalar = requireScalar(map, column);
    if (scalar.text === null) throw new Error(`Cannot remap NULL replay-local reference column ${column}.`);
  }
  return JSON.stringify(parsed.map(([column, pgType, text]) => [
    column,
    pgType,
    Object.hasOwn(replacements ?? {}, column) ? replacements[column] : text,
  ]));
}

export function replayLocalReferenceIds(canonicalRow) {
  const { map } = parseCanonicalRow(canonicalRow);
  const id = requireScalar(map, "id").text;
  if (typeof id !== "string" || !UUID.test(id)) throw new Error("Replay-local source reference ID must be a UUID.");
  return Object.freeze({
    id,
    kitchenId: map.get("kitchen_id")?.text ?? null,
    subcategoryId: map.get("subcategory_id")?.text ?? null,
  });
}
