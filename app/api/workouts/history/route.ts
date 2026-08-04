import { NextResponse } from "next/server";

import {
  WORKOUT_HISTORY_HEADERS,
  boundedWorkoutHistoryDuration,
  withWorkoutHistoryHeaders,
  workoutHistoryError,
  workoutHistoryServerTiming,
} from "@/app/api/workouts/history/_shared";
import { requireUser, serverEnv } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import {
  REQUEST_ID_HEADER,
  resolveOperationalCorrelationId,
} from "@/lib/observability/correlation-id";
import { logOperationalEvent } from "@/lib/observability/structured-log";
import {
  parseWorkoutHistoryListRequest,
  WorkoutHistoryRequestError,
} from "@/lib/workouts/history/request";
import { readWorkoutHistoryFilterOptions } from "@/services/workouts/history/filter-options";
import { listWorkoutHistoryKeyset } from "@/services/workouts/history/server-list-reader";
import { WorkoutHistoryReaderError } from "@/services/workouts/history/server-reader";

export const runtime = "nodejs";

type Operation = "first_page" | "cursor_page";
type Outcome = "success" | "failed_closed" | "invalid_request" | "rejected";

function operationFor(cursor: string | null | undefined): Operation {
  return cursor ? "cursor_page" : "first_page";
}

function safeResultCount(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !("items" in value) ||
    !Array.isArray(value.items)
  ) {
    return undefined;
  }
  return Math.min(100, value.items.length);
}

function safeErrorCode(error: unknown) {
  return error instanceof WorkoutHistoryReaderError
    ? error.code
    : "history_unavailable";
}

function logCompletion({
  requestId,
  operation,
  outcome,
  startedAt,
  errorCode,
  resultCount,
}: {
  requestId: string;
  operation: Operation;
  outcome: Outcome;
  startedAt: number;
  errorCode?: string;
  resultCount?: number;
}) {
  logOperationalEvent({
    event: "workout_history_list_request_completed",
    level:
      outcome === "success"
        ? "info"
        : outcome === "rejected" || outcome === "invalid_request"
          ? "warn"
          : "error",
    request_id: requestId,
    operation,
    outcome,
    duration_ms: boundedWorkoutHistoryDuration(performance.now() - startedAt),
    error_code: errorCode,
    result_count: resultCount,
  });
}

async function measured<T>(work: () => Promise<T>) {
  const startedAt = performance.now();
  const value = await work();
  return {
    value,
    durationMs: boundedWorkoutHistoryDuration(performance.now() - startedAt),
  };
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const requestId = resolveOperationalCorrelationId(
    request.headers.get(REQUEST_ID_HEADER),
  );
  const limited = rateLimit(request, "workout-history-list", 60, 60_000);
  if (limited) {
    logCompletion({
      requestId,
      operation: new URL(request.url).searchParams.has("cursor")
        ? "cursor_page"
        : "first_page",
      outcome: "rejected",
      startedAt,
    });
    return withWorkoutHistoryHeaders(limited, requestId);
  }

  let input;
  try {
    input = parseWorkoutHistoryListRequest(new URL(request.url));
  } catch (error) {
    if (error instanceof WorkoutHistoryRequestError) {
      logCompletion({
        requestId,
        operation: "first_page",
        outcome: "invalid_request",
        startedAt,
        errorCode: error.code,
      });
      return withWorkoutHistoryHeaders(
        NextResponse.json(
          { error: error.message, code: error.code },
          { status: 400, headers: WORKOUT_HISTORY_HEADERS },
        ),
        requestId,
      );
    }
    logCompletion({
      requestId,
      operation: "first_page",
      outcome: "failed_closed",
      startedAt,
      errorCode: "history_unavailable",
    });
    return workoutHistoryError(error, {
      requestId,
      totalDurationMs: performance.now() - startedAt,
    });
  }

  const operation = operationFor(input.cursor);
  let context;
  try {
    context = await requireUser(request);
  } catch {
    logCompletion({
      requestId,
      operation,
      outcome: "failed_closed",
      startedAt,
      errorCode: "history_unavailable",
    });
    return workoutHistoryError(undefined, {
      requestId,
      totalDurationMs: performance.now() - startedAt,
    });
  }

  if (context instanceof NextResponse) {
    logCompletion({
      requestId,
      operation,
      outcome: "rejected",
      startedAt,
    });
    return withWorkoutHistoryHeaders(context, requestId);
  }

  try {
    if (!serverEnv.workoutHistoryCursorSecret) {
      throw new WorkoutHistoryReaderError(
        "history_unavailable",
        "Workout history could not load.",
        503,
      );
    }

    const listPromise = measured(() =>
      listWorkoutHistoryKeyset(
        context.supabase,
        context.user.id,
        input,
        serverEnv.workoutHistoryCursorSecret,
      ),
    );
    const filtersPromise = input.cursor
      ? Promise.resolve(null)
      : measured(() =>
          readWorkoutHistoryFilterOptions(
            context.supabase,
            context.user.id,
            input,
          ),
        );

    const [listResult, filtersResult] = await Promise.all([
      listPromise,
      filtersPromise,
    ]);
    const response = listResult.value;
    const periodOptions = filtersResult?.value ?? null;
    const resultCount = safeResultCount(response);

    logCompletion({
      requestId,
      operation,
      outcome: "success",
      startedAt,
      resultCount,
    });

    return withWorkoutHistoryHeaders(
      NextResponse.json(
        periodOptions ? { ...response, filterOptions: periodOptions } : response,
      ),
      requestId,
      workoutHistoryServerTiming({
        total: performance.now() - startedAt,
        list: listResult.durationMs,
        filters: filtersResult?.durationMs,
      }),
    );
  } catch (error) {
    logCompletion({
      requestId,
      operation,
      outcome: "failed_closed",
      startedAt,
      errorCode: safeErrorCode(error),
    });
    return workoutHistoryError(error, {
      requestId,
      totalDurationMs: performance.now() - startedAt,
    });
  }
}
