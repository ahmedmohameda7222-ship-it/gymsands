"use client";

import { ChatGptSetupFlow } from "@/components/settings/connected-apps";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";

export default function ChatGptSetupPage() {
  return (
    <SettingsPageShell
      title="Set up ChatGPT import"
      description="Follow these steps carefully. The setup is done on the ChatGPT website."
    >
      <ChatGptSetupFlow />
    </SettingsPageShell>
  );
}
