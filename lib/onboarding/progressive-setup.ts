import { ONBOARDING_SECTIONS } from "@/lib/onboarding/adaptive-profile";

export const ONBOARDING_STEPS = ONBOARDING_SECTIONS;

export function clampOnboardingStep(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) return 0;
  return Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, parsed));
}
