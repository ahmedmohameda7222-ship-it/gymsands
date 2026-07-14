"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Loader2, RotateCcw, Save, Target } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { env } from "@/lib/env";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import { InlineFeedback } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addIsoDays } from "@/lib/eat/eat-model";
import {
  buildNutritionTargetDraft,
  canonicalNutritionTargetDraft,
  isNutritionTargetDraftDirty,
  profileForEditor,
  targetChoiceEditorType,
  type NutritionTargetDraft,
  type PersistedNutritionTargetState
} from "@/lib/eat/nutrition-target-draft";
import {
  buildNutritionTargetsDateHref,
  resolveNutritionTargetsReturnHref,
  type NutritionTargetsReturnDestination
} from "@/lib/eat/nutrition-target-return";
import { eatEnergyDisplayValue, eatLiquidDisplayValue } from "@/lib/eat/eat-units";
import { useUnsavedChangesGuard } from "@/lib/hooks/use-unsaved-changes-guard";
import { useNutritionTargetsTranslation } from "@/lib/i18n/nutrition-targets";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { getCalorieTargets } from "@/services/database/nutrition";
import { getNutritionTargetProfiles } from "@/services/database/execution-layer";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { getEatTargetAssignmentForDate } from "@/services/database/eat-targets";
import {
  applyNutritionTargetChanges,
  isNutritionTargetApplyConsistencyError
} from "@/services/database/nutrition-target-assignments";
import { detectNutritionTargetTypeForDate } from "@/services/nutrition/active-target";
import type { NutritionTargetAssignment, NutritionTargetProfileType } from "@/types";

const choices: NutritionTargetAssignment[] = ["auto", "default_day", "training_day", "rest_day", "high_activity_day"];

function fieldNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function NutritionTargetSettings({
  selectedDate,
  returnDestination
}: {
  selectedDate: string;
  returnDestination: NutritionTargetsReturnDestination;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const router = useRouter();
  const { settings } = useUserSettings();
  const { nt, dir, locale } = useNutritionTargetsTranslation();
  const [persisted, setPersisted] = useState<PersistedNutritionTargetState | null>(null);
  const persistedRef = useRef<PersistedNutritionTargetState | null>(null);
  const [persistedDraft, setPersistedDraft] = useState<NutritionTargetDraft | null>(null);
  const [draft, setDraft] = useState<NutritionTargetDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);
  const currentReturnHref = resolveNutritionTargetsReturnHref(returnDestination, selectedDate);

  const load = useCallback(async ({ preserveDraft = false }: { preserveDraft?: boolean } = {}) => {
    if (!userId) return false;
    setLoading(true);
    setLoadError(false);
    try {
      const [baseTarget, profiles, plan, assignment] = await Promise.all([
        getCalorieTargets(userId, { throwOnError: true }),
        env.useMockAuth && isMockAuthUserId(userId) ? Promise.resolve([]) : getNutritionTargetProfiles(userId),
        getDefaultUserWorkoutPlan(userId),
        env.useMockAuth && isMockAuthUserId(userId) ? Promise.resolve<NutritionTargetAssignment>("auto") : getEatTargetAssignmentForDate(userId, selectedDate)
      ]);
      const resolvedTargetType = detectNutritionTargetTypeForDate(plan, selectedDate);
      const nextPersisted: PersistedNutritionTargetState = {
        selectedDate,
        assignment,
        resolvedTargetType,
        profiles,
        baseTarget
      };
      const nextPersistedDraft = buildNutritionTargetDraft({ persisted: nextPersisted, settings });
      persistedRef.current = nextPersisted;
      setPersisted(nextPersisted);
      setPersistedDraft(nextPersistedDraft);
      if (!preserveDraft) setDraft(nextPersistedDraft);
      setLoading(false);
      return true;
    } catch {
      setLoading(false);
      setLoadError(true);
      return false;
    }
  }, [selectedDate, settings, userId]);

  useEffect(() => { void load(); }, [load]);

  const dirty = Boolean(draft && persistedDraft && isNutritionTargetDraftDirty(draft, persistedDraft));

  const validate = useCallback((current: NutritionTargetDraft) => {
    const energy = fieldNumber(current.calories);
    const protein = fieldNumber(current.protein);
    const carbs = fieldNumber(current.carbs);
    const fat = fieldNumber(current.fat);
    const water = fieldNumber(current.water);
    const minEnergy = eatEnergyDisplayValue(500, settings.energyUnit);
    const maxEnergy = eatEnergyDisplayValue(15000, settings.energyUnit);
    const minWater = eatLiquidDisplayValue(250, settings.liquidUnit);
    const maxWater = eatLiquidDisplayValue(20000, settings.liquidUnit);
    if (energy !== null && (!Number.isFinite(energy) || energy < minEnergy || energy > maxEnergy)) {
      throw new Error(nt("invalidEnergy", { min: minEnergy, max: maxEnergy, unit: settings.energyUnit }));
    }
    for (const [value, label, max] of [[protein, nt("protein"), 1000], [carbs, nt("carbs"), 2000], [fat, nt("fat"), 1000]] as const) {
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > max)) throw new Error(nt("invalidMacro", { field: label }));
    }
    if (water !== null && (!Number.isFinite(water) || water < minWater || water > maxWater)) {
      throw new Error(nt("invalidWater", { min: minWater, max: maxWater, unit: settings.liquidUnit }));
    }
    return canonicalNutritionTargetDraft(current, settings);
  }, [nt, settings]);

  const apply = useCallback(async () => {
    if (!userId || !draft || applying) return false;
    setApplying(true);
    setFeedback({ type: "info", message: `${nt("apply")}…` });
    try {
      const canonical = validate(draft);
      await applyNutritionTargetChanges({
        userId,
        targetDate: selectedDate,
        assignment: draft.assignment,
        editorTargetType: draft.editorTargetType,
        ...canonical
      });
      const reloaded = await load();
      if (!reloaded) throw new Error(nt("applyFailed"));
      setFeedback({ type: "info", message: nt("applied") });
      return true;
    } catch (error) {
      const failedDraft = draft;
      if (isNutritionTargetApplyConsistencyError(error)) {
        await load({ preserveDraft: true });
        setDraft(failedDraft);
        setFeedback({ type: "error", message: nt("verifyFailed") });
      } else {
        setFeedback({ type: "error", message: error instanceof Error && error.message ? error.message : nt("applyFailed") });
      }
      return false;
    } finally {
      setApplying(false);
    }
  }, [applying, draft, load, nt, selectedDate, userId, validate]);

  const discard = useCallback(() => {
    if (persistedDraft) setDraft(persistedDraft);
    setFeedback({ type: "info", message: nt("discarded") });
  }, [nt, persistedDraft]);

  const { request, dialog } = useUnsavedChangesGuard({
    dirty,
    applying,
    onApply: apply,
    onDiscard: discard,
    copy: {
      title: nt("unsavedTitle"),
      description: nt("unsavedDescription"),
      apply: nt("applyContinue"),
      discard: nt("discardContinue"),
      stay: nt("stay")
    }
  });

  const targetLabel = useCallback((type: NutritionTargetAssignment | NutritionTargetProfileType) => {
    if (type === "auto") return nt("automatic");
    if (type === "default_day") return nt("fallback");
    if (type === "training_day") return nt("training");
    if (type === "rest_day") return nt("rest");
    return nt("highActivity");
  }, [nt]);

  function navigateDate(date: string) {
    request(() => router.push(buildNutritionTargetsDateHref(date, returnDestination)));
  }

  function selectAssignment(assignment: NutritionTargetAssignment) {
    if (draft?.assignment === assignment) return;
    request(() => {
      const currentPersisted = persistedRef.current;
      if (!currentPersisted) return;
      const editorTargetType = targetChoiceEditorType(assignment, currentPersisted.resolvedTargetType);
      const next = buildNutritionTargetDraft({
        persisted: { ...currentPersisted, assignment },
        settings
      });
      setDraft({ ...next, assignment, editorTargetType });
      setFeedback(null);
    });
  }

  const source = useMemo(() => draft && persisted ? profileForEditor(draft.editorTargetType, persisted.profiles, persisted.baseTarget) : null, [draft, persisted]);

  if (loading && !draft) return <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{nt("loading")}</CardContent></Card>;
  if (loadError || !draft || !persisted) return <Card><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-destructive">{nt("loadFailed")}</p><Button type="button" variant="outline" onClick={() => void load()}>{nt("retry")}</Button></CardContent></Card>;

  return <div className="space-y-4" dir={dir}>
    {dialog}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button type="button" variant="outline" className="min-h-12" onClick={() => request(() => router.push(currentReturnHref))}><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{nt("returnEat")}</Button>
      <Badge variant={dirty ? "warning" : "outline"}>{dirty ? nt("pending") : nt("noChanges")}</Badge>
    </div>

    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-[auto_1fr_auto] gap-2">
          <Button type="button" variant="outline" size="icon" className="min-h-12 min-w-12" aria-label={nt("previousDay")} onClick={() => navigateDate(addIsoDays(selectedDate, -1))}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Button>
          <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-muted-foreground rtl:left-auto rtl:right-3" /><Input type="date" value={selectedDate} aria-label={nt("date")} onChange={(event) => navigateDate(event.target.value)} className="centered-date-input relative h-12 px-12 text-center font-semibold [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:end-3 [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-datetime-edit-fields-wrapper]:flex [&::-webkit-datetime-edit-fields-wrapper]:w-full [&::-webkit-datetime-edit-fields-wrapper]:justify-center [&::-webkit-datetime-edit]:flex [&::-webkit-datetime-edit]:w-full [&::-webkit-datetime-edit]:justify-center" /></label>
          <Button type="button" variant="outline" size="icon" className="min-h-12 min-w-12" aria-label={nt("nextDay")} onClick={() => navigateDate(addIsoDays(selectedDate, 1))}><ArrowRight className="h-4 w-4 rtl:rotate-180" /></Button>
        </div>
      </CardContent>
    </Card>

    <Card className="border-primary/20">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Target className="h-5 w-5 text-primary" />{nt("targetFor", { date: new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selectedDate}T12:00:00`)) })}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div role="radiogroup" aria-label={nt("dateAssignment")} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {choices.map((choice) => <button key={choice} type="button" role="radio" aria-checked={draft.assignment === choice} onClick={() => selectAssignment(choice)} className={`min-h-12 shrink-0 rounded-full border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${draft.assignment === choice ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>{targetLabel(choice)}</button>)}
        </div>
        <div className="rounded-[14px] border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">{nt("dateAssignment")}</p>
          <p className="mt-1">{draft.assignment === "auto"
            ? nt("automaticResolves", { target: targetLabel(persisted.resolvedTargetType), date: new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selectedDate}T12:00:00`)) })
            : nt("dateAssignmentDescription")}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <SummaryMetric label={nt("calories")} value={draft.calories ? `${draft.calories} ${settings.energyUnit}` : "—"} />
          <SummaryMetric label={nt("protein")} value={draft.protein ? `${draft.protein} g` : "—"} />
          <SummaryMetric label={nt("carbs")} value={draft.carbs ? `${draft.carbs} g` : "—"} />
          <SummaryMetric label={nt("water")} value={draft.water ? `${draft.water} ${settings.liquidUnit}` : "—"} />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{nt("editing", { target: targetLabel(draft.editorTargetType) })}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[14px] border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">{nt("reusableProfile")}</p>
          <p className="mt-1">{draft.assignment === "auto"
            ? nt("automaticScope", { target: targetLabel(draft.editorTargetType) })
            : nt("explicitScope", { target: targetLabel(draft.editorTargetType), date: selectedDate })}</p>
          {source?.source === "fallback-profile" ? <p className="mt-2 text-warning">{nt("missingProfile")}</p> : null}
          {source?.source === "legacy-base" ? <p className="mt-2 text-warning">{nt("legacyFallback")}</p> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TargetField label={`${nt("calories")} (${settings.energyUnit})`} value={draft.calories} onChange={(calories) => setDraft({ ...draft, calories })} />
          <TargetField label={`${nt("protein")} (g)`} value={draft.protein} onChange={(protein) => setDraft({ ...draft, protein })} />
          <TargetField label={`${nt("carbs")} (g)`} value={draft.carbs} onChange={(carbs) => setDraft({ ...draft, carbs })} />
          <TargetField label={`${nt("fat")} (g)`} value={draft.fat} onChange={(fat) => setDraft({ ...draft, fat })} />
          <TargetField label={`${nt("water")} (${settings.liquidUnit})`} value={draft.water} onChange={(water) => setDraft({ ...draft, water })} />
        </div>
        <div className="space-y-2"><Label htmlFor="nutrition-target-notes">{nt("notes")}</Label><textarea id="nutrition-target-notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} className="w-full rounded-[14px] border border-input bg-card px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>

        <InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} onClose={() => setFeedback(null)} />
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-10 grid gap-2 rounded-[16px] border border-border/70 bg-card/95 p-3 shadow-soft backdrop-blur sm:static sm:grid-cols-[1fr_auto] sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <Button type="button" className="min-h-12" onClick={() => void apply()} disabled={!dirty || applying}><Save className="h-4 w-4" />{applying ? `${nt("apply")}…` : nt("apply")}</Button>
          <Button type="button" variant="outline" className="min-h-12" onClick={discard} disabled={!dirty || applying}><RotateCcw className="h-4 w-4" />{nt("discard")}</Button>
        </div>
      </CardContent>
    </Card>
  </div>;
}

function TargetField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type="number" min="0" step="0.1" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[14px] border border-border/70 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>;
}
