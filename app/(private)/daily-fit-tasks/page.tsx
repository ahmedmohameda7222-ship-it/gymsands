import { PageHeading } from "@/components/layout/page-heading";
import { DailyFitTasksPageClient } from "@/components/lifestyle/daily-fit-tasks-page-client";

export default function DailyFitTasksPage() {
  return (
    <>
      <PageHeading title="Daily Fit Tasks" description="Add, edit, complete, and delete today's fitness tasks." />
      <DailyFitTasksPageClient />
    </>
  );
}
