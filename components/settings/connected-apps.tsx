"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Bot, Copy, KeyRound, MapPin, RefreshCcw, Smartphone, Trash2, Watch } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";

type ChatGptConnection = {
  id: string;
  label: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export function ConnectedApps() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [origin, setOrigin] = useState("");
  const [routeText, setRouteText] = useState("");
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [chatGptConnection, setChatGptConnection] = useState<ChatGptConnection | null>(null);
  const [chatGptToken, setChatGptToken] = useState("");

  const mcpUrl = useMemo(() => {
    if (typeof window === "undefined") return "/api/mcp";
    return `${window.location.origin}/api/mcp`;
  }, []);

  function authHeaders() {
    return { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" };
  }

  async function loadChatGptConnection() {
    if (!session?.access_token) return;
    const response = await fetch("/api/chatgpt-connection", { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setChatGptConnection(data.active_connection ?? null);
  }

  useEffect(() => {
    void loadChatGptConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  async function createChatGptConnection() {
    setIsBusy("chatgpt-create");
    const response = await fetch("/api/chatgpt-connection", { method: "POST", headers: authHeaders(), body: JSON.stringify({ label: "ChatGPT" }) });
    const data = await response.json().catch(() => ({}));
    setIsBusy(null);
    if (!response.ok) return toast({ title: "ChatGPT connection failed", description: data.error ?? "Check MCP server settings." });
    setChatGptConnection(data.connection);
    setChatGptToken(data.token);
    toast({ title: "ChatGPT connection created", description: "Copy the token now. It is shown only once." });
  }

  async function revokeChatGptConnection() {
    setIsBusy("chatgpt-revoke");
    const response = await fetch("/api/chatgpt-connection", { method: "DELETE", headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    setIsBusy(null);
    if (!response.ok) return toast({ title: "Could not revoke ChatGPT", description: data.error ?? "Try again." });
    setChatGptConnection(null);
    setChatGptToken("");
    toast({ title: "ChatGPT access revoked", description: "ChatGPT can no longer update this FitLife account." });
  }

  async function copyText(value: string, title: string) {
    await navigator.clipboard.writeText(value);
    toast({ title, description: "Copied to clipboard." });
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
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> ChatGPT Connection</CardTitle>
          <CardDescription>External MCP connection. This is not an in-app chatbot and does not use Gemini.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-card p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold">{chatGptConnection ? "Connected" : "Not connected"}</p>
                <p className="mt-1 text-sm text-muted-foreground">ChatGPT can update your FitLife data only after you connect your FitLife account. You can revoke access anytime.</p>
                {chatGptConnection ? <p className="mt-2 text-xs text-muted-foreground">Last used: {chatGptConnection.last_used_at ? new Date(chatGptConnection.last_used_at).toLocaleString() : "Never"} · Scopes: {chatGptConnection.scopes.join(", ")}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={createChatGptConnection} disabled={isBusy === "chatgpt-create"}><KeyRound className="h-4 w-4" /> {chatGptConnection ? "Create new token" : "Create connection"}</Button>
                <Button variant="outline" onClick={revokeChatGptConnection} disabled={!chatGptConnection || isBusy === "chatgpt-revoke"}><Trash2 className="h-4 w-4" /> Revoke</Button>
              </div>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-sm font-semibold">MCP endpoint</p>
              <div className="mt-2 flex gap-2"><Input readOnly value={mcpUrl} /><Button variant="outline" size="icon" onClick={() => copyText(mcpUrl, "MCP URL copied")} aria-label="Copy MCP endpoint"><Copy className="h-4 w-4" /></Button></div>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-sm font-semibold">One-time token</p>
              <div className="mt-2 flex gap-2"><Input readOnly value={chatGptToken || "Create a connection to show the token once"} /><Button variant="outline" size="icon" onClick={() => copyText(chatGptToken, "Token copied")} disabled={!chatGptToken} aria-label="Copy ChatGPT token"><Copy className="h-4 w-4" /></Button></div>
              <p className="mt-2 text-xs text-muted-foreground">FitLife stores only a hashed token. If you lose it, create a new connection.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Watch className="h-5 w-5 text-primary" /> Connected Apps</CardTitle><CardDescription>Cardio imports stay private to your account.</CardDescription></CardHeader>
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
