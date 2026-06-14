import { PageHeading } from "@/components/layout/page-heading";
import { WellnessDashboard } from "@/components/lifestyle/wellness-trackers";

export default function WellnessPage() {
  return (
    <>
      <PageHeading title="Wellness" description="Daily checklist for habits, water, supplements, sleep, recovery, workouts, meals, and protein using real saved data." />
      <WellnessDashboard />
    </>
  );
}
