"use client";

import Link from "next/link";
import { ArrowLeft, Copy, ExternalLink, Loader2, Paperclip, RotateCcw, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useTodayTranslation, type TodayKey } from "@/lib/i18n/today";
import { filterPromptLibrary, getPromptAvailability, getPromptHomeSections, localizePrompt, PROMPT_CATEGORIES, QUICK_PROMPTS, rankQuickPrompts, type PromptCapability, type PromptCategory, type PromptLanguage, type QuickPromptContext, type QuickPromptDefinition } from "@/lib/ai/quick-prompts";
import { getAiPermissionSettingsWithStatus, type AiPermissionConfig, type AiPermissionSettingsStatus } from "@/services/database/ai-permissions";
import type { AiPermissionSection } from "@/types";
import { cn } from "@/lib/utils";

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

type PromptSurfaceView =
  | { name: "home" }
  | { name: "library" }
  | { name: "detail"; promptId: string; backTo: "home" | "library" }
  | { name: "custom-detail" };

type QuickChatGptContextValue = {
  openPrompts: (promptId?: string) => void;
  openCustomPrompt: (prompt: CustomQuickPrompt) => void;
  setDashboardContext: (context: QuickPromptContext) => void;
  rankedPrompts: QuickPromptDefinition[];
  dashboardContext: QuickPromptContext;
  isOpen: boolean;
};

const QuickChatGptContext = createContext<QuickChatGptContextValue | null>(null);
const emptyContext: QuickPromptContext = {
  nutrition: { hasTargets: false, targetsState: "loading", foodLogsState: "loading", foodLogCount: null, mealPlanCount: null },
  grocery: { state: "loading", itemCount: null },
  hydration: { state: "loading", logCount: null },
  recovery: { state: "loading", hasData: false },
  wellness: { state: "loading", habitCount: null, supplementCount: null },
  progress: { state: "loading", entryCount: null },
  profile: { state: "loading" }
};

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
const categoryLabelKeys: Record<PromptCategory | "all", TodayKey> = {
  all: "categoryAll",
  training: "categoryTraining",
  nutrition: "categoryNutrition",
  grocery: "categoryGrocery",
  recovery: "categoryRecovery",
  progress: "categoryProgress",
  daily: "categoryDaily",
  profile: "categoryProfile"
};

function hasPermission(config: AiPermissionConfig | null, section: AiPermissionSection, capability: PromptCapability) {
  if (!config) return false;
  if (config.accessMode === "full") return true;
  const saved = config.sections[section];
  return capability === "write" ? saved.write : saved.read || saved.write;
}
function missingPermissions(definition: Pick<QuickPromptDefinition, "permissionSections" | "capability">, config: AiPermissionConfig | null) {
  return definition.permissionSections.filter((section) => !hasPermission(config, section, definition.capability));
}

