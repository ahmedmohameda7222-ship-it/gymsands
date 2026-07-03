"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Bot, Check, CheckCircle2, Clipboard, ExternalLink, Loader2, Send, X } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { buildAiActionSummary, buildChatGptActionPrompt } from "@/components/ai/ai-action-summary";
import { getAiActionSafetyDecision, type AiActionSafetyDecision } from "@/components/ai/ai-action-safety";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import {
  createAiActionRequest,
  getNutritionPreferenceProfile,
  getSafetyProfile,
  updateAiActionRequestStatus
} from "@/services/database/execution-layer";
import type { AiActionRequest, AiActionType } from "@/types";

export type AiActionOption = {
  type: AiActionType;
  label: string;
  description: string;
};

export { buildChatGptActionPrompt } from "@/components/ai/ai-action-summary";

const statusLabels: Record<AiActionRequest["status"], string> = {
  draft: "Draft",
  ready_for_chatgpt: "Ready",
  sent_to_chatgpt: "Sent",
  resolved: "Resolved",
  cancelled: "Cancelled"
};

export function AiActionRequestDialog({
  actions,
  sourceType,
  sourceId,
  context,
  title = "Ask ChatGPT for help",
  children,
  buttonVariant = "outline",
  className
}: {
  actions: AiActionOption[];
  sourceType: string;
  sourceId?: string | null;
  context: Record<string, unknown>;
  title?: string;
  children?: ReactNode;
  buttonVariant?: "default" | "outline" | "ghost";
  className?: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<AiActionOption | null>(null);
  const [note, setNote] = useState("");
  const [request, setRequest] = useState<AiActionRequest | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [safetyDecision, setSafetyDecision] = useState<AiActionSafetyDecision>({ decision: "allow" });

  const summary = useMemo(() => selected ? buildAiActionSummary(selected.type, context) : [], [context, selected]);
  const prompt = useMemo(
    () => request && selected ? buildChatGptActionPrompt(request, { label: selected.label, description: selected.description, goal: selected.label }) : "",
    [request, selected]
  );

  function openAction(action: AiActionOption) {
    setSelected(action);
    setRequest(null);
    setNote("");
    setSafetyDecision({ decision: "allow" });
  }

  function closeDialog(open: boolean) {
    if (!open && !isSaving) {
      setSelected(null);
      setRequest(null);
      setSafetyDecision({ decision: "allow" });
    }
  }

  async function createRequest() {
    if (!user?.id || !selected) return;
    setIsSaving(true);
    try {
      const [safetyProfile, nutritionProfile] = await Promise.all([
        getSafetyProfile(user.id).catch(() => null),
        getNutritionPreferenceProfile(user.id).catch(() => null)
      ]);
      const decision = getAiActionSafetyDecision(selected.type, safetyProfile);
      setSafetyDecision(decision);
      if (decision.decision === "block") return;

      const saved = await createAiActionRequest({
        userId: user.id,
        actionType: selected.type,
        sourceType,
        sourceId,
        userNote: note,
        context: {
          ...context,
          ...(safetyProfile ? { safety_profile: safetyProfile } : {}),
          ...(nutritionProfile ? { nutrition_preference_profile: nutritionProfile } : {}),
          product_rule: "ChatGPT decides; Plaivra stores and tracks only. No automatic plan rewrite."
        }
      });
      setRequest(saved);
      toast({ title: "Request ready", description: "Copy it or open ChatGPT when you are ready." });
    } catch (error) {
      toast({ title: "Could not prepare request", description: userSafeError(error, "Please try again. Your choices are still here.") });
    } finally {
      setIsSaving(false);
    }
  }

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      toast({ title: "Request copied", description: "Paste it into ChatGPT when you are ready." });
    } catch {
      toast({ title: "Could not copy", description: "Please try again." });
    }
  }

  async function changeStatus(status: AiActionRequest["status"]) {
    if (!request || !user?.id) return;
    setIsSaving(true);
    try {
      const updated = await updateAiActionRequestStatus(user.id, request.id, status);
      setRequest(updated);
      toast({
        title: status === "sent_to_chatgpt" ? "Marked as sent" : status === "resolved" ? "Request resolved" : "Request cancelled",
        description: status === "cancelled" ? "No workout or meal data was changed." : "Your saved request is up to date."
      });
    } catch (error) {
      toast({ title: "Could not update request", description: userSafeError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  const requestFinished = request?.status === "resolved" || request?.status === "cancelled";

  return (
    <>
      <div className={className ?? "flex flex-wrap gap-2"}>
        {actions.map((action) => (
          <Button key={action.type} type="button" variant={buttonVariant} size="sm" onClick={() => openAction(action)}>
            <Bot className="h-4 w-4" />
            {action.label}
          </Button>
        ))}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {request ? "Review the next steps and keep control of anything saved in Plaivra." : "Choose what you want help with. Plaivra will not change anything automatically."}
            </DialogDescription>
          </DialogHeader>

          {!request ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">What do you want help with?</p>
                <p className="mt-1 text-sm text-muted-foreground">{selected?.description}</p>
              </div>
              <div className="divide-y divide-border/70 rounded-[16px] border border-border/70 bg-muted/20 px-4">
                {summary.map((row) => (
                  <div key={row.label} className="grid grid-cols-[7rem_1fr] gap-3 py-3 text-sm">
                    <span className="font-medium text-muted-foreground">{row.label}</span>
                    <span className="font-semibold text-foreground">{row.value}</span>
                  </div>
                ))}
              </div>
              {children}
              <div className="space-y-2">
                <Label htmlFor="ai-action-note">Optional note</Label>
                <textarea
                  id="ai-action-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-24 w-full rounded-[14px] border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Add a preference, constraint, or detail"
                  maxLength={500}
                />
              </div>
              {safetyDecision.message ? <SafetyMessage decision={safetyDecision} /> : null}
              <p className="text-xs leading-5 text-muted-foreground">Plaivra is not medical advice. Stop if pain is sharp, unusual, or worsening, and seek qualified help for medical concerns.</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={() => closeDialog(false)}>Cancel</Button>
                <Button type="button" onClick={createRequest} disabled={isSaving || !user?.id}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {isSaving ? "Preparing..." : "Prepare request"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[16px] border border-primary/25 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-foreground">Your ChatGPT request is ready.</p>
                  <span className="text-xs font-semibold text-primary">{statusLabels[request.status]}</span>
                </div>
                <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {["Open ChatGPT.", "Ask ChatGPT to help with this request.", "Review the answer.", "Approve only the changes you want saved in Plaivra."].map((step, index) => (
                    <li key={step} className="flex gap-2"><span className="font-semibold text-primary">{index + 1}.</span>{step}</li>
                  ))}
                </ol>
              </div>
              <div className="rounded-[16px] border border-border/70 bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your request</p>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-foreground">{prompt}</p>
              </div>
              {safetyDecision.message ? <SafetyMessage decision={safetyDecision} /> : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" onClick={copyPrompt} disabled={request.status === "cancelled"}><Clipboard className="h-4 w-4" /> Copy request</Button>
                <Button asChild variant="outline" className={request.status === "cancelled" ? "pointer-events-none opacity-50" : ""}>
                  <a href="https://chatgpt.com/" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open ChatGPT</a>
                </Button>
                {request.status === "ready_for_chatgpt" ? (
                  <Button type="button" variant="outline" onClick={() => changeStatus("sent_to_chatgpt")} disabled={isSaving}><Send className="h-4 w-4" /> Mark as sent</Button>
                ) : null}
                {!requestFinished ? (
                  <Button type="button" variant="outline" onClick={() => changeStatus("resolved")} disabled={isSaving}><Check className="h-4 w-4" /> Mark as resolved</Button>
                ) : null}
              </div>
              {!requestFinished ? (
                <Button type="button" variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={() => changeStatus("cancelled")} disabled={isSaving}><X className="h-4 w-4" /> Cancel request</Button>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SafetyMessage({ decision }: { decision: AiActionSafetyDecision }) {
  return (
    <div className={`rounded-[14px] border p-3 text-sm leading-6 ${decision.decision === "block" ? "border-destructive/30 bg-destructive/10" : "border-warning/30 bg-warning/10"}`}>
      <p className="font-semibold text-foreground">{decision.decision === "block" ? "Request paused for safety" : "A little extra caution"}</p>
      <p className="mt-1 text-muted-foreground">{decision.message}</p>
    </div>
  );
}
