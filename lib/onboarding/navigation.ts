export const ONBOARDING_RETURN_ROUTES = [
  "/profile",
  "/settings",
  "/settings/account"
] as const;

export type OnboardingReturnRoute = (typeof ONBOARDING_RETURN_ROUTES)[number];

export function resolveOnboardingReturnRoute(value: string | null | undefined): OnboardingReturnRoute {
  return ONBOARDING_RETURN_ROUTES.includes(value as OnboardingReturnRoute)
    ? (value as OnboardingReturnRoute)
    : "/settings";
}

export type OnboardingExitDecision = "exit" | "confirm";

export function onboardingExitDecision(dirty: boolean): OnboardingExitDecision {
  return dirty ? "confirm" : "exit";
}
