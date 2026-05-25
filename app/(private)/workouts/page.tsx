import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutBrowser } from "@/components/workouts/workout-browser";
import { WorkoutPlanBuilder } from "@/components/workouts/workout-plan-builder";
import { WorkoutHistory } from "@/components/workouts/workout-history";

export default function WorkoutsPage() {
  return (
    <>
      <PageHeading title="Workouts" description="Build a weekly workout plan, save it, start today's workout, and browse exercises by category." />
      <div className="space-y-6">
        <WorkoutPlanBuilder />
        <WorkoutHistory />
        <WorkoutBrowser />
      </div>
    </>
  );
}
