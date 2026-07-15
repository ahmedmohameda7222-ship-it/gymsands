import { CatalogError } from "./errors";
import type {
  ActivityAlternative,
  ActivityCatalogFilters,
  ActivityEquipment,
  ActivityGoal,
  ActivityMuscle,
  ActivitySessionPhase,
  ActivitySessionType,
  ActivitySport,
  CatalogHealth,
  InstructionStep,
  LocalizedActivityContent,
  MetricField,
  MetricSchema,
  OffsetPagination,
  ResponseMeta,
  Sport,
  SportSessionTemplate,
  TaxonomyItem,
  TrainingActivity
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CATALOG_SLUG = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
export const CATALOG_LOCALE = /^[a-z]{2}(?:-[A-Z]{2})?$/;

function invalid(): never {
  throw new CatalogError("catalog_invalid_response");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) invalid();
}

function string(value: unknown, options?: { nullable?: false; nonempty?: boolean }): string;
function string(value: unknown, options: { nullable: true; nonempty?: boolean }): string | null;
function string(value: unknown, options: { nullable?: boolean; nonempty?: boolean } = {}): string | null {
  if (value === null && options.nullable) return null;
  if (typeof value !== "string" || (options.nonempty && !value.length)) invalid();
  return value;
}

function number(value: unknown, options: { integer?: boolean; min?: number } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid();
  if (options.integer && !Number.isInteger(value)) invalid();
  if (options.min !== undefined && value < options.min) invalid();
  return value;
}

function boolean(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

function array<T>(value: unknown, parser: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) invalid();
  return value.map(parser);
}

function uuid(value: unknown) {
  const parsed = string(value, { nonempty: true });
  if (!UUID.test(parsed)) invalid();
  return parsed;
}

function slug(value: unknown) {
  const parsed = string(value, { nonempty: true });
  if (parsed.length > 100 || !CATALOG_SLUG.test(parsed)) invalid();
  return parsed;
}

function dateTime(value: unknown, nullable = false) {
  if (value === null && nullable) return null;
  const parsed = string(value, { nonempty: true });
  if (!Number.isFinite(Date.parse(parsed))) invalid();
  return parsed;
}

export function parseInstructionStep(value: unknown): InstructionStep {
  const item = record(value);
  exact(item, ["order", "text"]);
  return { order: number(item.order, { integer: true, min: 1 }), text: string(item.text, { nonempty: true }) };
}

function parseMetricField(value: unknown): MetricField {
  const item = record(value);
  const type = string(item.type);
  if (!["integer", "number", "text", "boolean"].includes(type)) invalid();
  return {
    ...item,
    key: string(item.key),
    label: string(item.label),
    type: type as MetricField["type"],
    ...(item.unit === undefined ? {} : { unit: string(item.unit, { nullable: true }) }),
    required: boolean(item.required)
  };
}

function parseMetricSchema(value: unknown): MetricSchema | null {
  if (value === null) return null;
  const item = record(value);
  return {
    ...(item.slug === undefined ? {} : { slug: slug(item.slug) }),
    ...(item.name === undefined ? {} : { name: string(item.name) }),
    ...(item.fields === undefined ? {} : { fields: array(item.fields, parseMetricField) })
  };
}

function parseTaxonomy(value: unknown, extraKeys: readonly string[] = []): TaxonomyItem & Record<string, unknown> {
  const item = record(value);
  exact(item, ["id", "slug", "name", ...extraKeys]);
  return { ...item, id: uuid(item.id), slug: slug(item.slug), name: string(item.name) };
}

export function parseSport(value: unknown): Sport {
  const item = parseTaxonomy(value, ["description"]);
  return { id: item.id, slug: item.slug, name: item.name, ...(item.description === undefined ? {} : { description: string(item.description, { nullable: true }) }) };
}

function parseActivitySport(value: unknown): ActivitySport {
  const item = parseTaxonomy(value, ["isPrimary"]);
  return { id: item.id, slug: item.slug, name: item.name, isPrimary: boolean(item.isPrimary) };
}

