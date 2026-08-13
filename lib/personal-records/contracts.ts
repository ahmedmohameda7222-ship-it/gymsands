export type PersonalRecordComparisonDirection = "higher_better" | "lower_better" | "not_comparable";
export type PersonalRecordSource = "manual" | "verified";

export type PersonalRecordContextItem = {
  key: string;
  value: string | number;
  unit?: string | null;
};

export type PersonalRecordSubject = {
  identityKind: "catalog_activity" | "custom_subject" | "verified_activity" | "legacy_event";
  identity: string;
  name: string;
  sportDomain: string | null;
  sportName: string | null;
};

export type PersonalRecordDefinition = {
  id: string | null;
  key: string;
  version: string;
  label: string;
  comparisonDirection: PersonalRecordComparisonDirection;
  canonicalUnit: string;
};

export type CanonicalPersonalRecordEvent = {
  eventId: string;
  lineageId: string;
  subject: PersonalRecordSubject;
  definition: PersonalRecordDefinition;
  value: number;
  context: PersonalRecordContextItem[];
  achievedAt: string;
  rawAchievedAt: string;
  source: PersonalRecordSource;
  sourceWorkoutId: string | null;
  notes: string | null;
  editable: boolean;
  eventSemanticsVersion: string;
  editAuthority: {
    catalogRevisionId: string | null;
    authoritySnapshot: Record<string, unknown>;
  } | null;
};

export type PersonalRecordLineageSummary = {
  lineageId: string;
  subject: PersonalRecordSubject;
  definition: PersonalRecordDefinition;
  currentBest: CanonicalPersonalRecordEvent;
  previousBest: CanonicalPersonalRecordEvent | null;
};

export type PersonalRecordSportGroup = {
  sportDomain: string | null;
  sportName: string;
  records: PersonalRecordLineageSummary[];
};

export type PersonalRecordsNotice = {
  kind: "updating" | "stale";
  message: string;
};

export type PersonalRecordsMainResult = {
  latestAchievement: CanonicalPersonalRecordEvent | null;
  representedSports: Array<{ domain: string; name: string }>;
  groups: PersonalRecordSportGroup[];
  nextCursor: string | null;
  notices: PersonalRecordsNotice[];
};

export type PersonalRecordLineageDetail = {
  lineage: PersonalRecordLineageSummary;
  history: CanonicalPersonalRecordEvent[];
  selectedEventId: string | null;
  nextCursor: string | null;
};

export type ManualRecordDefinitionTemplate = PersonalRecordDefinition & {
  sports: string[];
  contextFields: Array<{
    key: string;
    label: string;
    unit: string | null;
    required: boolean;
    minimum?: number;
    maximum?: number;
  }>;
};

export const MANUAL_RECORD_DEFINITIONS: readonly ManualRecordDefinitionTemplate[] = [
  { id: "main:highest_load:v1", key: "highest_load", version: "1", label: "Highest load", comparisonDirection: "higher_better", canonicalUnit: "kg", sports: ["strength"], contextFields: [] },
  { id: "main:same_load_max_repetitions:v1", key: "same_load_max_repetitions", version: "1", label: "Most repetitions", comparisonDirection: "higher_better", canonicalUnit: "repetitions", sports: ["strength"], contextFields: [{ key: "external_load_kg", label: "Load", unit: "kg", required: true, minimum: 0, maximum: 2000 }] },
  { id: "main:longest_duration:v1", key: "longest_duration", version: "1", label: "Longest duration", comparisonDirection: "higher_better", canonicalUnit: "seconds", sports: ["running", "cycling", "swimming", "yoga", "mobility", "pilates", "other"], contextFields: [] },
  { id: "main:longest_distance:v1", key: "longest_distance", version: "1", label: "Longest distance", comparisonDirection: "higher_better", canonicalUnit: "meters", sports: ["running", "cycling", "swimming", "other"], contextFields: [] },
  { id: "main:fastest_time:v1", key: "fastest_time", version: "1", label: "Fastest time", comparisonDirection: "lower_better", canonicalUnit: "seconds", sports: ["running", "cycling", "swimming", "other"], contextFields: [{ key: "distance_meters", label: "Distance", unit: "meters", required: true, minimum: 1, maximum: 1000000 }] },
] as const;

export type ManualPersonalRecordInput = {
  eventId?: string | null;
  subject: {
    identityKind: "catalog_activity" | "custom_subject";
    identity: string;
    name: string;
    sportDomain: string;
    sportName: string;
    catalogRevisionId?: string | null;
    authoritySnapshot?: Record<string, unknown>;
  };
  definition: PersonalRecordDefinition;
  value: number;
  context: Record<string, string | number>;
  achievedAt: string;
  notes?: string | null;
};

export type PersonalRecordsApiError = {
  error: string;
  code: string;
};
