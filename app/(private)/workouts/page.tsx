import { PageHeading } from "@/components/layout/page-heading";
import { WorkoutBrowser } from "@/components/workouts/workout-browser";

export default function WorkoutsPage() {
  return (
    <>
      <PageHeading title="Exercise Library" description="Search and filter exercises by muscle, equipment, mechanics, force type, level, and secondary muscles." />
      <div className="space-y-6">
        <WorkoutBrowser />
      </div>
    </>
  );
}
