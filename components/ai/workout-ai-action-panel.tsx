"use client";

import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { AiActionRequestDialog, type AiActionOption } from "@/components/ai/ai-action-request-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrainTranslation } from "@/lib/i18n/train";

export function WorkoutAiActionPanel({
  sourceType,
  sourceId,
  context,
  actions,
  compact = false
}: {
  sourceType: string;
  sourceId?: string | null;
  context: Record<string, unknown>;
  actions?: AiActionOption[];
  compact?: boolean;
}) {
  const { tr } = useTrainTranslation();
  const resolvedActions: AiActionOption[] = actions ?? [
    { type: "review_workout_session", label: tr("reviewThisSession"), description: tr("reviewSessionDescription") },
    { type: "adjust_next_workout", label: tr("adjustNextWorkout"), description: tr("adjustNextWorkoutDescription") },
    { type: "rebalance_week", label: tr("rebalanceThisWeek"), description: tr("rebalanceThisWeekDescription") },
    { type: "explain_progression", label: tr("explainProgression"), description: tr("explainProgressionDescription") },
    { type: "adjust_for_low_readiness", label: tr("makeTodayLighter"), description: tr("makeTodayLighterDescription") }
  ];
  if (compact) {
    return <AiActionRequestDialog actions={resolvedActions} sourceType={sourceType} sourceId={sourceId} context={context} title={tr("workoutRequest")} />;
  }

  return (
    <Card variant="glass" className="border-primary/20">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <CardTitle className="flex items-center gap-2 text-base"><OpenAiBlossom className="h-5 w-5 text-primary" /> {tr("chatGptWorkoutActions")}</CardTitle>
        <p className="text-sm text-muted-foreground">{tr("chatGptWorkoutDescription")}</p>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <AiActionRequestDialog actions={resolvedActions} sourceType={sourceType} sourceId={sourceId} context={context} title={tr("workoutRequest")} />
      </CardContent>
    </Card>
  );
}
