import { PageHeading } from "@/components/layout/page-heading";
import { PersonalRecordsTracker } from "@/components/lifestyle/wellness-trackers";

export default function PersonalRecordsPage() {
  return (
    <>
      <PageHeading title="Personal Records" description="Add, edit, sort, and delete exercise performance records." />
      <PersonalRecordsTracker />
    </>
  );
}
