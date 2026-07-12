"use client";

import Link from "next/link";
import { ArrowLeft, Copy, ExternalLink, Loader2, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useTodayTranslation, type TodayKey } from "@/lib/i18n/today";
import { localizePrompt, rankQuickPrompts, type PromptCapability, type QuickPromptContext, type QuickPromptDefinition } from "@/lib/ai/quick-prompts";
import { getAiPermissionSettingsWithStatus, type AiPermissionConfig, type AiPermissionSettingsStatus } from "@/services/database/ai-permissions";
import type { AiPermissionSection } from "@/types";

export type CustomQuickPrompt = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  permissionSections: AiPermissionSection[];
  capability: PromptCapability;
  destination?: string;
  contextChips?: string[];
  attachmentExpected?: boolean;
};

type QuickChatGptContextValue = {
  openPrompts: (promptId?: string) => void;
  openCustomPrompt: (prompt: CustomQuickPrompt) => void;
  setDashboardContext: (context: QuickPromptContext) => void;
  rankedPrompts: QuickPromptDefinition[];
  dashboardContext: QuickPromptContext;
  isOpen: boolean;
};

const QuickChatGptContext = createContext<QuickChatGptContextValue | null>(null);
const emptyContext: QuickPromptContext = { nutrition: { hasTargets: false, foodLogsState: "loading", foodLogCount: null, mealPlanCount: 0 }, grocery: { itemCount: 0 }, recovery: { poorRecovery: false } };
const permissionLabelKeys: Record<AiPermissionSection, TodayKey> = {
  workouts: "permissionWorkouts",
  nutrition: "permissionNutrition",
  meal_plans: "permissionMealPlans",
  hydration: "permissionHydration",
  wellness: "permissionWellness",
  progress: "permissionProgress",
  profile: "permissionProfile",
  settings: "permissionSettings"
};

function hasPermission(config: AiPermissionConfig | null, section: AiPermissionSection, capability: PromptCapability) {
  if (!config) return false;
  if (config.accessMode === "full") return true;
  const saved = config.sections[section];
  return capability === "write" ? saved.write : saved.read || saved.write;
}

