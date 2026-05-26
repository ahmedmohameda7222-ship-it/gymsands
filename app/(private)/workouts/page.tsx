import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutBrowser } from "@/components/workouts/workout-browser";

export default function WorkoutsPage() {
  return (
    <>
      <PageHeading title="Workouts" description="Browse the exercise library by category and open any workout when you need details." />
      <div className="space-y-6">
        <WorkoutBrowser />
      </div>
    </>
  );
}
