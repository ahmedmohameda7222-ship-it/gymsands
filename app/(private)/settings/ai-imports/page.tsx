"use client";

import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { AiPermissionsCard } from "@/components/settings/ai-permissions-card";
import { ChatGptActivityCard, ChatGptSetupCard, ConnectionStatusCard } from "@/components/settings/connected-apps";
import { RecentAiActionRequests } from "@/components/ai/recent-ai-action-requests";
import { Disclosure } from "@/components/ui/disclosure";
import { useTranslation } from "@/lib/i18n/use-translation";

export default function AiImportsSettingsPage() {
  const { t } = useTranslation();

  return (
    <SettingsPageShell
      title={t("settings.aiImports")}
      description={t("settings.aiPageDesc")}
    >
      <div className="space-y-4">
        <ChatGptSetupCard />
        <RecentAiActionRequests limit={5} />
        <AiPermissionsCard />
        <ConnectionStatusCard />
        <Disclosure title="Connection activity" description="See when ChatGPT used or was denied access to a Plaivra area">
          <ChatGptActivityCard />
        </Disclosure>
      </div>

    </SettingsPageShell>
  );
}
