import { PageHeading } from "@/components/layout/page-heading";
import { ChatGptImportCard } from "@/components/shared/chatgpt-import-card";
import { MyWorkoutPlans } from "@/components/workouts/my-workout-plans";

export default function MyPlansPage() {
  return (
    <>
      <PageHeading
        title="Workout Plans"
        description="Manage your workout plans and import from ChatGPT."
      />
      <div className="mb-5">
        <ChatGptImportCard mode="workout" />
      </div>
      <MyWorkoutPlans />
    </>
  );
}
