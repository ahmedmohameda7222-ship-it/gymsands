import { FitnessConstraintsCard, NutritionPreferenceCard } from "@/components/profile/execution-profiles";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function CoachingProfilePage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const params = await searchParams;
  const returnTo = params.returnTo?.startsWith("/workouts/session/") ? params.returnTo : "/settings";
  return (
    <SettingsPageShell
      title="ChatGPT context"
      description="Save reusable fitness and food context once. ChatGPT can read only the categories you authorize through your Plaivra connection."
      backHref={returnTo}
      backLabel={returnTo === "/settings" ? undefined : "Back to workout"}
    >
      <div className="space-y-4">
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="font-semibold text-foreground">Fitness goals and routine</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Your main profile stores goals, body context, training level, equipment, and routine. Keep it current so ChatGPT does not ask for the same information in every conversation.
              </p>
            </div>
            <Button asChild variant="outline"><Link href="/profile">Review fitness profile</Link></Button>
          </CardContent>
        </Card>
        <FitnessConstraintsCard />
        <NutritionPreferenceCard />
      </div>
    </SettingsPageShell>
  );
}
