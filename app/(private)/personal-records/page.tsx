import { PageHeading } from "@/components/layout/page-heading";
import { PersonalRecordsInsights } from "@/components/lifestyle/personal-records-insights";
import { PersonalRecordsTracker } from "@/components/lifestyle/wellness-trackers";

export default function PersonalRecordsPage() {
  return (
    <>
      <PageHeading title="Personal Records" description="Track exercise performance records with real estimated 1RM insights." />
      <div className="space-y-4">
        <PersonalRecordsInsights />
        <PersonalRecordsTracker />
      </div>
    </>
  );
}
