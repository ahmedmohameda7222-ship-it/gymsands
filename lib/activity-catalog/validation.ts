import { ActivityCatalogError } from "./errors";
import type {
  ActivityCatalogAlternative,
  ActivityCatalogFilterOptions,
  ActivityCatalogPagination,
  ActivityCatalogSearchParams,
  ActivityCatalogSport,
  ActivityCatalogSportSessionTemplate,
  ActivityCatalogTaxonomyItem,
  LocalizedTrainingActivityContent,
  TrainingActivity,
  TrainingActivityInstruction,
  TrainingActivityMetricField,
  TrainingActivityMetricSchema
} from "./types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const localePattern = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const safeRequestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

type JsonObject = Record<string, unknown>;

function invalidResponse(message: string): never {
  throw new ActivityCatalogError("invalid_response", { message });
}

function objectValue(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidResponse(`${label} must be an object.`);
  return value as JsonObject;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) invalidResponse(`${label} must be an array.`);
  return value;
}

function stringValue(value: unknown, label: string, options: { nullable: true; nonEmpty?: boolean }): string | null;
function stringValue(value: unknown, label: string, options?: { nullable?: false; nonEmpty?: boolean }): string;
function stringValue(value: unknown, label: string, options: { nullable?: boolean; nonEmpty?: boolean } = {}): string | null {
  if (value === null && options.nullable) return null;
  if (typeof value !== "string") invalidResponse(`${label} must be a string.`);
  if (options.nonEmpty && !value.trim()) invalidResponse(`${label} must not be empty.`);
  return value;
}

function numberValue(value: unknown, label: string, options: { integer?: boolean; minimum?: number } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) invalidResponse(`${label} must be a finite number.`);
  if (options.integer && !Number.isInteger(value)) invalidResponse(`${label} must be an integer.`);
  if (options.minimum !== undefined && value < options.minimum) invalidResponse(`${label} is below its minimum.`);
  return value;
}

function booleanValue(value: unknown, label: string) {
  if (typeof value !== "boolean") invalidResponse(`${label} must be a boolean.`);
  return value;
}

function uuidValue(value: unknown, label: string) {
  const parsed = stringValue(value, label, { nonEmpty: true });
  if (!uuidPattern.test(parsed)) invalidResponse(`${label} must be a UUID.`);
  return parsed;
}

function slugValue(value: unknown, label: string) {
  const parsed = stringValue(value, label, { nonEmpty: true });
  if (!slugPattern.test(parsed) || parsed.length > 100) invalidResponse(`${label} must be a catalog slug.`);
  return parsed;
}

function dateTimeValue(value: unknown, label: string, nullable = false) {
  if (value === null && nullable) return null;
  const parsed = stringValue(value, label, { nonEmpty: true });
  if (!Number.isFinite(Date.parse(parsed))) invalidResponse(`${label} must be an ISO date-time.`);
  return parsed;
}

function optionalString(value: unknown, label: string) {
  if (value === undefined) return undefined;
  return stringValue(value, label);
}

function assertKeys(value: JsonObject, allowed: string[], label: string) {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unexpected) invalidResponse(`${label} contains an unexpected field.`);
}

function parseTaxonomy(value: unknown, label: string): ActivityCatalogTaxonomyItem {
  const item = objectValue(value, label);
  return {
    id: uuidValue(item.id, `${label}.id`),
    slug: slugValue(item.slug, `${label}.slug`),
    name: stringValue(item.name, `${label}.name`, { nonEmpty: true })
  };
}

function parseInstruction(value: unknown, label: string): TrainingActivityInstruction {
  const item = objectValue(value, label);
  assertKeys(item, ["order", "text"], label);
  return {
    order: numberValue(item.order, `${label}.order`, { integer: true, minimum: 1 }),
    text: stringValue(item.text, `${label}.text`, { nonEmpty: true })
  };
}

