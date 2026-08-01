import { currentMonthWorkoutHistoryRange, validateWorkoutHistoryDateRange } from "@/lib/workouts/history/date-range";
import { isUuid } from "@/lib/utils";
import type { WorkoutHistoryLifecycle, WorkoutHistoryListRequest, WorkoutHistorySort } from "@/types/workout-history";

export class WorkoutHistoryRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkoutHistoryRequestError";
    this.code = code;
  }
}

const STATUS_VALUES = new Set<WorkoutHistoryLifecycle>(["completed", "partial", "cancelled", "skipped"]);
const SORT_VALUES = new Set<WorkoutHistorySort>(["newest", "oldest", "longest_duration"]);

function listValues(params: URLSearchParams, key: string, max = 50): string[] | undefined {
  const values = params.getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.normalize("NFKC").trim())
    .filter(Boolean);
  if (!values.length) return undefined;
  if (values.length > max || values.some((value) => value.length > 120)) {
    throw new WorkoutHistoryRequestError("invalid_filters", "Workout History filters are invalid.");
  }
  return [...new Set(values)];
}

function uuidList(params: URLSearchParams, key: string): string[] | undefined {
  const values = listValues(params, key);
  if (values?.some((value) => !isUuid(value))) {
    throw new WorkoutHistoryRequestError("invalid_filters", "Workout History filters are invalid.");
  }
  return values;
}

const EXERCISE_IDENTITY = /^(?:global|custom):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$|^(?:provider|name):[^\u0000-\u001f\u007f]{1,200}$/iu;

function exerciseIdentityList(params: URLSearchParams, key: string): string[] | undefined {
  const values = listValues(params, key);
  if (values?.some((value) => !EXERCISE_IDENTITY.test(value))) {
    throw new WorkoutHistoryRequestError("invalid_filters", "Workout History filters are invalid.");
  }
  return values;
}

function normalizedSearch(value: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  if (normalized.length > 120 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new WorkoutHistoryRequestError("invalid_search", "Workout History search is invalid.");
  }
  return normalized;
}

export function parseWorkoutHistoryListRequest(url: URL, now = new Date()): WorkoutHistoryListRequest {
  const timezone = (url.searchParams.get("timezone") ?? "UTC").trim();
  let range;
  try {
    range = url.searchParams.has("from") || url.searchParams.has("to")
      ? validateWorkoutHistoryDateRange(
          url.searchParams.get("from") ?? "",
          url.searchParams.get("to") ?? "",
          timezone,
        )
      : currentMonthWorkoutHistoryRange(now, timezone);
  } catch {
    throw new WorkoutHistoryRequestError("invalid_period", "Workout History period is invalid.");
  }
  const limitValue = url.searchParams.get("limit");
  const limit = limitValue === null ? 20 : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new WorkoutHistoryRequestError("invalid_limit", "Workout History page size is invalid.");
  }
  const cursor = url.searchParams.get("cursor")?.trim() || undefined;
  if (cursor && cursor.length > 1024) {
    throw new WorkoutHistoryRequestError("invalid_cursor", "Workout History cursor is invalid.");
  }
  const statusValues = listValues(url.searchParams, "status", 4);
  if (statusValues?.some((value) => !STATUS_VALUES.has(value as WorkoutHistoryLifecycle))) {
    throw new WorkoutHistoryRequestError("invalid_filters", "Workout History status filter is invalid.");
  }
  const sortValue = (url.searchParams.get("sort") ?? "newest") as WorkoutHistorySort;
  if (!SORT_VALUES.has(sortValue)) {
    throw new WorkoutHistoryRequestError("invalid_sort", "Workout History sort is invalid.");
  }
  const progressValue = url.searchParams.get("progressOnly");
  if (progressValue !== null && progressValue !== "true" && progressValue !== "false") {
    throw new WorkoutHistoryRequestError("invalid_filters", "Workout History progress filter is invalid.");
  }
  return {
    ...range,
    cursor,
    limit,
    search: normalizedSearch(url.searchParams.get("search")),
    workoutTypes: listValues(url.searchParams, "workoutType"),
    muscleIds: listValues(url.searchParams, "muscleId"),
    exerciseIds: exerciseIdentityList(url.searchParams, "exerciseId"),
    planIds: uuidList(url.searchParams, "planId"),
    statuses: statusValues as WorkoutHistoryLifecycle[] | undefined,
    progressOnly: progressValue === "true" ? true : undefined,
    sort: sortValue,
  };
}

export function workoutHistoryRequestSearchParams(request: WorkoutHistoryListRequest): URLSearchParams {
  const params = new URLSearchParams({
    from: request.from,
    to: request.to,
    timezone: request.timezone,
    limit: String(request.limit ?? 20),
    sort: request.sort ?? "newest",
  });
  if (request.cursor) params.set("cursor", request.cursor);
  if (request.search) params.set("search", request.search);
  if (request.progressOnly) params.set("progressOnly", "true");
  for (const [key, values] of [
    ["workoutType", request.workoutTypes],
    ["muscleId", request.muscleIds],
    ["exerciseId", request.exerciseIds],
    ["planId", request.planIds],
    ["status", request.statuses],
  ] as const) {
    values?.forEach((value) => params.append(key, value));
  }
  return params;
}
