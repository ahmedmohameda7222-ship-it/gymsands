import { PageHeading } from "@/components/layout/page-heading";
import { ChatGptImportCard } from "@/components/shared/chatgpt-import-card";
import { MyWorkoutPlans } from "@/components/workouts/my-workout-plans";

export default function MyPlansPage() {
  return (
    <>
      <PageHeading
        title="Workout Plans"
        description="ChatGPT-created plans are the recommended flow. FitLife stores, schedules, edits, and tracks the approved imported plan."
      />
      <div className="mb-5">
        <ChatGptImportCard mode="workout" />
      </div>
      <MyWorkoutPlans />
    </>
  );
}
