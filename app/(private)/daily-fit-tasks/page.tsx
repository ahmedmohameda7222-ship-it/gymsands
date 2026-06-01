import { PageHeading } from "@/components/layout/page-heading";
import { DailyFitTasksTracker } from "@/components/lifestyle/wellness-trackers";

export default function DailyFitTasksPage() {
  return (
    <>
      <PageHeading title="Daily Fit Tasks" description="Add, edit, complete, and delete today's fitness tasks." />
      <DailyFitTasksTracker />
    </>
  );
}
