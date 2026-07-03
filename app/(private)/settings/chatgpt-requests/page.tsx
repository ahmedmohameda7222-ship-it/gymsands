import { RecentAiActionRequests } from "@/components/ai/recent-ai-action-requests";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";

export default function ChatGptRequestsPage() {
  return (
    <SettingsPageShell
      title="ChatGPT requests"
      description="These are requests you prepared for ChatGPT. Copy them again, continue, mark them done, or hide completed ones."
    >
      <RecentAiActionRequests />
    </SettingsPageShell>
  );
}
