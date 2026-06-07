"use client";

import { useState } from "react";
import { Activity, Bot, ExternalLink, MapPin, RefreshCcw, Smartphone, Watch } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { env } from "@/lib/env";

export function ConnectedApps() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [origin, setOrigin] = useState("");
  const [routeText, setRouteText] = useState("");
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [isChatGptModalOpen, setIsChatGptModalOpen] = useState(false);

  function authHeaders() {
    return { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" };
  }

  function continueToChatGpt() {
    if (!env.chatgptConnectUrl) {
      toast({
        title: "ChatGPT connection link is not configured yet",
        description: "Add NEXT_PUBLIC_CHATGPT_CONNECT_URL in your deployment environment."
      });
      return;
    }
    window.location.href = env.chatgptConnectUrl;
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
            <Bot className="h-5 w-5 text-primary" /> Connect to ChatGPT
          </CardTitle>
          <CardDescription>
            ChatGPT creates workout plans and updates FitLife through the external MCP connector. FitLife stores and tracks the data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setIsChatGptModalOpen(true)}>
            <ExternalLink className="h-4 w-4" /> Connect to ChatGPT
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isChatGptModalOpen} onOpenChange={setIsChatGptModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable ChatGPT Developer Mode first</DialogTitle>
            <DialogDescription>
              To connect FitLife to ChatGPT, Developer Mode must be enabled in ChatGPT first. FitLife cannot reliably detect that from the browser, so follow these steps before continuing.
            </DialogDescription>
          </DialogHeader>
          <ol className="ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
            <li>Open ChatGPT.</li>
            <li>Go to Settings.</li>
            <li>Go to Apps &amp; Connectors.</li>
            <li>Open Advanced settings.</li>
            <li>Enable Developer Mode.</li>
            <li>Return to FitLife and click continue.</li>
          </ol>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setIsChatGptModalOpen(false)}>Cancel</Button>
            <Button onClick={continueToChatGpt}>I enabled Developer Mode, continue</Button>
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
