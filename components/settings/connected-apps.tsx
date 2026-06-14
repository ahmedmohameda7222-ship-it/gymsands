"use client";

import { useState } from "react";
import { Bot, Copy, ExternalLink, KeyRound, RefreshCcw, Settings2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { env } from "@/lib/env";
import { MCP_DEFAULT_SCOPES, MCP_SCOPES } from "@/lib/mcp/scopes";

const fitlifeDescription = "ChatGPT creates workout and meal plans. FitLife stores, schedules, edits, and tracks the imported data.";

type ChatGptConnection = {
  id: string;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const scopeOptions = [
  { value: MCP_SCOPES.summaryRead, label: "Summary", detail: "Read dashboard summaries and status." },
  { value: MCP_SCOPES.nutritionWrite, label: "Nutrition", detail: "Log food, water, meals, and targets." },
  { value: MCP_SCOPES.trainingWrite, label: "Training", detail: "Save imported plans and log workouts." },
  { value: MCP_SCOPES.progressWrite, label: "Progress", detail: "Save weight, measurements, goals, and PRs." },
  { value: MCP_SCOPES.wellnessWrite, label: "Wellness", detail: "Manage habits, tasks, recovery, and supplements." },
  { value: MCP_SCOPES.profileWrite, label: "Profile", detail: "Update account-level fitness profile fields." }
];

export function ConnectedApps() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [isChatGptModalOpen, setIsChatGptModalOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [connectionToken, setConnectionToken] = useState("");
  const [connections, setConnections] = useState<ChatGptConnection[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(MCP_DEFAULT_SCOPES);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const mcpServerUrl = env.fitlifeMcpServerUrl.trim();
  const hasMcpServerUrl = Boolean(mcpServerUrl);

  function authHeaders() {
    return { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" };
  }

  async function loadConnections() {
    if (!session?.access_token) return;
    const response = await fetch("/api/mcp/connections", { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setConnections(data.connections ?? []);
  }

  async function copyText(value: string, type: "url" | "token") {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    if (type === "url") {
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedToken(true);
      window.setTimeout(() => setCopiedToken(false), 2000);
    }
    toast({ title: "Copied", description: type === "url" ? "FitLife import address copied." : "FitLife connection code copied." });
  }

  async function copyMcpUrl() {
    if (!hasMcpServerUrl) {
      toast({ title: "Import connection is not ready", description: "Ask support to finish ChatGPT import setup for this deployment." });
      return;
    }
    await copyText(mcpServerUrl, "url");
  }

  async function generateConnectionToken() {
    if (!session?.access_token) {
      toast({ title: "Sign in required", description: "Sign in to FitLife before generating a ChatGPT connection token." });
      return;
    }

    setIsBusy("chatgpt-token");
    const response = await fetch("/api/mcp/connections", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ scopes: selectedScopes })
    });
    const data = await response.json().catch(() => ({}));
    setIsBusy(null);

    if (!response.ok) {
      toast({ title: "Could not create connection code", description: data.error ?? "Please try again. If this keeps happening, contact support." });
      return;
    }

    setConnectionToken(data.token ?? "");
    await loadConnections();
    toast({ title: "Connection code created", description: "Copy it now. FitLife shows this code only once." });
  }

  async function revokeConnectionToken() {
    if (!session?.access_token) {
      toast({ title: "Sign in required", description: "Sign in to FitLife before revoking a ChatGPT connection." });
      return;
    }

    setIsBusy("chatgpt-revoke");
    const response = await fetch("/api/mcp/connections", { method: "DELETE", headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    setIsBusy(null);

    if (!response.ok) {
      toast({ title: "Could not revoke token", description: data.error ?? "Please try again." });
      return;
    }

    setConnectionToken("");
    await loadConnections();
    toast({ title: "Connection revoked", description: "Active ChatGPT connection tokens were revoked for this account." });
  }

  function openChatGpt() {
    window.open("https://chatgpt.com", "_blank", "noopener,noreferrer");
  }

  function toggleScope(scope: string) {
    setSelectedScopes((current) => {
      const next = current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope];
      return Array.from(new Set([MCP_SCOPES.profileRead, ...next]));
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Import from ChatGPT
          </CardTitle>
          <CardDescription>
            ChatGPT creates the plan. FitLife stores, schedules, edits, and tracks the imported workout or meal plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasMcpServerUrl ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              ChatGPT import is not ready for this deployment yet. Ask support to finish the connection setup.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setIsChatGptModalOpen(true); void loadConnections(); }}>
              <ExternalLink className="h-4 w-4" /> {hasMcpServerUrl ? "Set up ChatGPT import" : "Import setup unavailable"}
            </Button>
            <Button variant="outline" onClick={revokeConnectionToken} disabled={isBusy === "chatgpt-revoke"}>
              Revoke active connection
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isChatGptModalOpen} onOpenChange={setIsChatGptModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Connect FitLife to ChatGPT</DialogTitle>
            <DialogDescription>
              Use ChatGPT to create your plan, then let FitLife save and track the approved plan.
            </DialogDescription>
          </DialogHeader>

          {!hasMcpServerUrl ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              ChatGPT import is not available yet. Please try again after the connection has been enabled.
            </p>
          ) : null}

          <div className="space-y-4">
            <div className="rounded-md border p-4">
              <p className="font-semibold">Simple import wizard</p>
              <ol className="mt-3 ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
                <li>Generate a FitLife connection code and copy it.</li>
                <li>Open ChatGPT and connect FitLife Hub when ChatGPT asks for an app or connector.</li>
                <li>Ask ChatGPT to import a workout plan or meal plan into FitLife Hub.</li>
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={generateConnectionToken} disabled={isBusy === "chatgpt-token" || !hasMcpServerUrl}>
                  <KeyRound className="h-4 w-4" /> Generate connection code
                </Button>
                <Button type="button" variant="outline" onClick={() => copyText(connectionToken, "token")} disabled={!connectionToken}>
                  <Copy className="h-4 w-4" /> {copiedToken ? "Copied" : "Copy code"}
                </Button>
                <Button type="button" variant="outline" onClick={openChatGpt}>
                  <ExternalLink className="h-4 w-4" /> Open ChatGPT
                </Button>
              </div>
              {connectionToken ? (
                <Input readOnly value={connectionToken} className="mt-3 font-mono text-xs" aria-label="FitLife connection code" />
              ) : null}
            </div>

            <p className="rounded-md border p-3 text-sm text-muted-foreground">
              FitLife is a responsive web app. Browser-supported features are used here; no Google Play or App Store behavior is assumed.
            </p>

            <div className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">Advanced setup</p>
                  <p className="text-sm text-muted-foreground">Only use these details if ChatGPT asks for manual connection fields.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAdvancedSetup((current) => !current)}>
                  <Settings2 className="h-4 w-4" /> {showAdvancedSetup ? "Hide" : "Show"}
                </Button>
              </div>
              {showAdvancedSetup ? (
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-[170px_1fr]">
                  <p className="font-semibold">Name:</p>
                  <p>FitLife Hub</p>
                  <p className="font-semibold">Description:</p>
                  <p>{fitlifeDescription}</p>
                  <p className="font-semibold">Server URL:</p>
                  <div className="space-y-2">
                    <Input readOnly value={mcpServerUrl || "Not configured"} className="font-mono text-xs" />
                    <Button type="button" variant="outline" onClick={copyMcpUrl} disabled={!hasMcpServerUrl}>
                      <Copy className="h-4 w-4" /> {copiedUrl ? "Copied" : "Copy URL"}
                    </Button>
                  </div>
                  <p className="font-semibold">Authentication:</p>
                  <p>Use the FitLife connection code as a bearer token if ChatGPT asks for authentication.</p>
                  <p className="font-semibold">Allowed access:</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {scopeOptions.map((option) => {
                      const checked = selectedScopes.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleScope(option.value)}
                          className={`rounded-md border p-3 text-left transition ${checked ? "border-primary bg-primary/10" : "bg-card hover:border-primary"}`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{option.label}</span>
                            <Badge variant={checked ? "default" : "outline"}>{checked ? "Allowed" : "Off"}</Badge>
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">{option.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">Recent connections</p>
                <Button type="button" variant="outline" size="sm" onClick={loadConnections}>
                  <RefreshCcw className="h-4 w-4" /> Refresh
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {connections.map((connection) => (
                  <div key={connection.id} className="rounded-md bg-muted p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{connection.is_active && !connection.revoked_at ? "Active token" : "Revoked token"}</span>
                      <span className="text-xs text-muted-foreground">{new Date(connection.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last used: {connection.last_used_at ? new Date(connection.last_used_at).toLocaleString() : "Never"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Scopes: {connection.scopes.join(", ") || "No scopes"}</p>
                  </div>
                ))}
                {!connections.length ? <p className="text-sm text-muted-foreground">No previous ChatGPT connections yet.</p> : null}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setIsChatGptModalOpen(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
