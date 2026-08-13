import { PersonalRecordDetailPage } from "@/components/personal-records/personal-record-detail-page";

export default async function PersonalRecordLineagePage({ params, searchParams }: { params: Promise<{ lineageId: string }>; searchParams: Promise<{ event?: string }> }) {
  const [{ lineageId }, { event }] = await Promise.all([params, searchParams]);
  return <PersonalRecordDetailPage lineageId={lineageId} selectedEventId={event} />;
}
