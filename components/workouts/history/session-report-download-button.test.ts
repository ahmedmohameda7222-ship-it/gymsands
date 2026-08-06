import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "components/workouts/history/session-report-download-button.tsx",
  "utf8",
);
const detailSource = readFileSync(
  "components/workouts/history/session-history-page.tsx",
  "utf8",
);

describe("P8A report action UI contract", () => {
  it("is a single performed-only localized outline action with busy protection", () => {
    expect(source).toContain("FileDown");
    expect(source).toContain('variant="outline"');
    expect(source).toContain('className="min-h-11 w-full sm:w-auto"');
    expect(source).toContain("activeRequest.current");
    expect(source).toContain("disabled={preparing}");
    expect(source).toContain("aria-busy={preparing}");
    expect(source).toContain("normalizeReportLanguage(input.language)");
    expect(source).toContain('value === "de" || value === "ar"');
    expect(source).toContain('? value : "en"');
    expect(source).toContain("WORKOUT_REPORT_UI_COPY[language]");
    expect(source).toContain(
      "downloadPerformedWorkoutReport({ ...input, language })",
    );
    expect(source).toContain("setFailed(false)");
    expect(source).toContain("setFailed(true)");
    expect(source).toContain('role="alert"');
    expect(source).toContain("copy.failedTitle");
    expect(source).toContain("copy.failedDescription");
    expect(source).not.toContain("useToast");
    expect(detailSource).toContain(
      'detail.activity.sourceKind === "performed"',
    );
    expect(detailSource).toContain("<SessionReportDownloadButton");
    expect(detailSource.match(/data-workout-report-download/gu)).toBeNull();
  });
});
