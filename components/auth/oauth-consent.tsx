"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Bot, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Brand } from "@/components/layout/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FULL_ACCESS_WARNING, permissionGroupsForScopes } from "@/lib/mcp/permission-presentation";

export function OAuthConsent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session, isLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const continuationPath = `/oauth/authorize?${searchParams.toString()}`;
  const permissions = useMemo(
    () => permissionGroupsForScopes(searchParams.get("scope")),
    [searchParams]
  );
  const hasValidContinuation = Boolean(searchParams.get("continuation"));

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(continuationPath)}`);
    }
  }, [continuationPath, isLoading, router, user]);

  async function submitDecision(decision: "approve" | "deny") {
    if (!session?.access_token || !hasValidContinuation) return;
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/oauth/authorize?${searchParams.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ decision })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.redirect_to !== "string") {
        throw new Error(data.error_description ?? data.error ?? "The connection could not be authorized.");
      }
      window.location.assign(data.redirect_to);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The connection could not be authorized.");
      setIsSubmitting(false);
    }
  }

  if (isLoading || !user) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Preparing secure account linking...</main>;
  }

  if (!hasValidContinuation || permissions.groups.length === 0) {
    return (
      <main className="premium-page-bg flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Connection request unavailable</CardTitle>
            <CardDescription>This request is incomplete or has expired. Start the connection again from ChatGPT.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="premium-page-bg flex min-h-screen items-center justify-center p-4" id="main-content">
      <div className="w-full max-w-2xl space-y-4">
        <Brand />
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Bot className="h-5 w-5 text-primary" /> Connect ChatGPT to Plaivra
            </CardTitle>
            <CardDescription>
              ChatGPT is requesting access to the Plaivra account <span className="font-semibold text-foreground">{user.email ?? "currently signed in"}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {permissions.fullAccess ? (
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{FULL_ACCESS_WARNING}</p>
              </div>
            ) : null}

            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Requested permission groups</h2>
              {permissions.groups.map((group) => (
                <div key={group.section} className="rounded-xl border border-border/70 bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{group.label}</p>
                    <div className="flex gap-2">
                      <Badge variant="outline">Read</Badge>
                      {group.canWrite ? <Badge variant="warning">Create & update</Badge> : null}
                      {group.sensitive ? <Badge variant="destructive">Sensitive fitness data</Badge> : null}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{group.readDescription}</p>
                  {group.canWrite ? <p className="mt-1 text-sm text-muted-foreground">{group.writeDescription}</p> : null}
                </div>
              ))}
            </div>

            <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Access is limited by your saved AI Permissions. You can revoke it anytime from Settings → AI & Imports. Revoking does not delete your Plaivra account or fitness data.
              </p>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              Plaivra sends only the data needed for the ChatGPT action you approve. Plaivra is not approved or endorsed by OpenAI.
            </p>
            {error ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => void submitDecision("deny")} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void submitDecision("approve")} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Authorize ChatGPT
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
