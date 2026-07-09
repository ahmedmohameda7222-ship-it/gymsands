import { PageHeading } from "@/components/layout/page-heading";
import { MyWorkoutPlans } from "@/components/workouts/my-workout-plans";

export default function MyPlansPage() {
  return (
    <>
      <PageHeading
        title="My workout"
        description="Start today's training, review the active week, and manage saved plans."
      />
      <MyWorkoutPlans />
    </>
  );
}
