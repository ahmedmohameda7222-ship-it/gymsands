export type ActivityCatalogSource = "external" | "legacy";

export type ActivityCatalogErrorCode =
  | "invalid_request"
  | "configuration_error"
  | "unavailable"
  | "timeout"
  | "rate_limited"
  | "upstream_unauthorized"
  | "upstream_forbidden"
  | "invalid_response"
  | "not_found";

export type ActivityCatalogTaxonomyItem = {
  id: string;
  slug: string;
  name: string;
};

export type ActivityCatalogSport = ActivityCatalogTaxonomyItem & {
  description?: string | null;
};

export type ActivityCatalogActivityType = ActivityCatalogTaxonomyItem;
export type ActivityCatalogEquipment = ActivityCatalogTaxonomyItem;
export type ActivityCatalogTrainingGoal = ActivityCatalogTaxonomyItem;

export type ActivityCatalogSessionType = ActivityCatalogTaxonomyItem & {
  sportId: string;
};

export type ActivityCatalogSessionPhase = ActivityCatalogTaxonomyItem & {
  sportId: string;
  isOptional: boolean;
};

export type TrainingActivityInstruction = {
  order: number;
  text: string;
};

export type TrainingActivityMetricField = {
  key: string;
  label: string;
  type: "integer" | "number" | "text" | "boolean";
  unit?: string | null;
  required: boolean;
};

export type TrainingActivityMetricSchema = {
  slug?: string;
  name?: string;
  fields?: TrainingActivityMetricField[];
};

export type TrainingActivitySport = ActivityCatalogTaxonomyItem & {
  isPrimary: boolean;
};

export type TrainingActivitySessionType = ActivityCatalogSessionType;

export type TrainingActivitySessionPhase = ActivityCatalogSessionPhase;

export type TrainingActivityEquipment = ActivityCatalogTaxonomyItem & {
  isRequired: boolean;
};

export type TrainingActivityMuscle = ActivityCatalogTaxonomyItem & {
  bodyRegion?: string | null;
  role: "primary" | "secondary" | "stabilizer";
};

export type TrainingActivityGoal = ActivityCatalogTaxonomyItem & {
  relevanceWeight: number;
};

export type LocalizedTrainingActivityContent = {
  name?: string | null;
  shortDescription?: string | null;
  instructions?: TrainingActivityInstruction[];
};

export type LegacyActivityMediaCompatibility = {
  exerciseUrl: string | null;
  videoUrl: string | null;
};

export type TrainingActivity = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  instructions: TrainingActivityInstruction[];
  difficulty: string | null;
  movementPattern: string | null;
  version: number;
  activityType: ActivityCatalogActivityType;
  metricSchema: TrainingActivityMetricSchema | null;
  sports: TrainingActivitySport[];
  sessionTypes: TrainingActivitySessionType[];
  sessionPhases: TrainingActivitySessionPhase[];
  equipment: TrainingActivityEquipment[];
  muscles: TrainingActivityMuscle[];
  trainingGoals: TrainingActivityGoal[];
  translations: Record<string, LocalizedTrainingActivityContent>;
  publishedAt: string | null;
  updatedAt: string | null;
  /** Internal-only legacy compatibility data. The external parser never accepts this field. */
  legacyMediaCompatibility?: LegacyActivityMediaCompatibility;
};

export type ActivityCatalogAlternative = {
  sourceActivityId: string;
  alternativeActivityId: string;
  alternativeSlug: string;
  alternativeName: string;
  alternativeActivityTypeSlug?: string;
  alternativeDifficulty: string | null;
  reasonCode: string;
  differenceSummary: string | null;
  prescriptionTransfer: "full" | "partial" | "none";
  compatibilityScore: number;
  priority: number;
};

export type ActivityCatalogSearchParams = {
  query?: string;
  sport?: string;
  sessionType?: string;
  phase?: string;
  activityType?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  equipment?: string[];
  goal?: string;
  limit?: number;
  offset?: number;
  locale?: string;
};

export type ActivityCatalogRequestOptions = {
  locale?: string;
  signal?: AbortSignal;
};

export type ActivityCatalogAlternativesOptions = ActivityCatalogRequestOptions & {
  limit?: number;
};

export type ActivityCatalogFilterOptions = {
  sports: ActivityCatalogTaxonomyItem[];
  activityTypes: ActivityCatalogTaxonomyItem[];
  sessionTypes: ActivityCatalogSessionType[];
  sessionPhases: ActivityCatalogSessionPhase[];
  equipment: ActivityCatalogTaxonomyItem[];
  trainingGoals: ActivityCatalogTaxonomyItem[];
  difficulties: string[];
};

export type ActivityCatalogSportSessionTemplate = {
  sport: ActivityCatalogSport;
  sessionTypes: ActivityCatalogSessionType[];
  sessionPhases: ActivityCatalogSessionPhase[];
};

export type ActivityCatalogPagination = {
  limit: number;
  offset: number;
  returned: number;
  nextOffset: number | null;
};

export type ActivityCatalogResultMeta = {
  source: ActivityCatalogSource;
  degraded: boolean;
  apiVersion: string;
  locale: string;
  requestId?: string;
  fallbackReason?: ActivityCatalogErrorCode;
};

export type ActivityCatalogResult<T> = {
  data: T;
  pagination?: ActivityCatalogPagination;
  meta: ActivityCatalogResultMeta;
};

export type ActivityCatalogProviderMode = "legacy" | "external" | "external_with_legacy_fallback";

export type ActivityCatalogWorkoutMetadata = {
  source: ActivityCatalogSource;
  activityId: string;
  slug: string;
  version: number;
  metricSchema: TrainingActivityMetricSchema | null;
};
