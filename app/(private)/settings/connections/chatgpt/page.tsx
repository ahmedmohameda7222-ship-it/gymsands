"use client";

import { ChatGptSetupFlow } from "@/components/settings/connected-apps";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";

export default function ChatGptConnectionSetupPage() {
  return (
    <SettingsPageShell
      title="Connect Plaivra to ChatGPT"
      description="Choose limited permissions in Plaivra, then complete the OAuth connection from ChatGPT."
    >
      <ChatGptSetupFlow />
    </SettingsPageShell>
  );
}