export function QuickChatGptProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { language, dir } = useTranslation();
  const promptLanguage = language as PromptLanguage;
  const { tt } = useTodayTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PromptSurfaceView>({ name: "home" });
  const [customPrompt, setCustomPrompt] = useState<CustomQuickPrompt | null>(null);
  const [dashboardContext, setDashboardContextState] = useState<QuickPromptContext>(emptyContext);
  const [permissionConfig, setPermissionConfig] = useState<AiPermissionConfig | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<AiPermissionSettingsStatus>({ state: "none" });
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [copyError, setCopyError] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryCategory, setLibraryCategory] = useState<PromptCategory | "all">("all");

  const rankedPrompts = useMemo(() => rankQuickPrompts(dashboardContext), [dashboardContext]);
  const homeSections = useMemo(() => getPromptHomeSections(dashboardContext), [dashboardContext]);
  const libraryPrompts = useMemo(() => filterPromptLibrary({ prompts: QUICK_PROMPTS, search: librarySearch, category: libraryCategory, language: promptLanguage }), [libraryCategory, librarySearch, promptLanguage]);
  const selectedDefinition = view.name === "detail" ? QUICK_PROMPTS.find((prompt) => prompt.id === view.promptId) ?? null : null;
  const localized = selectedDefinition ? localizePrompt(selectedDefinition, promptLanguage) : null;
  const generatedPrompt = view.name === "custom-detail" ? customPrompt?.prompt ?? "" : selectedDefinition?.buildPrompt(dashboardContext, promptLanguage) ?? "";
  const title = view.name === "custom-detail" ? customPrompt?.title ?? "" : localized?.title ?? "";
  const description = view.name === "custom-detail" ? customPrompt?.description ?? "" : localized?.description ?? "";
  const sections = view.name === "custom-detail" ? customPrompt?.permissionSections ?? [] : selectedDefinition?.permissionSections ?? [];
  const capability = view.name === "custom-detail" ? customPrompt?.capability ?? "read" : selectedDefinition?.capability ?? "read";
  const destination = view.name === "custom-detail" ? customPrompt?.destination : selectedDefinition?.destination?.[promptLanguage];
  const attachmentExpected = view.name === "custom-detail" ? customPrompt?.attachmentExpected ?? false : selectedDefinition?.attachmentExpected ?? false;
  const contextChips = view.name === "custom-detail" ? customPrompt?.contextChips ?? [] : selectedDefinition?.contextChips(dashboardContext, promptLanguage) ?? [];
  const missingSections = sections.filter((section) => !hasPermission(permissionConfig, section, capability));
  const missingSectionLabels = missingSections.map((section) => tt(permissionLabelKeys[section])).join(", ");

  const setDashboardContext = useCallback((context: QuickPromptContext) => setDashboardContextState(context), []);
  const loadPermissions = useCallback(async () => {
    if (!user?.id) {
      setPermissionConfig(null);
      setPermissionStatus({ state: "failed", message: tt("permissionLoadFailed") });
      return;
    }
    setPermissionLoading(true);
    const result = await getAiPermissionSettingsWithStatus(user.id);
    setPermissionConfig(result.config);
    setPermissionStatus(result.status);
    setPermissionLoading(false);
  }, [tt, user]);

  useEffect(() => { if (open) void loadPermissions(); }, [loadPermissions, open]);
  useEffect(() => { setEditedPrompt(generatedPrompt); setCopyError(false); }, [generatedPrompt]);

  const openPrompts = useCallback((promptId?: string) => {
    setCustomPrompt(null);
    setLibrarySearch("");
    setLibraryCategory("all");
    setView(promptId && QUICK_PROMPTS.some((prompt) => prompt.id === promptId) ? { name: "detail", promptId, backTo: "home" } : { name: "home" });
    setOpen(true);
  }, []);
  const openCustomPrompt = useCallback((prompt: CustomQuickPrompt) => { setCustomPrompt(prompt); setView({ name: "custom-detail" }); setOpen(true); }, []);
  function closeSurface(next: boolean) {
    setOpen(next);
    if (!next) { setView({ name: "home" }); setCustomPrompt(null); setEditedPrompt(""); setCopyError(false); setLibrarySearch(""); setLibraryCategory("all"); }
  }
  function openDefinition(promptId: string, backTo: "home" | "library") { setView({ name: "detail", promptId, backTo }); }
  function goBack() {
    if (view.name === "detail") {
      setView(view.backTo === "library" ? { name: "library" } : { name: "home" });
    } else if (view.name === "library" || view.name === "custom-detail") {
      setView({ name: "home" });
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
    if (popup) popup.location.href = "https://chatgpt.com/";
    else toast({ title: tt("popupBlocked"), variant: "error" });
    if (copied && popup) closeSurface(false);
  }

  const value = useMemo<QuickChatGptContextValue>(() => ({ openPrompts, openCustomPrompt, setDashboardContext, rankedPrompts, dashboardContext, isOpen: open }), [dashboardContext, open, openCustomPrompt, openPrompts, rankedPrompts, setDashboardContext]);
  const headerTitle = view.name === "home" ? tt("askChatGpt") : view.name === "library" ? tt("allChatGptPrompts") : title;
  const headerDescription = view.name === "home" ? tt("promptHomeDescription") : view.name === "library" ? tt("promptLibraryDescription") : description;

  return (
    <QuickChatGptContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={closeSurface}>
        <DialogContent variant="glass" layout="responsive-drawer" closeLabel={tt("close")} dir={dir}>
          <DialogHeader className="mb-0 shrink-0 border-b border-border/70 px-5 py-4 text-start">
            <DialogTitle className="flex items-center gap-2"><OpenAiBlossom className="h-[22px] w-[22px]" />{headerTitle}</DialogTitle>
            <DialogDescription>{headerDescription}</DialogDescription>
          </DialogHeader>
          <p className="sr-only" aria-live="polite">{view.name === "home" ? tt("promptHomeView") : view.name === "library" ? tt("promptLibraryView") : tt("promptDetailView")}</p>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] lg:px-5">
            {view.name === "home" ? <PromptHome language={promptLanguage} context={dashboardContext} permissionConfig={permissionConfig} sections={homeSections} onSelect={(id) => openDefinition(id, "home")} onBrowse={() => setView({ name: "library" })} tt={tt} /> : null}
            {view.name === "library" ? <PromptLibrary language={promptLanguage} context={dashboardContext} permissionConfig={permissionConfig} prompts={libraryPrompts} search={librarySearch} category={libraryCategory} onSearch={setLibrarySearch} onCategory={setLibraryCategory} onSelect={(id) => openDefinition(id, "library")} onBack={goBack} tt={tt} /> : null}
            {view.name === "detail" || view.name === "custom-detail" ? <PromptDetail editedPrompt={editedPrompt} generatedPrompt={generatedPrompt} onPromptChange={setEditedPrompt} onBack={goBack} onCopy={() => void copyPrompt()} onCopyAndOpen={() => void copyAndOpen()} onReset={() => setEditedPrompt(generatedPrompt)} attachmentExpected={attachmentExpected} contextChips={contextChips} sections={sections} capability={capability} destination={destination} permissionLoading={permissionLoading} permissionStatus={permissionStatus} missingSections={missingSections} missingSectionLabels={missingSectionLabels} onRetryPermissions={() => void loadPermissions()} copyError={copyError} tt={tt} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </QuickChatGptContext.Provider>
  );
}

