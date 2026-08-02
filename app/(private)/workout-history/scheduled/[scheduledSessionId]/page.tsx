import { SessionHistoryPage } from "@/components/workouts/history/session-history-page";

export default async function ScheduledWorkoutHistorySessionPage({ params }: { params: Promise<{ scheduledSessionId: string }> }) {
  const { scheduledSessionId } = await params;
  return <SessionHistoryPage source="scheduled_fallback" id={scheduledSessionId} />;
}
