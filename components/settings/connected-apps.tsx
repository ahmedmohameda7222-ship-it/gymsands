"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Activity,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  RefreshCcw,
  Shield,
  Trash2
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { InlineFeedback } from "@/components/motion";
import { env } from "@/lib/env";
import type { PublicMcpActivity } from "@/lib/mcp/activity";
import { connectionCreationErrorMessage } from "@/lib/mcp/connection-errors";
import { getAiPermissionSettingsWithStatus } from "@/services/database/ai-permissions";

const chatGptUrl = "https://chatgpt.com";
const appDescription =
  "Plaivra imports approved workout and meal plans from ChatGPT into the user's Plaivra account.";

type ChatGptConnection = {
  id: string;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type CopyKind = "url" | "clientId" | "description";

type SetupStepProps = {
  title: string;
  body: string;
  children?: React.ReactNode;
};

type NumberedInstructionsProps = {
  items: string[];
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

export function AiImportStatusHero() {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;
  const userId = user?.id;
  const [isLoading, setIsLoading] = useState(true);
  const [connection, setConnection] = useState<{ label: string; state: "success" | "warning" | "error" | "neutral" }>({
    label: "Checking connection",
    state: "neutral"
  });
  const [permission, setPermission] = useState<{ label: string; state: "success" | "warning" | "error" | "neutral" }>({
    label: "Checking permissions",
    state: "neutral"
  });
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
        setConnection({
          label: connected ? "Connected" : "Not connected",
          state: connected ? "success" : "warning"
        });
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
          nextError = nextError || result.status.message;
        } else if (result.status.state === "none") {
          setPermission({ label: "No saved permissions", state: "warning" });
        } else {
          setPermission({
            label: result.config?.accessMode === "full" ? "Full access saved" : "Custom permissions saved",
            state: "success"
          });
        }
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "AI permission status could not be loaded.";
      nextError = nextError || message;
      setPermission({ label: "Permissions unknown", state: "error" });
    } finally {
      setError(nextError);
      setIsLoading(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <Shield className="h-5 w-5 text-primary" /> ChatGPT import status
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              ChatGPT can only access the categories you save here. Plaivra never changes plans, logs, progress, wellness, or settings silently.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadStatus()} disabled={isLoading} className="min-h-12 w-full sm:w-auto">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Refresh
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[12px] border bg-card p-3">
            <p className="text-sm font-semibold text-foreground">Connection</p>
            <Badge className="mt-2" variant={statusBadgeVariant(connection.state)}>
              {connection.label}
            </Badge>
          </div>
          <div className="rounded-[12px] border bg-card p-3">
            <p className="text-sm font-semibold text-foreground">Permissions</p>
            <Badge className="mt-2" variant={statusBadgeVariant(permission.state)}>
              {permission.label}
            </Badge>
          </div>
        </div>

        {error ? (
          <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <ul className="grid gap-2 text-sm text-foreground sm:grid-cols-3">
          <li className="rounded-[12px] border bg-card p-3"><span className="font-semibold">Approval first</span><span className="mt-1 block text-muted-foreground">AI-generated changes still require user approval.</span></li>
          <li className="rounded-[12px] border bg-card p-3"><span className="font-semibold">Scope control</span><span className="mt-1 block text-muted-foreground">Limit ChatGPT by Plaivra area and action.</span></li>
          <li className="rounded-[12px] border bg-card p-3"><span className="font-semibold">Revoke anytime</span><span className="mt-1 block text-muted-foreground">Disconnect below to stop existing ChatGPT access.</span></li>
        </ul>
      </CardContent>
    </Card>
  );
}

function SetupStep({ title, body, children }: SetupStepProps) {
  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="leading-6">{body}</CardDescription>
      </CardHeader>
      {children ? <CardContent className="space-y-3">{children}</CardContent> : null}
    </Card>
  );
}

function NumberedInstructions({ items }: NumberedInstructionsProps) {
  return (
    <ol className="ml-5 list-decimal space-y-2 text-sm leading-6 text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}

export function ChatGptSetupCard() {
  const mcpServerUrl = env.plaivraMcpServerUrl.trim();
  const hasMcpServerUrl = Boolean(mcpServerUrl);

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-5 w-5 text-primary" /> Set up ChatGPT import
        </CardTitle>
        <CardDescription>
          Create the Plaivra app inside ChatGPT, then connect it using the details Plaivra prepares for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasMcpServerUrl ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            ChatGPT import is not ready for this deployment. The Plaivra connection URL is missing.
          </p>
        ) : null}
        <Button asChild className="min-h-12 w-full sm:w-auto">
          <Link href="/settings/ai-imports/chatgpt-setup">
            <ExternalLink className="h-4 w-4" /> Set up ChatGPT import
          </Link>
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
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" }),
    [session?.access_token]
  );

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
      setConnections(data.connections ?? []);
    } catch (error) {
      setConnections([]);
      setLoadError(error instanceof Error ? error.message : "ChatGPT connection status could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders, session?.access_token]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  function requestRevokeConnectionToken() {
    confirmAsk({
      title: "Revoke ChatGPT access?",
      description:
        "Existing ChatGPT access tokens will stop working. Your Plaivra account, plans, logs, and progress data will not be deleted.",
      confirmLabel: "Revoke access",
      variant: "destructive",
      onConfirm: () => void revokeConnectionToken()
    });
  }

  async function revokeConnectionToken() {
    if (!session?.access_token) {
      setFeedback({ type: "error", message: "Sign in to Plaivra before revoking a ChatGPT connection." });
      return;
    }

    setIsBusy("chatgpt-revoke");
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
      setIsBusy(null);
    }
  }

  const currentConnection = getConnectionStatus(connections);
  const isConnected = Boolean(currentConnection?.is_active && !currentConnection.revoked_at);

  return (
    <>
      {confirmDialog}
      <Card className="border-border/70">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-5 w-5 text-primary" /> Connection status
              </CardTitle>
              <CardDescription>Recent ChatGPT connections for this Plaivra account.</CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadConnections()} disabled={isLoading} className="min-h-12 w-full sm:w-auto">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <InlineFeedback
            message={feedback?.message}
            variant={feedback?.type === "error" ? "error" : "info"}
            onClose={() => setFeedback(null)}
          />
          {loadError ? (
            <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{loadError}</p>
            </div>
          ) : null}
          <div className="rounded-md border border-border/70 bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{isLoading ? "Checking connection..." : loadError ? "Connection unknown" : isConnected ? "Connected" : "Not connected"}</p>
              <Badge variant={loadError ? "destructive" : isConnected ? "success" : "outline"}>
                {isLoading ? "Loading" : loadError ? "Unknown" : isConnected ? "Connected" : "Not connected"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <p>Created: {formatConnectionDate(currentConnection?.created_at ?? null)}</p>
              <p>Last used: {formatConnectionDate(currentConnection?.last_used_at ?? null)}</p>
            </div>
          </div>

          <Button
            type="button"
            variant="destructive"
            onClick={requestRevokeConnectionToken}
            disabled={!isConnected || isBusy === "chatgpt-revoke" || isLoading}
            className="min-h-12 w-full sm:w-auto"
          >
            {isBusy === "chatgpt-revoke" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isBusy === "chatgpt-revoke" ? "Revoking..." : "Revoke connection"}
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">
            Revoking stops ChatGPT access immediately. It does not delete your Plaivra account, plans, logs, or progress data.
          </p>
          {!isConnected ? (
            <Button asChild variant="outline" className="min-h-12 w-full sm:w-auto">
              <Link href="/settings/ai-imports/chatgpt-setup">Reconnect ChatGPT</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

export function ChatGptSetupFlow() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyKind | null>(null);
  const [connectionClientId, setConnectionClientId] = useState("");
  const [connections, setConnections] = useState<ChatGptConnection[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [connectionLoadError, setConnectionLoadError] = useState("");
  const [setupFeedback, setSetupFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);
  const mcpServerUrl = env.plaivraMcpServerUrl.trim();
  const hasMcpServerUrl = Boolean(mcpServerUrl);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" }),
    [session?.access_token]
  );

  const loadConnections = useCallback(async () => {
    setIsLoadingConnections(true);
    setConnectionLoadError("");
    if (!session?.access_token) {
      setConnections([]);
      setConnectionClientId("");
      setIsLoadingConnections(false);
      return;
    }

    try {
      const response = await fetch("/api/mcp/connections", { headers: authHeaders(), cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "ChatGPT connection status could not be loaded.");
      const nextConnections = data.connections ?? [];
      setConnections(nextConnections);
      setConnectionClientId(getConnectionStatus(nextConnections)?.id ?? "");
    } catch (error) {
      setConnections([]);
      setConnectionClientId("");
      setConnectionLoadError(error instanceof Error ? error.message : "ChatGPT connection status could not be loaded.");
    } finally {
      setIsLoadingConnections(false);
    }
  }, [authHeaders, session?.access_token]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  async function copyText(value: string, type: CopyKind) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(type);
    window.setTimeout(() => setCopied(null), 2000);

    const description =
      type === "url"
        ? "Plaivra connection URL copied."
        : type === "description"
          ? "Plaivra app description copied."
          : "Plaivra OAuth client ID copied.";
    toast({ title: "Copied", description });
  }

  async function copyMcpUrl() {
    if (!hasMcpServerUrl) {
      toast({
        title: "Connection URL missing",
        description: "ChatGPT import is not ready for this deployment. The Plaivra connection URL is missing."
      });
      return;
    }
    await copyText(mcpServerUrl, "url");
  }

  async function generateConnectionToken() {
    if (!session?.access_token) {
      setSetupFeedback({ type: "error", message: "Sign in to Plaivra before creating a ChatGPT OAuth client." });
      return;
    }

    setIsBusy("chatgpt-token");
    setSetupFeedback(null);
    try {
      const response = await fetch("/api/mcp/connections", {
        method: "POST",
        headers: authHeaders()
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = connectionCreationErrorMessage(data).description ?? "Could not create the ChatGPT OAuth client.";
        setSetupFeedback({ type: "error", message });
        toast(connectionCreationErrorMessage(data));
        return;
      }

      setConnectionClientId(data.client_id ?? "");
      await loadConnections();
      const message = "Copy the client ID into ChatGPT OAuth settings and leave the client secret empty.";
      setSetupFeedback({ type: "info", message });
      toast({ title: "OAuth client created", description: message });
    } catch (error) {
      setSetupFeedback({ type: "error", message: error instanceof Error ? error.message : "Could not create the ChatGPT OAuth client." });
    } finally {
      setIsBusy(null);
    }
  }

  function openChatGpt() {
    window.open(chatGptUrl, "_blank", "noopener,noreferrer");
  }

  const currentConnection = getConnectionStatus(connections);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
        <p className="font-semibold text-foreground">Follow these steps carefully. The setup is done on the ChatGPT website.</p>
        <p className="mt-2">
          If ChatGPT uses slightly different wording, choose the option for adding a private app or connector. Access remains limited by your saved permissions.
        </p>
      </div>
      <InlineFeedback
        message={setupFeedback?.message}
        variant={setupFeedback?.type === "error" ? "error" : "info"}
        onClose={() => setSetupFeedback(null)}
      />
      {connectionLoadError ? (
        <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{connectionLoadError}</p>
        </div>
      ) : null}

      <SetupStep
        title="Step 1 — Create your Plaivra OAuth client"
        body="First, create a pre-registered OAuth client for this Plaivra account. You will paste its client ID inside ChatGPT."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" onClick={generateConnectionToken} disabled={isBusy === "chatgpt-token"} className="w-full">
            {isBusy === "chatgpt-token" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} {isBusy === "chatgpt-token" ? "Creating..." : "Create OAuth client"}
          </Button>
          <Button type="button" variant="outline" onClick={() => copyText(connectionClientId, "clientId")} disabled={!connectionClientId} className="w-full">
            <Copy className="h-4 w-4" /> {copied === "clientId" ? "Copied" : "Copy OAuth client ID"}
          </Button>
        </div>
        {connectionClientId ? (
          <div className="rounded-md border border-primary/20 bg-card p-3">
            <label htmlFor="plaivra-oauth-client-id" className="text-sm font-semibold text-foreground">
              Plaivra OAuth client ID
            </label>
            <Input id="plaivra-oauth-client-id" readOnly value={connectionClientId} className="mt-2 font-mono text-xs" />
            <p className="mt-2 text-xs text-muted-foreground">This is a client identifier, not a password or access token. Keep it within your connector setup.</p>
          </div>
        ) : null}
      </SetupStep>

      <SetupStep
        title="Step 2 — Copy your Plaivra connection URL"
        body="ChatGPT needs this URL so it knows where your Plaivra app connection lives."
      >
        {hasMcpServerUrl ? (
          <div className="rounded-md border border-border/70 bg-card p-3">
            <label htmlFor="plaivra-connection-url" className="text-sm font-semibold text-foreground">
              Plaivra connection URL
            </label>
            <Input id="plaivra-connection-url" readOnly value={mcpServerUrl} className="mt-2 font-mono text-xs" />
          </div>
        ) : (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            ChatGPT import is not ready for this deployment. The Plaivra connection URL is missing.
          </p>
        )}
        <Button type="button" variant="outline" onClick={copyMcpUrl} disabled={!hasMcpServerUrl} className="w-full sm:w-auto">
          <Copy className="h-4 w-4" /> {copied === "url" ? "Copied" : "Copy connection URL"}
        </Button>
      </SetupStep>

      <SetupStep
        title="Step 3 — Open ChatGPT"
        body="Now go to the ChatGPT website. Keep this Plaivra page open because you will need the Client ID and connection URL."
      >
        <Button type="button" onClick={openChatGpt} className="w-full sm:w-auto">
          <ExternalLink className="h-4 w-4" /> Open ChatGPT
        </Button>
      </SetupStep>

      <SetupStep title="Step 4 — Open ChatGPT settings" body="Open the settings window in ChatGPT.">
        <NumberedInstructions
          items={[
            "In ChatGPT, look at the bottom-left corner.",
            "Click your profile name or profile picture.",
            "Click Settings.",
            "A settings window should open."
          ]}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          If the menu looks different, open the menu where ChatGPT keeps account and app settings.
        </p>
      </SetupStep>

      <SetupStep title="Step 5 — Open Apps or Connectors" body="Find the ChatGPT area where apps or connectors are managed.">
        <NumberedInstructions
          items={[
            "Inside ChatGPT Settings, look for Apps.",
            "If you do not see Apps, look for Connectors.",
            "If you do not see Connectors, look for Developer or Developer Mode.",
            "Open that section."
          ]}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          ChatGPT may use different names. The correct section is the one where you can create or manage apps/connectors.
        </p>
      </SetupStep>

      <SetupStep title="Step 6 — Turn on Developer Mode" body="Developer Mode lets you add Plaivra as a private/manual connection.">
        <NumberedInstructions
          items={[
            "Find Developer Mode.",
            "Turn Developer Mode on.",
            "If ChatGPT asks for confirmation, confirm it.",
            "After Developer Mode is on, look for Create app or Create connector."
          ]}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          Developer Mode is needed because Plaivra is a private/manual connection, not an App Store app.
        </p>
      </SetupStep>

      <SetupStep
        title="Step 7 — Create the Plaivra app inside ChatGPT"
        body="Create the private Plaivra app and give ChatGPT a clear description."
      >
        <NumberedInstructions
          items={[
            "Click Create app.",
            "If ChatGPT says Create connector instead, click that.",
            "In the app name field, type: Plaivra",
            `In the description field, paste this: ${appDescription}`,
            "Continue to the connection/server setup step."
          ]}
        />
        <Button type="button" variant="outline" onClick={() => copyText(appDescription, "description")} className="w-full sm:w-auto">
          <Copy className="h-4 w-4" /> {copied === "description" ? "Copied" : "Copy app description"}
        </Button>
      </SetupStep>

      <SetupStep
        title="Step 8 — Add the Plaivra connection URL"
        body="This URL tells ChatGPT where to send the approved workout or meal plan."
      >
        <NumberedInstructions
          items={[
            "Find the field called Connection URL, Server URL, or Endpoint URL.",
            "Paste the Plaivra connection URL you copied from Step 2.",
            "Click Continue or Next."
          ]}
        />
        <Button type="button" variant="outline" onClick={copyMcpUrl} disabled={!hasMcpServerUrl} className="w-full sm:w-auto">
          <Copy className="h-4 w-4" /> {copied === "url" ? "Copied" : "Copy connection URL"}
        </Button>
      </SetupStep>

      <SetupStep title="Step 9 — Choose OAuth authentication" body="ChatGPT must connect with OAuth authentication.">
        <NumberedInstructions
          items={[
            "In ChatGPT app setup, look for Authentication.",
            "Choose OAuth.",
            "Do not choose \"No authentication.\"",
            "Do not choose API key.",
            "Continue to OAuth settings."
          ]}
        />
      </SetupStep>

      <SetupStep title="Step 10 — Open Advanced OAuth settings" body="This is the real setup path for the current Plaivra connection.">
        <NumberedInstructions
          items={[
            "In the OAuth section, look for Advanced settings.",
            "Click Advanced settings.",
            "Look for OAuth client type.",
            "Choose User-defined OAuth client."
          ]}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          If ChatGPT says "client configuration," "custom client," or "user-defined client," choose that option.
        </p>
      </SetupStep>

      <SetupStep
        title="Step 11 — Paste your Plaivra OAuth client ID"
        body="Use the pre-registered Plaivra client ID and leave the client secret empty."
      >
        <NumberedInstructions
          items={[
            "Find the OAuth client ID field.",
            "Paste the Plaivra OAuth client ID you copied from Step 1.",
            "Leave the client secret field empty because Plaivra uses a public OAuth client with PKCE.",
            "Click Save, Connect, or Finish."
          ]}
        />
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
          The OAuth client ID is identification only. It is not a password, access token, or client secret.
        </p>
        <Button type="button" variant="outline" onClick={() => copyText(connectionClientId, "clientId")} disabled={!connectionClientId} className="w-full sm:w-auto">
          <Copy className="h-4 w-4" /> {copied === "clientId" ? "Copied" : "Copy OAuth client ID"}
        </Button>
      </SetupStep>

      <SetupStep title="Step 12 — Test the connection" body="After saving the app in ChatGPT, test one import before relying on it.">
        <NumberedInstructions
          items={[
            "Start a new chat in ChatGPT.",
            "Select or mention the Plaivra app.",
            "Ask ChatGPT: Create a workout plan for me and import it into Plaivra after I approve it.",
            "Review the plan in ChatGPT.",
            "Only approve the import when the plan looks correct.",
            "Go back to Plaivra and check your workout or meal plan."
          ]}
        />
      </SetupStep>

      <div className="rounded-md border border-border/70 bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>ChatGPT can only access what you allow in AI Permissions. You can change permissions anytime from Settings → AI & Imports.</p>
        </div>
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {currentConnection?.is_active && !currentConnection.revoked_at ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
            )}
            Connection status
          </CardTitle>
          <CardDescription>
            {isLoadingConnections
              ? "Checking current connection"
              : connectionLoadError
                ? "Connection status could not be loaded"
                : currentConnection?.is_active && !currentConnection.revoked_at
                  ? "Connected"
                  : "Not connected"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant={connectionLoadError ? "destructive" : currentConnection?.is_active && !currentConnection.revoked_at ? "success" : "outline"}>
            {isLoadingConnections ? "Loading" : connectionLoadError ? "Unknown" : currentConnection?.is_active && !currentConnection.revoked_at ? "Connected" : "Not connected"}
          </Badge>
          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <p>Created: {formatConnectionDate(currentConnection?.created_at ?? null)}</p>
            <p>Last used: {formatConnectionDate(currentConnection?.last_used_at ?? null)}</p>
          </div>
        </CardContent>
      </Card>
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
    if (!accessToken) {
      setActivities([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/mcp/activity", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "ChatGPT activity could not be loaded.");
      setActivities(Array.isArray(data.activities) ? data.activities : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "ChatGPT activity could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  return (
    <Card className="border-border/70">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-5 w-5 text-primary" /> Recent ChatGPT activity</CardTitle>
            <CardDescription>A simple history of what ChatGPT was allowed or unable to do in Plaivra.</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadActivity()} disabled={isLoading} className="min-h-12 w-full sm:w-auto">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-5 text-muted-foreground">Private request details, sign-in details, notes, and body measurements are never shown here.</p>
        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        {!isLoading && !error && activities.length === 0 ? <p className="text-sm text-muted-foreground">No ChatGPT activity has been recorded yet.</p> : null}
        {activities.map((activity) => (
          <div key={activity.id} className="rounded-xl border border-border/70 bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{activity.action}</p>
              <div className="flex gap-2">
                <Badge variant="outline">{activity.category}</Badge>
                <Badge variant={activity.status === "allowed" ? "success" : activity.status === "denied" ? "warning" : "destructive"}>{activity.status}</Badge>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{activity.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">{activity.connectionLabel} · {formatConnectionDate(activity.timestamp)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ConnectedApps() {
  return (
    <div className="space-y-4">
      <ChatGptSetupCard />
      <ConnectionStatusCard />
      <ChatGptActivityCard />
    </div>
  );
}
