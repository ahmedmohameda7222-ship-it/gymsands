"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { useTrainTranslation } from "@/lib/i18n/train";
import type { ReportLanguage } from "@/lib/reports/pdf/types";
import { downloadPerformedWorkoutReport } from "@/lib/reports/workout/download-client";
import type { WorkoutHistorySessionDetailResponse } from "@/types/workout-history";

async function mutation(sessionId: string, action: "delete" | "restore", token: string, idempotencyKey: string) {
  const response = await fetch(`/api/workouts/history/${encodeURIComponent(sessionId)}/${action}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ idempotencyKey }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Workout history could not be updated.");
}

export function SessionHistoryMoreActions({
  detail,
  accessToken,
  language,
  timezone,
  formattedDate,
  onCorrect,
}: {
  detail: WorkoutHistorySessionDetailResponse;
  accessToken: string | null | undefined;
  language: string;
  timezone: string;
  formattedDate: string;
  onCorrect: () => void;
}) {
  const { tr } = useTrainTranslation();
  const { toast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const sessionId = detail.activity.canonicalSessionId;
  const canReport = Boolean(sessionId && accessToken && detail.activity.capabilities.downloadReport);
  const canCorrect = Boolean(sessionId && detail.activity.capabilities.correctSession);
  const canDelete = Boolean(sessionId && accessToken && detail.activity.capabilities.softDeleteSession);
  if (!canReport && !canCorrect && !canDelete) return null;

  async function download() {
    if (!sessionId || !accessToken || busy) return;
    setBusy(true);
    try {
      await downloadPerformedWorkoutReport({ sessionId, sessionAt: detail.activity.effectiveAt, accessToken, language: (language === "de" || language === "ar" ? language : "en") as ReportLanguage, timezone });
    } catch (error) {
      toast({ title: tr("historyReportFailed"), description: error instanceof Error ? error.message : tr("historyRetry"), variant: "error" });
    } finally { setBusy(false); }
  }

  async function restore(deleteKey: string) {
    if (!sessionId || !accessToken) return;
    try {
      await mutation(sessionId, "restore", accessToken, `history-restore:${deleteKey}`);
      toast({ title: tr("historyWorkoutRestored") });
    } catch (error) {
      toast({ title: tr("historyRestoreFailed"), description: error instanceof Error ? error.message : tr("historyRetry"), variant: "error" });
    }
  }

  function requestDelete() {
    if (!sessionId || !accessToken) return;
    confirm.ask({
      title: tr("historyDeleteWorkout"),
      description: tr("historyDeleteConfirmationWithDate", { title: detail.activity.title, date: formattedDate }),
      confirmLabel: tr("historyDeleteWorkout"),
      cancelLabel: tr("historyKeepWorkout"),
      variant: "destructive",
      onConfirm: () => {
        const deleteKey = crypto.randomUUID();
        setBusy(true);
        void mutation(sessionId, "delete", accessToken, `history-delete:${deleteKey}`).then(() => {
          toast({ title: tr("historyWorkoutDeleted"), description: tr("historyWorkoutDeletedDescription"), actionLabel: tr("historyUndo"), onAction: () => void restore(deleteKey) });
          router.push("/workout-history");
        }).catch((error) => toast({ title: tr("historyWorkoutDeleted"), description: error instanceof Error ? error.message : tr("historyRetry"), variant: "error" })).finally(() => setBusy(false));
      },
    });
  }

  return (
    <>
      <ActionMenu label={tr("historyMoreActions")} visibleLabel={tr("historyMoreActions")} disabled={busy}>
        {canReport ? <ActionMenuItem onSelect={() => void download()}>{tr("historyDownloadReport")}</ActionMenuItem> : null}
        {canCorrect ? <ActionMenuItem onSelect={onCorrect}>{tr("historyCorrectSession")}</ActionMenuItem> : null}
        {canDelete ? <ActionMenuItem destructive onSelect={requestDelete}>{tr("historyDeleteWorkout")}</ActionMenuItem> : null}
      </ActionMenu>
      {confirm.dialog}
    </>
  );
}
