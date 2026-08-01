import { SessionHistoryPage } from "@/components/workouts/history/session-history-page";

export default async function WorkoutHistorySessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <SessionHistoryPage source="performed" id={sessionId} />;
}
