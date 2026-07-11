"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, RefreshCcw, X } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CardGridSkeleton } from "@/components/ui/state-views";
import { TagInput } from "@/components/ui/tag-input";
import { useToast } from "@/components/ui/toaster";
import { useOnboardingTranslation } from "@/lib/i18n/onboarding";
import {
  GOAL_OPTIONS,
  ONBOARDING_SECTIONS,
  SPORT_FIELD_CONFIG,
  SPORT_OPTIONS,
  createEmptyAdaptiveOnboarding,
  firstInvalidSection,
  mergeLoadedAdaptiveOnboarding,
  sanitizeAdaptiveOnboarding,
  shouldShowTargetWeight,
  validateOnboardingSection,
  type AdaptiveFitnessConstraints,
  type AdaptiveNutritionRow,
  type AdaptiveOnboardingAnswers,
  type AdaptiveOnboardingRow,
  type FieldErrors,
  type GoalId,
  type OnboardingSectionIndex,
  type SportFieldDefinition,
  type SportId
} from "@/lib/onboarding/adaptive-profile";
import { AI_PERMISSION_SECTION_DETAILS } from "@/lib/mcp/permission-presentation";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import {
  ALL_AI_PERMISSION_SECTIONS,
  getAiPermissionSettingsWithStatus,
  getDefaultAiPermissionConfig,
  saveAiPermissionSettings,
  type AiPermissionConfig,
  type AiPermissionSettingsStatus
} from "@/services/database/ai-permissions";
import {
  completeAdaptiveOnboarding,
  getAdaptiveFitnessConstraints,
  getAdaptiveNutritionProfile,
  getAdaptiveOnboardingDraft,
  saveAdaptiveConstraintDraft,
  saveAdaptiveNutritionDraft,
  saveAdaptiveOnboardingDraft
} from "@/services/database/adaptive-onboarding";
import { cn } from "@/lib/utils";

const DAY_IDS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const EXPERIENCE_OPTIONS = ["new", "beginner", "intermediate", "advanced"];
const LOCATION_OPTIONS = ["gym", "home", "outdoors", "studio", "pool", "mixed"];
const ACTIVITY_OPTIONS = ["low", "moderate", "high", "very_high"];
const TIME_OPTIONS = ["morning", "midday", "afternoon", "evening", "variable"];
const NUTRITION_GOALS = ["balanced", "fat_loss", "muscle_gain", "performance", "health", "maintenance"];
const COOKING_SKILLS = ["none", "basic", "comfortable", "advanced"];
const MEAL_PREP_OPTIONS = ["none", "some_meals", "most_meals", "batch_cooking", "flexible"];
const CURRENCIES = ["EUR", "USD", "GBP", "EGP"];

const dayLabels = {
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  de: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
  ar: ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]
};

type SourceName = "onboarding" | "nutrition" | "constraints" | "permissions";
type LoadStatus = "loading" | "loaded" | "none" | "failed";
type SourceStatuses = Record<SourceName, LoadStatus>;
type SourceErrors = Partial<Record<SourceName, string>>;

