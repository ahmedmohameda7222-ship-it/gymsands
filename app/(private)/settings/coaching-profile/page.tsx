import { NutritionPreferenceCard, SafetyProfileCard } from "@/components/profile/execution-profiles";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";

export default async function CoachingProfilePage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const params = await searchParams;
  const returnTo = params.returnTo?.startsWith("/workouts/session/") ? params.returnTo : "/settings";
  return (
    <SettingsPageShell title="Coaching context" description="Help ChatGPT understand your training safety, food preferences, budget, and cooking routine." backHref={returnTo} backLabel={returnTo === "/settings" ? undefined : "Back to workout"}>
      <div className="space-y-4">
        <SafetyProfileCard />
        <NutritionPreferenceCard />
      </div>
    </SettingsPageShell>
  );
}
