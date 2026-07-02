"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Bot, CheckCircle2, Clipboard, ExternalLink, Loader2, X } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
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

const redFlagBlockedActions = new Set<AiActionType>([
  "adjust_next_workout",
  "explain_progression"
]);

export function buildChatGptActionPrompt(request: AiActionRequest, action: AiActionOption) {
  return [
    `Plaivra action request: ${action.label}`,
    action.description,
    "Use the structured Plaivra context below. Explain your recommendation before changing anything.",
    "If I approve a structured update, save it through the connected Plaivra tools. Do not invent missing measurements, diagnose a condition, or make destructive changes without confirmation.",
    `Request ID: ${request.id}`,
    `User note: ${request.user_note || "None"}`,
    "Context:",
    JSON.stringify(request.context_json, null, 2)
  ].join("\n\n");
}

export function AiActionRequestDialog({
  actions,
  sourceType,
  sourceId,
  context,
  title = "Ask ChatGPT",
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

  const prompt = useMemo(() => request && selected ? buildChatGptActionPrompt(request, selected) : "", [request, selected]);

  function openAction(action: AiActionOption) {
    setSelected(action);
    setRequest(null);
    setNote("");
  }

  function closeDialog(open: boolean) {
    if (!open && !isSaving) {
      setSelected(null);
      setRequest(null);
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
      if (safetyProfile?.risk_level === "red" && redFlagBlockedActions.has(selected.type)) {
        toast({
          title: "Request paused for safety",
          description: "Your safety profile is set to red. Review your restrictions and seek qualified guidance before asking for progression or a harder workout adjustment."
        });
        return;
      }
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
      toast({ title: "ChatGPT request ready", description: "Review the context, then copy it or open ChatGPT." });
    } catch (error) {
      toast({ title: "Could not create request", description: error instanceof Error ? error.message : "Please try again." });
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
      toast({ title: "Could not copy", description: "Select the request text and copy it manually." });
    }
  }

  async function cancelRequest() {
    if (!request || !user?.id) return;
    try {
      const cancelled = await updateAiActionRequestStatus(user.id, request.id, "cancelled");
      setRequest(cancelled);
      toast({ title: "Request cancelled", description: "No workout or meal data was changed." });
    } catch (error) {
      toast({ title: "Could not cancel request", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}: {selected?.label}</DialogTitle>
            <DialogDescription>{selected?.description} Plaivra will save a request and context only; it will not change your plan automatically.</DialogDescription>
          </DialogHeader>

          {!request ? (
            <div className="space-y-4">
              {children}
              <div className="space-y-2">
                <Label htmlFor="ai-action-note">Anything ChatGPT should consider?</Label>
                <textarea
                  id="ai-action-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-24 w-full rounded-[14px] border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Optional note, constraint, or preference"
                />
              </div>
              <div className="rounded-[14px] border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Context preview</p>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(context, null, 2)}</pre>
              </div>
              <p className="text-xs text-muted-foreground">Plaivra is not medical advice. Do not train through sharp, unusual, or worsening pain; seek qualified help for medical concerns.</p>
              <Button type="button" className="w-full" onClick={createRequest} disabled={isSaving || !user?.id}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isSaving ? "Preparing request..." : "Prepare ChatGPT request"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[14px] border border-primary/30 bg-primary/5 p-3">
                <p className="text-sm font-semibold">Request {request.status === "cancelled" ? "cancelled" : "ready"}</p>
                <p className="mt-1 text-xs text-muted-foreground">ID: {request.id}</p>
              </div>
              <textarea readOnly value={prompt} className="min-h-64 w-full rounded-[14px] border bg-card px-3 py-2 font-mono text-xs outline-none" aria-label="ChatGPT request prompt" />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" onClick={copyPrompt} disabled={request.status === "cancelled"}><Clipboard className="h-4 w-4" /> Copy request</Button>
                <Button asChild variant="outline" className={request.status === "cancelled" ? "pointer-events-none opacity-50" : ""}>
                  <a href="https://chatgpt.com/" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open ChatGPT</a>
                </Button>
              </div>
              {request.status !== "cancelled" ? (
                <Button type="button" variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={cancelRequest}><X className="h-4 w-4" /> Cancel request</Button>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
