"use client";

import { useState } from "react";
import { Activity, Bot, Copy, ExternalLink, KeyRound, MapPin, RefreshCcw, Smartphone, Watch } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { env } from "@/lib/env";

const fitlifeDescription = "ChatGPT creates workout plans, meal plans, food logs, weight logs, water logs, habits, and saves/tracks them in FitLife.";

export function ConnectedApps() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [origin, setOrigin] = useState("");
  const [routeText, setRouteText] = useState("");
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [isChatGptModalOpen, setIsChatGptModalOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [connectionToken, setConnectionToken] = useState("");
  const mcpServerUrl = env.fitlifeMcpServerUrl.trim();
  const hasMcpServerUrl = Boolean(mcpServerUrl);

  function authHeaders() {
    return { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" };
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
    toast({ title: "Copied", description: type === "url" ? "FitLife MCP Server URL copied." : "FitLife connection token copied." });
  }

  async function copyMcpUrl() {
    if (!hasMcpServerUrl) {
      toast({ title: "Connector URL not configured", description: "Set NEXT_PUBLIC_FITLIFE_MCP_SERVER_URL in your deployment environment." });
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
    const response = await fetch("/api/mcp/connections", { method: "POST", headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    setIsBusy(null);

    if (!response.ok) {
      toast({ title: "Could not create token", description: data.error ?? "Check MCP server configuration and Supabase tables." });
      return;
    }

    setConnectionToken(data.token ?? "");
    toast({ title: "Connection token created", description: "Copy it now. FitLife shows this token only once." });
  }

  function openChatGpt() {
    window.open("https://chatgpt.com", "_blank", "noopener,noreferrer");
  }

  async function connectStrava() {
    setIsBusy("strava");
    const response = await fetch("/api/integrations/strava/auth", { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
    const data = await response.json().catch(() => ({}));
    setIsBusy(null);
    if (!response.ok) return toast({ title: "Strava not configured", description: data.error ?? "Check server settings." });
    window.location.href = data.url;
  }

  async function importStrava() {
    setIsBusy("strava-import");
    const response = await fetch("/api/integrations/strava/import-activities", { method: "POST", headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    setIsBusy(null);
    if (!response.ok) return toast({ title: "Could not import Strava", description: data.error ?? "Please reconnect Strava." });
    toast({ title: "Strava imported", description: `${data.imported ?? 0} activities saved.` });
  }

  async function connectGoogleHealth() {
    setIsBusy("google-health");
    const response = await fetch("/api/integrations/google-health/auth", { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
    const data = await response.json().catch(() => ({}));
    setIsBusy(null);
    if (!response.ok) return toast({ title: "Google Health not configured", description: data.error ?? "Check server settings." });
    window.location.href = data.url;
  }

  async function calculateRoute() {
    setIsBusy("maps");
    const response = await fetch("/api/maps/routes", { method: "POST", headers: authHeaders(), body: JSON.stringify({ origin: { address: origin } }) });
    const data = await response.json().catch(() => ({}));
    setIsBusy(null);
    if (!response.ok) return toast({ title: "Route unavailable", description: data.error ?? "Check Google Maps configuration." });
    const meters = data.route?.distanceMeters;
    const duration = String(data.route?.duration ?? "").replace("s", "");
    setRouteText(`${meters ? `${(meters / 1000).toFixed(1)} km` : "Distance unavailable"} | ${duration ? `${Math.round(Number(duration) / 60)} min` : "time unavailable"}`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Connect FitLife to ChatGPT
          </CardTitle>
          <CardDescription>
            ChatGPT can create workout plans and update FitLife through the FitLife MCP connector. FitLife stores, schedules, edits, and tracks the data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasMcpServerUrl ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Connector URL not configured. Set NEXT_PUBLIC_FITLIFE_MCP_SERVER_URL to your deployed FitLife MCP endpoint.
            </p>
          ) : null}
          <Button onClick={() => setIsChatGptModalOpen(true)}>
            <ExternalLink className="h-4 w-4" /> {hasMcpServerUrl ? "Set up FitLife in ChatGPT" : "Connector URL not configured"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isChatGptModalOpen} onOpenChange={setIsChatGptModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Connect FitLife to ChatGPT</DialogTitle>
            <DialogDescription>
              FitLife cannot install the ChatGPT app automatically. ChatGPT requires the user to create/connect custom MCP apps from inside ChatGPT.
            </DialogDescription>
          </DialogHeader>

          {!hasMcpServerUrl ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              FitLife MCP server endpoint is not implemented yet or the connector URL is not configured. Build/deploy the MCP server first, then set FITLIFE_MCP_SERVER_URL.
            </p>
          ) : null}

          <div className="space-y-4">
            <div className="grid gap-3 rounded-md border p-4 text-sm md:grid-cols-[150px_1fr]">
              <p className="font-semibold">Name:</p>
              <p>FitLife</p>
              <p className="font-semibold">Description:</p>
              <p>{fitlifeDescription}</p>
              <p className="font-semibold">Connection:</p>
              <p>Server URL</p>
              <p className="font-semibold">Server URL:</p>
              <div className="space-y-2">
                <Input readOnly value={mcpServerUrl || "Not configured"} className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={copyMcpUrl} disabled={!hasMcpServerUrl}>
                  <Copy className="h-4 w-4" /> {copiedUrl ? "Copied" : "Copy URL"}
                </Button>
              </div>
              <p className="font-semibold">Authentication:</p>
              <p>OAuth</p>
              <p className="font-semibold">Access token:</p>
              <div className="space-y-2">
                <Input readOnly value={connectionToken || "Generate a user-specific token first"} className="font-mono text-xs" />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={generateConnectionToken} disabled={isBusy === "chatgpt-token"}>
                    <KeyRound className="h-4 w-4" /> Generate connection token
                  </Button>
                  <Button type="button" variant="outline" onClick={() => copyText(connectionToken, "token")} disabled={!connectionToken}>
                    <Copy className="h-4 w-4" /> {copiedToken ? "Copied" : "Copy token"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">This token is specific to the signed-in FitLife user and is shown only once.</p>
              </div>
            </div>

            <div className="rounded-md border p-4">
              <p className="font-semibold">Instructions</p>
              <ol className="mt-3 ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
                <li>Click Generate connection token and copy it.</li>
                <li>Click Open ChatGPT.</li>
                <li>Go to Settings, Apps and Connectors, then Create.</li>
                <li>In the New App modal, enter Name: FitLife.</li>
                <li>Use the description shown above.</li>
                <li>Set Connection to Server URL.</li>
                <li>Copy the FitLife MCP URL into Server URL.</li>
                <li>Set Authentication to OAuth.</li>
                <li>If ChatGPT asks for OAuth Client ID or connection token, paste the FitLife token you generated.</li>
                <li>Check I understand and want to continue.</li>
                <li>Click Create.</li>
                <li>Approve FitLife OAuth/login if asked.</li>
                <li>Start a new chat and select FitLife as a tool.</li>
              </ol>
            </div>

            <p className="rounded-md border p-3 text-sm text-muted-foreground">
              If you do not see the Create button in ChatGPT, enable Developer Mode in ChatGPT: Settings, Apps and Connectors, Advanced settings.
            </p>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setIsChatGptModalOpen(false)}>Close</Button>
              <Button onClick={openChatGpt}>
                <ExternalLink className="h-4 w-4" /> Open ChatGPT
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Watch className="h-5 w-5 text-primary" /> Connected Apps</CardTitle>
          <CardDescription>Cardio imports stay private to your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border p-3"><p className="font-semibold">Strava</p><p className="mt-1 text-sm text-muted-foreground">Connect and import completed cardio activities.</p><div className="mt-3 flex flex-wrap gap-2"><Button onClick={connectStrava} disabled={isBusy === "strava"}><Activity className="h-4 w-4" /> Connect</Button><Button variant="outline" onClick={importStrava} disabled={isBusy === "strava-import"}><RefreshCcw className="h-4 w-4" /> Import</Button></div></div>
          <div className="rounded-md border p-3"><p className="font-semibold">Google Health</p><p className="mt-1 text-sm text-muted-foreground">OAuth-ready. Import is feature-gated until API scopes are approved.</p><Button className="mt-3" variant="outline" onClick={connectGoogleHealth} disabled={isBusy === "google-health"}>Connect placeholder</Button></div>
          <div className="rounded-md border p-3"><p className="font-semibold">Health Connect</p><p className="mt-1 text-sm text-muted-foreground">Health Connect is available only in the future Android app.</p></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Gym Distance</CardTitle><CardDescription>Google Maps Routes estimates travel distance and time when configured.</CardDescription></CardHeader>
        <CardContent className="space-y-3"><Input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Enter your starting address" /><Button onClick={calculateRoute} disabled={!origin.trim() || isBusy === "maps"}><MapPin className="h-4 w-4" /> Calculate route</Button>{routeText ? <p className="rounded-md border bg-card p-3 text-sm font-semibold">{routeText}</p> : null}<div className="flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground"><Smartphone className="mt-0.5 h-4 w-4 text-primary" /> Browser location can be added later by passing latitude and longitude to the same server route.</div></CardContent>
      </Card>
    </div>
  );
}
