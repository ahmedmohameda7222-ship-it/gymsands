"use client";

import { useRef, useState } from "react";
import { FileDown, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReportLanguage } from "@/lib/reports/pdf/types";
import { WORKOUT_REPORT_UI_COPY } from "@/lib/reports/workout/copy";
import { downloadPerformedWorkoutReport } from "@/lib/reports/workout/download-client";

export function SessionReportDownloadButton(
  input: Readonly<{
    sessionId: string;
    sessionAt: string;
    accessToken: string;
    language: ReportLanguage;
    timezone: string;
  }>,
) {
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);
  const activeRequest = useRef(false);
  const copy = WORKOUT_REPORT_UI_COPY[input.language];

  async function download() {
    if (activeRequest.current) return;
    activeRequest.current = true;
    setPreparing(true);
    setFailed(false);
    try {
      await downloadPerformedWorkoutReport(input);
    } catch {
      setFailed(true);
    } finally {
      activeRequest.current = false;
      setPreparing(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full sm:w-auto"
        disabled={preparing}
        aria-busy={preparing}
        data-workout-report-download
        onClick={() => void download()}
      >
        {preparing ? (
          <LoaderCircle
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          <FileDown className="size-4" aria-hidden="true" />
        )}
        {preparing ? copy.preparing : copy.download}
      </Button>
      {failed ? (
        <p
          role="alert"
          className="max-w-sm text-sm text-destructive sm:text-end"
        >
          <span className="font-medium">{copy.failedTitle}</span>{" "}
          <span>{copy.failedDescription}</span>
        </p>
      ) : null}
    </div>
  );
}
