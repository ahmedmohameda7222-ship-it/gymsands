"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, ExternalLink, RotateCcw, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { type UserAppSettings } from "@/services/database/user-settings";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";

function SaveStatus({ hasSaved }: { hasSaved: boolean }) {
  const { t } = useTranslation();
  return hasSaved ? <p className="text-xs text-muted-foreground">{t("common.savedAccount")}</p> : null;
}

export default function DataPrivacyPage() {
  const { settings, isLoadingSettings, isSavingSettings, updateSettings, resetSettings } = useUserSettings();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { session } = useAuth();
  const [hasSaved, setHasSaved] = useState(false);
  const [isDownloadingExport, setIsDownloadingExport] = useState(false);

  async function downloadDataExport() {
    if (!session?.access_token) {
      toast({ title: "Sign in required", description: "Sign in again before downloading your data." });
      return;
    }
    setIsDownloadingExport(true);
    try {
      const response = await fetch("/api/user/data-export", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store"
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Your data export could not be generated.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `plaivra-data-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    toast({ title: "CSV export ready", description: "A private CSV copy of your Plaivra data was downloaded." });    } catch (downloadError) {
      toast({ title: "Export failed", description: downloadError instanceof Error ? downloadError.message : "Please try again." });
    } finally {
      setIsDownloadingExport(false);
    }
  }

  async function updateSetting<Key extends keyof UserAppSettings>(key: Key, value: UserAppSettings[Key]) {
    await updateSettings({ [key]: value } as Partial<UserAppSettings>);
    setHasSaved(true);
  }



  async function handleResetSettings() {
    await resetSettings();
    setHasSaved(true);
    toast({ title: t("common.resetSettings"), description: t("common.savedAccount") });
  }

  if (isLoadingSettings) {
    return (
      <SettingsPageShell title={t("settings.dataPrivacy")} description={t("settings.dataPrivacyDesc")}>
        <p className="text-sm text-muted-foreground">{t("common.loadingSettings")}</p>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title={t("settings.dataPrivacy")}
      description={t("settings.dataPrivacyDesc")}
    >
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.privacy")}</CardTitle>
          <CardDescription>{t("settings.privacyDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex min-h-[56px] items-center gap-3 rounded-2xl border bg-card p-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{t("settings.privacy")}</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">{t("settings.privacyHelper")}</span>
              </span>
            </span>
          </div>
          <SettingsToggleRow label={t("settings.hideBodyWeight")} defaultOn={settings.hideBodyWeightOnDashboard} onChange={(value) => void updateSetting("hideBodyWeightOnDashboard", value)} />
          <SettingsToggleRow label={t("settings.hideCalories")} defaultOn={settings.hideCaloriesOnDashboard} onChange={(value) => void updateSetting("hideCaloriesOnDashboard", value)} />
          <SettingsToggleRow label={t("settings.hideProgressPhotos")} defaultOn={settings.hideProgressPhotos} onChange={(value) => void updateSetting("hideProgressPhotos", value)} />
          <SettingsToggleRow label={t("settings.hideProfileDetails")} defaultOn={settings.hideProfileDetails} onChange={(value) => void updateSetting("hideProfileDetails", value)} />
          <SettingsToggleRow label={t("settings.privateProfileMode")} defaultOn={settings.privateProfileMode} onChange={(value) => void updateSetting("privateProfileMode", value)} />
          <SaveStatus hasSaved={hasSaved} />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Privacy information and contact</CardTitle>
          <CardDescription>Review how Plaivra handles sensitive fitness data or contact the individual operator about your rights.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/legal/privacy" target="_blank">Privacy Policy <ExternalLink className="h-4 w-4" /></Link></Button>
          <Button asChild variant="outline"><Link href="/legal/terms" target="_blank">Terms <ExternalLink className="h-4 w-4" /></Link></Button>
          <Button asChild variant="outline"><a href="mailto:Ahmed.Mohamed04@outlook.de">Contact Ahmed Mohamed</a></Button>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.safeActions")}</CardTitle>
          <CardDescription>{t("settings.safeActionsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Export Plaivra Data</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">Download a private CSV copy of your Plaivra account, workouts, meals, progress, and settings.</span>
              </span>
            </span>
            <Button variant="outline" disabled={isDownloadingExport} onClick={() => void downloadDataExport()}>{isDownloadingExport ? "Preparing…" : "Export CSV"}</Button>
          </div>
          <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{t("settings.exportSettings")}</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">{t("settings.exportSettingsDesc")}</span>
              </span>
            </span>
          </div>
          <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileArchive className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Request full data export</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">Submit a tracked request for a complete Plaivra data export.</span>
              </span>
            </span>
          </div>
          <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-card p-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Request account deletion</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">Creates a reviewable deletion request and revokes active ChatGPT access; it does not immediately delete your account or fitness data.</span>
              </span>
            </span>
          </div>
          <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <RotateCcw className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{t("common.resetSettings")}</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">{t("settings.resetSettingsDesc")}</span>
              </span>
            </span>
            <Button variant="outline" disabled={isSavingSettings} onClick={() => void handleResetSettings()}>{t("common.resetSettings")}</Button>
          </div>
        </CardContent>
      </Card>
    </SettingsPageShell>
  );
}
