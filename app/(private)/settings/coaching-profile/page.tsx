import { PageHeading } from "@/components/layout/page-heading";
import { NutritionPreferenceCard, SafetyProfileCard } from "@/components/profile/execution-profiles";

export default function CoachingProfilePage() {
  return (
    <>
      <PageHeading title="Coaching Context" description="Optional safety, budget, and prep context for user-triggered ChatGPT requests." />
      <div className="space-y-4">
        <SafetyProfileCard />
        <NutritionPreferenceCard />
      </div>
    </>
  );
}
