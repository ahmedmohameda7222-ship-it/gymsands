"use client";

import { Download, RotateCcw, Shield, Trash2, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";

export default function DataPrivacyPage() {
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
          <CardDescription>Manage your privacy settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Privacy controls</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">Coming soon</span>
              </span>
            </span>
          </div>
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
