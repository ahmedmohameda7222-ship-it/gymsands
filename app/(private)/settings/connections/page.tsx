"use client";

import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { AiPermissionsCard } from "@/components/settings/ai-permissions-card";
import {
  ChatGptActivityCard,
  ChatGptConnectionStatusHero,
  ChatGptSetupCard,
  ConnectionStatusCard
} from "@/components/settings/connected-apps";
import { useTranslation } from "@/lib/i18n/use-translation";

export default function ChatGptConnectionsSettingsPage() {
  const { t } = useTranslation();

  return (
    <SettingsPageShell title={t("settings.aiImports")} description={t("settings.aiPageDesc")}>
      <div className="space-y-4">
        <ChatGptConnectionStatusHero />
        <AiPermissionsCard />
        <ChatGptSetupCard />
        <ConnectionStatusCard />
        <ChatGptActivityCard />
      </div>
    </SettingsPageShell>
  );
}
