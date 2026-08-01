"use client";

import { CopyPlus } from "lucide-react";

import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryCapabilities } from "@/types/workout-history";

export function SessionHistoryActions({ capabilities }: { capabilities: WorkoutHistoryCapabilities }) {
  const { tr } = useTrainTranslation();
  if (!capabilities.repeatWorkout && !capabilities.correctSession && !capabilities.softDeleteSession) return null;
  return (
    <section className="grid gap-2 sm:grid-cols-[1fr_auto]" aria-label={tr("historyMoreActions")} data-session-history-actions>
      {capabilities.repeatWorkout ? (
        <Button type="button" className="min-h-12" disabled title={tr("historyRepeatPending")}>
          <CopyPlus className="size-4" aria-hidden="true" />
          {tr("historyRepeatWorkout")}
        </Button>
      ) : <span />}
      <ActionMenu label={tr("historyMoreActions")} visibleLabel={tr("historyMoreActions")}>
        <ActionMenuItem disabled onSelect={() => undefined}>{tr("historyRepeatPending")}</ActionMenuItem>
      </ActionMenu>
    </section>
  );
}