function parseSessionType(value: unknown): ActivitySessionType {
  const item = parseTaxonomy(value, ["sportId"]);
  return { id: item.id, slug: item.slug, name: item.name, sportId: uuid(item.sportId) };
}

function parseSessionPhase(value: unknown): ActivitySessionPhase {
  const item = parseTaxonomy(value, ["sportId", "isOptional"]);
  return { id: item.id, slug: item.slug, name: item.name, sportId: uuid(item.sportId), isOptional: boolean(item.isOptional) };
}

function parseEquipment(value: unknown): ActivityEquipment {
  const item = parseTaxonomy(value, ["isRequired"]);
  return { id: item.id, slug: item.slug, name: item.name, isRequired: boolean(item.isRequired) };
}

function parseMuscle(value: unknown): ActivityMuscle {
  const item = parseTaxonomy(value, ["bodyRegion", "role"]);
  const role = string(item.role);
  if (!["primary", "secondary", "stabilizer"].includes(role)) invalid();
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    ...(item.bodyRegion === undefined ? {} : { bodyRegion: string(item.bodyRegion, { nullable: true }) }),
    role: role as ActivityMuscle["role"]
  };
}

function parseGoal(value: unknown): ActivityGoal {
  const item = parseTaxonomy(value, ["relevanceWeight"]);
  return { id: item.id, slug: item.slug, name: item.name, relevanceWeight: number(item.relevanceWeight, { integer: true, min: 0 }) };
}

function parseLocalizedContent(value: unknown): LocalizedActivityContent {
  const item = record(value);
  exact(item, ["name", "shortDescription", "instructions"]);
  return {
    ...(item.name === undefined ? {} : { name: string(item.name, { nullable: true }) }),
    ...(item.shortDescription === undefined ? {} : { shortDescription: string(item.shortDescription, { nullable: true }) }),
    ...(item.instructions === undefined ? {} : { instructions: array(item.instructions, parseInstructionStep) })
  };
}

export function parseTrainingActivity(value: unknown): TrainingActivity {
  const item = record(value);
  exact(item, [
    "id", "slug", "name", "shortDescription", "instructions", "difficulty", "movementPattern", "version",
    "activityType", "metricSchema", "sports", "sessionTypes", "sessionPhases", "equipment", "muscles",
    "trainingGoals", "translations", "publishedAt", "updatedAt"
  ]);
  const translations = record(item.translations);
  return {
    id: uuid(item.id),
    slug: slug(item.slug),
    name: string(item.name),
    ...(item.shortDescription === undefined ? {} : { shortDescription: string(item.shortDescription, { nullable: true }) }),
    instructions: array(item.instructions, parseInstructionStep),
    difficulty: string(item.difficulty, { nullable: true }),
    movementPattern: string(item.movementPattern, { nullable: true }),
    version: number(item.version, { integer: true, min: 1 }),
    activityType: parseTaxonomy(item.activityType),
    ...(item.metricSchema === undefined ? {} : { metricSchema: parseMetricSchema(item.metricSchema) }),
    sports: array(item.sports, parseActivitySport),
    sessionTypes: array(item.sessionTypes, parseSessionType),
    sessionPhases: array(item.sessionPhases, parseSessionPhase),
    equipment: array(item.equipment, parseEquipment),
    muscles: array(item.muscles, parseMuscle),
    trainingGoals: array(item.trainingGoals, parseGoal),
    translations: Object.fromEntries(Object.entries(translations).map(([locale, content]) => [locale, parseLocalizedContent(content)])),
    ...(item.publishedAt === undefined ? {} : { publishedAt: dateTime(item.publishedAt, true) }),
    updatedAt: dateTime(item.updatedAt) as string
  };
}

function parseResponseMeta(value: unknown): ResponseMeta {
  const item = record(value);
  const apiVersion = string(item.apiVersion);
  if (apiVersion !== "v1") invalid();
  return { apiVersion, locale: string(item.locale), requestId: string(item.requestId) };
}

