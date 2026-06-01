import { PageHeading } from "@/components/layout/page-heading";
import { SupplementsTracker } from "@/components/lifestyle/wellness-trackers";

export default function SupplementsPage() {
  return (
    <>
      <PageHeading title="Supplements" description="Plan supplement dose, timing, reminders, and taken status." />
      <SupplementsTracker />
    </>
  );
}
