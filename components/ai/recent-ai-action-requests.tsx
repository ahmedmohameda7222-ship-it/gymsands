"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Clipboard, ExternalLink, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { buildChatGptActionPrompt, getAiActionPresentation } from "@/components/ai/ai-action-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/state-views";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { InlineFeedback } from "@/components/motion";
import { getAiActionRequests, updateAiActionRequestStatus } from "@/services/database/execution-layer";
import type { AiActionRequest, AiActionRequestStatus } from "@/types";

type RequestFilter = "open" | "waiting" | "done" | "cancelled" | "all";

const statusPresentation: Record<AiActionRequestStatus, { label: string; description: string }> = {
  draft: { label: "Draft", description: "Still being prepared." },
  ready_for_chatgpt: { label: "Ready to copy", description: "Prepared, but not sent to ChatGPT yet." },
  sent_to_chatgpt: { label: "Waiting for ChatGPT", description: "You marked this as pasted into ChatGPT." },
  resolved: { label: "Done", description: "You finished with this request." },
  cancelled: { label: "Cancelled", description: "You decided not to use this request." }
};

const filters: Array<{ value: RequestFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" }
];

function relativeDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const todayKey = today.toLocaleDateString("en-CA");
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const valueKey = date.toLocaleDateString("en-CA");
  if (valueKey === todayKey) return "Today";
  if (valueKey === yesterday.toLocaleDateString("en-CA")) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function RecentAiActionRequests({ limit, compact = false }: { limit?: number; compact?: boolean }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [requests, setRequests] = useState<AiActionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RequestFilter>("open");
  const [search, setSearch] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError("");
    try {
      const saved = await getAiActionRequests(userId);
      setRequests(typeof limit === "number" ? saved.slice(0, limit) : saved);
    } catch (error) {
      const message = userSafeError(error, "Please refresh and try again.");
      setLoadError(message);
      if (!compact) toast({ title: "Could not load ChatGPT requests", description: message });
    } finally {
      setIsLoading(false);
    }
  }, [compact, limit, toast, userId]);

  useEffect(() => { void load(); }, [load]);

  const visibleRequests = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const matchesFilter = (request: AiActionRequest) => {
      if (filter === "open") return request.status === "draft" || request.status === "ready_for_chatgpt";
      if (filter === "waiting") return request.status === "sent_to_chatgpt";
      if (filter === "done") return request.status === "resolved";
      if (filter === "cancelled") return request.status === "cancelled";
      return true;
    };
    return requests
      .filter((request) => matchesFilter(request))
      .filter((request) => showCompleted || filter === "done" || filter === "cancelled" || (request.status !== "resolved" && request.status !== "cancelled"))
      .filter((request) => {
        if (!needle) return true;
        const presentation = getAiActionPresentation(request.action_type);
        return `${presentation.label} ${presentation.description} ${request.source_type}`.toLocaleLowerCase().includes(needle);
      })
      .toSorted((a, b) => newestFirst ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at));
  }, [filter, newestFirst, requests, search, showCompleted]);

  async function copyRequest(request: AiActionRequest) {
    try {
      await navigator.clipboard.writeText(buildChatGptActionPrompt(request));
      setCopiedId(request.id);
      toast({ title: "Request copied", description: "Paste it into ChatGPT when you are ready." });
    } catch {
      toast({ title: "Could not copy request", description: "Please try again.", variant: "error" });
    }
  }

  async function changeStatus(request: AiActionRequest, status: AiActionRequestStatus) {
    if (!userId) return;
    setBusyId(request.id);
    try {
      const updated = await updateAiActionRequestStatus(userId, request.id, status);
      setRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast({ title: statusPresentation[status].label, description: statusPresentation[status].description });
    } catch (error) {
      toast({ title: "Could not update request", description: userSafeError(error), variant: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const content = (
    <>
      {!compact ? (
        <div className="mb-5 space-y-4">
          <div>
            <p className="font-semibold text-foreground">These are requests you prepared for ChatGPT.</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Copy them again, continue in ChatGPT, correct a status, or hide completed requests. Plaivra never sends them automatically.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">Search requests</span><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search request labels" /></label>
            <Button type="button" variant="outline" onClick={() => setNewestFirst((current) => !current)}><ArrowDownUp className="h-4 w-4" /> {newestFirst ? "Newest first" : "Oldest first"}</Button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {filters.map((item) => <Button key={item.value} type="button" size="sm" variant={filter === item.value ? "default" : "outline"} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</Button>)}
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" className="h-5 w-5 accent-primary" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} /> Show completed and cancelled in All</label>
        </div>
      ) : null}

      {isLoading ? <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading requests...</div> : null}
      {!isLoading && loadError ? <ErrorState description={loadError} onRetry={() => void load()} /> : null}
      {!isLoading && !loadError && !visibleRequests.length ? (
        <div className="rounded-[16px] border border-dashed p-4">
          <p className="font-semibold text-foreground">{requests.length ? "No requests match this view" : "No ChatGPT requests yet"}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Prepare one from a workout, meal plan, grocery list, or weekly review. It will appear here until you decide what to do with it.</p>
          {!compact ? <div className="mt-3 flex flex-wrap gap-2"><Button asChild size="sm"><Link href="/my-meal-plan">Open meal plan</Link></Button><Button asChild size="sm" variant="outline"><Link href="/my-workout/plans">Open workouts</Link></Button><Button asChild size="sm" variant="outline"><Link href="/dashboard">Open weekly review</Link></Button></div> : null}
        </div>
      ) : null}

      <div className="space-y-3">
        {visibleRequests.map((request) => {
          const presentation = getAiActionPresentation(request.action_type);
          const status = statusPresentation[request.status];
          return (
            <article key={request.id} className="rounded-[16px] border border-border/70 bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{presentation.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{presentation.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{relativeDate(request.created_at)}</p>
                </div>
                <div className="rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-right">
                  <p className="text-xs font-semibold text-primary">{status.label}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{status.description}</p>
              {!compact ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {copiedId === request.id ? (
                    <Button type="button" size="sm" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" /> Refresh</Button>
                  ) : (
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyRequest(request)} disabled={busyId === request.id}><Clipboard className="h-4 w-4" /> Copy</Button>
                  )}
                  <Button asChild size="sm" variant="outline"><a href="https://chatgpt.com/" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open ChatGPT</a></Button>
                  {request.status !== "resolved" && request.status !== "cancelled" ? <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void changeStatus(request, "cancelled")} disabled={busyId === request.id}><X className="h-4 w-4" /> Cancel</Button> : null}
                </div>
              ) : null}
              <InlineFeedback message={copiedId === request.id ? "Copied to your clipboard. Nothing was sent automatically." : ""} onClose={() => setCopiedId(null)} />
            </article>
          );
        })}
      </div>
    </>
  );

  if (compact) {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent ChatGPT requests</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link href="/settings/chatgpt-requests">View all</Link></Button>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
    );
  }

  return <Card><CardContent className="p-4 sm:p-5">{content}</CardContent></Card>;
}
