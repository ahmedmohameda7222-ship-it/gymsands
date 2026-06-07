import { PageHeading } from "@/components/layout/page-heading";
import { ChatGptWorkoutPlans } from "@/components/workouts/chatgpt-workout-plans";

export default function WorkoutsPage() {
  return (
    <>
      <PageHeading
        title="Workout Plans"
        description="View and track workout plans created by ChatGPT. FitLife stores plans, sessions, and exercise logs but no longer generates plans internally."
      />
      <ChatGptWorkoutPlans />
    </>
  );
}
