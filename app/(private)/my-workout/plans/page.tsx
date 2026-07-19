import { MyWorkoutPlans } from "@/components/workouts/my-workout-plans";
import { TrainMuscleLoadEntry } from "@/components/workouts/train-muscle-load-entry";

export default function MyPlansPage() {
  return (
    <>
      <MyWorkoutPlans />
      <TrainMuscleLoadEntry />
    </>
  );
}
