"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { QuickChatGptSurface } from "@/components/ai/quick-chatgpt-surface";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useTodayTranslation, type TodayKey } from "@/lib/i18n/today";
import {
  buildRuntimePrompt,
  filterRuntimeLibrary,
  getEatRuntimeHome,
  getMealAdjustmentRuntimePrompts,
  getRuntimeContextChips,
  getRuntimeHomeSections,
  localizePrompt,
  RUNTIME_QUICK_PROMPTS,
  rankRuntimePrompts
} from "@/lib/ai/prompt-runtime";
import { type PromptCapability, type PromptCategory, type PromptLanguage, type PromptOpenOptions, type PromptSurfaceMode, type PromptSurfaceSource, type QuickPromptContext, type QuickPromptDefinition } from "@/lib/ai/quick-prompts";
import { evaluatePromptPermission } from "@/lib/ai/prompt-permissions";
import { getAiPermissionSettingsWithStatus, type AiPermissionConfig, type AiPermissionSettingsStatus } from "@/services/database/ai-permissions";
import type { AiPermissionSection } from "@/types";

export type CustomQuickPrompt = { id: string; title: string; description: string; prompt: string; permissionSections: AiPermissionSection[]; capability: PromptCapability; destination?: string; contextChips?: string[]; attachmentExpected?: boolean };
export type PromptSurfaceView = { name: "home" } | { name: "library" } | { name: "detail"; promptId: string; backTo: "home" | "library" } | { name: "custom-detail" };
type OpenPromptsInput = string | PromptOpenOptions | undefined;
type QuickChatGptContextValue = {
  openPrompts: (input?: OpenPromptsInput) => void;
  openCustomPrompt: (prompt: CustomQuickPrompt) => void;
  setDashboardContext: (context: QuickPromptContext) => void;
  rankedPrompts: QuickPromptDefinition[];
  dashboardContext: QuickPromptContext;
  isOpen: boolean;
};

const QuickChatGptContext = createContext<QuickChatGptContextValue | null>(null);
const emptyContext: QuickPromptContext = {
  nutrition: { hasTargets: false, targetsState: "loading", foodLogsState: "loading", foodLogCount: null, mealPlanCount: null },
  grocery: { state: "loading", itemCount: null }, hydration: { state: "loading", logCount: null }, recovery: { state: "loading", hasData: false },
  wellness: { state: "loading", habitCount: null, supplementCount: null }, progress: { state: "loading", entryCount: null }, profile: { state: "loading" }
};
const permissionLabelKeys: Record<AiPermissionSection, TodayKey> = { workouts: "permissionWorkouts", nutrition: "permissionNutrition", meal_plans: "permissionMealPlans", hydration: "permissionHydration", wellness: "permissionWellness", progress: "permissionProgress", profile: "permissionProfile", settings: "permissionSettings" };

function sameDashboardContext(current: QuickPromptContext, next: QuickPromptContext) {
  return JSON.stringify(current) === JSON.stringify(next);
}