function parseMetricField(value: unknown, label: string): TrainingActivityMetricField {
  const item = objectValue(value, label);
  const type = stringValue(item.type, `${label}.type`);
  if (!["integer", "number", "text", "boolean"].includes(type)) invalidResponse(`${label}.type is unsupported.`);
  return {
    key: stringValue(item.key, `${label}.key`, { nonEmpty: true }),
    label: stringValue(item.label, `${label}.label`, { nonEmpty: true }),
    type: type as TrainingActivityMetricField["type"],
    ...(item.unit !== undefined ? { unit: stringValue(item.unit, `${label}.unit`, { nullable: true }) } : {}),
    required: booleanValue(item.required, `${label}.required`)
  };
}

function parseMetricSchema(value: unknown, label: string): TrainingActivityMetricSchema | null {
  if (value === null || value === undefined) return null;
  const item = objectValue(value, label);
  assertKeys(item, ["slug", "name", "fields"], label);
  return {
    ...(item.slug !== undefined ? { slug: slugValue(item.slug, `${label}.slug`) } : {}),
    ...(item.name !== undefined ? { name: stringValue(item.name, `${label}.name`, { nonEmpty: true }) } : {}),
    ...(item.fields !== undefined ? {
      fields: arrayValue(item.fields, `${label}.fields`).map((field, index) => parseMetricField(field, `${label}.fields[${index}]`))
    } : {})
  };
}

function parseLocalizedContent(value: unknown, label: string): LocalizedTrainingActivityContent {
  const item = objectValue(value, label);
  assertKeys(item, ["name", "shortDescription", "instructions"], label);
  return {
    ...(item.name !== undefined ? { name: stringValue(item.name, `${label}.name`, { nullable: true }) } : {}),
    ...(item.shortDescription !== undefined ? { shortDescription: stringValue(item.shortDescription, `${label}.shortDescription`, { nullable: true }) } : {}),
    ...(item.instructions !== undefined ? {
      instructions: arrayValue(item.instructions, `${label}.instructions`).map((step, index) => parseInstruction(step, `${label}.instructions[${index}]`))
    } : {})
  };
}

