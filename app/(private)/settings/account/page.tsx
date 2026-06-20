"use client";

import { UserRound, Goal, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useTranslation } from "@/lib/i18n/use-translation";

export default function AccountSettingsPage() {
  const { signOut } = useAuth();
  const { t } = useTranslation();

  return (
    <SettingsPageShell
      title={t("settings.account")}
      description={t("settings.accountDesc")}
    >
      {/* Profile */}
      <SettingsSectionCard
        title={t("settings.profile")}
        rows={[
          {
            icon: UserRound,
            title: t("settings.profile"),
            detail: t("settings.profileDesc"),
            href: "/profile",
            action: t("common.open"),
          },
        ]}
      />

      {/* Fitness profile */}
      <SettingsSectionCard
        title={t("settings.fitnessProfile")}
        rows={[
          {
            icon: Goal,
            title: t("settings.fitnessProfile"),
            detail: t("settings.fitnessProfileDesc"),
            href: "/onboarding?edit=true",
            action: t("common.edit"),
          },
        ]}
      />

      {/* Account session */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.accountSession")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3">
            <span className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">
                  {t("settings.accountSession")}
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  {t("settings.signOutDevice")}
                </span>
              </span>
            </span>
            <Button variant="destructive" size="sm" onClick={() => signOut()}>
              {t("settings.signOut")}
            </Button>
          </div>
        </CardContent>
      </Card>

    </SettingsPageShell>
  );
}
