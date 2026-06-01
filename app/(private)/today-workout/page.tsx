import { PageHeading } from "@/components/layout/page-heading";
import { TodaysWorkout } from "@/components/workouts/todays-workout";

export default function TodayWorkoutPage() {
  return (
    <>
      <PageHeading title="Today's Workout" description="Start and complete the workout assigned by your default plan." />
      <TodaysWorkout />
    </>
  );
}
