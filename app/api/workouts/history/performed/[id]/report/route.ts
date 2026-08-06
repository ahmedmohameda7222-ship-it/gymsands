import { NextResponse } from "next/server";

import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { PdfReportError } from "@/lib/reports/pdf/errors";
import {
  REPORT_LANGUAGES,
  type ReportLanguage,
} from "@/lib/reports/pdf/types";
import { buildWorkoutReportModel } from "@/lib/reports/workout/model";
import { renderWorkoutReport } from "@/lib/reports/workout/render";
import { isUuid } from "@/lib/utils";
import {
  getWorkoutHistorySessionDetail,
  WorkoutHistoryReaderError,
} from "@/services/workouts/history/server-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const REPORT_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;

function withReportHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(REPORT_HEADERS).forEach(([key, value]) =>
    headers.set(key, value),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function reportError(message: string, code: string, status: number) {
  return withReportHeaders(
    NextResponse.json({ error: message, code }, { status }),
  );
}

function parseLanguage(url: URL): ReportLanguage | null {
  const values = url.searchParams.getAll("language");
  if (values.length !== 1) return null;
  const value = values[0];
  return REPORT_LANGUAGES.includes(value as ReportLanguage)
    ? (value as ReportLanguage)
    : null;
}

function parseTimezone(url: URL): string | null {
  const values = url.searchParams.getAll("timezone");
  if (values.length !== 1) return null;
  const value = values[0];
  if (!value || value.length > 100) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return null;
  }
}

function safeDate(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = read("year");
  const month = read("month");
  const day = read("day");
  if (!year || !month || !day) {
    throw new PdfReportError(
      "REPORT_GENERATION_FAILED",
      "The report date could not be formatted safely.",
    );
  }
  return `${year}-${month}-${day}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "workout-history-pdf-report", 12, 60_000);
  if (limited) return withReportHeaders(limited);

  const { id } = await params;
  if (!isUuid(id)) {
    return reportError(
      "Workout history item was not found.",
      "history_not_found",
      404,
    );
  }

  const url = new URL(request.url);
  const language = parseLanguage(url);
  const timezone = parseTimezone(url);
  if (!language) {
    return reportError(
      "The report language is invalid.",
      "report_invalid_language",
      400,
    );
  }
  if (!timezone) {
    return reportError(
      "The report timezone is invalid.",
      "report_invalid_timezone",
      400,
    );
  }

  const context = await requireUser(request);
  if (context instanceof NextResponse) return withReportHeaders(context);

  try {
    const detail = await getWorkoutHistorySessionDetail(
      context.supabase,
      context.user.id,
      id,
    );
    if (detail.activity.sourceKind !== "performed") {
      return reportError(
        "Workout history item was not found.",
        "history_not_found",
        404,
      );
    }
    const model = buildWorkoutReportModel({
      detail,
      language,
      timezone,
    });
    const report = await renderWorkoutReport(model);
    const filename = `plaivra-workout-report-${safeDate(
      detail.activity.effectiveAt,
      timezone,
    )}.pdf`;

    return new Response(Buffer.from(report.bytes), {
      status: 200,
      headers: {
        ...REPORT_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(report.byteCount),
      },
    });
  } catch (error) {
    if (error instanceof WorkoutHistoryReaderError) {
      return reportError(
        error.status === 404
          ? "Workout history item was not found."
          : "The workout report could not be prepared.",
        error.status === 404 ? "history_not_found" : "report_unavailable",
        error.status,
      );
    }
    if (error instanceof PdfReportError) {
      return reportError(
        error.code === "REPORT_TOO_LARGE"
          ? "The workout report is too large to generate safely."
          : "The workout report could not be prepared.",
        error.code,
        error.status,
      );
    }
    return reportError(
      "The workout report could not be prepared.",
      "report_unavailable",
      500,
    );
  }
}