function PromptHome({ language, context, permissionConfig, sections, onSelect, onBrowse, tt }: { language: PromptLanguage; context: QuickPromptContext; permissionConfig: AiPermissionConfig | null; sections: ReturnType<typeof getPromptHomeSections>; onSelect: (id: string) => void; onBrowse: () => void; tt: ReturnType<typeof useTodayTranslation>["tt"] }) {
  return <div className="space-y-6">
    {sections.recommended ? <PromptSection title={tt("recommendedNow")}><PromptCard definition={sections.recommended} language={language} context={context} permissionConfig={permissionConfig} onSelect={() => onSelect(sections.recommended!.id)} featured tt={tt} /></PromptSection> : null}
    {sections.quick.length ? <PromptSection title={tt("quickPromptList")}><div className="grid gap-2">{sections.quick.map((prompt) => <PromptCard key={prompt.id} definition={prompt} language={language} context={context} permissionConfig={permissionConfig} onSelect={() => onSelect(prompt.id)} tt={tt} />)}</div></PromptSection> : null}
    {sections.dynamic.length ? <PromptSection title={tt("dynamicPrompts")}><div className="grid gap-2">{sections.dynamic.map((prompt) => <PromptCard key={prompt.id} definition={prompt} language={language} context={context} permissionConfig={permissionConfig} onSelect={() => onSelect(prompt.id)} tt={tt} />)}</div></PromptSection> : null}
    {!sections.recommended && !sections.quick.length && !sections.dynamic.length ? <p className="text-sm text-muted-foreground">{tt("noPrompts")}</p> : null}
    <Button type="button" variant="outline" className="min-h-12 w-full" onClick={onBrowse}>{tt("browseAllPrompts")}</Button>
  </div>;
}

