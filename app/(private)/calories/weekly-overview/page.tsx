import { PageHeading } from "@/components/layout/page-heading";
import { WeeklyOverviewPage } from "@/components/meals/weekly-overview";

export default function CaloriesWeeklyOverviewPage() {
  return (
    <>
      <PageHeading title="Weekly Summary" description="Review weekly calories, daily completion status, and trained versus skipped days." />
      <WeeklyOverviewPage />
    </>
  );
}
