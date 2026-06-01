import { PageHeading } from "@/components/layout/page-heading";
import { SleepRecoveryTracker } from "@/components/lifestyle/wellness-trackers";

export default function SleepRecoveryPage() {
  return (
    <>
      <PageHeading title="Sleep & Recovery" description="Log sleep, fatigue, soreness, recovery level, and notes." />
      <SleepRecoveryTracker />
    </>
  );
}
