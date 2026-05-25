import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutBrowser } from "@/components/workouts/workout-browser";
import { WorkoutPlanBuilder } from "@/components/workouts/workout-plan-builder";

export default function WorkoutsPage() {
  return (
    <>
      <PageHeading title="Workouts" description="Choose workouts by category, view instructions, and build your own day-by-day plan." />
      <div className="space-y-6">
        <WorkoutPlanBuilder />
        <WorkoutBrowser />
      </div>
    </>
  );
}
