import { PageHeading } from "@/components/layout/page-heading";
import { ChatGptImportCard } from "@/components/shared/chatgpt-import-card";
import { MyWorkoutPlans } from "@/components/workouts/my-workout-plans";
import { Disclosure } from "@/components/ui/disclosure";

export default function MyPlansPage() {
  return (
    <>
      <PageHeading
        title="My workout"
        description="See today’s session, start training, or manage your saved plans."
      />
      <MyWorkoutPlans />
      <div className="mt-5">
        <Disclosure title="Import a plan from ChatGPT" description="Save a plan you already reviewed and approved in ChatGPT">
          <ChatGptImportCard mode="workout" />
        </Disclosure>
      </div>
    </>
  );
}
