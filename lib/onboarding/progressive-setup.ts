import type { AiPermissionConfig } from "@/services/database/ai-permissions";

export const ONBOARDING_STEPS = [
  "Essentials",
  "Goal & schedule",
  "Optional constraints",
  "First outcome",
  "Connect & continue"
] as const;

export type FirstUsefulJob = "training_plan" | "nutrition_plan" | "daily_execution";

export const FIRST_USEFUL_JOBS: Record<
  FirstUsefulJob,
  { label: string; description: string; destination: string }
> = {
  training_plan: {
    label: "Create a training plan",
    description: "Start with a practical plan built around your goal, schedule, equipment, and optional constraints.",
    destination: "/my-workout/plans?first=true"
  },
  nutrition_plan: {
    label: "Plan meals for the week",
    description: "Start with a meal plan you can track, adjust, and turn into a grocery list.",
    destination: "/my-meal-plan?first=true"
  },
  daily_execution: {
    label: "Track today",
    description: "Start with today’s workout, food, hydration, and check-in controls.",
    destination: "/dashboard?first=true"
  }
};

const EMPTY_SECTIONS: AiPermissionConfig["sections"] = {
  workouts: { read: false, write: false },
  nutrition: { read: false, write: false },
  meal_plans: { read: false, write: false },
  hydration: { read: false, write: false },
  wellness: { read: false, write: false },
  progress: { read: false, write: false },
  profile: { read: false, write: false },
  settings: { read: false, write: false }
};

export function permissionsForFirstJob(job: FirstUsefulJob): AiPermissionConfig {
  const sections = structuredClone(EMPTY_SECTIONS);
  sections.profile.read = true;

  if (job === "training_plan") {
    sections.workouts = { read: true, write: true };
  } else if (job === "nutrition_plan") {
    sections.nutrition.read = true;
    sections.meal_plans = { read: true, write: true };
  } else {
    sections.workouts = { read: true, write: true };
    sections.nutrition = { read: true, write: true };
    sections.hydration = { read: true, write: true };
    sections.wellness = { read: true, write: true };
  }

  return { accessMode: "custom", sections };
}

export function clampOnboardingStep(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) return 0;
  return Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, parsed));
}
