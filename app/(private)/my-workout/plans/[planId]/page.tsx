import { WorkoutPlanDetail } from "@/components/workouts/workout-plan-detail";
import { WorkoutPlanWeeklyMuscleLoad } from "@/components/workouts/workout-plan-weekly-muscle-load";

export default function MyPlanDetailPage() {
  return (
    <>
      <WorkoutPlanDetail />
      <WorkoutPlanWeeklyMuscleLoad />
    </>
  );
}