function PromptLibrary({ language, context, permissionConfig, prompts, search, category, onSearch, onCategory, onSelect, onBack, tt }: { language: PromptLanguage; context: QuickPromptContext; permissionConfig: AiPermissionConfig | null; prompts: QuickPromptDefinition[]; search: string; category: PromptCategory | "all"; onSearch: (value: string) => void; onCategory: (value: PromptCategory | "all") => void; onSelect: (id: string) => void; onBack: () => void; tt: ReturnType<typeof useTodayTranslation>["tt"] }) {
  const grouped = useMemo(() => PROMPT_CATEGORIES.map((item) => ({ category: item, prompts: prompts.filter((prompt) => prompt.category === item) })).filter((group) => group.prompts.length), [prompts]);
  return <div className="space-y-5">
    <Button type="button" variant="ghost" size="sm" onClick={onBack} className="min-h-11"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{tt("back")}</Button>
    <label className="relative block"><span className="sr-only">{tt("searchPrompts")}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground rtl:left-auto rtl:right-3" /><input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={tt("searchPrompts")} className="min-h-12 w-full rounded-[14px] border border-border bg-card py-2 pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring rtl:pl-3 rtl:pr-10" /></label>
    <div className="flex gap-2 overflow-x-auto pb-1" role="toolbar" aria-label={tt("promptCategories")}>{(["all", ...PROMPT_CATEGORIES] as const).map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => onCategory(item)} className={cn("min-h-11 shrink-0 rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", category === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}>{tt(categoryLabelKeys[item])}</button>)}</div>
    {grouped.map((group) => <section key={group.category} aria-labelledby={`prompt-category-${group.category}`}><h3 id={`prompt-category-${group.category}`} className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{tt(categoryLabelKeys[group.category])}</h3><div className="grid gap-2">{group.prompts.map((prompt) => <PromptCard key={prompt.id} definition={prompt} language={language} context={context} permissionConfig={permissionConfig} onSelect={() => onSelect(prompt.id)} tt={tt} library />)}</div></section>)}
    {!prompts.length ? <p className="rounded-[14px] border border-border/70 p-4 text-sm text-muted-foreground">{tt("noMatchingPrompts")}</p> : null}
  </div>;
}

function PromptSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>{children}</section>;
}

function PromptCard({ definition, language, context, permissionConfig, onSelect, featured = false, library = false, tt }: { definition: QuickPromptDefinition; language: PromptLanguage; context: QuickPromptContext; permissionConfig: AiPermissionConfig | null; onSelect: () => void; featured?: boolean; library?: boolean; tt: ReturnType<typeof useTodayTranslation>["tt"] }) {
  const localized = localizePrompt(definition, language);
  const availability = getPromptAvailability(definition, context, language);
  const missing = missingPermissions(definition, permissionConfig);
  const disabled = !availability.available;
  const status = disabled ? `${tt("requiresContext")}: ${availability.missingContext.join(", ")}` : missing.length ? tt("requiresAccess") : tt("availableNow");
  return <button type="button" onClick={onSelect} disabled={disabled} aria-describedby={`prompt-status-${definition.id}`} className={cn("w-full rounded-[16px] border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60", featured ? "border-primary/35 bg-primary/5" : "border-border/70 bg-card hover:border-primary/35", library && "p-4")}>
    <span className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="font-semibold text-foreground">{localized.title}</span><span className="mt-1 block text-sm leading-5 text-muted-foreground">{localized.description}</span></span>{definition.attachmentExpected ? <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label={tt("attachmentRequired")} /> : null}</span>
    <span id={`prompt-status-${definition.id}`} className="mt-2 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-border/70 px-2 py-1 text-muted-foreground">{definition.capability === "write" ? tt("capabilityWrite") : tt("capabilityRead")}</span><span className={cn("rounded-full border px-2 py-1", disabled || missing.length ? "border-warning/35 text-warning" : "border-primary/25 text-primary")}>{status}</span></span>
  </button>;
}

