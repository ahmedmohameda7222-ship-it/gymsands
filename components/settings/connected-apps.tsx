"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, Bot, ExternalLink, Link2, Loader2, RefreshCcw, Shield, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { InlineFeedback } from "@/components/motion";
import { env } from "@/lib/env";
import type { PublicMcpActivity } from "@/lib/mcp/activity";
import { getAiPermissionSettingsWithStatus } from "@/services/database/ai-permissions";

type ChatGptConnection = {
  id: string;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function getConnectionStatus(connections: ChatGptConnection[]) {
  return connections.find((connection) => connection.is_active && !connection.revoked_at) ?? connections[0] ?? null;
}

function formatConnectionDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

function statusBadgeVariant(state: "success" | "warning" | "error" | "neutral") {
  if (state === "success") return "success";
  if (state === "warning") return "warning";
  if (state === "error") return "destructive";
  return "outline";
}

export function ChatGptConnectionStatusHero() {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;
  const userId = user?.id;
  const [isLoading, setIsLoading] = useState(true);
  const [connection, setConnection] = useState<{ label: string; state: "success" | "warning" | "error" | "neutral" }>({ label: "Checking connection", state: "neutral" });
  const [permission, setPermission] = useState<{ label: string; state: "success" | "warning" | "error" | "neutral" }>({ label: "Checking permissions", state: "neutral" });
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError("");
    let nextError = "";

    try {
      if (!accessToken) {
        setConnection({ label: "Sign in required", state: "error" });
      } else {
        const response = await fetch("/api/mcp/connections", {
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "ChatGPT connection status could not be loaded.");
        const currentConnection = getConnectionStatus(Array.isArray(data.connections) ? data.connections : []);
        const connected = Boolean(currentConnection?.is_active && !currentConnection.revoked_at);
        setConnection({ label: connected ? "Connected" : "Not connected", state: connected ? "success" : "warning" });
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "ChatGPT connection status could not be loaded.";
      nextError = message;
      setConnection({ label: "Connection unknown", state: "error" });
    }

    try {
      if (!userId) {
        setPermission({ label: "Sign in required", state: "error" });
      } else {
        const result = await getAiPermissionSettingsWithStatus(userId);
        if (result.status.state === "failed") {
          setPermission({ label: "Permissions unknown", state: "error" });
          nextError ||= result.status.message;
        } else if (result.status.state === "none") {
          setPermission({ label: "No saved permissions", state: "warning" });
        } else {
          setPermission({ label: result.config?.accessMode === "full" ? "Full access saved" : "Custom permissions saved", state: "success" });
        }
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "AI permission status could not be loaded.";
      nextError ||= message;
      setPermission({ label: "Permissions unknown", state: "error" });
    } finally {
      setError(nextError);
      setIsLoading(false);
    }
  }, [accessToken, userId]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-semibold text-foreground"><Shield className="h-5 w-5 text-primary" /> ChatGPT connection status</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              ChatGPT can use only the Plaivra areas and tool actions you allow. Successful tool changes appear directly in Plaivra for tracking and correction.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadStatus()} disabled={isLoading} className="min-h-12 w-full sm:w-auto">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Refresh
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusBox title="Connection" label={connection.label} state={connection.state} />
          <StatusBox title="Permissions" label={permission.label} state={permission.state} />
        </div>
        {error ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        <ul className="grid gap-2 text-sm text-foreground sm:grid-cols-3">
          <li className="rounded-[12px] border bg-card p-3"><span className="font-semibold">Task-specific context</span><span className="mt-1 block text-muted-foreground">Only the context needed for the requested job.</span></li>
          <li className="rounded-[12px] border bg-card p-3"><span className="font-semibold">Scope control</span><span className="mt-1 block text-muted-foreground">Limit ChatGPT by Plaivra area and action.</span></li>
          <li className="rounded-[12px] border bg-card p-3"><span className="font-semibold">Revoke anytime</span><span className="mt-1 block text-muted-foreground">Disconnect below to stop existing ChatGPT access.</span></li>
        </ul>
      </CardContent>
    </Card>
  );
}

function StatusBox({ title, label, state }: { title: string; label: string; state: "success" | "warning" | "error" | "neutral" }) {
  return (
    <div className="rounded-[12px] border bg-card p-3">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <Badge className="mt-2" variant={statusBadgeVariant(state)}>{label}</Badge>
    </div>
  );
}

export function ChatGptSetupCard() {
  const connectionConfigured = Boolean(env.plaivraMcpServerUrl.trim());
  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-5 w-5 text-primary" /> Connect Plaivra to ChatGPT</CardTitle>
        <CardDescription>Save task-specific permissions in Plaivra, then connect from ChatGPT using OAuth. Plaivra never asks you to copy access tokens or client identifiers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!connectionConfigured ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">ChatGPT connection is not available in this deployment because the public connection endpoint is not configured.</p> : null}
        <Button asChild className="min-h-12 w-full sm:w-auto" disabled={!connectionConfigured}>
          <Link href="/settings/connections/chatgpt"><ExternalLink className="h-4 w-4" /> Continue connection</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function ConnectionStatusCard() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();
  const [connections, setConnections] = useState<ChatGptConnection[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);

  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" }), [session?.access_token]);
  const loadConnections = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    if (!session?.access_token) {
      setConnections([]);
      setLoadError("Sign in again to check your ChatGPT connection.");
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/mcp/connections", { headers: authHeaders(), cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "ChatGPT connection status could not be loaded.");
      setConnections(Array.isArray(data.connections) ? data.connections : []);
    } catch (error) {
      setConnections([]);
      setLoadError(error instanceof Error ? error.message : "ChatGPT connection status could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders, session?.access_token]);

  useEffect(() => { void loadConnections(); }, [loadConnections]);

  async function revokeConnection() {
    if (!session?.access_token) return;
    setIsBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/mcp/connections", { method: "DELETE", headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Please try again.");
      await loadConnections();
      const message = "Existing access tokens no longer work. Reconnect from ChatGPT when you are ready.";
      setFeedback({ type: "info", message });
      toast({ title: "ChatGPT access revoked", description: message });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Could not revoke connection. Please try again." });
    } finally {
      setIsBusy(false);
    }
  }

  function requestRevoke() {
    confirmAsk({
      title: "Revoke ChatGPT access?",
      description: "Existing ChatGPT access tokens will stop working. Your Plaivra account, plans, logs, and progress data will not be deleted.",
      confirmLabel: "Revoke access",
      variant: "destructive",
      onConfirm: () => void revokeConnection()
    });
  }

  const currentConnection = getConnectionStatus(connections);
  const isConnected = Boolean(currentConnection?.is_active && !currentConnection.revoked_at);

  return (
    <>
      {confirmDialog}
      <Card className="border-border/70">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-5 w-5 text-primary" /> Connection status</CardTitle><CardDescription>Recent ChatGPT connections for this Plaivra account.</CardDescription></div>
            <Button type="button" variant="outline" onClick={() => void loadConnections()} disabled={isLoading} className="min-h-12 w-full sm:w-auto">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Refresh</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} onClose={() => setFeedback(null)} />
          {loadError ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</p> : null}
          <div className="rounded-md border border-border/70 bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-foreground">{isLoading ? "Checking connection..." : loadError ? "Connection unknown" : isConnected ? "Connected" : "Not connected"}</p><Badge variant={loadError ? "destructive" : isConnected ? "success" : "outline"}>{isLoading ? "Loading" : loadError ? "Unknown" : isConnected ? "Connected" : "Not connected"}</Badge></div>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"><p>Created: {formatConnectionDate(currentConnection?.created_at ?? null)}</p><p>Last used: {formatConnectionDate(currentConnection?.last_used_at ?? null)}</p></div>
          </div>
          <Button type="button" variant="destructive" onClick={requestRevoke} disabled={!isConnected || isBusy || isLoading} className="min-h-12 w-full sm:w-auto">{isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{isBusy ? "Revoking..." : "Revoke connection"}</Button>
          <p className="text-xs leading-5 text-muted-foreground">Revoking stops ChatGPT access immediately. It does not delete your Plaivra account, plans, logs, or progress data.</p>
        </CardContent>
      </Card>
    </>
  );
}

export function ChatGptSetupFlow() {
  const connectionConfigured = Boolean(env.plaivraMcpServerUrl.trim());
  return (
    <div className="space-y-4">
      <Card className="border-primary/25 bg-primary/5">
        <CardHeader><CardTitle>Connect from ChatGPT</CardTitle><CardDescription>Plaivra uses OAuth and task-specific permissions. Connection credentials are exchanged by the authorized services, not copied by the user.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <ol className="ml-5 list-decimal space-y-2 text-sm leading-6 text-muted-foreground">
            <li>Save the minimum Plaivra permissions needed for your first task.</li>
            <li>Open ChatGPT and select the Plaivra app when it is available to your account.</li>
            <li>Complete the Plaivra OAuth consent screen, then ask ChatGPT to use a Plaivra tool.</li>
            <li>Return to Plaivra to track, edit, or correct the tool-confirmed result.</li>
          </ol>
          {!connectionConfigured ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">The public Plaivra connection endpoint is not configured for this deployment.</p> : null}
          <Button asChild disabled={!connectionConfigured} className="min-h-12 w-full sm:w-auto"><a href="https://chatgpt.com/" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open ChatGPT</a></Button>
        </CardContent>
      </Card>
      <ConnectionStatusCard />
    </div>
  );
}

export function ChatGptActivityCard() {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [activities, setActivities] = useState<PublicMcpActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadActivity = useCallback(async () => {
    if (!accessToken) { setActivities([]); setIsLoading(false); return; }
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/mcp/activity", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "ChatGPT activity could not be loaded.");
      setActivities(Array.isArray(data.activities) ? data.activities : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "ChatGPT activity could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void loadActivity(); }, [loadActivity]);

  return (
    <Card className="border-border/70">
      <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-5 w-5 text-primary" /> Recent ChatGPT activity</CardTitle><CardDescription>What ChatGPT was allowed or unable to do in Plaivra.</CardDescription></div><Button type="button" variant="outline" onClick={() => void loadActivity()} disabled={isLoading} className="min-h-12 w-full sm:w-auto">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Refresh</Button></div></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-5 text-muted-foreground">Private request details, sign-in details, notes, and body measurements are never shown here.</p>
        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        {!isLoading && !error && activities.length === 0 ? <p className="text-sm text-muted-foreground">No ChatGPT activity has been recorded yet.</p> : null}
        {activities.map((activity) => (
          <div key={activity.id} className="rounded-xl border border-border/70 bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{activity.action}</p><div className="flex gap-2"><Badge variant="outline">{activity.category}</Badge><Badge variant={activity.status === "allowed" ? "success" : activity.status === "denied" ? "warning" : "destructive"}>{activity.status}</Badge></div></div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{activity.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">{activity.connectionLabel} · {formatConnectionDate(activity.timestamp)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ConnectedApps() {
  return <div className="space-y-4"><ChatGptSetupCard /><ConnectionStatusCard /><ChatGptActivityCard /></div>;
}
