"use client";

import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { AiPermissionsCard } from "@/components/settings/ai-permissions-card";
import { ConnectedApps } from "@/components/settings/connected-apps";

export default function AiImportsSettingsPage() {
  return (
    <SettingsPageShell
      title="AI & Imports"
      description="Manage ChatGPT import, AI permissions, and active connections."
    >
      <div className="space-y-4">
        <AiPermissionsCard />
        <ConnectedApps />
      </div>

    </SettingsPageShell>
  );
}
