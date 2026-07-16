export type CatalogProviderMode = "legacy" | "external" | "external_with_legacy_fallback";

export type InstructionStep = {
  order: number;
  text: string;
};

export type MetricField = {
  key: string;
  label: string;
  type: "integer" | "number" | "text" | "boolean";
  unit?: string | null;
  required: boolean;
  [key: string]: unknown;
};

export type MetricSchema = {
  slug?: string;
  name?: string;
  fields?: MetricField[];
};

export type TaxonomyItem = {
  id: string;
  slug: string;
  name: string;
};

export type Sport = TaxonomyItem & { description?: string | null };
export type ActivitySport = TaxonomyItem & { isPrimary: boolean };
export type ActivitySessionType = TaxonomyItem & { sportId: string };
export type ActivitySessionPhase = TaxonomyItem & { sportId: string; isOptional: boolean };
export type ActivityEquipment = TaxonomyItem & { isRequired: boolean };
export type ActivityMuscle = TaxonomyItem & {
  bodyRegion?: string | null;
  role: "primary" | "secondary" | "stabilizer";
};
export type ActivityGoal = TaxonomyItem & { relevanceWeight: number };

export type LocalizedActivityContent = {
  name?: string | null;
  shortDescription?: string | null;
  instructions?: InstructionStep[];
};

export type TrainingActivity = {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string | null;
  instructions: InstructionStep[];
  difficulty: string | null;
  movementPattern: string | null;
  version: number | null;
  activityType: TaxonomyItem | null;
  metricSchema?: MetricSchema | null;
  sports: ActivitySport[];
  sessionTypes: ActivitySessionType[];
  sessionPhases: ActivitySessionPhase[];
  equipment: ActivityEquipment[];
  muscles: ActivityMuscle[];
  trainingGoals: ActivityGoal[];
  translations: Record<string, LocalizedActivityContent>;
  publishedAt?: string | null;
  updatedAt: string | null;
  /** Legacy-only compatibility metadata. External responses are not allowed to add these fields. */
  guideUrl?: string | null;
  videoUrl?: string | null;
  legacyIdentifier?: string | null;
  forceType?: string | null;
};

export type SportSessionTemplate = {
  sport: Sport;
  sessionTypes: ActivitySessionType[];
  sessionPhases: ActivitySessionPhase[];
};

export type ActivityCatalogFilters = {
  sports: TaxonomyItem[];
  activityTypes: TaxonomyItem[];
  sessionTypes: ActivitySessionType[];
  sessionPhases: ActivitySessionPhase[];
  equipment: TaxonomyItem[];
  trainingGoals: TaxonomyItem[];
  difficulties: string[];
  /** Legacy compatibility dimensions. External providers may omit these fields. */
  primaryMuscles?: TaxonomyItem[];
  secondaryMuscles?: TaxonomyItem[];
  muscleCategories?: TaxonomyItem[];
  movementPatterns?: TaxonomyItem[];
  forceTypes?: TaxonomyItem[];
};

export type ActivityAlternative = {
  sourceActivityId: string;
  alternativeActivityId: string;
  alternativeSlug: string;
  alternativeName: string;
  alternativeActivityTypeSlug?: string;
  alternativeDifficulty?: string | null;
  reasonCode: string;
  differenceSummary?: string | null;
  prescriptionTransfer: "full" | "partial" | "none";
  compatibilityScore: number;
  priority: number;
};

export type OffsetPagination = {
  limit: number;
  offset: number;
  returned: number;
  nextOffset?: number | null;
};

export type ResponseMeta = {
  apiVersion: "v1";
  locale: string;
  requestId: string;
};

export type CatalogRequestOptions = { locale?: string };

export type ActivitySearchParams = CatalogRequestOptions & {
  query?: string;
  sport?: string;
  sessionType?: string;
  phase?: string;
  activityType?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  equipment?: string[];
  goal?: string;
  /** Internal Plaivra compatibility filters. The external API contract does not support them. */
  primaryMuscle?: string;
  secondaryMuscle?: string;
  muscleCategory?: string;
  movementPattern?: string;
  forceType?: string;
  limit?: number;
  offset?: number;
};

export type PaginatedTrainingActivities = {
  activities: TrainingActivity[];
  pagination: OffsetPagination;
};

export type CatalogSourceMetadata = {
  source: "external" | "legacy";
  degraded: boolean;
  catalogVersion: string;
  locale?: string;
};

export type CatalogResult<T> = {
  data: T;
  meta: CatalogSourceMetadata;
};

export type CatalogHealth = {
  status: "ok" | "degraded";
  service: "plaivra-activity-catalog";
  apiVersion: "v1";
  database: "connected" | "unavailable";
};