function parsePagination(value: unknown): OffsetPagination {
  const item = record(value);
  return {
    limit: number(item.limit, { integer: true, min: 1 }),
    offset: number(item.offset, { integer: true, min: 0 }),
    returned: number(item.returned, { integer: true, min: 0 }),
    ...(item.nextOffset === undefined ? {} : { nextOffset: item.nextOffset === null ? null : number(item.nextOffset, { integer: true, min: 0 }) })
  };
}

export function parseSportSessionTemplate(value: unknown): SportSessionTemplate {
  const item = record(value);
  return { sport: parseSport(item.sport), sessionTypes: array(item.sessionTypes, parseSessionType), sessionPhases: array(item.sessionPhases, parseSessionPhase) };
}

export function parseFilters(value: unknown): ActivityCatalogFilters {
  const item = record(value);
  return {
    sports: array(item.sports, (entry) => parseTaxonomy(entry)),
    activityTypes: array(item.activityTypes, (entry) => parseTaxonomy(entry)),
    sessionTypes: array(item.sessionTypes, parseSessionType),
    sessionPhases: array(item.sessionPhases, parseSessionPhase),
    equipment: array(item.equipment, (entry) => parseTaxonomy(entry)),
    trainingGoals: array(item.trainingGoals, (entry) => parseTaxonomy(entry)),
    difficulties: array(item.difficulties, (entry) => string(entry))
  };
}

export function parseAlternative(value: unknown): ActivityAlternative {
  const item = record(value);
  const transfer = string(item.prescriptionTransfer);
  if (!["full", "partial", "none"].includes(transfer)) invalid();
  return {
    sourceActivityId: uuid(item.sourceActivityId),
    alternativeActivityId: uuid(item.alternativeActivityId),
    alternativeSlug: slug(item.alternativeSlug),
    alternativeName: string(item.alternativeName),
    ...(item.alternativeActivityTypeSlug === undefined ? {} : { alternativeActivityTypeSlug: slug(item.alternativeActivityTypeSlug) }),
    ...(item.alternativeDifficulty === undefined ? {} : { alternativeDifficulty: string(item.alternativeDifficulty, { nullable: true }) }),
    reasonCode: string(item.reasonCode),
    ...(item.differenceSummary === undefined ? {} : { differenceSummary: string(item.differenceSummary, { nullable: true }) }),
    prescriptionTransfer: transfer as ActivityAlternative["prescriptionTransfer"],
    compatibilityScore: number(item.compatibilityScore, { min: 0 }),
    priority: number(item.priority, { integer: true, min: 0 })
  };
}

export function parseHealth(value: unknown): CatalogHealth {
  const item = record(value);
  if (!["ok", "degraded"].includes(String(item.status)) || item.service !== "plaivra-activity-catalog" || item.apiVersion !== "v1" || !["connected", "unavailable"].includes(String(item.database))) invalid();
  return item as CatalogHealth;
}

export function parseEnvelope<T>(value: unknown, parseData: (data: unknown) => T) {
  const item = record(value);
  return { data: parseData(item.data), meta: parseResponseMeta(item.meta) };
}

export function parseSearchEnvelope(value: unknown) {
  const item = record(value);
  return { data: array(item.data, parseTrainingActivity), pagination: parsePagination(item.pagination), meta: parseResponseMeta(item.meta) };
}

export const parseSportsEnvelope = (value: unknown) => parseEnvelope(value, (data) => array(data, parseSport));
export const parseTemplateEnvelope = (value: unknown) => parseEnvelope(value, parseSportSessionTemplate);
export const parseFiltersEnvelope = (value: unknown) => parseEnvelope(value, parseFilters);
export const parseActivityEnvelope = (value: unknown) => parseEnvelope(value, parseTrainingActivity);
export const parseAlternativesEnvelope = (value: unknown) => parseEnvelope(value, (data) => array(data, parseAlternative));
