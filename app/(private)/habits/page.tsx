import { PageHeading } from "@/components/layout/page-heading";
import { HabitsTracker } from "@/components/lifestyle/wellness-trackers";

export default function HabitsPage() {
  return (
    <>
      <PageHeading title="Habits" description="Track daily fitness habits for water, steps, protein, sleep, workouts, and calories." />
      <HabitsTracker />
    </>
  );
}