function PromptDetail({ editedPrompt, generatedPrompt, onPromptChange, onBack, onCopy, onCopyAndOpen, onReset, attachmentExpected, contextChips, sections, capability, destination, permissionLoading, permissionStatus, missingSections, missingSectionLabels, onRetryPermissions, copyError, tt }: { editedPrompt: string; generatedPrompt: string; onPromptChange: (value: string) => void; onBack: () => void; onCopy: () => void; onCopyAndOpen: () => void; onReset: () => void; attachmentExpected: boolean; contextChips: string[]; sections: AiPermissionSection[]; capability: PromptCapability; destination?: string; permissionLoading: boolean; permissionStatus: AiPermissionSettingsStatus; missingSections: AiPermissionSection[]; missingSectionLabels: string; onRetryPermissions: () => void; copyError: boolean; tt: ReturnType<typeof useTodayTranslation>["tt"] }) {
  return <div className="space-y-4">
    <Button type="button" variant="ghost" size="sm" onClick={onBack} className="min-h-11"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{tt("back")}</Button>
    {attachmentExpected ? <p className="rounded-[14px] border border-primary/25 bg-primary/5 p-3 text-sm text-muted-foreground">{tt("photoInstruction")}</p> : null}
    <div className="space-y-2"><label htmlFor="quick-chatgpt-prompt" className="text-sm font-semibold">{tt("prompt")}</label><textarea id="quick-chatgpt-prompt" value={editedPrompt} onChange={(event) => onPromptChange(event.target.value)} rows={14} className="min-h-72 w-full resize-y rounded-[16px] border border-border bg-card px-3 py-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
    {contextChips.length ? <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tt("uses")}</p><div className="flex flex-wrap gap-2">{contextChips.map((chip) => <span key={chip} className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">{chip}</span>)}</div></div> : null}
    <div className="rounded-[14px] border border-border/70 bg-muted/20 p-3 text-sm">
      {sections.length === 0 ? <p className="flex gap-2 text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />{tt("readOnly")}</p>
        : permissionLoading ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{tt("loading")}</p>
        : permissionStatus.state === "failed" ? <div className="space-y-2"><p className="flex gap-2 text-destructive"><ShieldAlert className="h-4 w-4 shrink-0" />{tt("permissionLoadFailed")}</p><Button type="button" size="sm" variant="outline" onClick={onRetryPermissions}>{tt("retry")}</Button></div>
        : missingSections.length ? <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex gap-2 text-warning"><ShieldAlert className="h-4 w-4 shrink-0" />{tt("accessRequired", { section: missingSectionLabels })}</p><Button asChild size="sm" variant="outline"><Link href="/settings/connections/chatgpt">{tt("reviewAccess")}</Link></Button></div>
        : <p className="flex gap-2 text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />{capability === "write" ? tt("writeCapable", { destination: destination ?? "Plaivra" }) : tt("readOnly")}</p>}
    </div>
    {copyError ? <p role="alert" className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-3 text-sm">{tt("copyFailed")}</p> : null}
    <div className="grid gap-2 sm:grid-cols-2"><Button type="button" variant="outline" onClick={onCopy} disabled={!editedPrompt.trim()} className="min-h-12"><Copy className="h-4 w-4" />{tt("copyOnly")}</Button><Button type="button" onClick={onCopyAndOpen} disabled={!editedPrompt.trim()} className="min-h-12"><ExternalLink className="h-4 w-4" />{tt("copyAndOpen")}</Button></div>
    <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={editedPrompt === generatedPrompt} className="min-h-11"><RotateCcw className="h-4 w-4" />{tt("resetPrompt")}</Button>
  </div>;
}

export function useQuickChatGpt() {
  const context = useContext(QuickChatGptContext);
  if (!context) throw new Error("useQuickChatGpt must be used inside QuickChatGptProvider");
  return context;
}
