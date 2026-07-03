import { RecentAiActionRequests } from "@/components/ai/recent-ai-action-requests";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";

export default function ChatGptRequestsPage() {
  return (
    <SettingsPageShell
      title="ChatGPT requests"
      description="Find requests you prepared in Plaivra, copy them again, and keep their status up to date."
    >
      <RecentAiActionRequests />
    </SettingsPageShell>
  );
}