export function parseTrainingActivity(value: unknown): TrainingActivity {
  const item = objectValue(value, "activity");
  assertKeys(item, [
    "id", "slug", "name", "shortDescription", "instructions", "difficulty", "movementPattern", "version",
    "activityType", "metricSchema", "sports", "sessionTypes", "sessionPhases", "equipment", "muscles",
    "trainingGoals", "translations", "publishedAt", "updatedAt"
  ], "activity");
  const activityType = parseTaxonomy(item.activityType, "activity.activityType");
  const translationsObject = objectValue(item.translations, "activity.translations");
  const translations = Object.fromEntries(
    Object.entries(translationsObject).map(([locale, content]) => {
      if (!localePattern.test(locale)) invalidResponse("activity.translations contains an invalid locale.");
      return [locale, parseLocalizedContent(content, `activity.translations.${locale}`)];
    })
  );
  const instructions = arrayValue(item.instructions, "activity.instructions")
    .map((step, index) => parseInstruction(step, `activity.instructions[${index}]`));
  const sports = arrayValue(item.sports, "activity.sports").map((entry, index) => {
    const value = objectValue(entry, `activity.sports[${index}]`);
    return { ...parseTaxonomy(value, `activity.sports[${index}]`), isPrimary: booleanValue(value.isPrimary, `activity.sports[${index}].isPrimary`) };
  });
  const sessionTypes = arrayValue(item.sessionTypes, "activity.sessionTypes").map((entry, index) => {
    const value = objectValue(entry, `activity.sessionTypes[${index}]`);
    return { ...parseTaxonomy(value, `activity.sessionTypes[${index}]`), sportId: uuidValue(value.sportId, `activity.sessionTypes[${index}].sportId`) };
  });
  const sessionPhases = arrayValue(item.sessionPhases, "activity.sessionPhases").map((entry, index) => {
    const value = objectValue(entry, `activity.sessionPhases[${index}]`);
    return {
      ...parseTaxonomy(value, `activity.sessionPhases[${index}]`),
      sportId: uuidValue(value.sportId, `activity.sessionPhases[${index}].sportId`),
      isOptional: booleanValue(value.isOptional, `activity.sessionPhases[${index}].isOptional`)
    };
  });
  const equipment = arrayValue(item.equipment, "activity.equipment").map((entry, index) => {
    const value = objectValue(entry, `activity.equipment[${index}]`);
    return { ...parseTaxonomy(value, `activity.equipment[${index}]`), isRequired: booleanValue(value.isRequired, `activity.equipment[${index}].isRequired`) };
  });
  const muscles = arrayValue(item.muscles, "activity.muscles").map((entry, index) => {
    const value = objectValue(entry, `activity.muscles[${index}]`);
    const role = stringValue(value.role, `activity.muscles[${index}].role`);
    if (!["primary", "secondary", "stabilizer"].includes(role)) invalidResponse("activity muscle role is invalid.");
    return {
      ...parseTaxonomy(value, `activity.muscles[${index}]`),
      ...(value.bodyRegion !== undefined ? { bodyRegion: stringValue(value.bodyRegion, `activity.muscles[${index}].bodyRegion`, { nullable: true }) } : {}),
      role: role as "primary" | "secondary" | "stabilizer"
    };
  });
  const trainingGoals = arrayValue(item.trainingGoals, "activity.trainingGoals").map((entry, index) => {
    const value = objectValue(entry, `activity.trainingGoals[${index}]`);
    return { ...parseTaxonomy(value, `activity.trainingGoals[${index}]`), relevanceWeight: numberValue(value.relevanceWeight, `activity.trainingGoals[${index}].relevanceWeight`, { integer: true, minimum: 0 }) };
  });
  return {
    id: uuidValue(item.id, "activity.id"),
    slug: slugValue(item.slug, "activity.slug"),
    name: stringValue(item.name, "activity.name", { nonEmpty: true }),
    shortDescription: item.shortDescription === undefined
      ? null
      : stringValue(item.shortDescription, "activity.shortDescription", { nullable: true }),
    instructions,
    difficulty: stringValue(item.difficulty, "activity.difficulty", { nullable: true }),
    movementPattern: stringValue(item.movementPattern, "activity.movementPattern", { nullable: true }),
    version: numberValue(item.version, "activity.version", { integer: true, minimum: 1 }),
    activityType,
    metricSchema: parseMetricSchema(item.metricSchema, "activity.metricSchema"),
    sports,
    sessionTypes,
    sessionPhases,
    equipment,
    muscles,
    trainingGoals,
    translations,
    publishedAt: item.publishedAt === undefined ? null : dateTimeValue(item.publishedAt, "activity.publishedAt", true),
    updatedAt: dateTimeValue(item.updatedAt, "activity.updatedAt")
  };
}

export function parseActivityAlternative(value: unknown): ActivityCatalogAlternative {
  const item = objectValue(value, "alternative");
  const prescriptionTransfer = stringValue(item.prescriptionTransfer, "alternative.prescriptionTransfer");
  if (!["full", "partial", "none"].includes(prescriptionTransfer)) invalidResponse("alternative.prescriptionTransfer is invalid.");
  return {
    sourceActivityId: uuidValue(item.sourceActivityId, "alternative.sourceActivityId"),
    alternativeActivityId: uuidValue(item.alternativeActivityId, "alternative.alternativeActivityId"),
    alternativeSlug: slugValue(item.alternativeSlug, "alternative.alternativeSlug"),
    alternativeName: stringValue(item.alternativeName, "alternative.alternativeName", { nonEmpty: true }),
    ...(item.alternativeActivityTypeSlug !== undefined ? { alternativeActivityTypeSlug: slugValue(item.alternativeActivityTypeSlug, "alternative.alternativeActivityTypeSlug") } : {}),
    alternativeDifficulty: item.alternativeDifficulty === undefined
      ? null
      : stringValue(item.alternativeDifficulty, "alternative.alternativeDifficulty", { nullable: true }),
    reasonCode: stringValue(item.reasonCode, "alternative.reasonCode", { nonEmpty: true }),
    differenceSummary: item.differenceSummary === undefined
      ? null
      : stringValue(item.differenceSummary, "alternative.differenceSummary", { nullable: true }),
    prescriptionTransfer: prescriptionTransfer as ActivityCatalogAlternative["prescriptionTransfer"],
    compatibilityScore: numberValue(item.compatibilityScore, "alternative.compatibilityScore", { minimum: 0 }),
    priority: numberValue(item.priority, "alternative.priority", { integer: true, minimum: 0 })
  };
}

