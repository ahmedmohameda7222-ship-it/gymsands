"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Clipboard, ExternalLink, Loader2, Send, X } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { buildChatGptActionPrompt, getAiActionPresentation } from "@/components/ai/ai-action-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { getAiActionRequests, updateAiActionRequestStatus } from "@/services/database/execution-layer";
import type { AiActionRequest, AiActionRequestStatus } from "@/types";

const statusLabels: Record<AiActionRequestStatus, string> = {
  draft: "Draft",
  ready_for_chatgpt: "Ready",
  sent_to_chatgpt: "Sent",
  resolved: "Resolved",
  cancelled: "Cancelled"
};

function relativeDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const todayKey = today.toLocaleDateString("en-CA");
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const valueKey = date.toLocaleDateString("en-CA");
  if (valueKey === todayKey) return "Today";
  if (valueKey === yesterday.toLocaleDateString("en-CA")) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function RecentAiActionRequests({ limit, compact = false }: { limit?: number; compact?: boolean }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [requests, setRequests] = useState<AiActionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const saved = await getAiActionRequests(userId);
      setRequests(typeof limit === "number" ? saved.slice(0, limit) : saved);
    } catch (error) {
      if (!compact) toast({ title: "Could not load ChatGPT requests", description: userSafeError(error, "Please refresh and try again.") });
    } finally {
      setIsLoading(false);
    }
  }, [compact, limit, toast, userId]);

  useEffect(() => { void load(); }, [load]);

  async function copyRequest(request: AiActionRequest) {
    try {
      await navigator.clipboard.writeText(buildChatGptActionPrompt(request));
      toast({ title: "Request copied", description: "Paste it into ChatGPT when you are ready." });
    } catch {
      toast({ title: "Could not copy request", description: "Please try again." });
    }
  }

  async function changeStatus(request: AiActionRequest, status: AiActionRequestStatus) {
    if (!userId) return;
    setBusyId(request.id);
    try {
      const updated = await updateAiActionRequestStatus(userId, request.id, status);
      setRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      toast({ title: "Could not update request", description: userSafeError(error) });
    } finally {
      setBusyId(null);
    }
  }

  const content = (
    <>
      {isLoading ? <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading requests...</div> : null}
      {!isLoading && !requests.length ? <p className="py-3 text-sm text-muted-foreground">No saved ChatGPT requests yet. Requests you prepare from workouts, meals, groceries, or weekly reviews will appear here.</p> : null}
      <div className="divide-y divide-border/70">
        {requests.map((request) => {
          const presentation = getAiActionPresentation(request.action_type);
          const finished = request.status === "resolved" || request.status === "cancelled";
          return (
            <div key={request.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{presentation.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{statusLabels[request.status]} · {relativeDate(request.created_at)}</p>
                </div>
                <span className="text-xs font-semibold text-primary">{statusLabels[request.status]}</span>
              </div>
              {!compact ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => copyRequest(request)} disabled={request.status === "cancelled"}><Clipboard className="h-4 w-4" /> Copy</Button>
                  <Button asChild size="sm" variant="outline" className={request.status === "cancelled" ? "pointer-events-none opacity-50" : ""}><a href="https://chatgpt.com/" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open</a></Button>
                  {request.status === "ready_for_chatgpt" ? <Button type="button" size="sm" variant="ghost" onClick={() => changeStatus(request, "sent_to_chatgpt")} disabled={busyId === request.id}><Send className="h-4 w-4" /> Mark sent</Button> : null}
                  {!finished ? <Button type="button" size="sm" variant="ghost" onClick={() => changeStatus(request, "resolved")} disabled={busyId === request.id}><Check className="h-4 w-4" /> Resolve</Button> : null}
                  {!finished ? <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => changeStatus(request, "cancelled")} disabled={busyId === request.id}><X className="h-4 w-4" /> Cancel</Button> : null}
                </div>
              ) : null}
            </div>
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
