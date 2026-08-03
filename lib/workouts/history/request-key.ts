import { workoutHistoryRequestSearchParams } from "@/lib/workouts/history/request";
import type {
  WorkoutHistoryLifecycle,
  WorkoutHistoryListRequest,
} from "@/types/workout-history";

const STATUS_ORDER: WorkoutHistoryLifecycle[] = [
  "completed",
  "partial",
  "cancelled",
  "skipped",
];

function normalizeText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function normalizeValues(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;
  const normalized = [
    ...new Set(
      values
        .map((value) => value.normalize("NFKC").trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right, "en"));
  return normalized.length ? normalized : undefined;
}

function normalizeStatuses(
  statuses: WorkoutHistoryLifecycle[] | undefined,
): WorkoutHistoryLifecycle[] | undefined {
  if (!statuses?.length) return undefined;
  const values = new Set(statuses);
  const normalized = STATUS_ORDER.filter((status) => values.has(status));
  return normalized.length ? normalized : undefined;
}

export function canonicalWorkoutHistoryListRequest(
  request: WorkoutHistoryListRequest,
  options: { includeCursor?: boolean } = {},
): WorkoutHistoryListRequest {
  const cursor =
    options.includeCursor === false
      ? undefined
      : normalizeText(request.cursor);

  return {
    from: request.from,
    to: request.to,
    timezone: request.timezone,
    cursor,
    limit: request.limit ?? 20,
    search: normalizeText(request.search),
    workoutTypes: normalizeValues(request.workoutTypes),
    muscleIds: normalizeValues(request.muscleIds),
    exerciseIds: normalizeValues(request.exerciseIds),
    planIds: normalizeValues(request.planIds),
    statuses: normalizeStatuses(request.statuses),
    progressOnly: request.progressOnly ? true : undefined,
    sort: request.sort ?? "newest",
  };
}

function serializedRequestKey(
  request: WorkoutHistoryListRequest,
  includeCursor: boolean,
): string {
  return workoutHistoryRequestSearchParams(
    canonicalWorkoutHistoryListRequest(request, { includeCursor }),
  ).toString();
}

export function workoutHistoryFirstPageRequestKey(
  ownerId: string,
  request: WorkoutHistoryListRequest,
): string {
  return `${ownerId}:${serializedRequestKey(request, false)}`;
}

export function workoutHistoryCursorRequestKey(
  ownerId: string,
  request: WorkoutHistoryListRequest,
): string {
  return `${ownerId}:${serializedRequestKey(request, true)}`;
}
