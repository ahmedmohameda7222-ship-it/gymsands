import { PageHeading } from "@/components/layout/page-heading";
import { WeeklyOverviewPage } from "@/components/meals/weekly-overview";

export default function CaloriesWeeklyOverviewPage() {
  return (
    <>
      <PageHeading title="Fitness Reports" description="Weekly and monthly reports for workouts, nutrition, water, weight, measurements, habits, sleep, and PRs." />
      <WeeklyOverviewPage />
    </>
  );
}