export function QuickChatGptProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { language, dir } = useTranslation();
  const { tt } = useTodayTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState<CustomQuickPrompt | null>(null);
  const [dashboardContext, setDashboardContextState] = useState<QuickPromptContext>(emptyContext);
  const [permissionConfig, setPermissionConfig] = useState<AiPermissionConfig | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<AiPermissionSettingsStatus>({ state: "none" });
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [copyError, setCopyError] = useState(false);

  const rankedPrompts = useMemo(() => rankQuickPrompts(dashboardContext), [dashboardContext]);
  const selectedDefinition = selectedId ? rankedPrompts.find((prompt) => prompt.id === selectedId) ?? null : null;
  const localized = selectedDefinition ? localizePrompt(selectedDefinition, language) : null;
  const generatedPrompt = customPrompt?.prompt ?? (selectedDefinition ? selectedDefinition.template(dashboardContext, language) : "");
  const title = customPrompt?.title ?? localized?.title ?? "";
  const description = customPrompt?.description ?? localized?.description ?? "";
  const sections = customPrompt?.permissionSections ?? selectedDefinition?.permissionSections ?? [];
  const capability = customPrompt?.capability ?? selectedDefinition?.capability ?? "read";
  const destination = customPrompt?.destination ?? (selectedDefinition?.destination ? selectedDefinition.destination[language] : undefined);
  const attachmentExpected = customPrompt?.attachmentExpected ?? selectedDefinition?.attachmentExpected ?? false;
  const contextChips = customPrompt?.contextChips ?? selectedDefinition?.contextChips(dashboardContext, language) ?? [];
  const missingSections = sections.filter((section) => !hasPermission(permissionConfig, section, capability));
  const missingSectionLabels = missingSections.map((section) => tt(permissionLabelKeys[section])).join(", ");

  const setDashboardContext = useCallback((context: QuickPromptContext) => setDashboardContextState(context), []);

  const loadPermissions = useCallback(async () => {
    if (!user?.id) {
      setPermissionConfig(null);
      setPermissionStatus({ state: "failed", message: "Sign in again to load your AI permission settings." });
      return;
    }
    setPermissionLoading(true);
    const result = await getAiPermissionSettingsWithStatus(user.id);
    setPermissionConfig(result.config);
    setPermissionStatus(result.status);
    setPermissionLoading(false);
  }, [user]);

  useEffect(() => { if (open) void loadPermissions(); }, [loadPermissions, open]);
  useEffect(() => { setEditedPrompt(generatedPrompt); setCopyError(false); }, [generatedPrompt, selectedId, customPrompt]);

  const openPrompts = useCallback((promptId?: string) => {
    setCustomPrompt(null);
    setSelectedId(promptId ?? null);
    setOpen(true);
  }, []);

  const openCustomPrompt = useCallback((prompt: CustomQuickPrompt) => {
    setSelectedId(null);
    setCustomPrompt(prompt);
    setOpen(true);
  }, []);

  function closeSurface(next: boolean) {
    setOpen(next);
    if (!next) {
      setSelectedId(null);
      setCustomPrompt(null);
      setEditedPrompt("");
      setCopyError(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(editedPrompt);
      setCopyError(false);
      toast({ title: tt("copied"), description: attachmentExpected ? tt("copiedPhoto") : tt("copiedNormal"), variant: "success" });
      return true;
    } catch {
      setCopyError(true);
      toast({ title: tt("copyFailed"), variant: "error" });
      return false;
    }
  }

  async function copyAndOpen() {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    const copied = await copyPrompt();
    if (popup) {
      popup.location.href = "https://chatgpt.com/";
    } else {
      toast({ title: tt("popupBlocked"), variant: "error" });
    }
    if (copied && popup) closeSurface(false);
  }

  const value = useMemo<QuickChatGptContextValue>(() => ({ openPrompts, openCustomPrompt, setDashboardContext, rankedPrompts, dashboardContext, isOpen: open }), [dashboardContext, open, openCustomPrompt, openPrompts, rankedPrompts, setDashboardContext]);

  return (
    <QuickChatGptContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={closeSurface}>
        <DialogContent
          variant="glass"
          dir={dir}
          className="inset-x-0 bottom-0 left-0 top-auto max-h-[85dvh] w-full max-w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-[24px] p-0 lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:h-dvh lg:max-h-dvh lg:w-[min(30rem,100vw)] lg:max-w-[30rem] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:rtl:left-0 lg:rtl:right-auto lg:rtl:border-l-0 lg:rtl:border-r"
        >
          <DialogHeader className="border-b border-border/70 px-5 py-4 text-start">
            <DialogTitle className="flex items-center gap-2">
              <OpenAiBlossom className="h-[22px] w-[22px]" />
              {selectedDefinition || customPrompt ? title : tt("askChatGpt")}
            </DialogTitle>
            <DialogDescription>{selectedDefinition || customPrompt ? description : tt("quickPrompts")}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(85dvh-5.5rem)] overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] lg:max-h-[calc(100dvh-5.5rem)] lg:px-5">
            {selectedDefinition || customPrompt ? (
              <div className="space-y-4">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedId(null); setCustomPrompt(null); }} className="min-h-11">
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tt("back")}
                </Button>
                {attachmentExpected ? <p className="rounded-[14px] border border-primary/25 bg-primary/5 p-3 text-sm text-muted-foreground">{tt("photoInstruction")}</p> : null}
                <div className="space-y-2">
                  <label htmlFor="quick-chatgpt-prompt" className="text-sm font-semibold">{tt("prompt")}</label>
                  <textarea
                    id="quick-chatgpt-prompt"
                    value={editedPrompt}
                    onChange={(event) => setEditedPrompt(event.target.value)}
                    rows={10}
                    className="min-h-56 w-full resize-y rounded-[16px] border border-border bg-card px-3 py-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                {contextChips.length ? <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tt("uses")}</p><div className="flex flex-wrap gap-2">{contextChips.map((chip) => <span key={chip} className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">{chip}</span>)}</div></div> : null}
                <div className="rounded-[14px] border border-border/70 bg-muted/20 p-3 text-sm">
                  {sections.length === 0 ? <p className="flex gap-2 text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />{tt("readOnly")}</p> : permissionLoading ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{tt("loading")}</p> : permissionStatus.state === "failed" ? <div className="space-y-2"><p className="flex gap-2 text-destructive"><ShieldAlert className="h-4 w-4 shrink-0" />{tt("permissionLoadFailed")}</p><Button type="button" size="sm" variant="outline" onClick={() => void loadPermissions()}>{tt("retry")}</Button></div> : missingSections.length ? <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex gap-2 text-warning"><ShieldAlert className="h-4 w-4 shrink-0" />{tt("accessRequired", { section: missingSectionLabels })}</p><Button asChild size="sm" variant="outline"><Link href="/settings/connections/chatgpt">{tt("reviewAccess")}</Link></Button></div> : <p className="flex gap-2 text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />{capability === "write" ? tt("writeCapable", { destination: destination ?? "Plaivra" }) : tt("readOnly")}</p>}
                </div>
                {copyError ? <p role="alert" className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-3 text-sm">{tt("copyFailed")}</p> : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="outline" onClick={() => void copyPrompt()} disabled={!editedPrompt.trim()} className="min-h-12"><Copy className="h-4 w-4" />{tt("copyOnly")}</Button>
                  <Button type="button" onClick={() => void copyAndOpen()} disabled={!editedPrompt.trim()} className="min-h-12"><ExternalLink className="h-4 w-4" />{tt("copyAndOpen")}</Button>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditedPrompt(generatedPrompt)} disabled={editedPrompt === generatedPrompt} className="min-h-11"><RotateCcw className="h-4 w-4" />{tt("resetPrompt")}</Button>
              </div>
            ) : (
              <div className="space-y-5">
                {rankedPrompts[0] ? <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tt("recommendedNow")}</p><PromptButton definition={rankedPrompts[0]} language={language} onSelect={() => setSelectedId(rankedPrompts[0].id)} featured /></div> : null}
                <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tt("quickPromptList")}</p><div className="grid gap-2">{rankedPrompts.slice(1).map((prompt) => <PromptButton key={prompt.id} definition={prompt} language={language} onSelect={() => setSelectedId(prompt.id)} />)}</div></div>
                {!rankedPrompts.length ? <p className="text-sm text-muted-foreground">{tt("noPrompts")}</p> : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </QuickChatGptContext.Provider>
  );
}

function PromptButton({ definition, language, onSelect, featured = false }: { definition: QuickPromptDefinition; language: "en" | "de" | "ar"; onSelect: () => void; featured?: boolean }) {
  const localized = localizePrompt(definition, language);
  return <button type="button" onClick={onSelect} className={`w-full rounded-[16px] border p-3 text-start transition focus-visible:ring-2 focus-visible:ring-ring ${featured ? "border-primary/35 bg-primary/5" : "border-border/70 bg-card hover:border-primary/35"}`}><span className="font-semibold text-foreground">{localized.title}</span><span className="mt-1 block text-sm leading-5 text-muted-foreground">{localized.description}</span></button>;
}

export function useQuickChatGpt() {
  const context = useContext(QuickChatGptContext);
  if (!context) throw new Error("useQuickChatGpt must be used inside QuickChatGptProvider");
  return context;
}
