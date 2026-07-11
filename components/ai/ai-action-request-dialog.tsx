"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bot, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { buildAiActionSummary } from "@/components/ai/ai-action-summary";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import type { AiActionType, AiPermissionSection } from "@/types";
import {
  getAiPermissionSettings,
  getDefaultAiPermissionConfig,
  saveAiPermissionSettings,
  type AiPermissionConfig
} from "@/services/database/ai-permissions";

export type AiActionOption = {
  type: AiActionType;
  label: string;
  description: string;
};

function inferPermissionSection(sourceType: string): AiPermissionSection {
  if (sourceType.includes("workout") || sourceType.includes("exercise") || sourceType.includes("plan_exercise")) return "workouts";
  if (sourceType.includes("grocery") || sourceType.includes("meal")) return "meal_plans";
  if (sourceType.includes("food") || sourceType.includes("nutrition")) return "nutrition";
  if (sourceType.includes("wellness") || sourceType.includes("sleep") || sourceType.includes("habit")) return "wellness";
  return "progress";
}

const permissionLabels: Record<AiPermissionSection, string> = {
  workouts: "workouts",
  nutrition: "nutrition",
  meal_plans: "meal plans",
  hydration: "hydration",
  wellness: "wellness",
  progress: "progress",
  profile: "profile",
  settings: "settings"
};

export function AiActionRequestDialog({
  actions,
  sourceType,
  context,
  title = "Continue with ChatGPT",
  children,
  buttonVariant = "outline",
  permissionSection,
  className
}: {
  actions: AiActionOption[];
  sourceType: string;
  sourceId?: string | null;
  context: Record<string, unknown>;
  title?: string;
  children?: ReactNode;
  buttonVariant?: "default" | "outline" | "ghost";
  permissionSection?: AiPermissionSection;
  className?: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<AiActionOption | null>(null);
  const [permissionConfig, setPermissionConfig] = useState<AiPermissionConfig | null>(null);
  const [isPermissionLoading, setIsPermissionLoading] = useState(true);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [isSavingPermission, setIsSavingPermission] = useState(false);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  const section = permissionSection ?? inferPermissionSection(sourceType);
  const sectionLabel = permissionLabels[section];
  const sectionPermission = permissionConfig?.sections[section];
  const hasSectionAccess = permissionConfig?.accessMode === "full" || Boolean(sectionPermission?.read || sectionPermission?.write);

  useEffect(() => {
    let mounted = true;
    if (!user?.id) {
      setPermissionConfig(null);
      setIsPermissionLoading(false);
      return;
    }

    setIsPermissionLoading(true);
    getAiPermissionSettings(user.id)
      .then((saved) => {
        if (mounted) setPermissionConfig(saved);
      })
      .finally(() => {
        if (mounted) setIsPermissionLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const summary = useMemo(
    () => selected ? buildAiActionSummary(selected.type, context) : [],
    [context, selected]
  );

  function openAction(action: AiActionOption, trigger: HTMLButtonElement) {
    lastTriggerRef.current = trigger;
    setSelected(action);
  }

  function closeDialog(open: boolean) {
    if (!open) {
      setSelected(null);
      window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
    }
  }

  function openChatGpt() {
    const chatWindow = window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    if (chatWindow) chatWindow.opener = null;
    if (!chatWindow) {
      toast({
        title: "ChatGPT was blocked by the browser",
        description: "Allow pop-ups, then try again.",
        variant: "error"
      });
    }
  }

  async function grantAccess(mode: "read" | "write" | "both") {
    if (!user?.id) return;
    setIsSavingPermission(true);
    try {
      const base = permissionConfig ?? getDefaultAiPermissionConfig();
      const next: AiPermissionConfig = {
        ...base,
        accessMode: "custom",
        sections: {
          ...base.sections,
          [section]: {
            read: mode === "read" || mode === "write" || mode === "both",
            write: mode === "write" || mode === "both"
          }
        }
      };
      await saveAiPermissionSettings(user.id, next);
      setPermissionConfig(next);
      setPermissionDialogOpen(false);
      toast({ title: "ChatGPT access updated", description: `Access for ${sectionLabel} is now available.` });
    } catch {
      toast({ title: "Could not update ChatGPT access", description: "Please refresh and try again.", variant: "error" });
    } finally {
      setIsSavingPermission(false);
    }
  }

  if (isPermissionLoading) {
    return <p className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking ChatGPT access…</p>;
  }

  if (!hasSectionAccess) {
    return (
      <>
        <button
          type="button"
          onClick={() => setPermissionDialogOpen(true)}
          className={cn("min-h-11 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        >
          Give ChatGPT access for {sectionLabel}
        </button>
        <Dialog open={permissionDialogOpen} onOpenChange={setPermissionDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Give ChatGPT access to {sectionLabel}?</DialogTitle>
              <DialogDescription>
                Choose the smallest access level needed. Plaivra enforces the current saved permissions on every tool request, and you can revoke access later.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Button type="button" variant="outline" onClick={() => void grantAccess("read")} disabled={isSavingPermission}>Read only</Button>
              <Button type="button" onClick={() => void grantAccess("both")} disabled={isSavingPermission}>Read and write</Button>
              <Button type="button" variant="ghost" onClick={() => setPermissionDialogOpen(false)} disabled={isSavingPermission}>Do not give access</Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className={className ?? "flex flex-wrap gap-2"}>
        {actions.map((action) => (
          <Button
            key={action.type}
            type="button"
            variant={buttonVariant}
            size="sm"
            onClick={(event) => openAction(action, event.currentTarget)}
          >
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
              Open ChatGPT with Plaivra connected. ChatGPT reads only the authorized context needed and uses Plaivra tools for requested changes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-foreground">{selected?.label}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{selected?.description}</p>
            </div>

            <div className="divide-y divide-border/70 rounded-[16px] border border-border/70 bg-muted/20 px-4">
              {summary.map((row) => (
                <div key={row.label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3 text-sm">
                  <span className="font-medium text-muted-foreground">{row.label}</span>
                  <span className="font-semibold text-foreground">{row.value}</span>
                </div>
              ))}
            </div>

            {children}

            <div className="flex gap-3 rounded-[16px] border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Use your active Plaivra connection and the permissions saved for {sectionLabel}. Successful tool changes appear directly in Plaivra, where you can track, edit, or correct them.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => closeDialog(false)}>Cancel</Button>
              <Button type="button" onClick={openChatGpt}><ExternalLink className="h-4 w-4" /> Open ChatGPT</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
