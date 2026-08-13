import { createHash } from "node:crypto";

import type {
  CanonicalPersonalRecordEvent,
  PersonalRecordContextItem,
  PersonalRecordDefinition,
  PersonalRecordLineageDetail,
  PersonalRecordLineageSummary,
  PersonalRecordsMainResult,
  PersonalRecordSubject,
} from "./contracts";

export type PersonalRecordSubjectRow = {
  id: string;
  identity_kind: "catalog_activity" | "custom_subject";
  identity_value: string;
  name_snapshot: string;
  sport_domain: string | null;
  sport_name_snapshot: string | null;
  catalog_revision_id?: string | null;
  authority_snapshot?: Record<string, unknown> | null;
};

export type PersonalRecordRawRow = {
  id: string;
  exercise_name: string;
  record_type: string;
  weight_kg: number | string | null;
  reps: number | null;
  record_date: string;
  notes: string | null;
  source_kind: "manual" | "workout_derived";
  exercise_identity_kind: string | null;
  exercise_identity: string | null;
  workout_session_id: string | null;
  exercise_log_id?: string | null;
  derived_record_type: string | null;
  record_value: number | string | null;
  record_unit: string | null;
  comparison_context_key: string | null;
  schema_version: number | null;
  formula_version: string | null;
  achieved_at: string | null;
  subject_id?: string | null;
  sport_domain?: string | null;
  sport_name_snapshot?: string | null;
  record_definition_id?: string | null;
  record_definition_key?: string | null;
  record_definition_version?: string | null;
  comparison_direction?: string | null;
  canonical_value?: number | string | null;
  canonical_unit?: string | null;
  comparison_context?: Record<string, unknown> | null;
  semantic_version?: string | null;
  effective_achieved_at?: string | null;
  event_semantics_version?: string | null;
  subject?: PersonalRecordSubjectRow | null;
};

