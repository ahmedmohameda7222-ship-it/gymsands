"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, ExternalLink, Loader2, RefreshCcw, ShieldCheck } from "lucide-react";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/motion";
import { useAuth } from "@/components/auth/auth-provider";

type EntitlementRow = {
  capability_key: string;
  state: string;
  source_provider: string | null;
  valid_through: string | null;
  grace_period_end: string | null;
  access_active: boolean;
};

export default function SubscriptionSettingsPage() {
  const { session } = useAuth();
  const [entitlements, setEntitlements] = useState<EntitlementRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [feedback, setFeedback] = useState("");
  const accessToken = session?.access_token;

  const load = useCallback(async () => {
    if (!accessToken) {
      setIsLoading(false);
      setFeedback("Sign in again to verify subscription access.");
      return;
    }
    setIsLoading(true);
    setFeedback("");
    try {
      const response = await fetch("/api/billing/entitlements", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Subscription access could not be loaded.");
      setEntitlements(Array.isArray(data.entitlements) ? data.entitlements : []);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Subscription access could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  async function openPortal() {
    if (!accessToken) return;
    setIsOpeningPortal(true);
    setFeedback("");
    try {
      const response = await fetch("/api/billing/stripe/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.portal_url) throw new Error(data.error ?? "Billing portal is unavailable.");
      window.location.assign(data.portal_url);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Billing portal is unavailable.");
      setIsOpeningPortal(false);
    }
  }

  return (
    <SettingsPageShell title="Subscription" description="Provider-neutral access, billing recovery, and account-linked entitlements.">
      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-primary" /> Paid launch is not configured</p>
          <p className="text-sm leading-6 text-muted-foreground">Plaivra does not publish a price or paid capability until the owner approves the offering. Checkout stays disabled until that decision is recorded and a provider offering is configured.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current access</CardTitle>
          <CardDescription>Capabilities are decided by Plaivra entitlements, not raw Stripe, StoreKit, or Play status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="flex min-h-12 items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Verifying account-linked access...</p> : null}
          {!isLoading && entitlements.length === 0 ? <p className="rounded-2xl bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">No paid entitlement is recorded. Core account history, privacy controls, data export, and existing records remain accessible.</p> : null}
          {entitlements.map((entitlement) => (
            <div key={entitlement.capability_key} className="flex min-h-14 flex-col justify-center rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div><p className="font-semibold">{entitlement.capability_key}</p><p className="text-xs text-muted-foreground">{entitlement.source_provider ?? "Plaivra"}</p></div>
              <p className="mt-1 text-sm font-semibold sm:mt-0">{entitlement.state.replaceAll("_", " ")}</p>
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="outline" className="min-h-12" disabled={isLoading} onClick={() => void load()}><RefreshCcw className="h-4 w-4" /> Refresh access</Button>
            {entitlements.length ? <Button type="button" className="min-h-12" disabled={isOpeningPortal} onClick={() => void openPortal()}>{isOpeningPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Manage billing</Button> : null}
          </div>
          <InlineFeedback message={feedback} variant="error" onClose={() => setFeedback("")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-5 w-5 text-primary" /> Provider recovery</CardTitle>
          <CardDescription>Stripe web subscriptions can use the portal after an account is linked. StoreKit and Play restoration remain native-platform contracts; no native Plaivra app is represented as available.</CardDescription>
        </CardHeader>
        <CardContent><p className="text-sm leading-6 text-muted-foreground">Refunds, chargebacks, expiry, grace periods, cancellations, and revocations reduce into the same Plaivra entitlement states. Payment credentials are never collected through ChatGPT or MCP.</p></CardContent>
      </Card>
    </SettingsPageShell>
  );
}
