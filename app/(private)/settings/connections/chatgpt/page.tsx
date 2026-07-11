"use client";

import { ChatGptSetupFlow, TemporaryChatGptDeveloperSetupCard } from "@/components/settings/connected-apps";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { env } from "@/lib/env";

export default function ChatGptConnectionSetupPage() {
  return (
    <SettingsPageShell
      title="Connect Plaivra to ChatGPT"
      description="Choose limited permissions in Plaivra, then complete the OAuth connection from ChatGPT."
    >
      {env.manualChatGptSetupEnabled ? <TemporaryChatGptDeveloperSetupCard /> : <ChatGptSetupFlow />}
    </SettingsPageShell>
  );
}
