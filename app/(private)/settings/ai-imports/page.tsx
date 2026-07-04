"use client";

import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { AiPermissionsCard } from "@/components/settings/ai-permissions-card";
import { ChatGptSetupCard, ConnectionStatusCard } from "@/components/settings/connected-apps";
import { RecentAiActionRequests } from "@/components/ai/recent-ai-action-requests";
import { useTranslation } from "@/lib/i18n/use-translation";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function AiImportsSettingsPage() {
  const { t } = useTranslation();

  return (
    <SettingsPageShell
      title={t("settings.aiImports")}
      description={t("settings.aiPageDesc")}
    >
      <div className="space-y-4">
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <p className="flex items-center gap-2 font-semibold text-foreground"><ShieldCheck className="h-5 w-5 text-primary" /> You decide what reaches ChatGPT</p>
            <p className="text-sm leading-6 text-muted-foreground">Plaivra can use only the categories you allow, such as workouts, nutrition, meal plans, hydration, progress, or wellness.</p>
            <ul className="grid gap-2 text-sm text-foreground sm:grid-cols-3">
              <li className="rounded-[12px] border bg-card p-3"><span className="font-semibold">Permissions</span><span className="mt-1 block text-muted-foreground">Control what ChatGPT may view or change.</span></li>
              <li className="rounded-[12px] border bg-card p-3"><span className="font-semibold">Your approval</span><span className="mt-1 block text-muted-foreground">Plaivra never changes plans or logs silently.</span></li>
              <li className="rounded-[12px] border bg-card p-3"><span className="font-semibold">Revoke anytime</span><span className="mt-1 block text-muted-foreground">Disconnect below to stop existing ChatGPT access.</span></li>
            </ul>
          </CardContent>
        </Card>
        <ChatGptSetupCard />
        <RecentAiActionRequests limit={5} />
        <AiPermissionsCard />
        <ConnectionStatusCard />
      </div>

    </SettingsPageShell>
  );
}