export function parseResponseMeta(value: unknown) {
  const item = objectValue(value, "meta");
  const apiVersion = stringValue(item.apiVersion, "meta.apiVersion", { nonEmpty: true });
  const locale = stringValue(item.locale, "meta.locale", { nonEmpty: true });
  const requestId = stringValue(item.requestId, "meta.requestId", { nonEmpty: true });
  if (!localePattern.test(locale)) invalidResponse("meta.locale is invalid.");
  if (apiVersion !== "v1") invalidResponse("meta.apiVersion is unsupported.");
  return { apiVersion, locale, requestId: safeRequestIdPattern.test(requestId) ? requestId : undefined };
}

export function parsePagination(value: unknown): ActivityCatalogPagination {
  const item = objectValue(value, "pagination");
  const nextOffset = item.nextOffset === null
    ? null
    : numberValue(item.nextOffset, "pagination.nextOffset", { integer: true, minimum: 0 });
  return {
    limit: numberValue(item.limit, "pagination.limit", { integer: true, minimum: 1 }),
    offset: numberValue(item.offset, "pagination.offset", { integer: true, minimum: 0 }),
    returned: numberValue(item.returned, "pagination.returned", { integer: true, minimum: 0 }),
    nextOffset
  };
}

export function parseActivitySearchResponse(value: unknown) {
  const response = objectValue(value, "response");
  return {
    data: arrayValue(response.data, "response.data").map(parseTrainingActivity),
    pagination: parsePagination(response.pagination),
    meta: parseResponseMeta(response.meta)
  };
}

export function parseActivityResponse(value: unknown) {
  const response = objectValue(value, "response");
  return { data: parseTrainingActivity(response.data), meta: parseResponseMeta(response.meta) };
}

export function parseAlternativesResponse(value: unknown) {
  const response = objectValue(value, "response");
  return { data: arrayValue(response.data, "response.data").map(parseActivityAlternative), meta: parseResponseMeta(response.meta) };
}

function parseSport(value: unknown, label: string): ActivityCatalogSport {
  const item = objectValue(value, label);
  return { ...parseTaxonomy(item, label), ...(item.description !== undefined ? { description: stringValue(item.description, `${label}.description`, { nullable: true }) } : {}) };
}

export function parseSportsResponse(value: unknown) {
  const response = objectValue(value, "response");
  return {
    data: arrayValue(response.data, "response.data").map((sport, index) => parseSport(sport, `response.data[${index}]`)),
    meta: parseResponseMeta(response.meta)
  };
}

function parseSessionType(value: unknown, label: string) {
  const item = objectValue(value, label);
  return { ...parseTaxonomy(item, label), sportId: uuidValue(item.sportId, `${label}.sportId`) };
}

function parseSessionPhase(value: unknown, label: string) {
  const item = objectValue(value, label);
  return {
    ...parseTaxonomy(item, label),
    sportId: uuidValue(item.sportId, `${label}.sportId`),
    isOptional: booleanValue(item.isOptional, `${label}.isOptional`)
  };
}

export function parseSportSessionTemplateResponse(value: unknown) {
  const response = objectValue(value, "response");
  const data = objectValue(response.data, "response.data");
  const template: ActivityCatalogSportSessionTemplate = {
    sport: parseSport(data.sport, "response.data.sport"),
    sessionTypes: arrayValue(data.sessionTypes, "response.data.sessionTypes").map((entry, index) => parseSessionType(entry, `response.data.sessionTypes[${index}]`)),
    sessionPhases: arrayValue(data.sessionPhases, "response.data.sessionPhases").map((entry, index) => parseSessionPhase(entry, `response.data.sessionPhases[${index}]`))
  };
  return { data: template, meta: parseResponseMeta(response.meta) };
}