function sourceLabel(source: SourceName, ot: ReturnType<typeof useOnboardingTranslation>["ot"]) {
  if (source === "onboarding") return ot("sourceOnboarding");
  if (source === "nutrition") return ot("sourceNutrition");
  if (source === "constraints") return ot("sourceConstraints");
  return ot("sourcePermissions");
}
function snapshot(answers: AdaptiveOnboardingAnswers, permissions: AiPermissionConfig, permissionConfirmed: boolean) { return JSON.stringify({ answers, permissions, permissionConfirmed }); }
function parseOptionalNumber(value: string) { if (!value.trim()) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function kgToDisplay(value: number | null, unit: "kg" | "lb") { if (value === null) return ""; return String(unit === "lb" ? Math.round(value * 2.2046226218 * 10) / 10 : value); }
function displayToKg(value: string, unit: "kg" | "lb") { const parsed = parseOptionalNumber(value); if (parsed === null) return null; return unit === "lb" ? Math.round((parsed / 2.2046226218) * 100) / 100 : parsed; }
function cmToDisplay(value: number | null, unit: "cm" | "ft-in") { if (value === null) return ""; return String(unit === "ft-in" ? Math.round((value / 2.54) * 10) / 10 : value); }
function displayToCm(value: string, unit: "cm" | "ft-in") { const parsed = parseOptionalNumber(value); if (parsed === null) return null; return unit === "ft-in" ? Math.round(parsed * 2.54 * 100) / 100 : parsed; }

export function AdaptiveOnboardingForm() {
  const { user, refreshProfile } = useAuth();
  const { settings } = useUserSettings();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { language, dir, ot, goalLabel, sportLabel, fieldLabel, optionLabel } = useOnboardingTranslation();
  const editMode = searchParams.get("edit") === "true";
  const [step, setStep] = useState<OnboardingSectionIndex>(0);
  const [answers, setAnswers] = useState<AdaptiveOnboardingAnswers>(() => createEmptyAdaptiveOnboarding());
  const [permissions, setPermissions] = useState<AiPermissionConfig>(() => getDefaultAiPermissionConfig());
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<AiPermissionSettingsStatus["state"] | "loading">("loading");
  const [statuses, setStatuses] = useState<SourceStatuses>({ onboarding: "loading", nutrition: "loading", constraints: "loading", permissions: "loading" });
  const [sourceErrors, setSourceErrors] = useState<SourceErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [existingCompletedAt, setExistingCompletedAt] = useState<string | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const currentSnapshot = useMemo(() => snapshot(answers, permissions, permissionConfirmed), [answers, permissionConfirmed, permissions]);
  const dirty = Boolean(initialSnapshot && currentSnapshot !== initialSnapshot);
  const progressValue = ((step + 1) / ONBOARDING_SECTIONS.length) * 100;
  const anyCriticalLoadFailure = Object.values(statuses).some((status) => status === "failed");

  const loadAll = useCallback(async () => {
    if (!user?.id) { setIsLoading(false); return; }
    setIsLoading(true);
    setStatuses({ onboarding: "loading", nutrition: "loading", constraints: "loading", permissions: "loading" });
    setSourceErrors({});
    const [onboardingResult, nutritionResult, constraintsResult, permissionsResult] = await Promise.allSettled([
      getAdaptiveOnboardingDraft(user.id), getAdaptiveNutritionProfile(user.id), getAdaptiveFitnessConstraints(user.id), getAiPermissionSettingsWithStatus(user.id)
    ]);
    let onboarding: AdaptiveOnboardingRow | null = null;
    let nutrition: AdaptiveNutritionRow | null = null;
    let constraints: AdaptiveFitnessConstraints | null = null;
    let nextPermissions = getDefaultAiPermissionConfig();
    let nextPermissionConfirmed = false;
    let nextPermissionStatus: AiPermissionSettingsStatus["state"] = "none";
    const nextStatuses: SourceStatuses = { onboarding: "none", nutrition: "none", constraints: "none", permissions: "none" };
    const nextErrors: SourceErrors = {};
    if (onboardingResult.status === "fulfilled") { onboarding = onboardingResult.value; nextStatuses.onboarding = onboarding ? "loaded" : "none"; }
    else { nextStatuses.onboarding = "failed"; nextErrors.onboarding = onboardingResult.reason instanceof Error ? onboardingResult.reason.message : ot("loadFailure"); }
    if (nutritionResult.status === "fulfilled") { nutrition = nutritionResult.value; nextStatuses.nutrition = nutrition ? "loaded" : "none"; }
    else { nextStatuses.nutrition = "failed"; nextErrors.nutrition = nutritionResult.reason instanceof Error ? nutritionResult.reason.message : ot("loadFailure"); }
    if (constraintsResult.status === "fulfilled") { constraints = constraintsResult.value; nextStatuses.constraints = constraints ? "loaded" : "none"; }
    else { nextStatuses.constraints = "failed"; nextErrors.constraints = constraintsResult.reason instanceof Error ? constraintsResult.reason.message : ot("loadFailure"); }
    if (permissionsResult.status === "fulfilled") {
      const result = permissionsResult.value;
      nextPermissionStatus = result.status.state;
      nextStatuses.permissions = result.status.state === "failed" ? "failed" : result.status.state === "loaded" ? "loaded" : "none";
      if (result.config) nextPermissions = result.config;
      nextPermissionConfirmed = result.status.state === "loaded";
      if (result.status.state === "failed") nextErrors.permissions = result.status.message;
    } else {
      nextPermissionStatus = "failed"; nextStatuses.permissions = "failed";
      nextErrors.permissions = permissionsResult.reason instanceof Error ? permissionsResult.reason.message : ot("permissionLoadFailed");
    }
    const merged = mergeLoadedAdaptiveOnboarding({ onboarding, nutrition, constraints });
    if (onboarding?.completed_at && !editMode) { router.replace("/dashboard"); return; }
    setAnswers(merged); setPermissions(nextPermissions); setPermissionConfirmed(nextPermissionConfirmed); setPermissionStatus(nextPermissionStatus);
    setStatuses(nextStatuses); setSourceErrors(nextErrors); setExistingCompletedAt(onboarding?.completed_at ?? null);
    setStep(Math.max(0, Math.min(6, Number(onboarding?.setup_stage ?? 0))) as OnboardingSectionIndex);
    setInitialSnapshot(snapshot(merged, nextPermissions, nextPermissionConfirmed)); setIsLoading(false);
  }, [editMode, ot, router, user]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => { if (!dirty || isSaving) return; const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [dirty, isSaving]);
  useEffect(() => { if (Object.keys(errors).length) errorSummaryRef.current?.focus(); }, [errors]);

  async function retrySource(source: SourceName) {
    if (!user?.id) return;
    setStatuses((current) => ({ ...current, [source]: "loading" }));
    setSourceErrors((current) => ({ ...current, [source]: undefined }));
    try {
      if (source === "onboarding") {
        const row = await getAdaptiveOnboardingDraft(user.id);
        const loaded = mergeLoadedAdaptiveOnboarding({ onboarding: row, nutrition: null, constraints: null });
        setAnswers((current) => ({ ...current, ...loaded, nutrition: current.nutrition, constraints: current.constraints }));
        setExistingCompletedAt(row?.completed_at ?? null); setStatuses((current) => ({ ...current, onboarding: row ? "loaded" : "none" }));
      } else if (source === "nutrition") {
        const row = await getAdaptiveNutritionProfile(user.id); const loaded = mergeLoadedAdaptiveOnboarding({ onboarding: null, nutrition: row, constraints: null });
        setAnswers((current) => ({ ...current, nutrition: loaded.nutrition })); setStatuses((current) => ({ ...current, nutrition: row ? "loaded" : "none" }));
      } else if (source === "constraints") {
        const row = await getAdaptiveFitnessConstraints(user.id); const loaded = mergeLoadedAdaptiveOnboarding({ onboarding: null, nutrition: null, constraints: row });
        setAnswers((current) => ({ ...current, constraints: loaded.constraints })); setStatuses((current) => ({ ...current, constraints: row ? "loaded" : "none" }));
      } else {
        const result = await getAiPermissionSettingsWithStatus(user.id); setPermissionStatus(result.status.state);
        if (result.status.state === "failed") throw new Error(result.status.message);
        setPermissions(result.config ?? getDefaultAiPermissionConfig()); setPermissionConfirmed(result.status.state === "loaded");
        setStatuses((current) => ({ ...current, permissions: result.status.state === "loaded" ? "loaded" : "none" }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ot("loadFailure");
      setStatuses((current) => ({ ...current, [source]: "failed" })); setSourceErrors((current) => ({ ...current, [source]: message }));
      if (source === "permissions") setPermissionStatus("failed");
    }
  }

  function updateGoals(goal: GoalId) {
    setAnswers((current) => { const selected = current.goals.includes(goal) ? current.goals.filter((item) => item !== goal) : [...current.goals, goal]; const primary = current.primary_goal && selected.includes(current.primary_goal) ? current.primary_goal : null; return { ...current, goals: selected, primary_goal: primary, goal_weight_kg: shouldShowTargetWeight(selected) ? current.goal_weight_kg : null }; });
    setErrors((current) => ({ ...current, goals: "", primary_goal: "", goal_weight_kg: "" }));
  }
  function updateSport(primarySport: SportId) { setAnswers((current) => ({ ...current, primary_sport: primarySport, primary_sport_other: primarySport === "other" ? current.primary_sport_other : "", secondary_sports: current.secondary_sports.filter((sport) => sport !== primarySport) })); setErrors((current) => ({ ...current, primary_sport: "", primary_sport_other: "" })); }
  function setSportDetail(id: string, value: string | number | string[] | null) { setAnswers((current) => ({ ...current, sport_details: { ...current.sport_details, [id]: value } })); setErrors((current) => ({ ...current, [`sport_details.${id}`]: "" })); }

  async function persistDraft(nextStep: OnboardingSectionIndex) {
    if (!user?.id || editMode) return;
    if (statuses.onboarding === "failed") throw new Error(sourceErrors.onboarding || ot("loadFailure"));
    await saveAdaptiveOnboardingDraft(user.id, answers, nextStep, existingCompletedAt);
    if (step >= 3) { if (statuses.nutrition === "failed") throw new Error(sourceErrors.nutrition || ot("loadFailure")); await saveAdaptiveNutritionDraft(user.id, answers); }
    if (step >= 4) { if (statuses.constraints === "failed") throw new Error(sourceErrors.constraints || ot("loadFailure")); await saveAdaptiveConstraintDraft(user.id, answers.constraints); }
    if (step >= 5 && permissionConfirmed) { if (permissionStatus === "failed") throw new Error(sourceErrors.permissions || ot("permissionLoadFailed")); await saveAiPermissionSettings(user.id, permissions); }
  }

  async function goNext() {
    const currentErrors = validateOnboardingSection(step, answers, { permissionStatus, permissionConfirmed, permissions });
    if (Object.keys(currentErrors).length) { setErrors(currentErrors); return; }
    setErrors({}); setSaveError(""); const next = Math.min(6, step + 1) as OnboardingSectionIndex; setIsSaving(true);
    try { await persistDraft(next); setStep(next); window.scrollTo({ top: 0, behavior: settings.reduceAnimations ? "auto" : "smooth" }); }
    catch (error) { setSaveError(error instanceof Error ? error.message : ot("saveFailure")); }
    finally { setIsSaving(false); }
  }

  async function finish() {
    if (!user?.id || isSaving) return;
    if (!navigator.onLine) { setSaveError(ot("offline")); return; }
    if (anyCriticalLoadFailure) { setSaveError(ot("loadFailureDetail")); return; }
    const invalidSection = firstInvalidSection(answers, { permissionStatus, permissionConfirmed, permissions });
    if (invalidSection !== null) { setStep(invalidSection); setErrors(validateOnboardingSection(invalidSection, answers, { permissionStatus, permissionConfirmed, permissions })); return; }
    setIsSaving(true); setSaveError("");
    try {
      const sanitized = sanitizeAdaptiveOnboarding(answers); await completeAdaptiveOnboarding(user.id, sanitized, permissions); await refreshProfile();
      setAnswers(sanitized); setExistingCompletedAt(new Date().toISOString()); setInitialSnapshot(snapshot(sanitized, permissions, permissionConfirmed));
      toast({ title: ot("saved"), description: ot("savedDetail"), variant: "success" }); router.push(editMode ? "/settings" : "/dashboard");
    } catch (error) { setSaveError(error instanceof Error ? error.message : ot("saveFailure")); }
    finally { setIsSaving(false); }
  }

  function requestCancel() { if (!dirty) { router.push("/settings"); return; } setShowCancelConfirm(true); }
  function selectPermissionMode(mode: "full" | "custom") { if (permissionStatus === "failed" || statuses.permissions === "loading") return; setPermissions((current) => ({ ...current, accessMode: mode })); setPermissionConfirmed(false); setErrors((current) => ({ ...current, permissions: "", permission_confirmation: "" })); }
  function togglePermission(section: (typeof ALL_AI_PERMISSION_SECTIONS)[number], action: "read" | "write") {
    if (permissionStatus === "failed" || permissions.accessMode !== "custom") return;
    setPermissions((current) => { const previous = current.sections[section]; const next = action === "read" ? previous.read ? { read: false, write: false } : { ...previous, read: true } : previous.write ? { ...previous, write: false } : { read: true, write: true }; return { ...current, sections: { ...current.sections, [section]: next } }; });
    setPermissionConfirmed(false);
  }

  if (isLoading) return <div dir={dir}><PageHeading title={editMode ? ot("editTitle") : ot("title")} description={editMode ? ot("editDescription") : ot("firstDescription")} /><CardGridSkeleton count={2} rows={3} className="mx-auto max-w-5xl" /></div>;

  return (
    <div dir={dir}>
      <PageHeading title={editMode ? ot("editTitle") : ot("title")} description={editMode ? ot("editDescription") : ot("firstDescription")} action={editMode ? <Button type="button" variant="outline" className="min-h-11" onClick={requestCancel}><X className="h-4 w-4" />{ot("cancel")}</Button> : undefined} />
      <div className="mx-auto max-w-5xl space-y-4">
        {Object.entries(sourceErrors).map(([source, message]) => message ? <SourceErrorCard key={source} title={sourceLabel(source as SourceName, ot)} message={message} retryLabel={ot("retry")} onRetry={() => void retrySource(source as SourceName)} loading={statuses[source as SourceName] === "loading"} /> : null)}
        {showCancelConfirm ? <Card className="border-warning/35 bg-warning/5"><CardContent className="space-y-3 p-4"><p className="font-semibold">{ot("cancelQuestion")}</p><p className="text-sm text-muted-foreground">{ot("cancelDetail")}</p><div className="flex flex-col gap-2 sm:flex-row"><Button type="button" variant="outline" className="min-h-11" onClick={() => setShowCancelConfirm(false)}>{ot("stay")}</Button><Button type="button" variant="destructive" className="min-h-11" onClick={() => router.push("/settings")}>{ot("discard")}</Button></div></CardContent></Card> : null}
        <Card variant="glassStrong" className="overflow-hidden border-primary/15">
          <CardHeader className="space-y-3 border-b border-border/70"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{ot("step")} {step + 1} {ot("of")} 7</p><CardTitle className="mt-1 text-xl sm:text-2xl">{localizedSectionTitle(step, ot)}</CardTitle></div><div role="progressbar" aria-valuemin={1} aria-valuemax={7} aria-valuenow={step + 1} aria-label={`${ot("step")} ${step + 1} ${ot("of")} 7`}><Progress value={progressValue} animated={!settings.reduceAnimations} /></div></CardHeader>
          <CardContent className="space-y-6 p-4 pb-28 sm:p-6 sm:pb-6">
            {Object.keys(errors).length ? <div ref={errorSummaryRef} tabIndex={-1} role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive outline-none"><p className="font-semibold">{ot("reviewErrors")}</p><ul className="mt-2 list-disc space-y-1 ps-5">{Object.values(errors).filter(Boolean).map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul></div> : null}
            {saveError ? <PersistentError message={saveError} /> : null}
            {step === 0 ? <BasicProfileSection answers={answers} setAnswers={setAnswers} errors={errors} ot={ot} weightUnit={settings.weightUnit} heightUnit={settings.heightUnit} /> : null}
            {step === 1 ? <GoalsSection answers={answers} setAnswers={setAnswers} errors={errors} updateGoals={updateGoals} goalLabel={goalLabel} ot={ot} weightUnit={settings.weightUnit} /> : null}
            {step === 2 ? <TrainingSection answers={answers} setAnswers={setAnswers} errors={errors} updateSport={updateSport} setSportDetail={setSportDetail} sportLabel={sportLabel} fieldLabel={fieldLabel} optionLabel={optionLabel} language={language} ot={ot} /> : null}
            {step === 3 ? <NutritionSection answers={answers} setAnswers={setAnswers} errors={errors} ot={ot} optionLabel={optionLabel} /> : null}
            {step === 4 ? <ConstraintsSection answers={answers} setAnswers={setAnswers} ot={ot} /> : null}
            {step === 5 ? <PermissionsSection permissions={permissions} permissionConfirmed={permissionConfirmed} permissionStatus={permissionStatus} errors={errors} selectMode={selectPermissionMode} togglePermission={togglePermission} setPermissionConfirmed={setPermissionConfirmed} retry={() => void retrySource("permissions")} ot={ot} /> : null}
            {step === 6 ? <ReviewSection answers={answers} permissions={permissions} setStep={setStep} goalLabel={goalLabel} sportLabel={sportLabel} optionLabel={optionLabel} ot={ot} /> : null}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3"><Button type="button" variant="outline" className="min-h-12" disabled={step === 0 || isSaving} onClick={() => { setErrors({}); setStep(Math.max(0, step - 1) as OnboardingSectionIndex); }}><ChevronLeft className={cn("h-4 w-4", dir === "rtl" && "rotate-180")} /> {ot("back")}</Button>{step < 6 ? <Button type="button" className="min-h-12" disabled={isSaving} onClick={() => void goNext()}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{step === 4 ? ot("skip") : ot("next")}<ChevronRight className={cn("h-4 w-4", dir === "rtl" && "rotate-180")} /></Button> : <Button type="button" className="min-h-12" disabled={isSaving || anyCriticalLoadFailure} onClick={() => void finish()}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{isSaving ? ot("saving") : editMode ? ot("saveChanges") : ot("finish")}</Button>}</div></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function localizedSectionTitle(step: OnboardingSectionIndex, ot: ReturnType<typeof useOnboardingTranslation>["ot"]) { return [ot("profileSection"), ot("goalsSection"), ot("trainingSection"), ot("nutritionSection"), ot("constraintsSection"), ot("permissionsSection"), ot("reviewSection")][step]; }
function SectionIntro({ children }: { children: ReactNode }) { return <p className="rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">{children}</p>; }
function FieldError({ id, message }: { id: string; message?: string }) { return message ? <p id={id} className="text-sm text-destructive">{message}</p> : null; }
function SourceErrorCard({ title, message, retryLabel, onRetry, loading }: { title: string; message: string; retryLabel: string; onRetry: () => void; loading: boolean }) { return <Card className="border-destructive/30 bg-destructive/5"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{message}</p></div></div><Button type="button" variant="outline" className="min-h-11" onClick={onRetry} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}{retryLabel}</Button></CardContent></Card>; }
function PersistentError({ message }: { message: string }) { return <div role="alert" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{message}</p></div>; }

function BasicProfileSection({ answers, setAnswers, errors, ot, weightUnit, heightUnit }: { answers: AdaptiveOnboardingAnswers; setAnswers: React.Dispatch<React.SetStateAction<AdaptiveOnboardingAnswers>>; errors: FieldErrors; ot: ReturnType<typeof useOnboardingTranslation>["ot"]; weightUnit: "kg" | "lb"; heightUnit: "cm" | "ft-in" }) {
  return <section className="space-y-5"><SectionIntro>{ot("basicIntro")}</SectionIntro><div className="grid gap-4 sm:grid-cols-2"><NumericInput id="age" label={ot("age")} value={answers.age === null ? "" : String(answers.age)} onChange={(value) => setAnswers((current) => ({ ...current, age: parseOptionalNumber(value) }))} required min={16} max={100} step={1} error={errors.age} unit="years" /><SingleChoice legend={`${ot("sex")} (${ot("optional")})`} value={answers.gender} items={[{ value: "male", label: ot("male") }, { value: "female", label: ot("female") }, { value: "prefer_not_to_say", label: ot("preferNotSay") }]} onChange={(gender) => setAnswers((current) => ({ ...current, gender }))} /><NumericInput id="height_cm" label={`${ot("height")} (${ot("optional")})`} value={cmToDisplay(answers.height_cm, heightUnit)} onChange={(value) => setAnswers((current) => ({ ...current, height_cm: displayToCm(value, heightUnit) }))} error={errors.height_cm} unit={heightUnit === "ft-in" ? "in" : "cm"} /><NumericInput id="weight_kg" label={`${ot("currentWeight")} (${ot("optional")})`} value={kgToDisplay(answers.weight_kg, weightUnit)} onChange={(value) => setAnswers((current) => ({ ...current, weight_kg: displayToKg(value, weightUnit) }))} error={errors.weight_kg} unit={weightUnit} /></div></section>;
}

function GoalsSection({ answers, setAnswers, errors, updateGoals, goalLabel, ot, weightUnit }: { answers: AdaptiveOnboardingAnswers; setAnswers: React.Dispatch<React.SetStateAction<AdaptiveOnboardingAnswers>>; errors: FieldErrors; updateGoals: (goal: GoalId) => void; goalLabel: (value: GoalId) => string; ot: ReturnType<typeof useOnboardingTranslation>["ot"]; weightUnit: "kg" | "lb" }) {
  return <section className="space-y-5"><SectionIntro>{ot("goalsIntro")}</SectionIntro><MultiChoice legend={`${ot("goals")} *`} values={GOAL_OPTIONS.map((value) => ({ value, label: goalLabel(value) }))} selected={answers.goals} onToggle={(value) => updateGoals(value as GoalId)} error={errors.goals} />{answers.goals.length ? <SingleChoice legend={`${ot("primaryGoal")} *`} value={answers.primary_goal ?? ""} items={answers.goals.map((value) => ({ value, label: goalLabel(value) }))} onChange={(primary_goal) => setAnswers((current) => ({ ...current, primary_goal: primary_goal as GoalId }))} error={errors.primary_goal} /> : null}{shouldShowTargetWeight(answers.goals) ? <div className="max-w-sm"><NumericInput id="goal_weight_kg" label={`${ot("targetWeight")} (${ot("optional")})`} value={kgToDisplay(answers.goal_weight_kg, weightUnit)} onChange={(value) => setAnswers((current) => ({ ...current, goal_weight_kg: displayToKg(value, weightUnit) }))} error={errors.goal_weight_kg} unit={weightUnit} /></div> : null}</section>;
}

function TrainingSection({ answers, setAnswers, errors, updateSport, setSportDetail, sportLabel, fieldLabel, optionLabel, language, ot }: { answers: AdaptiveOnboardingAnswers; setAnswers: React.Dispatch<React.SetStateAction<AdaptiveOnboardingAnswers>>; errors: FieldErrors; updateSport: (sport: SportId) => void; setSportDetail: (id: string, value: string | number | string[] | null) => void; sportLabel: (sport: SportId) => string; fieldLabel: (id: string, fallback: string) => string; optionLabel: (value: string) => string; language: "en" | "de" | "ar"; ot: ReturnType<typeof useOnboardingTranslation>["ot"] }) {
  const fields = answers.primary_sport ? SPORT_FIELD_CONFIG[answers.primary_sport] : [];
  return <section className="space-y-5"><SectionIntro>{ot("trainingIntro")}</SectionIntro><SingleChoice legend={`${ot("primarySport")} *`} value={answers.primary_sport ?? ""} items={SPORT_OPTIONS.map((value) => ({ value, label: sportLabel(value) }))} onChange={(value) => updateSport(value as SportId)} error={errors.primary_sport} columns="sm:grid-cols-2 lg:grid-cols-3" />{answers.primary_sport === "other" ? <TextInput id="primary_sport_other" label={`${ot("otherSport")} *`} value={answers.primary_sport_other} onChange={(value) => setAnswers((current) => ({ ...current, primary_sport_other: value }))} error={errors.primary_sport_other} /> : null}<MultiChoice legend={`${ot("secondarySports")} (${ot("optional")})`} values={SPORT_OPTIONS.filter((value) => value !== answers.primary_sport && value !== "other").map((value) => ({ value, label: sportLabel(value) }))} selected={answers.secondary_sports} onToggle={(value) => setAnswers((current) => ({ ...current, secondary_sports: current.secondary_sports.includes(value as SportId) ? current.secondary_sports.filter((item) => item !== value) : [...current.secondary_sports, value as SportId] }))} /><div className="grid gap-4 sm:grid-cols-2"><SingleChoice legend={`${ot("experienceLevel")} *`} value={answers.training_level} items={EXPERIENCE_OPTIONS.map((value) => ({ value, label: optionLabel(value) }))} onChange={(training_level) => setAnswers((current) => ({ ...current, training_level }))} error={errors.training_level} /><SingleChoice legend={`${ot("trainingLocation")} *`} value={answers.training_place} items={LOCATION_OPTIONS.map((value) => ({ value, label: optionLabel(value) }))} onChange={(training_place) => setAnswers((current) => ({ ...current, training_place }))} error={errors.training_place} /><SingleChoice legend={`${ot("activityLevel")} *`} value={answers.activity_level} items={ACTIVITY_OPTIONS.map((value) => ({ value, label: optionLabel(value) }))} onChange={(activity_level) => setAnswers((current) => ({ ...current, activity_level }))} error={errors.activity_level} /><NumericInput id="training_days_per_week" label={`${ot("daysPerWeek")} *`} value={answers.training_days_per_week === null ? "" : String(answers.training_days_per_week)} onChange={(value) => setAnswers((current) => ({ ...current, training_days_per_week: parseOptionalNumber(value) }))} min={1} max={7} step={1} error={errors.training_days_per_week} /><NumericInput id="workout_duration_minutes" label={`${ot("sessionDuration")} *`} value={answers.workout_duration_minutes === null ? "" : String(answers.workout_duration_minutes)} onChange={(value) => setAnswers((current) => ({ ...current, workout_duration_minutes: parseOptionalNumber(value) }))} min={10} max={240} step={5} error={errors.workout_duration_minutes} unit="min" /><SingleChoice legend={`${ot("preferredTime")} *`} value={answers.preferred_workout_time} items={TIME_OPTIONS.map((value) => ({ value, label: optionLabel(value) }))} onChange={(preferred_workout_time) => setAnswers((current) => ({ ...current, preferred_workout_time }))} error={errors.preferred_workout_time} /></div><MultiChoice legend={`${ot("availableDays")} *`} values={DAY_IDS.map((value, index) => ({ value, label: dayLabels[language][index] }))} selected={answers.available_days} onToggle={(value) => setAnswers((current) => ({ ...current, available_days: current.available_days.includes(value) ? current.available_days.filter((item) => item !== value) : [...current.available_days, value] }))} error={errors.available_days} /><div className="grid gap-4 sm:grid-cols-2"><TagInput id="liked-activities" label={ot("likedActivities")} value={answers.liked_activities} onChange={(liked_activities) => setAnswers((current) => ({ ...current, liked_activities }))} /><TagInput id="disliked-activities" label={ot("dislikedActivities")} value={answers.disliked_activities} onChange={(disliked_activities) => setAnswers((current) => ({ ...current, disliked_activities }))} /></div>{fields.length ? <fieldset className="space-y-4 rounded-xl border border-border/70 p-4"><legend className="px-2 font-semibold">{ot("sportSpecific")}</legend><div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => <SportField key={field.id} field={field} label={fieldLabel(field.id, field.label)} value={answers.sport_details[field.id]} error={errors[`sport_details.${field.id}`]} onChange={(value) => setSportDetail(field.id, value)} optionLabel={optionLabel} />)}</div></fieldset> : null}</section>;
}

function SportField({ field, label, value, error, onChange, optionLabel }: { field: SportFieldDefinition; label: string; value: string | number | string[] | null | undefined; error?: string; onChange: (value: string | number | string[] | null) => void; optionLabel: (value: string) => string }) {
  if (field.type === "tags") return <TagInput id={`sport-${field.id}`} label={`${label}${field.optional ? "" : " *"}`} value={Array.isArray(value) ? value : []} onChange={onChange} />;
  if (field.type === "choice") return <SingleChoice legend={`${label}${field.optional ? "" : " *"}`} value={typeof value === "string" ? value : ""} items={(field.options ?? []).map((option) => ({ value: option, label: optionLabel(option) }))} onChange={onChange} error={error} />;
  if (field.type === "number") return <NumericInput id={`sport-${field.id}`} label={`${label}${field.optional ? "" : " *"}`} value={typeof value === "number" ? String(value) : ""} onChange={(next) => onChange(parseOptionalNumber(next))} min={field.min} max={field.max} error={error} unit={field.unit} />;
  return <TextInput id={`sport-${field.id}`} label={`${label}${field.optional ? "" : " *"}`} value={typeof value === "string" ? value : ""} onChange={onChange} error={error} />;
}

function NutritionSection({ answers, setAnswers, errors, ot, optionLabel }: { answers: AdaptiveOnboardingAnswers; setAnswers: React.Dispatch<React.SetStateAction<AdaptiveOnboardingAnswers>>; errors: FieldErrors; ot: ReturnType<typeof useOnboardingTranslation>["ot"]; optionLabel: (value: string) => string }) {
  const n = answers.nutrition; const patch = (next: Partial<typeof n>) => setAnswers((current) => ({ ...current, nutrition: { ...current.nutrition, ...next } })); const noCuisinePreference = n.preferred_cuisines.includes("no_preference");
  return <section className="space-y-5"><SectionIntro>{ot("nutritionIntro")}</SectionIntro><fieldset className="space-y-4 rounded-xl border border-border/70 p-4"><legend className="px-2 font-semibold">{ot("essential")}</legend><div className="grid gap-4 sm:grid-cols-2"><SingleChoice legend={`${ot("nutritionGoal")} *`} value={n.nutrition_goal} items={NUTRITION_GOALS.map((value) => ({ value, label: optionLabel(value) }))} onChange={(nutrition_goal) => patch({ nutrition_goal })} error={errors["nutrition.nutrition_goal"]} /><NumericInput id="meals-per-day" label={`${ot("mealsPerDay")} *`} value={n.meals_per_day === null ? "" : String(n.meals_per_day)} onChange={(value) => patch({ meals_per_day: parseOptionalNumber(value) })} min={1} max={12} step={1} error={errors["nutrition.meals_per_day"]} /><div className="space-y-2 sm:col-span-2"><TagInput id="preferred-cuisines" label={`${ot("preferredCuisines")} *`} value={noCuisinePreference ? [] : n.preferred_cuisines} onChange={(preferred_cuisines) => patch({ preferred_cuisines })} /><Button type="button" variant={noCuisinePreference ? "default" : "outline"} className="min-h-11" onClick={() => patch({ preferred_cuisines: noCuisinePreference ? [] : ["no_preference"] })}>{ot("noPreference")}</Button><FieldError id="preferred-cuisines-error" message={errors["nutrition.preferred_cuisines"]} /></div><TagInput id="foods-liked" label={ot("foodsLiked")} value={n.liked_foods} onChange={(liked_foods) => patch({ liked_foods })} /><TagInput id="foods-disliked" label={ot("foodsDisliked")} value={n.disliked_foods} onChange={(disliked_foods) => patch({ disliked_foods })} /><TagInput id="allergies" label={ot("allergies")} value={n.allergies} onChange={(allergies) => patch({ allergies })} /><TagInput id="dietary-restrictions" label={ot("restrictions")} value={n.dietary_restrictions} onChange={(dietary_restrictions) => patch({ dietary_restrictions })} /></div></fieldset><fieldset className="space-y-4 rounded-xl border border-border/70 p-4"><legend className="px-2 font-semibold">{ot("optionalDetails")}</legend><div className="grid gap-4 sm:grid-cols-2"><SingleChoice legend={ot("cookingAbility")} value={n.cooking_skill} items={COOKING_SKILLS.map((value) => ({ value, label: optionLabel(value) }))} onChange={(cooking_skill) => patch({ cooking_skill })} /><NumericInput id="cooking-time" label={ot("cookingTime")} value={n.max_cooking_time_minutes === null ? "" : String(n.max_cooking_time_minutes)} onChange={(value) => patch({ max_cooking_time_minutes: parseOptionalNumber(value) })} min={0} max={1440} error={errors["nutrition.max_cooking_time_minutes"]} unit="min" /><SingleChoice legend={ot("mealPrep")} value={n.meal_prep_preference} items={MEAL_PREP_OPTIONS.map((value) => ({ value, label: optionLabel(value) }))} onChange={(meal_prep_preference) => patch({ meal_prep_preference })} /><div className="grid grid-cols-[1fr_auto] gap-2"><NumericInput id="weekly-budget" label={ot("weeklyBudget")} value={n.weekly_food_budget === null ? "" : String(n.weekly_food_budget)} onChange={(value) => patch({ weekly_food_budget: parseOptionalNumber(value) })} min={0} error={errors["nutrition.weekly_food_budget"]} /><div className="space-y-2"><Label htmlFor="budget-currency">{ot("currency")}</Label><select id="budget-currency" value={n.budget_currency} onChange={(event) => patch({ budget_currency: event.target.value })} className="h-11 rounded-[14px] border border-input bg-card px-3"><option value="">—</option>{CURRENCIES.map((value) => <option key={value} value={value}>{value}</option>)}</select><FieldError id="budget-currency-error" message={errors["nutrition.budget_currency"]} /></div></div><TextInput id="eating-schedule" label={ot("eatingSchedule")} value={n.eating_schedule} onChange={(eating_schedule) => patch({ eating_schedule })} /><TagInput id="supplements" label={ot("supplements")} value={n.supplements} onChange={(supplements) => patch({ supplements })} /><SingleChoice legend={ot("tracksMacros")} value={n.tracks_calories_or_macros === null ? "" : n.tracks_calories_or_macros ? "yes" : "no"} items={[{ value: "yes", label: ot("yes") }, { value: "no", label: ot("no") }]} onChange={(value) => patch({ tracks_calories_or_macros: value === "yes" })} /></div></fieldset></section>;
}

function ConstraintsSection({ answers, setAnswers, ot }: { answers: AdaptiveOnboardingAnswers; setAnswers: React.Dispatch<React.SetStateAction<AdaptiveOnboardingAnswers>>; ot: ReturnType<typeof useOnboardingTranslation>["ot"] }) {
  const c = answers.constraints; const patch = (next: Partial<typeof c>) => setAnswers((current) => ({ ...current, constraints: { ...current.constraints, ...next } }));
  return <section className="space-y-5"><SectionIntro>{ot("constraintsIntro")}</SectionIntro><div className="grid gap-4 sm:grid-cols-2"><TagInput id="injuries" label={ot("injuries")} value={c.injury_or_limitation_labels} onChange={(injury_or_limitation_labels) => patch({ injury_or_limitation_labels })} /><TagInput id="pain-areas" label={ot("painAreas")} value={c.pain_sensitive_areas} onChange={(pain_sensitive_areas) => patch({ pain_sensitive_areas })} /><TextArea id="movements-avoid" label={ot("movementsAvoid")} value={c.movements_to_avoid ?? ""} onChange={(value) => patch({ movements_to_avoid: value.trim() ? value : null })} /><TagInput id="discomfort-exercises" label={ot("discomfortExercises")} value={c.discomfort_exercises} onChange={(discomfort_exercises) => patch({ discomfort_exercises })} /><TextArea id="mobility-limits" label={ot("mobilityLimits")} value={c.mobility_limitations ?? ""} onChange={(value) => patch({ mobility_limitations: value.trim() ? value : null })} /><TextArea id="professional-restrictions" label={ot("professionalRestrictions")} value={c.professional_restrictions ?? ""} onChange={(value) => patch({ professional_restrictions: value.trim() ? value : null })} /></div>{c.legacy_context_notes ? <div className="rounded-xl border border-border/70 p-4"><p className="font-semibold">{ot("retainedNotes")}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{c.legacy_context_notes}</p><Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => patch({ legacy_context_notes: null })}>{ot("clearRetained")}</Button></div> : null}</section>;
}

function PermissionsSection({ permissions, permissionConfirmed, permissionStatus, errors, selectMode, togglePermission, setPermissionConfirmed, retry, ot }: { permissions: AiPermissionConfig; permissionConfirmed: boolean; permissionStatus: AiPermissionSettingsStatus["state"] | "loading"; errors: FieldErrors; selectMode: (mode: "full" | "custom") => void; togglePermission: (section: (typeof ALL_AI_PERMISSION_SECTIONS)[number], action: "read" | "write") => void; setPermissionConfirmed: (value: boolean) => void; retry: () => void; ot: ReturnType<typeof useOnboardingTranslation>["ot"] }) {
  if (permissionStatus === "loading") return <div className="flex items-center gap-3 py-8"><Loader2 className="h-5 w-5 animate-spin" /><p>{ot("loading")}</p></div>;
  return <section className="space-y-5"><SectionIntro>{ot("permissionsIntro")}</SectionIntro>{permissionStatus === "failed" ? <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"><p className="text-sm text-destructive">{ot("permissionLoadFailed")}</p><Button type="button" variant="outline" className="min-h-11" onClick={retry}><RefreshCcw className="h-4 w-4" />{ot("retry")}</Button></div> : null}<SingleChoice legend={`${ot("permissionsSection")} *`} value={permissions.accessMode} items={[{ value: "custom", label: ot("customAccess"), description: ot("customAccessDetail") }, { value: "full", label: ot("fullAccess"), description: ot("fullAccessDetail") }]} onChange={(value) => selectMode(value as "full" | "custom")} disabled={permissionStatus === "failed"} error={errors.permissions} />{permissions.accessMode === "custom" ? <div className="grid gap-3 sm:grid-cols-2">{ALL_AI_PERMISSION_SECTIONS.map((section) => { const details = AI_PERMISSION_SECTION_DETAILS[section]; const permission = permissions.sections[section]; return <fieldset key={section} className="rounded-xl border border-border/70 p-4"><legend className="px-2 font-semibold">{details.label}</legend><p className="mb-3 text-sm text-muted-foreground">{details.readDescription}</p><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={permission.read} onChange={() => togglePermission(section, "read")} /><span>{ot("viewData")}</span></label><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={permission.write} onChange={() => togglePermission(section, "write")} /><span>{ot("updateData")}</span></label></fieldset>; })}</div> : null}<label className="flex min-h-12 items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><input type="checkbox" className="mt-1" checked={permissionConfirmed} disabled={permissionStatus === "failed"} onChange={(event) => setPermissionConfirmed(event.target.checked)} /><span><span className="font-semibold">{ot("confirmPermissions")}</span><span className="mt-1 block text-sm text-muted-foreground">{ot("permissionSeparate")}</span></span></label><FieldError id="permission-confirmation-error" message={errors.permission_confirmation} /></section>;
}

function ReviewSection({ answers, permissions, setStep, goalLabel, sportLabel, optionLabel, ot }: { answers: AdaptiveOnboardingAnswers; permissions: AiPermissionConfig; setStep: (step: OnboardingSectionIndex) => void; goalLabel: (goal: GoalId) => string; sportLabel: (sport: SportId) => string; optionLabel: (value: string) => string; ot: ReturnType<typeof useOnboardingTranslation>["ot"] }) {
  const permissionValues = permissions.accessMode === "full" ? [ot("full")] : ALL_AI_PERMISSION_SECTIONS.flatMap((section) => { const p = permissions.sections[section]; return p.read || p.write ? [`${AI_PERMISSION_SECTION_DETAILS[section].label}: ${p.write ? ot("updateData") : ot("viewData")}`] : []; });
  const constraintValues = [...answers.constraints.injury_or_limitation_labels, ...answers.constraints.pain_sensitive_areas, ...answers.constraints.discomfort_exercises];
  return <section className="space-y-4"><SectionIntro>{ot("reviewIntro")}</SectionIntro><ReviewCard title={ot("basicSummary")} onEdit={() => setStep(0)} editLabel={ot("edit")} values={[`${ot("age")}: ${answers.age ?? ot("noValue")}`, `${ot("sex")}: ${answers.gender ? optionLabel(answers.gender) : ot("noValue")}`, `${ot("height")}: ${answers.height_cm ?? ot("noValue")}`, `${ot("currentWeight")}: ${answers.weight_kg ?? ot("noValue")}`]} /><ReviewCard title={ot("goalsSummary")} onEdit={() => setStep(1)} editLabel={ot("edit")} values={[...answers.goals.map(goalLabel), `${ot("primaryGoal")}: ${answers.primary_goal ? goalLabel(answers.primary_goal) : ot("noValue")}`, ...(answers.goal_weight_kg ? [`${ot("targetWeight")}: ${answers.goal_weight_kg} kg`] : [])]} /><ReviewCard title={ot("trainingSummary")} onEdit={() => setStep(2)} editLabel={ot("edit")} values={[answers.primary_sport ? sportLabel(answers.primary_sport) : ot("noValue"), ...answers.secondary_sports.map(sportLabel), `${ot("daysPerWeek")}: ${answers.training_days_per_week ?? ot("noValue")}`, `${ot("sessionDuration")}: ${answers.workout_duration_minutes ?? ot("noValue")} min`]} /><ReviewCard title={ot("nutritionSummary")} onEdit={() => setStep(3)} editLabel={ot("edit")} values={[optionLabel(answers.nutrition.nutrition_goal), `${ot("mealsPerDay")}: ${answers.nutrition.meals_per_day ?? ot("noValue")}`, ...answers.nutrition.preferred_cuisines.map(optionLabel)]} /><ReviewCard title={ot("constraintsSummary")} onEdit={() => setStep(4)} editLabel={ot("edit")} values={constraintValues.length ? constraintValues : [ot("noValue")]} /><ReviewCard title={ot("permissionsSummary")} onEdit={() => setStep(5)} editLabel={ot("edit")} values={permissionValues.length ? permissionValues : [ot("noneSelected")]} /></section>;
}
function ReviewCard({ title, values, onEdit, editLabel }: { title: string; values: string[]; onEdit: () => void; editLabel: string }) { return <div className="rounded-xl border border-border/70 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{title}</h3><Button type="button" variant="outline" className="min-h-11" onClick={onEdit}>{editLabel}</Button></div><ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">{values.filter(Boolean).map((value, index) => <li key={`${value}-${index}`} className="break-words">{value}</li>)}</ul></div>; }
function SingleChoice({ legend, value, items, onChange, error, columns = "sm:grid-cols-2", disabled = false }: { legend: string; value: string; items: Array<{ value: string; label: string; description?: string }>; onChange: (value: string) => void; error?: string; columns?: string; disabled?: boolean }) { const errorId = `${legend.replace(/\W+/g, "-").toLowerCase()}-error`; return <fieldset className="space-y-2" aria-describedby={error ? errorId : undefined}><legend className="mb-2 text-sm font-semibold">{legend}</legend><div className={cn("grid gap-2", columns)}>{items.map((item) => <label key={item.value} className={cn("flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 focus-within:ring-2 focus-within:ring-ring", value === item.value ? "border-primary bg-primary/10" : "border-border bg-card", disabled && "cursor-not-allowed opacity-60")}><input type="radio" name={legend} value={item.value} checked={value === item.value} disabled={disabled} onChange={() => onChange(item.value)} className="mt-1" /><span><span className="font-semibold">{item.label}</span>{item.description ? <span className="mt-1 block text-sm leading-5 text-muted-foreground">{item.description}</span> : null}</span></label>)}</div><FieldError id={errorId} message={error} /></fieldset>; }
function MultiChoice({ legend, values, selected, onToggle, error }: { legend: string; values: Array<{ value: string; label: string }>; selected: string[]; onToggle: (value: string) => void; error?: string }) { const errorId = `${legend.replace(/\W+/g, "-").toLowerCase()}-error`; return <fieldset className="space-y-2" aria-describedby={error ? errorId : undefined}><legend className="mb-2 text-sm font-semibold">{legend}</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{values.map((item) => <label key={item.value} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 focus-within:ring-2 focus-within:ring-ring", selected.includes(item.value) ? "border-primary bg-primary/10" : "border-border bg-card")}><input type="checkbox" checked={selected.includes(item.value)} onChange={() => onToggle(item.value)} /><span className="font-semibold">{item.label}</span></label>)}</div><FieldError id={errorId} message={error} /></fieldset>; }
function NumericInput({ id, label, value, onChange, error, required = false, min, max, step = "any", unit }: { id: string; label: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean; min?: number; max?: number; step?: number | "any"; unit?: string }) { const errorId = `${id}-error`; return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><div className="relative"><Input id={id} type="number" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} required={required} min={min} max={max} step={step} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className={unit ? "pe-16" : undefined} />{unit ? <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground">{unit}</span> : null}</div><FieldError id={errorId} message={error} /></div>; }
function TextInput({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (value: string) => void; error?: string }) { const errorId = `${id}-error`; return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} /><FieldError id={errorId} message={error} /></div>; }
function TextArea({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-28 w-full resize-y rounded-[14px] border border-input bg-card px-3 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>; }
