"use client";

import { useState } from "react";
import { UserRound, Goal, ShieldAlert, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useToast } from "@/components/ui/toaster";

export default function AccountSettingsPage() {
  const { signOut, session } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);

  async function requestAccountDeletion() {
    if (!session?.access_token) {
      toast({ title: "Sign in required", description: "Sign in again before requesting account deletion." });
      return;
    }
    if (!window.confirm("Submit an account deletion request? This will not delete your account immediately.")) return;

    setIsRequestingDeletion(true);
    const response = await fetch("/api/user/privacy-requests", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ request_type: "deletion", message: "Submitted from Account settings." })
    });
    const data = await response.json().catch(() => ({}));
    setIsRequestingDeletion(false);
    toast({
      title: response.ok ? (data.already_exists ? "Request already pending" : "Deletion request submitted") : "Request not submitted",
      description: response.ok ? "Plaivra will review the request before any account data is removed." : data.error ?? "Please try again."
    });
  }

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

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <Trash2 className="h-5 w-5" /> Delete account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Submit a deletion request for review. Your account is not deleted immediately, and no service-role credential is exposed to the browser.
          </p>
          <Button variant="destructive" disabled={isRequestingDeletion} onClick={() => void requestAccountDeletion()}>
            {isRequestingDeletion ? "Submitting..." : "Request account deletion"}
          </Button>
        </CardContent>
      </Card>

    </SettingsPageShell>
  );
}
