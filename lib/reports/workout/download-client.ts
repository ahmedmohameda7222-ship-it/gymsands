import type { ReportLanguage } from "@/lib/reports/pdf/types";

const SAFE_FILENAME = /^plaivra-workout-report-\d{4}-\d{2}-\d{2}\.pdf$/u;

export class WorkoutReportDownloadError extends Error {
  constructor() {
    super("Workout report download failed.");
    this.name = "WorkoutReportDownloadError";
  }
}

function localDateKey(value: string, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    const year = read("year");
    const month = read("month");
    const day = read("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

export function safeWorkoutReportFilename(sessionAt: string, timezone: string) {
  const dateKey = localDateKey(sessionAt, timezone) ?? "1970-01-01";
  return `plaivra-workout-report-${dateKey}.pdf`;
}

function filenameFromDisposition(value: string | null, fallback: string) {
  const match = value?.match(/filename="([^"]+)"/iu);
  return match && SAFE_FILENAME.test(match[1] ?? "") ? match[1]! : fallback;
}

export async function downloadPerformedWorkoutReport(
  input: Readonly<{
    sessionId: string;
    sessionAt: string;
    accessToken: string;
    language: ReportLanguage;
    timezone: string;
    fetchImpl?: typeof fetch;
    documentImpl?: Document;
    urlImpl?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  }>,
) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const documentImpl = input.documentImpl ?? document;
  const urlImpl = input.urlImpl ?? URL;
  const query = new URLSearchParams({
    language: input.language,
    timezone: input.timezone,
  });
  const response = await fetchImpl(
    `/api/workouts/history/performed/${encodeURIComponent(
      input.sessionId,
    )}/report?${query.toString()}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${input.accessToken}` },
      cache: "no-store",
    },
  );
  if (
    !response.ok ||
    !response.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/pdf")
  ) {
    throw new WorkoutReportDownloadError();
  }
  const blob = await response.blob();
  if (!blob.size) throw new WorkoutReportDownloadError();
  const objectUrl = urlImpl.createObjectURL(blob);
  let anchor: HTMLAnchorElement | null = null;
  try {
    anchor = documentImpl.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filenameFromDisposition(
      response.headers.get("content-disposition"),
      safeWorkoutReportFilename(input.sessionAt, input.timezone),
    );
    anchor.rel = "noopener";
    anchor.style.display = "none";
    documentImpl.body.append(anchor);
    anchor.click();
  } finally {
    anchor?.remove();
    urlImpl.revokeObjectURL(objectUrl);
  }
}
