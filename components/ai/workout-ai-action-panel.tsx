"use client";

import { Bot } from "lucide-react";
import { AiActionRequestDialog, type AiActionOption } from "@/components/ai/ai-action-request-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const workoutActions: AiActionOption[] = [
  { type: "review_workout_session", label: "Review this session", description: "Ask ChatGPT to review the logged session and explain practical next steps." },
  { type: "adjust_next_workout", label: "Adjust next workout", description: "Ask ChatGPT to recommend a change for the next workout using current performance." },
  { type: "rebalance_week", label: "Rebalance this week", description: "Ask ChatGPT to review the remaining week without silently moving sessions." },
  { type: "explain_progression", label: "Explain progression", description: "Ask ChatGPT to explain the saved performance and next-target options." },
  { type: "adjust_for_low_readiness", label: "Make today lighter", description: "Ask ChatGPT for a lighter version using current readiness and safety context." }
];

export function WorkoutAiActionPanel({
  sourceType,
  sourceId,
  context,
  actions = workoutActions,
  compact = false
}: {
  sourceType: string;
  sourceId?: string | null;
  context: Record<string, unknown>;
  actions?: AiActionOption[];
  compact?: boolean;
}) {
  if (compact) {
    return <AiActionRequestDialog actions={actions} sourceType={sourceType} sourceId={sourceId} context={context} title="Workout request" />;
  }

  return (
    <Card variant="glass" className="border-primary/20">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-5 w-5 text-primary" /> ChatGPT workout actions</CardTitle>
        <p className="text-sm text-muted-foreground">Use ChatGPT with your scoped Plaivra connection. Successful tool changes appear in Plaivra with direct correction controls.</p>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <AiActionRequestDialog actions={actions} sourceType={sourceType} sourceId={sourceId} context={context} title="Workout request" />
      </CardContent>
    </Card>
  );
}
