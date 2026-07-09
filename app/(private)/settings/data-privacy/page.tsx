"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Download, ExternalLink, Loader2, RotateCcw, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { type UserAppSettings } from "@/services/database/user-settings";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { InlineFeedback } from "@/components/motion";

type PrivacySettingKey =
  | "hideBodyWeightOnDashboard"
  | "hideCaloriesOnDashboard"
  | "hideProgressPhotos"
  | "hideProfileDetails"
  | "privateProfileMode";

type RouteStatus = {
  type: "info" | "error";
  message: string;
};

type ToggleStatus = RouteStatus & {
  key: PrivacySettingKey;
};

function DataPrivacySkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((item) => (
        <Card key={item} className="border-border/70">
          <CardContent className="space-y-3 p-4">
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted/70" />
            <div className="h-14 w-full rounded-2xl bg-muted/60" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function DataPrivacyPage() {
  const { settings, isLoadingSettings, isSavingSettings, saveError, updateSettings, resetSettings } = useUserSettings();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { session } = useAuth();
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();
  const [pendingSetting, setPendingSetting] = useState<PrivacySettingKey | null>(null);
  const [toggleStatus, setToggleStatus] = useState<ToggleStatus | null>(null);
  const [exportStatus, setExportStatus] = useState<RouteStatus | null>(null);
  const [isDownloadingExport, setIsDownloadingExport] = useState(false);
  const [resetStatus, setResetStatus] = useState<RouteStatus | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const hasLoadIssue = Boolean(saveError && !toggleStatus && !resetStatus);

  const privacyToggles: Array<{
    key: PrivacySettingKey;
    label: string;
    description: string;
  }> = [
    {
      key: "hideBodyWeightOnDashboard",
      label: t("settings.hideBodyWeight"),
      description: "Hide body weight on dashboard and summary cards. Saved body-weight data is not deleted."
    },
    {
      key: "hideCaloriesOnDashboard",
      label: t("settings.hideCalories"),
      description: "Hide calories on dashboard and nutrition summaries. Food logs and targets remain saved."
    },
    {
      key: "hideProgressPhotos",
      label: t("settings.hideProgressPhotos"),
      description: "Hide progress photos from the Progress route. Photos are not removed by this setting."
    },
    {
      key: "hideProfileDetails",
      label: t("settings.hideProfileDetails"),
      description: "Hide identifying profile details where Plaivra shows account or profile context."
    },
    {
      key: "privateProfileMode",
      label: t("settings.privateProfileMode"),
      description: "Use a more private profile display. This changes visibility, not stored account data."
    }
  ];

  async function downloadDataExport() {
    if (!session?.access_token) {
      const message = "Sign in again before downloading your data.";
      setExportStatus({ type: "error", message });
      toast({ title: "Sign in required", description: message });
      return;
    }

    setIsDownloadingExport(true);
    setExportStatus({ type: "info", message: "Preparing your private CSV export..." });
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
      const message = "CSV downloaded to this device. Treat it like a private health and account record.";
      setExportStatus({ type: "info", message });
      toast({ title: "CSV export ready", description: message });
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : "Please try again.";
      setExportStatus({ type: "error", message: `Export failed. No file was downloaded. ${message}` });
      toast({ title: "Export failed", description: message });
    } finally {
      setIsDownloadingExport(false);
    }
  }

  async function updateSetting<Key extends PrivacySettingKey>(key: Key, value: UserAppSettings[Key]) {
    setPendingSetting(key);
    setToggleStatus(null);
    try {
      await updateSettings({ [key]: value } as Partial<UserAppSettings>);
      const label = privacyToggles.find((item) => item.key === key)?.label ?? "Privacy setting";
      setToggleStatus({ key, type: "info", message: `${label} saved to your account.` });
    } catch {
      setToggleStatus({
        key,
        type: "error",
        message: "Settings save failed. Your previous setting was restored."
      });
    } finally {
      setPendingSetting(null);
    }
  }

  function requestResetSettings() {
    confirmAsk({
      title: "Reset display and privacy settings?",
      description:
        "This restores display, privacy, preference, and shortcut defaults. It does not delete logs, plans, meals, photos, progress, ChatGPT connections, or your account.",
      confirmLabel: "Reset settings",
      variant: "destructive",
      onConfirm: () => void handleResetSettings()
    });
  }

  async function handleResetSettings() {
    setIsResetting(true);
    setResetStatus({ type: "info", message: "Resetting display and privacy settings..." });
    try {
      await resetSettings();
      const message = "Settings reset to defaults. No logs, plans, meals, photos, or account data were deleted.";
      setResetStatus({ type: "info", message });
      toast({ title: t("common.resetSettings"), description: message });
    } catch (error) {
      setResetStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Settings could not be reset. Please try again."
      });
    } finally {
      setIsResetting(false);
    }
  }

  if (isLoadingSettings) {
    return (
      <SettingsPageShell title={t("settings.dataPrivacy")} description={t("settings.dataPrivacyDesc")}>
        <DataPrivacySkeleton />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title={t("settings.dataPrivacy")}
      description={t("settings.dataPrivacyDesc")}
    >
      {confirmDialog}

      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <Shield className="h-5 w-5 text-primary" /> Privacy visibility controls
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            These settings hide information in Plaivra UI. They do not delete saved data, remove exports, or change your account rights.
          </p>
          {hasLoadIssue ? (
            <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Settings could not be loaded. Defaults shown here may not be your saved choices. Reload before changing privacy settings.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.privacy")}</CardTitle>
          <CardDescription>Hide sensitive surfaces without deleting the underlying records.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {saveError ? (
            <InlineFeedback
              message={hasLoadIssue ? saveError : `Settings save failed. Your previous setting was restored. ${saveError}`}
              variant="error"
            />
          ) : null}

          {privacyToggles.map((item) => {
            const isPending = pendingSetting === item.key;
            const status = toggleStatus?.key === item.key ? toggleStatus : undefined;
            return (
              <SettingsToggleRow
                key={item.key}
                label={item.label}
                description={item.description}
                defaultOn={Boolean(settings[item.key])}
                disabled={isSavingSettings || Boolean(pendingSetting) || hasLoadIssue}
                status={isPending ? "pending" : status?.type === "error" ? "error" : status ? "saved" : undefined}
                statusText={isPending ? "Saving..." : status?.message}
                onChange={(value) => void updateSetting(item.key, value)}
              />
            );
          })}

          {hasLoadIssue ? (
            <Button type="button" variant="outline" onClick={() => window.location.reload()} className="min-h-12 w-full sm:w-auto">
              Reload settings
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Export Plaivra data</CardTitle>
          <CardDescription>
            Export CSV includes account, app settings, AI permissions, workouts, nutrition, hydration, progress, wellness, and redacted ChatGPT activity where available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 rounded-2xl border bg-card p-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Download className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-2">
              <p className="font-semibold text-foreground">Private CSV download</p>
              <p className="text-sm leading-6 text-muted-foreground">
                This file is saved locally by your browser. Anyone with access to the downloaded file may be able to read sensitive health, nutrition, workout, and account data.
              </p>
              <Button variant="outline" disabled={isDownloadingExport} onClick={() => void downloadDataExport()} className="min-h-12 w-full sm:w-auto">
                {isDownloadingExport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isDownloadingExport ? "Preparing..." : exportStatus?.type === "error" ? "Retry export CSV" : "Export CSV"}
              </Button>
            </div>
          </div>
          <InlineFeedback
            message={exportStatus?.message}
            variant={exportStatus?.type === "error" ? "error" : "info"}
            onClose={() => setExportStatus(null)}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Rights and help</CardTitle>
          <CardDescription>Review legal documents, contact the operator, or manage account-level privacy requests.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button asChild variant="outline" className="min-h-12 w-full sm:w-auto"><Link href="/legal/privacy" target="_blank">Privacy Policy <ExternalLink className="h-4 w-4" /></Link></Button>
          <Button asChild variant="outline" className="min-h-12 w-full sm:w-auto"><Link href="/legal/terms" target="_blank">Terms <ExternalLink className="h-4 w-4" /></Link></Button>
          <Button asChild variant="outline" className="min-h-12 w-full sm:w-auto"><a href="mailto:Ahmed.Mohamed04@outlook.de">Contact Ahmed Mohamed</a></Button>
          <Button asChild variant="outline" className="min-h-12 w-full sm:w-auto"><Link href="/settings/account">Account requests</Link></Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base">{t("common.resetSettings")}</CardTitle>
          <CardDescription>
            Reset settings restores display/privacy/preferences defaults. It does not delete logs, plans, meals, photos, ChatGPT connections, or your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 rounded-2xl border bg-card p-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <RotateCcw className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-2">
              <p className="font-semibold text-foreground">Reset app settings only</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Use this if privacy, display, or shortcut settings need a clean default. Saved training, meals, progress, and account data stay in Plaivra.
              </p>
              <Button variant="destructive" disabled={isResetting || isSavingSettings} onClick={requestResetSettings} className="min-h-12 w-full sm:w-auto">
                {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {isResetting ? "Resetting..." : t("common.resetSettings")}
              </Button>
            </div>
          </div>
          <InlineFeedback
            message={resetStatus?.message}
            variant={resetStatus?.type === "error" ? "error" : "info"}
            onClose={() => setResetStatus(null)}
          />
          {resetStatus?.type === "info" && resetStatus.message.startsWith("Settings reset") ? (
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Settings reset was applied to app preferences only.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </SettingsPageShell>
  );
}
