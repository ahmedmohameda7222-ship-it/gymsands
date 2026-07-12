"use client";

import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { Button } from "@/components/ui/button";
import { buildAiActionSummary } from "@/components/ai/ai-action-summary";
import { useQuickChatGpt } from "@/components/ai/quick-chatgpt-provider";
import { cn } from "@/lib/utils";
import type { AiActionType, AiPermissionSection } from "@/types";
import type { ReactNode } from "react";

export type AiActionOption = {
  type: AiActionType;
  label: string;
  description: string;
};

function inferPermissionSection(sourceType: string): AiPermissionSection {
  if (sourceType.includes("workout") || sourceType.includes("exercise") || sourceType.includes("plan_exercise")) return "workouts";
  if (sourceType.includes("grocery") || sourceType.includes("meal")) return "meal_plans";
  if (sourceType.includes("food") || sourceType.includes("nutrition")) return "nutrition";
  if (sourceType.includes("wellness") || sourceType.includes("sleep") || sourceType.includes("habit")) return "wellness";
  return "progress";
}

function isWriteAction(type: AiActionType) {
  return !["review_week", "review_workout_session", "explain_progression"].includes(type);
}

function destination(section: AiPermissionSection) {
  const labels: Record<AiPermissionSection, string> = {
    workouts: "Workout Plan", nutrition: "Nutrition Log", meal_plans: "Meal Plan", hydration: "Hydration",
    wellness: "Wellness", progress: "Progress", profile: "Profile", settings: "Settings"
  };
  return labels[section];
}

export function AiActionRequestDialog({
  actions,
  sourceType,
  context,
  children,
  buttonVariant = "outline",
  permissionSection,
  className
}: {
  actions: AiActionOption[];
  sourceType: string;
  sourceId?: string | null;
  context: Record<string, unknown>;
  title?: string;
  children?: ReactNode;
  buttonVariant?: "default" | "outline" | "ghost";
  permissionSection?: AiPermissionSection;
  className?: string;
}) {
  const { openCustomPrompt } = useQuickChatGpt();
  const section = permissionSection ?? inferPermissionSection(sourceType);

  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      {actions.map((action) => (
        <Button
          key={action.type}
          type="button"
          variant={buttonVariant}
          size="sm"
          className={cn("min-h-11", className && "w-full")}
          onClick={() => {
            const summary = buildAiActionSummary(action.type, context);
            const write = isWriteAction(action.type);
            openCustomPrompt({
              id: `legacy-${action.type}`,
              title: action.label,
              description: action.description,
              prompt: `${action.description}\n\nUse only the authorized Plaivra context needed for this request. ${write ? "Show the proposed structured changes and do not save them until I explicitly confirm." : "Explain the result and do not change any Plaivra data."}`,
              permissionSections: [section],
              capability: write ? "write" : "read",
              destination: write ? destination(section) : undefined,
              contextChips: summary.slice(0, 4).map((row) => `${row.label}: ${row.value}`)
            });
          }}
        >
          <OpenAiBlossom className="h-4 w-4" />
          {action.label}
        </Button>
      ))}
      {children}
    </div>
  );
}
