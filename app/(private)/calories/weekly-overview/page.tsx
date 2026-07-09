import { PageHeading } from "@/components/layout/page-heading";
import { WeeklyOverviewPage } from "@/components/meals/weekly-overview";

export default function CaloriesWeeklyOverviewPage() {
  return (
    <>
      <PageHeading title="Fitness Reports" description="Read-only weekly and monthly reports with source coverage for workouts, nutrition, water, progress, habits, sleep, and PRs." />
      <WeeklyOverviewPage />
    </>
  );
}
