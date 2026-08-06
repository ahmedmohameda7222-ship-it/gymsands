"use client";

import { useRef, useState } from "react";
import { FileDown, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
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
  const { toast } = useToast();
  const [preparing, setPreparing] = useState(false);
  const activeRequest = useRef(false);
  const copy = WORKOUT_REPORT_UI_COPY[input.language];

  async function download() {
    if (activeRequest.current) return;
    activeRequest.current = true;
    setPreparing(true);
    try {
      await downloadPerformedWorkoutReport(input);
    } catch {
      toast({
        title: copy.failedTitle,
        description: copy.failedDescription,
        variant: "error",
      });
    } finally {
      activeRequest.current = false;
      setPreparing(false);
    }
  }

  return (
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
  );
}