const verifiedDefinitions: Record<string, Omit<PersonalRecordDefinition, "id" | "version">> = {
  highest_load: { key: "highest_load", label: "Highest load", comparisonDirection: "higher_better", canonicalUnit: "kg" },
  same_load_max_repetitions: { key: "same_load_max_repetitions", label: "Most repetitions", comparisonDirection: "higher_better", canonicalUnit: "repetitions" },
  estimated_one_rep_max: { key: "estimated_one_rep_max", label: "Estimated 1RM", comparisonDirection: "higher_better", canonicalUnit: "kg" },
  exercise_session_volume: { key: "exercise_session_volume", label: "Session volume", comparisonDirection: "higher_better", canonicalUnit: "kg_repetitions" },
};

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function stableObject(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

function opaqueLineageId(key: string): string {
  return `pr_${createHash("sha256").update(`plaivra-personal-record-lineage-v1:${key}`).digest("base64url").slice(0, 32)}`;
}

function legacyValue(row: PersonalRecordRawRow): number | null {
  return finite(row.canonical_value) ?? finite(row.record_value) ?? finite(row.weight_kg) ?? finite(row.reps);
}

function subjectFor(row: PersonalRecordRawRow): PersonalRecordSubject {
  if (row.subject) {
    return {
      identityKind: row.subject.identity_kind,
      identity: row.subject.identity_value,
      name: row.subject.name_snapshot,
      sportDomain: row.subject.sport_domain,
      sportName: row.subject.sport_name_snapshot,
    };
  }
  if (row.exercise_identity) {
    const verifiedStrength = row.source_kind === "workout_derived" && Boolean(verifiedDefinitions[row.derived_record_type ?? ""]);
    return {
      identityKind: "verified_activity",
      identity: row.exercise_identity,
      name: row.exercise_name,
      sportDomain: row.sport_domain ?? (verifiedStrength ? "strength" : null),
      sportName: row.sport_name_snapshot ?? (verifiedStrength ? "Strength" : null),
    };
  }
  return {
    identityKind: "legacy_event",
    identity: `legacy:${row.id}`,
    name: row.exercise_name,
    sportDomain: null,
    sportName: null,
  };
}

function definitionFor(row: PersonalRecordRawRow): PersonalRecordDefinition {
  const derived = row.derived_record_type ? verifiedDefinitions[row.derived_record_type] : null;
  const direction = row.comparison_direction;
  return {
    id: row.record_definition_id ?? (derived ? `verified:${derived.key}:${row.formula_version ?? "unknown"}` : null),
    key: row.record_definition_key ?? derived?.key ?? `legacy:${row.id}`,
    version: row.record_definition_version ?? row.formula_version ?? "legacy",
    label: derived?.label ?? row.record_type,
    comparisonDirection: direction === "higher_better" || direction === "lower_better" || direction === "not_comparable"
      ? direction
      : derived?.comparisonDirection ?? "not_comparable",
    canonicalUnit: row.canonical_unit ?? row.record_unit ?? derived?.canonicalUnit ?? (row.weight_kg !== null ? "kg" : row.reps !== null ? "repetitions" : "value"),
  };
}

function contextObject(row: PersonalRecordRawRow): Record<string, unknown> {
  if (row.comparison_context && typeof row.comparison_context === "object") return row.comparison_context;
  if (!row.comparison_context_key) return {};
  const result: Record<string, unknown> = {};
  for (const token of row.comparison_context_key.split("|")) {
    const separator = token.indexOf(":");
    if (separator < 1) continue;
    const key = token.slice(0, separator);
    const raw = token.slice(separator + 1);
    if (["resistance", "side", "set", "load", "assistance"].includes(key)) {
      const numeric = Number(raw);
      result[key] = Number.isFinite(numeric) ? numeric : raw;
    }
  }
  return result;
}

function contextItems(context: Record<string, unknown>): PersonalRecordContextItem[] {
  return Object.entries(context).sort(([left], [right]) => left.localeCompare(right)).flatMap(([key, value]) => {
    if (typeof value !== "string" && typeof value !== "number") return [];
    const unit = key.endsWith("_kg") || key === "load" || key === "assistance" ? "kg"
      : key.endsWith("_meters") ? "meters"
        : key.endsWith("_seconds") ? "seconds"
          : null;
    return [{ key, value, unit }];
  });
}

function comparableDefinitionVersion(definition: PersonalRecordDefinition): string {
  if (["highest_load", "same_load_max_repetitions", "estimated_one_rep_max", "exercise_session_volume"].includes(definition.key)
      && ["1", "wh6-v1"].includes(definition.version)) return "plaivra-strength-record-v1";
  return `${definition.id ?? definition.key}:${definition.version}`;
}

export function canonicalizePersonalRecordRows(rows: readonly PersonalRecordRawRow[]): CanonicalPersonalRecordEvent[] {
  const candidates = rows.flatMap((row) => {
    const value = legacyValue(row);
    if (value === null) return [];
    const subject = subjectFor(row);
    const definition = definitionFor(row);
    const context = contextObject(row);
    const achievedAt = row.effective_achieved_at ?? row.achieved_at ?? `${row.record_date}T12:00:00.000Z`;
    const lineageKey = subject.identityKind === "legacy_event" || definition.comparisonDirection === "not_comparable"
      ? `event:${row.id}`
      : [subject.identity, definition.key, comparableDefinitionVersion(definition), definition.comparisonDirection, definition.canonicalUnit, stableObject(context)].join("|");
    return [{
      eventId: row.id,
      lineageId: opaqueLineageId(lineageKey),
      subject,
      definition,
      value,
      context: contextItems(context),
      achievedAt,
      rawAchievedAt: row.achieved_at ?? `${row.record_date}T12:00:00.000Z`,
      source: row.source_kind === "workout_derived" ? "verified" as const : "manual" as const,
      sourceWorkoutId: row.source_kind === "workout_derived" ? row.workout_session_id : null,
      notes: row.notes,
      editable: row.source_kind === "manual",
      eventSemanticsVersion: row.event_semantics_version ?? (row.source_kind === "workout_derived" ? "wh6-historical-v1" : "manual-legacy-v1"),
      editAuthority: row.source_kind === "manual" && row.subject ? {
        catalogRevisionId: row.subject.catalog_revision_id ?? null,
        authoritySnapshot: row.subject.authority_snapshot ?? {},
      } : null,
    }];
  });

  const byLineage = new Map<string, CanonicalPersonalRecordEvent[]>();
  for (const candidate of candidates) {
    byLineage.set(candidate.lineageId, [...(byLineage.get(candidate.lineageId) ?? []), candidate]);
  }
  const canonical: CanonicalPersonalRecordEvent[] = [];
  for (const events of byLineage.values()) {
    const ordered = [...events].sort((left, right) => left.achievedAt.localeCompare(right.achievedAt) || left.eventId.localeCompare(right.eventId));
    let best: CanonicalPersonalRecordEvent | null = null;
    for (const event of ordered) {
      const better = !best
        || event.definition.comparisonDirection === "not_comparable"
        || (event.definition.comparisonDirection === "higher_better" && event.value > best.value)
        || (event.definition.comparisonDirection === "lower_better" && event.value < best.value);
      if (!better) continue;
      canonical.push(event);
      best = event;
    }
  }
  return canonical.sort((left, right) => right.achievedAt.localeCompare(left.achievedAt) || right.eventId.localeCompare(left.eventId));
}

function lineages(events: readonly CanonicalPersonalRecordEvent[]): PersonalRecordLineageSummary[] {
  const grouped = new Map<string, CanonicalPersonalRecordEvent[]>();
  for (const event of events) grouped.set(event.lineageId, [...(grouped.get(event.lineageId) ?? []), event]);
  return [...grouped.entries()].map(([lineageId, values]) => {
    const ordered = [...values].sort((left, right) => right.achievedAt.localeCompare(left.achievedAt) || right.eventId.localeCompare(left.eventId));
    return { lineageId, subject: ordered[0].subject, definition: ordered[0].definition, currentBest: ordered[0], previousBest: ordered[1] ?? null };
  }).sort((left, right) => right.currentBest.achievedAt.localeCompare(left.currentBest.achievedAt) || right.lineageId.localeCompare(left.lineageId));
}

type Cursor = { achievedAt: string; id: string };
function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}
function decodeCursor(cursor: string | null | undefined): Cursor | null {
  if (!cursor || cursor.length > 400) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<Cursor>;
    return typeof value.achievedAt === "string" && typeof value.id === "string" ? value as Cursor : null;
  } catch { return null; }
}
function afterCursor(at: string, id: string, cursor: Cursor | null) {
  return !cursor || at < cursor.achievedAt || (at === cursor.achievedAt && id.localeCompare(cursor.id) < 0);
}

