"use client";

import { UserRound, Goal, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";

export default function AccountSettingsPage() {
  const { signOut } = useAuth();

  return (
    <SettingsPageShell
      title="Account"
      description="Manage your profile, fitness profile, and account session."
    >
      {/* Profile */}
      <SettingsSectionCard
        title="Profile"
        rows={[
          {
            icon: UserRound,
            title: "Profile",
            detail: "Update your name, account details, and profile information.",
            href: "/profile",
            action: "Open",
          },
        ]}
      />

      {/* Fitness profile */}
      <SettingsSectionCard
        title="Fitness profile"
        rows={[
          {
            icon: Goal,
            title: "Fitness profile",
            detail: "Edit goals, training availability, equipment, nutrition preferences, and limitations.",
            href: "/onboarding?edit=true",
            action: "Edit",
          },
        ]}
      />

      {/* Account session */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="text-base">Account session</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3">
            <span className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">
                  Account session
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  Sign out of FitLife Hub on this device.
                </span>
              </span>
            </span>
            <Button variant="destructive" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>

    </SettingsPageShell>
  );
}
