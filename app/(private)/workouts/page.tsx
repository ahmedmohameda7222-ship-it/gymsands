import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutBrowser } from "@/components/workouts/workout-browser";

export default function WorkoutsPage() {
  return (
    <>
      <PageHeading title="Exercise Library" description="Browse exercises by muscle, equipment, and level." />
      <div className="space-y-6">
        <WorkoutBrowser />
      </div>
    </>
  );
}