export function parseFiltersResponse(value: unknown) {
  const response = objectValue(value, "response");
  const data = objectValue(response.data, "response.data");
  const filters: ActivityCatalogFilterOptions = {
    sports: arrayValue(data.sports, "filters.sports").map((entry, index) => parseTaxonomy(entry, `filters.sports[${index}]`)),
    activityTypes: arrayValue(data.activityTypes, "filters.activityTypes").map((entry, index) => parseTaxonomy(entry, `filters.activityTypes[${index}]`)),
    sessionTypes: arrayValue(data.sessionTypes, "filters.sessionTypes").map((entry, index) => parseSessionType(entry, `filters.sessionTypes[${index}]`)),
    sessionPhases: arrayValue(data.sessionPhases, "filters.sessionPhases").map((entry, index) => parseSessionPhase(entry, `filters.sessionPhases[${index}]`)),
    equipment: arrayValue(data.equipment, "filters.equipment").map((entry, index) => parseTaxonomy(entry, `filters.equipment[${index}]`)),
    trainingGoals: arrayValue(data.trainingGoals, "filters.trainingGoals").map((entry, index) => parseTaxonomy(entry, `filters.trainingGoals[${index}]`)),
    difficulties: arrayValue(data.difficulties, "filters.difficulties").map((entry, index) => stringValue(entry, `filters.difficulties[${index}]`, { nonEmpty: true }))
  };
  return { data: filters, meta: parseResponseMeta(response.meta) };
}

export function normalizeActivityCatalogBaseUrl(value: string, options: { allowLocalHttp?: boolean } = {}) {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash) throw new Error("unsafe URL components");
    if (url.protocol !== "https:" && !(options.allowLocalHttp && local && url.protocol === "http:")) throw new Error("unsafe URL scheme");
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    throw new ActivityCatalogError("configuration_error", { cause: error });
  }
}

export function validateActivityIdentifier(value: string) {
  const clean = value.trim();
  if (!clean || clean.length > 100 || !/^[A-Za-z0-9_-]+$/.test(clean)) throw new ActivityCatalogError("invalid_request");
  return clean;
}

export function validateActivityCatalogLocale(value: string | undefined) {
  const locale = value?.trim() || "en";
  if (!localePattern.test(locale)) throw new ActivityCatalogError("invalid_request");
  return locale;
}

export function validateActivityCatalogSlug(value: string, label = "slug") {
  const clean = value.trim();
  if (!slugPattern.test(clean) || clean.length > 100) throw new ActivityCatalogError("invalid_request", { message: `The activity catalog ${label} is invalid.` });
  return clean;
}

export function validateActivityCatalogSearchParams(params: ActivityCatalogSearchParams): ActivityCatalogSearchParams {
  const query = params.query?.trim();
  if (query && query.length > 100) throw new ActivityCatalogError("invalid_request");
  const limit = params.limit ?? 30;
  const offset = params.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
    throw new ActivityCatalogError("invalid_request");
  }
  const equipment = params.equipment?.map((item) => validateActivityCatalogSlug(item, "equipment"));
  return {
    ...(query ? { query } : {}),
    ...(params.sport ? { sport: validateActivityCatalogSlug(params.sport, "sport") } : {}),
    ...(params.sessionType ? { sessionType: validateActivityCatalogSlug(params.sessionType, "session type") } : {}),
    ...(params.phase ? { phase: validateActivityCatalogSlug(params.phase, "phase") } : {}),
    ...(params.activityType ? { activityType: validateActivityCatalogSlug(params.activityType, "activity type") } : {}),
    ...(params.difficulty ? { difficulty: params.difficulty } : {}),
    ...(equipment?.length ? { equipment: Array.from(new Set(equipment)).sort() } : {}),
    ...(params.goal ? { goal: validateActivityCatalogSlug(params.goal, "goal") } : {}),
    limit,
    offset,
    locale: validateActivityCatalogLocale(params.locale)
  };
}

export function safeUpstreamRequestId(value: string | null) {
  return value && safeRequestIdPattern.test(value) ? value : undefined;
}

export function optionalQueryValue(value: unknown, label: string) {
  return value === undefined ? undefined : optionalString(value, label);
}