export function QuickChatGptProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const permissionUserId = user?.id;
  const { language, dir } = useTranslation();
  const promptLanguage = language as PromptLanguage;
  const { tt } = useTodayTranslation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PromptSurfaceView>({ name: "home" });
  const [source, setSource] = useState<PromptSurfaceSource>("default");
  const [mode, setMode] = useState<PromptSurfaceMode>("home");
  const [customPrompt, setCustomPrompt] = useState<CustomQuickPrompt | null>(null);
  const [dashboardContext, setDashboardContextState] = useState<QuickPromptContext>(emptyContext);
  const [permissionConfig, setPermissionConfig] = useState<AiPermissionConfig | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<AiPermissionSettingsStatus | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [copyError, setCopyError] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryCategory, setLibraryCategory] = useState<PromptCategory | "all">("all");

  const rankedPrompts = useMemo(() => rankRuntimePrompts(dashboardContext), [dashboardContext]);
  const homeSections = useMemo(() => getRuntimeHomeSections(dashboardContext), [dashboardContext]);
  const eatHome = useMemo(() => getEatRuntimeHome(dashboardContext), [dashboardContext]);
  const mealPrompts = useMemo(() => getMealAdjustmentRuntimePrompts(dashboardContext), [dashboardContext]);
  const libraryPrompts = useMemo(() => filterRuntimeLibrary({ search: librarySearch, category: libraryCategory, language: promptLanguage }), [libraryCategory, librarySearch, promptLanguage]);
  const selected = view.name === "detail" ? RUNTIME_QUICK_PROMPTS.find((prompt) => prompt.id === view.promptId) ?? null : null;
  const localized = selected ? localizePrompt(selected, promptLanguage) : null;
  const generatedPrompt = view.name === "custom-detail" ? customPrompt?.prompt ?? "" : selected ? buildRuntimePrompt(selected, dashboardContext, promptLanguage) : "";
  const title = view.name === "custom-detail" ? customPrompt?.title ?? "" : localized?.title ?? "";
  const description = view.name === "custom-detail" ? customPrompt?.description ?? "" : localized?.description ?? "";
  const sections = view.name === "custom-detail" ? customPrompt?.permissionSections ?? [] : selected?.permissionSections ?? [];
  const capability = view.name === "custom-detail" ? customPrompt?.capability ?? "read" : selected?.capability ?? "read";
  const destination = view.name === "custom-detail" ? customPrompt?.destination : selected?.destination?.[promptLanguage];
  const attachmentExpected = view.name === "custom-detail" ? customPrompt?.attachmentExpected ?? false : selected?.attachmentExpected ?? false;
  const contextChips = view.name === "custom-detail" ? customPrompt?.contextChips ?? [] : selected ? getRuntimeContextChips(selected, dashboardContext, promptLanguage) : [];
  const permissionEvaluation = evaluatePromptPermission({ userId: permissionUserId, loading: permissionLoading, status: permissionStatus, config: permissionConfig, sections, capability });
  const missingSectionLabels = permissionEvaluation.state === "missing" ? permissionEvaluation.sections.map((section) => tt(permissionLabelKeys[section])).join(", ") : "";

  const setDashboardContext = useCallback((context: QuickPromptContext) => {
    setDashboardContextState((current) => sameDashboardContext(current, context) ? current : context);
  }, []);
  const loadPermissions = useCallback(async () => {
    if (!permissionUserId) { setPermissionConfig(null); setPermissionStatus(null); setPermissionLoading(false); return; }
    setPermissionLoading(true); setPermissionStatus(null);
    const result = await getAiPermissionSettingsWithStatus(permissionUserId);
    setPermissionConfig(result.config); setPermissionStatus(result.status); setPermissionLoading(false);
  }, [permissionUserId]);
  useEffect(() => { if (open) void loadPermissions(); }, [loadPermissions, open]);
  useEffect(() => { setEditedPrompt(generatedPrompt); setCopyError(false); }, [generatedPrompt]);

  const openPrompts = useCallback((input?: OpenPromptsInput) => {
    setCustomPrompt(null); setLibrarySearch(""); setLibraryCategory("all");
    if (typeof input === "string") {
      setSource("default"); setMode("home");
      setView(RUNTIME_QUICK_PROMPTS.some((prompt) => prompt.id === input) ? { name: "detail", promptId: input, backTo: "home" } : { name: "home" });
    } else {
      const options = input ?? { source: "default" as const };
      setSource(options.source);
      setMode(options.mode ?? "home");
      setDashboardContextState((current) => ({
        ...current,
        route: options.source === "eat" || options.source === "eat-planned-meal" ? "/calories" : current.route,
        today: options.selectedDate ?? current.today,
        selection: {
          ...current.selection,
          meal: options.meal?.name ?? current.selection?.meal ?? null,
          plannedMeal: options.meal ?? (options.source === "eat-planned-meal" ? null : current.selection?.plannedMeal ?? null)
        }
      }));
      setView(options.promptId && RUNTIME_QUICK_PROMPTS.some((prompt) => prompt.id === options.promptId) ? { name: "detail", promptId: options.promptId, backTo: "home" } : { name: "home" });
    }
    setOpen(true);
  }, []);

  const openCustomPrompt = useCallback((prompt: CustomQuickPrompt) => { setSource("default"); setMode("home"); setCustomPrompt(prompt); setView({ name: "custom-detail" }); setOpen(true); }, []);
  function closeSurface(next: boolean) {
    setOpen(next);
    if (!next) {
      setView({ name: "home" }); setSource("default"); setMode("home"); setCustomPrompt(null); setEditedPrompt(""); setCopyError(false); setLibrarySearch(""); setLibraryCategory("all");
    }
  }
  const value = useMemo<QuickChatGptContextValue>(() => ({ openPrompts, openCustomPrompt, setDashboardContext, rankedPrompts, dashboardContext, isOpen: open }), [dashboardContext, open, openCustomPrompt, openPrompts, rankedPrompts, setDashboardContext]);

  return <QuickChatGptContext.Provider value={value}>{children}<QuickChatGptSurface open={open} onOpenChange={closeSurface} source={source} mode={mode} view={view} setView={setView} language={promptLanguage} dir={dir} tt={tt} context={dashboardContext} homeSections={homeSections} eatHome={eatHome} mealPrompts={mealPrompts} libraryPrompts={libraryPrompts} librarySearch={librarySearch} setLibrarySearch={setLibrarySearch} libraryCategory={libraryCategory} setLibraryCategory={setLibraryCategory} title={title} description={description} editedPrompt={editedPrompt} generatedPrompt={generatedPrompt} setEditedPrompt={setEditedPrompt} attachmentExpected={attachmentExpected} contextChips={contextChips} capability={capability} destination={destination} permissionEvaluation={permissionEvaluation} permissionUserId={permissionUserId} permissionLoading={permissionLoading} permissionStatus={permissionStatus} permissionConfig={permissionConfig} missingSectionLabels={missingSectionLabels} retryPermissions={() => void loadPermissions()} copyError={copyError} setCopyError={setCopyError} /></QuickChatGptContext.Provider>;
}

export function useQuickChatGpt() {
  const context = useContext(QuickChatGptContext);
  if (!context) throw new Error("useQuickChatGpt must be used inside QuickChatGptProvider");
  return context;
}
