"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
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
import { env } from "@/lib/env";

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

type CopyKind = "url" | "token" | "description";

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
          Create the Plaivra app inside ChatGPT, then connect it with your Plaivra connection code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasMcpServerUrl ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            ChatGPT import is not ready for this deployment. The Plaivra connection URL is missing.
          </p>
        ) : null}
        <Button asChild className="w-full sm:w-auto">
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
  const [connections, setConnections] = useState<ChatGptConnection[]>([]);
  const [isBusy, setIsBusy] = useState<string | null>(null);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" }),
    [session?.access_token]
  );

  const loadConnections = useCallback(async () => {
    if (!session?.access_token) {
      setConnections([]);
      return;
    }

    const response = await fetch("/api/mcp/connections", { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setConnections(data.connections ?? []);
  }, [authHeaders, session?.access_token]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  async function revokeConnectionToken() {
    if (!session?.access_token) {
      toast({ title: "Sign in required", description: "Sign in to Plaivra before revoking a ChatGPT connection." });
      return;
    }

    setIsBusy("chatgpt-revoke");
    const response = await fetch("/api/mcp/connections", { method: "DELETE", headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    setIsBusy(null);

    if (!response.ok) {
      toast({ title: "Could not revoke connection", description: data.error ?? "Please try again." });
      return;
    }

    await loadConnections();
    toast({ title: "Connection revoked", description: "Active ChatGPT connections were revoked for this account." });
  }

  const currentConnection = getConnectionStatus(connections);
  const isConnected = Boolean(currentConnection?.is_active && !currentConnection.revoked_at);

  return (
    <Card className="border-border/70">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-5 w-5 text-primary" /> Connection status
            </CardTitle>
            <CardDescription>Recent ChatGPT connections for this Plaivra account.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadConnections()} className="w-full sm:w-auto">
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border/70 bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-foreground">{isConnected ? "Connected" : "Not connected"}</p>
            <Badge variant={isConnected ? "success" : "outline"}>{isConnected ? "Connected" : "Not connected"}</Badge>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <p>Created: {formatConnectionDate(currentConnection?.created_at ?? null)}</p>
            <p>Last used: {formatConnectionDate(currentConnection?.last_used_at ?? null)}</p>
          </div>
          {currentConnection?.scopes?.length ? (
            <details className="mt-3 rounded-md border border-border/70 bg-card p-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-semibold text-foreground">Technical details</summary>
              <p className="mt-2">Scopes: {currentConnection.scopes.join(", ")}</p>
            </details>
          ) : null}
        </div>

        <Button
          type="button"
          variant="destructive"
          onClick={revokeConnectionToken}
          disabled={!isConnected || isBusy === "chatgpt-revoke"}
          className="w-full sm:w-auto"
        >
          <Trash2 className="h-4 w-4" /> Revoke connection
        </Button>
      </CardContent>
    </Card>
  );
}

export function ChatGptSetupFlow() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyKind | null>(null);
  const [connectionToken, setConnectionToken] = useState("");
  const [connections, setConnections] = useState<ChatGptConnection[]>([]);
  const mcpServerUrl = env.plaivraMcpServerUrl.trim();
  const hasMcpServerUrl = Boolean(mcpServerUrl);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" }),
    [session?.access_token]
  );

  const loadConnections = useCallback(async () => {
    if (!session?.access_token) return;
    const response = await fetch("/api/mcp/connections", { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setConnections(data.connections ?? []);
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
          : "Plaivra connection code copied.";
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
      toast({ title: "Sign in required", description: "Sign in to Plaivra before creating a ChatGPT connection code." });
      return;
    }

    setIsBusy("chatgpt-token");
    const permissionResponse = await fetch("/api/user/ai-permissions", { headers: authHeaders() });
    const permissionData = await permissionResponse.json().catch(() => ({}));
    const savedScopes = permissionData.settings?.scopes;
    if (!permissionResponse.ok || !Array.isArray(savedScopes) || savedScopes.length === 0) {
      setIsBusy(null);
      toast({
        title: "AI permissions required",
        description: "Review and save AI Permissions before creating a ChatGPT connection code."
      });
      return;
    }

    const response = await fetch("/api/mcp/connections", {
      method: "POST",
      headers: authHeaders()
    });
    const data = await response.json().catch(() => ({}));
    setIsBusy(null);

    if (!response.ok) {
      const permissionsRequired = response.status === 409 || String(data.error ?? "").includes("AI permissions required");
      toast({
        title: permissionsRequired ? "AI permissions required" : "Could not create connection code",
        description: permissionsRequired
          ? "Review and save AI Permissions before creating a ChatGPT connection code."
          : data.error ?? "Please try again. If this keeps happening, contact support."
      });
      return;
    }

    setConnectionToken(data.token ?? "");
    await loadConnections();
    toast({ title: "Connection code created", description: "Copy it now. Plaivra shows this code only once." });
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
          If ChatGPT uses slightly different wording, choose the option that means "Apps," "Connectors," "Developer mode," or "Create app."
        </p>
      </div>

      <SetupStep
        title="Step 1 — Create your Plaivra connection code"
        body="First, create a private code from Plaivra. You will paste this code later inside ChatGPT."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" onClick={generateConnectionToken} disabled={isBusy === "chatgpt-token"} className="w-full">
            <KeyRound className="h-4 w-4" /> Create connection code
          </Button>
          <Button type="button" variant="outline" onClick={() => copyText(connectionToken, "token")} disabled={!connectionToken} className="w-full">
            <Copy className="h-4 w-4" /> {copied === "token" ? "Copied" : "Copy connection code"}
          </Button>
        </div>
        {connectionToken ? (
          <div className="rounded-md border border-primary/20 bg-card p-3">
            <label htmlFor="plaivra-connection-code" className="text-sm font-semibold text-foreground">
              Plaivra connection code
            </label>
            <Input id="plaivra-connection-code" readOnly value={connectionToken} className="mt-2 font-mono text-xs" />
            <p className="mt-2 text-xs text-muted-foreground">Copy this code now. Plaivra only shows it once.</p>
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
        body="Now go to the ChatGPT website. Keep this Plaivra page open because you will need the code and URL."
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
            "Find the field called Connection URL, Server URL, MCP URL, or Endpoint URL.",
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
            "Do not choose API key unless ChatGPT does not show OAuth.",
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
        title="Step 11 — Paste your Plaivra connection code"
        body="Use the Plaivra connection code, not your ChatGPT password."
      >
        <NumberedInstructions
          items={[
            "Find the field where ChatGPT asks for a token, client code, client secret, or authentication value.",
            "Paste the Plaivra connection code you copied from Step 1.",
            "If ChatGPT calls it a token, that is okay. The Plaivra connection code is the token.",
            "Click Save, Connect, or Finish."
          ]}
        />
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
          Use the Plaivra connection code, not your ChatGPT password.
        </p>
        <Button type="button" variant="outline" onClick={() => copyText(connectionToken, "token")} disabled={!connectionToken} className="w-full sm:w-auto">
          <Copy className="h-4 w-4" /> {copied === "token" ? "Copied" : "Copy connection code"}
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
            {currentConnection?.is_active && !currentConnection.revoked_at ? "Connected" : "Not connected"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p>Created: {formatConnectionDate(currentConnection?.created_at ?? null)}</p>
          <p>Last used: {formatConnectionDate(currentConnection?.last_used_at ?? null)}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function ConnectedApps() {
  return (
    <div className="space-y-4">
      <ChatGptSetupCard />
      <ConnectionStatusCard />
    </div>
  );
}
