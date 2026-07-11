"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Goal, Loader2, RefreshCcw, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { InlineFeedback } from "@/components/motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCOUNT_DELETION_CONFIRMATION, ACCOUNT_DELETION_IMPACT_VERSION } from "@/lib/privacy/deletion-contract";

type PrivacyRequest = {
  id: string;
  request_type: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
  completed_at?: string | null;
};

type Feedback = {
  type: "info" | "error";
  message: string;
};

type DeletionJob = {
  id: string;
  state: string;
  stage: string;
  attempt_count: number;
  next_attempt_at?: string | null;
  last_error_code?: string | null;
  notification_status?: string | null;
  completed_at?: string | null;
};

function formatRequestDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

function requestStatusVariant(status: string) {
  if (status === "completed") return "success";
  if (status === "pending" || status === "in_progress") return "warning";
  return "outline";
}

export default function AccountSettingsPage() {
  const { signOut, session, user, profile, isLoading } = useAuth();
  const accessToken = session?.access_token;
  const { t } = useTranslation();
  const { toast } = useToast();
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutFeedback, setSignOutFeedback] = useState<Feedback | null>(null);
  const [privacyRequests, setPrivacyRequests] = useState<PrivacyRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [requestLoadError, setRequestLoadError] = useState("");
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);
  const [deletionFeedback, setDeletionFeedback] = useState<Feedback | null>(null);
  const [chatGptRevokeFeedback, setChatGptRevokeFeedback] = useState<Feedback | null>(null);
  const [deletionJob, setDeletionJob] = useState<DeletionJob | null>(null);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [deletionIdempotencyKey, setDeletionIdempotencyKey] = useState("");
  const [needsRecentSignIn, setNeedsRecentSignIn] = useState(false);

  useEffect(() => {
    setDeletionIdempotencyKey(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`);
  }, []);

  const loadPrivacyRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    setRequestLoadError("");
    if (!accessToken) {
      setPrivacyRequests([]);
      setRequestLoadError("Sign in again to load account privacy requests.");
      setIsLoadingRequests(false);
      return;
    }

    try {
      const response = await fetch("/api/user/privacy-requests", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Privacy request status could not be loaded.");
      setPrivacyRequests(Array.isArray(data.requests) ? data.requests : []);
      setDeletionJob(data.deletion_job ?? null);
    } catch (error) {
      setPrivacyRequests([]);
      setRequestLoadError(error instanceof Error ? error.message : "Privacy request status could not be loaded.");
    } finally {
      setIsLoadingRequests(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadPrivacyRequests();
  }, [loadPrivacyRequests]);

  const latestDeletionRequest = useMemo(
    () => privacyRequests.find((request) => request.request_type === "deletion") ?? null,
    [privacyRequests]
  );
  const hasActiveDeletionRequest = latestDeletionRequest
    ? latestDeletionRequest.status === "pending" || latestDeletionRequest.status === "in_progress"
    : false;
  const accountName = profile?.full_name?.trim() || user?.user_metadata?.full_name || "Plaivra member";
  const accountEmail = user?.email ?? profile?.email ?? "Email not available";

  async function handleSignOut() {
    setIsSigningOut(true);
    setSignOutFeedback({ type: "info", message: "Signing out of this device..." });
    try {
      await signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sign out. Try again.";
      setSignOutFeedback({ type: "error", message });
      setIsSigningOut(false);
    }
  }

  function requestDeletionConfirmation() {
    if (hasActiveDeletionRequest || deletionConfirmation !== ACCOUNT_DELETION_CONFIRMATION) return;
    confirmAsk({
      title: "Submit account deletion request?",
      description:
        "ChatGPT access is revoked immediately. After legal-hold checks, Plaivra disables access, deletes private storage, removes or anonymizes account data, and deletes the Auth account. This cannot be undone once processing begins.",
      confirmLabel: "Request deletion",
      variant: "destructive",
      onConfirm: () => void requestAccountDeletion()
    });
  }

  async function requestAccountDeletion() {
    if (!accessToken) {
      const message = "Sign in again before requesting account deletion.";
      setDeletionFeedback({ type: "error", message });
      toast({ title: "Sign in required", description: message });
      return;
    }

    setIsRequestingDeletion(true);
    setDeletionFeedback({ type: "info", message: "Submitting deletion request..." });
    setChatGptRevokeFeedback(null);
    try {
      const response = await fetch("/api/user/privacy-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          request_type: "deletion",
          confirmation: deletionConfirmation,
          impact_version: ACCOUNT_DELETION_IMPACT_VERSION,
          idempotency_key: deletionIdempotencyKey
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === "recent_reauthentication_required") setNeedsRecentSignIn(true);
        throw new Error(data.error ?? "The deletion request could not be submitted.");
      }

      await loadPrivacyRequests();
      setDeletionJob(data.deletion_job ?? null);
      setNeedsRecentSignIn(false);
      const message = data.already_exists
        ? "Deletion request is already pending. Plaivra will review it before account data is removed."
        : "Request submitted. Plaivra will review it before account data is removed.";
      setDeletionFeedback({ type: "info", message });
      if (typeof data.chatgpt_access_revoked === "boolean") {
        setChatGptRevokeFeedback({
          type: data.chatgpt_access_revoked ? "info" : "error",
          message: data.chatgpt_access_revoked
            ? "ChatGPT access revocation was requested as part of this deletion request."
            : "Plaivra could not confirm ChatGPT access revocation. Review ChatGPT connections or contact support."
        });
      }
      toast({
        title: data.already_exists ? "Request already pending" : "Deletion request submitted",
        description: message
      });
    } catch (error) {
      setDeletionFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "The deletion request could not be submitted."
      });
    } finally {
      setIsRequestingDeletion(false);
    }
  }

  return (
    <SettingsPageShell
      title={t("settings.account")}
      description={t("settings.accountDesc")}
    >
      {confirmDialog}

      <Card className="border-primary/25 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-5 w-5 text-primary" /> Signed-in account
          </CardTitle>
          <CardDescription>Account and session controls apply to this signed-in Plaivra account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isLoading ? (
            <div className="flex min-h-12 items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading account identity...
            </div>
          ) : (
            <>
              <p className="font-semibold text-foreground">{accountName}</p>
              <p className="text-muted-foreground">Signed in as {accountEmail}.</p>
            </>
          )}
        </CardContent>
      </Card>

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

      <SettingsSectionCard
        title={t("settings.fitnessProfile")}
        rows={[
          {
            icon: Goal,
            title: t("settings.fitnessProfile"),
            detail: t("settings.fitnessProfileDesc"),
            href: "/onboarding?edit=true&returnTo=%2Fsettings%2Faccount",
            action: t("common.edit"),
          },
        ]}
      />

      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.accountSession")}</CardTitle>
          <CardDescription>Sign out of Plaivra on this device. Other browser sessions may remain signed in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="group flex min-h-[64px] flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex min-w-0 items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">
                  Sign out of this device
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  {t("settings.signOutDevice")}
                </span>
              </span>
            </span>
            <Button variant="destructive" disabled={isSigningOut} onClick={() => void handleSignOut()} className="min-h-12 w-full sm:w-auto">
              {isSigningOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSigningOut ? "Signing out..." : t("settings.signOut")}
            </Button>
          </div>
          <InlineFeedback
            message={signOutFeedback?.message}
            variant={signOutFeedback?.type === "error" ? "error" : "info"}
            onClose={() => setSignOutFeedback(null)}
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <Trash2 className="h-5 w-5" /> Delete account request
          </CardTitle>
          <CardDescription>
            Reauthentication, explicit impact acknowledgement, legal-hold checks, and a credential-gated deletion worker protect this irreversible process.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border bg-card p-3 text-sm leading-6 text-muted-foreground">
            <p className="font-semibold text-foreground">Deletion impact</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Active ChatGPT connections and OAuth tokens are revoked when the request is accepted.</li>
              <li>Account access is disabled before private storage, database records, and the Auth account are removed.</li>
              <li>Some operational evidence is minimized and retained only after the retention policy is owner/legal approved and configured.</li>
              <li>An active legal hold pauses deletion without silently rejecting your request.</li>
              <li>This cannot be reversed after deletion processing begins. Export your data first if you need a copy.</li>
            </ul>
          </div>

          {isLoadingRequests ? (
            <div className="flex min-h-12 items-center gap-2 rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading deletion request status...
            </div>
          ) : requestLoadError ? (
            <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="flex gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{requestLoadError}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => void loadPrivacyRequests()} className="min-h-12 w-full sm:w-auto">
                <RefreshCcw className="h-4 w-4" /> Retry status
              </Button>
            </div>
          ) : latestDeletionRequest ? (
            <div className="rounded-xl border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-foreground">
                  Deletion request {latestDeletionRequest.status.replaceAll("_", " ")}
                </p>
                <Badge variant={requestStatusVariant(latestDeletionRequest.status)}>
                  {latestDeletionRequest.status.replaceAll("_", " ")}
                </Badge>
              </div>
              <p className="mt-2 text-muted-foreground">
                Requested since {formatRequestDate(latestDeletionRequest.created_at)}.
                {latestDeletionRequest.completed_at ? ` Completed ${formatRequestDate(latestDeletionRequest.completed_at)}.` : ""}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
              No account deletion request is currently recorded for this account.
            </div>
          )}

          {deletionJob ? (
            <div className="rounded-xl border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">Processing stage: {deletionJob.stage.replaceAll("_", " ")}</p>
                <Badge variant={requestStatusVariant(deletionJob.state)}>{deletionJob.state.replaceAll("_", " ")}</Badge>
              </div>
              <p className="mt-2 text-muted-foreground">Attempts: {deletionJob.attempt_count}. {deletionJob.last_error_code ? `Safe error code: ${deletionJob.last_error_code}.` : "No processing error recorded."}</p>
            </div>
          ) : null}

          {!hasActiveDeletionRequest ? (
            <div className="space-y-2">
              <Label htmlFor="delete-account-confirmation">Type {ACCOUNT_DELETION_CONFIRMATION} to confirm</Label>
              <Input
                id="delete-account-confirmation"
                value={deletionConfirmation}
                onChange={(event) => setDeletionConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">A server-proven sign-in from the last 10 minutes is also required.</p>
            </div>
          ) : null}

          {needsRecentSignIn ? (
            <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
              <p className="font-semibold">Recent sign-in required</p>
              <p className="mt-1 text-muted-foreground">Sign out, sign in again with your account provider, then return here and repeat the confirmation.</p>
              <Button type="button" variant="outline" className="mt-3 min-h-12" onClick={() => void handleSignOut()}>Sign out to reauthenticate</Button>
            </div>
          ) : null}

          <InlineFeedback
            message={deletionFeedback?.message}
            variant={deletionFeedback?.type === "error" ? "error" : "info"}
            onClose={() => setDeletionFeedback(null)}
          />
          <InlineFeedback
            message={chatGptRevokeFeedback?.message}
            variant={chatGptRevokeFeedback?.type === "error" ? "error" : "info"}
            onClose={() => setChatGptRevokeFeedback(null)}
          />

          <Button
            variant="destructive"
            disabled={isRequestingDeletion || hasActiveDeletionRequest || isLoadingRequests || deletionConfirmation !== ACCOUNT_DELETION_CONFIRMATION || !deletionIdempotencyKey}
            onClick={requestDeletionConfirmation}
            className="min-h-12 w-full sm:w-auto"
          >
            {isRequestingDeletion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isRequestingDeletion ? "Submitting deletion request..." : hasActiveDeletionRequest ? "Deletion request pending" : "Request account deletion"}
          </Button>

          {hasActiveDeletionRequest ? (
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Existing pending request appears before submitting another request.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </SettingsPageShell>
  );
}
