import { AdaptiveOnboardingForm } from "@/components/onboarding/adaptive-onboarding-form";

export default function OnboardingPage() {
  return (
    <>
      <p className="sr-only">
        Connect ChatGPT with scoped permissions. Authorized Plaivra tools store and track confirmed fitness actions.
      </p>
      <AdaptiveOnboardingForm />
    </>
  );
}