export function projectPersonalRecordsMain(
  rows: readonly PersonalRecordRawRow[],
  options: { sport?: string | null; cursor?: string | null; limit?: number } = {},
): PersonalRecordsMainResult {
  const allEvents = canonicalizePersonalRecordRows(rows);
  const scopedEvents = options.sport ? allEvents.filter((event) => event.subject.sportDomain === options.sport) : allEvents;
  const current = lineages(scopedEvents);
  const cursor = decodeCursor(options.cursor);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const available = current.filter((item) => afterCursor(item.currentBest.achievedAt, item.lineageId, cursor));
  const page = available.slice(0, limit);
  const represented = new Map<string, string>();
  for (const event of allEvents) if (event.subject.sportDomain) represented.set(event.subject.sportDomain, event.subject.sportName ?? event.subject.sportDomain);
  const groups = new Map<string, PersonalRecordLineageSummary[]>();
  for (const item of page) {
    const key = item.subject.sportDomain ?? "__uncategorized__";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const sortedGroups = [...groups.entries()].sort(([left], [right]) => left === "__uncategorized__" ? 1 : right === "__uncategorized__" ? -1 : left.localeCompare(right));
  const next = available.length > limit ? page.at(-1) : null;
  return {
    latestAchievement: scopedEvents[0] ?? null,
    representedSports: [...represented.entries()].map(([domain, name]) => ({ domain, name })).sort((left, right) => left.name.localeCompare(right.name)),
    groups: sortedGroups.map(([sport, records]) => ({ sportDomain: sport === "__uncategorized__" ? null : sport, sportName: sport === "__uncategorized__" ? "Uncategorized" : records[0].subject.sportName ?? sport, records })),
    nextCursor: next ? encodeCursor({ achievedAt: next.currentBest.achievedAt, id: next.lineageId }) : null,
    notices: [],
  };
}

export function projectPersonalRecordDetail(
  rows: readonly PersonalRecordRawRow[],
  lineageId: string,
  options: { selectedEventId?: string | null; cursor?: string | null; limit?: number } = {},
): PersonalRecordLineageDetail | null {
  const events = canonicalizePersonalRecordRows(rows).filter((event) => event.lineageId === lineageId);
  if (!events.length) return null;
  const summary = lineages(events)[0];
  const cursor = decodeCursor(options.cursor);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const available = events.filter((event) => afterCursor(event.achievedAt, event.eventId, cursor));
  const history = available.slice(0, limit);
  const next = available.length > limit ? history.at(-1) : null;
  return {
    lineage: summary,
    history,
    selectedEventId: options.selectedEventId && events.some((event) => event.eventId === options.selectedEventId) ? options.selectedEventId : null,
    nextCursor: next ? encodeCursor({ achievedAt: next.achievedAt, id: next.eventId }) : null,
  };
}

export function projectExercisePerformance(rows: readonly PersonalRecordRawRow[], identities: readonly string[]) {
  const identitySet = new Set(identities);
  const events = canonicalizePersonalRecordRows(rows).filter((event) => identitySet.has(event.subject.identity));
  const current = lineages(events);
  const currentByKey = Object.fromEntries(current.map((item) => [item.definition.key, item.currentBest]));
  return {
    performed: rows.some((row) => Boolean(row.workout_session_id) && identitySet.has(row.exercise_identity ?? row.subject?.identity_value ?? "")),
    lastPerformedAt: rows.filter((row) => Boolean(row.workout_session_id) && identitySet.has(row.exercise_identity ?? row.subject?.identity_value ?? ""))
      .map((row) => row.effective_achieved_at ?? row.achieved_at ?? `${row.record_date}T12:00:00.000Z`).sort().at(-1) ?? null,
    highestLoad: currentByKey.highest_load ?? null,
    estimatedOneRepMax: currentByKey.estimated_one_rep_max ?? null,
    recentWorkoutId: events.find((event) => event.sourceWorkoutId)?.sourceWorkoutId ?? null,
  };
}
