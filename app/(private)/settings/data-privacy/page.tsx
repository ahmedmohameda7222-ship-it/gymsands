"use client";

import { useState } from "react";
import { Download, RotateCcw, Shield, Trash2, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { type PrivacySettings, usePrivacySettings } from "@/lib/settings/privacy-settings";

export default function DataPrivacyPage() {
  const { settings, setSettings } = usePrivacySettings();
  const [hasSaved, setHasSaved] = useState(false);

  function updateSetting<Key extends keyof PrivacySettings>(key: Key, value: PrivacySettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setHasSaved(true);
  }

  return (
    <SettingsPageShell
      title="Data & Privacy"
      description="Export, reset, privacy, and account data."
    >
      {/* Export data */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Export data</CardTitle>
          <CardDescription>Download your data in a portable format.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Export all data</span>
              </span>
            </span>
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Export workout data</span>
              </span>
            </span>
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Export nutrition data</span>
              </span>
            </span>
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Export progress data</span>
              </span>
            </span>
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reset data */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="text-base">Reset data</CardTitle>
          <CardDescription>Clear specific data without deleting your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <RotateCcw className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Reset workout history</span>
              </span>
            </span>
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <RotateCcw className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Reset nutrition history</span>
              </span>
            </span>
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <RotateCcw className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Reset progress history</span>
              </span>
            </span>
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <RotateCcw className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Reset onboarding</span>
              </span>
            </span>
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Privacy</CardTitle>
          <CardDescription>Control what sensitive details should stay hidden.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex min-h-[56px] items-center gap-3 rounded-2xl border bg-card p-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Privacy controls</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">Saved on this device.</span>
              </span>
            </span>
          </div>
          <SettingsToggleRow
            label="Hide body weight on dashboard"
            defaultOn={settings.hideBodyWeightOnDashboard}
            onChange={(value) => updateSetting("hideBodyWeightOnDashboard", value)}
          />
          <SettingsToggleRow
            label="Hide calories on dashboard"
            defaultOn={settings.hideCaloriesOnDashboard}
            onChange={(value) => updateSetting("hideCaloriesOnDashboard", value)}
          />
          <SettingsToggleRow
            label="Hide progress photos"
            defaultOn={settings.hideProgressPhotos}
            onChange={(value) => updateSetting("hideProgressPhotos", value)}
          />
          <SettingsToggleRow
            label="Hide profile details"
            defaultOn={settings.hideProfileDetails}
            onChange={(value) => updateSetting("hideProfileDetails", value)}
          />
          <SettingsToggleRow
            label="Private profile mode"
            defaultOn={settings.privateProfileMode}
            onChange={(value) => updateSetting("privateProfileMode", value)}
          />
          {hasSaved ? <p className="text-xs text-muted-foreground">Saved on this device.</p> : null}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="text-base">Danger zone</CardTitle>
          <CardDescription>Destructive actions that cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Delete all app data</span>
              </span>
            </span>
            <Button variant="destructive" disabled>
              Coming soon
            </Button>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Delete account</span>
              </span>
            </span>
            <Button variant="destructive" disabled>
              Coming soon
            </Button>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <LogOut className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Sign out from all devices</span>
              </span>
            </span>
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          </div>
        </CardContent>
      </Card>

    </SettingsPageShell>
  );
}
