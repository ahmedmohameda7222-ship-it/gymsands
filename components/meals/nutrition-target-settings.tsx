"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Loader2, Save, Target } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineFeedback } from "@/components/motion";
import {
  eatEnergyDisplayValue,
  eatEnergyInputToKcal,
  eatHeightDisplayValue,
  eatHeightInputToCm,
  eatLiquidDisplayValue,
  eatLiquidInputToMl,
  eatWeightDisplayValue,
  eatWeightInputToKg,
  formatEatEnergy,
  formatEatLiquid
} from "@/lib/eat/eat-units";
import { useEatTranslation } from "@/lib/i18n/eat";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { getOnboarding } from "@/services/database/profile";
import { getProgressEntries } from "@/services/database/progress";
import { getCalorieTargets, upsertCalorieTargets } from "@/services/database/nutrition";
import { getNutritionTargetProfiles, upsertNutritionTargetProfile } from "@/services/database/execution-layer";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { estimateTdee, type SavedTargets } from "@/services/nutrition/targets";
import { detectNutritionTargetTypeForDate, getActiveTargetOverride, resolveActiveNutritionTarget, setActiveTargetOverride, type ActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { NutritionTargetProfileType, OnboardingAnswers, UserNutritionTargetProfile } from "@/types";

type TargetForm = { energy: string; protein: string; carbs: string; fat: string; liquid: string; notes: string };
type EstimateForm = {
  age: string;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  weight: string;
  sex: "male" | "female";
  activityLevel: "sedentary" | "light" | "moderate" | "very_active";
  goal: "fat_loss" | "maintenance" | "muscle_gain" | "recomposition";
};

const emptyTarget: TargetForm = { energy: "", protein: "", carbs: "", fat: "", liquid: "", notes: "" };
const emptyEstimate: EstimateForm = { age: "", heightCm: "", heightFeet: "", heightInches: "", weight: "", sex: "male", activityLevel: "moderate", goal: "maintenance" };

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function targetLabel(target: ActiveNutritionTarget, et: ReturnType<typeof useEatTranslation>["et"]) {
  if (!target.hasTarget) return et("targetUnavailable");
  if (target.sourceType === "training_day") return et("trainingTarget");
  if (target.sourceType === "rest_day") return et("restTarget");
  if (target.sourceType === "high_activity_day") return et("highActivityTarget");
  return et("fallbackTarget");
}

export function NutritionTargetSettings({ selectedDate, returnHref }: { selectedDate: string; returnHref: string }) {
  const { user, profile } = useAuth();
  const { settings } = useUserSettings();
  const { et, formatDate, locale } = useEatTranslation();
  const [base, setBase] = useState<SavedTargets | null>(null);
  const [profiles, setProfiles] = useState<UserNutritionTargetProfile[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingAnswers | null>(null);
  const [suggestedType, setSuggestedType] = useState<NutritionTargetProfileType>("default_day");
  const [override, setOverride] = useState<NutritionTargetProfileType | "auto">("auto");
  const [editing, setEditing] = useState<NutritionTargetProfileType | "fallback" | null>(null);
  const [form, setForm] = useState<TargetForm>(emptyTarget);
  const [estimateForm, setEstimateForm] = useState<EstimateForm>(emptyEstimate);
  const [estimatePreview, setEstimatePreview] = useState<ReturnType<typeof estimateTdee> | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);

  function formFromProfile(saved: UserNutritionTargetProfile | null | undefined): TargetForm {
    return saved ? {
      energy: saved.calories === null ? "" : String(eatEnergyDisplayValue(saved.calories, settings.energyUnit)),
      protein: saved.protein_g === null ? "" : String(saved.protein_g),
      carbs: saved.carbs_g === null ? "" : String(saved.carbs_g),
      fat: saved.fat_g === null ? "" : String(saved.fat_g),
      liquid: saved.water_ml === null ? "" : String(eatLiquidDisplayValue(saved.water_ml, settings.liquidUnit)),
      notes: saved.notes ?? ""
    } : emptyTarget;
  }

  function formFromBase(saved: SavedTargets | null): TargetForm {
    return saved ? {
      energy: saved.daily_calories ? String(eatEnergyDisplayValue(saved.daily_calories, settings.energyUnit)) : "",
      protein: saved.protein_g ? String(saved.protein_g) : "",
      carbs: saved.carbs_g ? String(saved.carbs_g) : "",
      fat: saved.fat_g ? String(saved.fat_g) : "",
      liquid: saved.water_ml ? String(eatLiquidDisplayValue(saved.water_ml, settings.liquidUnit)) : "",
      notes: ""
    } : emptyTarget;
  }

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setLoading(true);
    Promise.allSettled([
      getCalorieTargets(user.id, { throwOnError: true }),
      user.id === "mock-user" ? Promise.resolve([]) : getNutritionTargetProfiles(user.id),
      getOnboarding(user.id),
      getProgressEntries(user.id, { throwOnError: true }),
      getDefaultUserWorkoutPlan(user.id)
    ]).then(([baseResult, profilesResult, onboardingResult, progressResult, planResult]) => {
      if (!active) return;
      const savedBase = baseResult.status === "fulfilled" ? baseResult.value : null;
      const savedProfiles = profilesResult.status === "fulfilled" ? profilesResult.value : [];
      const savedOnboarding = onboardingResult.status === "fulfilled" ? onboardingResult.value : null;
      const latestWeight = progressResult.status === "fulfilled" ? [...progressResult.value].reverse().find((entry) => entry.body_weight_kg)?.body_weight_kg ?? null : null;
      const detected = planResult.status === "fulfilled" ? detectNutritionTargetTypeForDate(planResult.value, selectedDate) : "rest_day";
      setBase(savedBase);
      setProfiles(savedProfiles);
      setOnboarding(savedOnboarding);
      setSuggestedType(detected);
      setOverride(getActiveTargetOverride(user.id, selectedDate));
      const weightKg = latestWeight ?? profile?.weight_kg ?? savedOnboarding?.weight_kg ?? null;
      const heightCm = profile?.height_cm ?? savedOnboarding?.height_cm ?? null;
      const age = profile?.age ?? savedOnboarding?.age ?? null;
      const gender = String(profile?.gender ?? savedOnboarding?.gender ?? "male").toLowerCase() === "female" ? "female" : "male";
      const height = eatHeightDisplayValue(heightCm ?? 0);
      setEstimateForm((current) => ({
        ...current,
        age: age ? String(age) : "",
        heightCm: heightCm ? String(height.cm) : "",
        heightFeet: heightCm ? String(height.feet) : "",
        heightInches: heightCm ? String(height.inches) : "",
        weight: weightKg ? String(eatWeightDisplayValue(weightKg, settings.weightUnit)) : "",
        sex: gender
      }));
      const failures = [baseResult, profilesResult, onboardingResult, progressResult, planResult].filter((result) => result.status === "rejected");
      if (failures.length) setFeedback({ type: "error", message: et("partialTargetLoad") });
      setLoading(false);
    });
    return () => { active = false; };
  }, [et, profile?.age, profile?.gender, profile?.height_cm, profile?.weight_kg, selectedDate, settings.heightUnit, settings.weightUnit, user?.id]);

  useEffect(() => {
    if (!editing) return;
    setForm(editing === "fallback" ? formFromBase(base) : formFromProfile(profiles.find((item) => item.target_type === editing)));
    // The canonical records are the source of truth when display units change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.energyUnit, settings.liquidUnit]);

  const activeType = override === "auto" ? suggestedType : override;
  const activeTarget = useMemo(() => resolveActiveNutritionTarget({ profiles, baseTarget: base, requestedType: activeType }), [activeType, base, profiles]);
  const types: Array<{ type: NutritionTargetProfileType; label: string }> = [
    { type: "default_day", label: et("fallbackTarget") },
    { type: "training_day", label: et("trainingTarget") },
    { type: "rest_day", label: et("restTarget") },
    { type: "high_activity_day", label: et("highActivityTarget") }
  ];

  function edit(target: NutritionTargetProfileType | "fallback") {
    setEditing(target);
    setForm(target === "fallback" ? formFromBase(base) : formFromProfile(profiles.find((item) => item.target_type === target)));
    setFeedback(null);
  }

  function validateForm() {
    const energyDisplay = numberOrNull(form.energy);
    const protein = numberOrNull(form.protein);
    const carbs = numberOrNull(form.carbs);
    const fat = numberOrNull(form.fat);
    const liquidDisplay = numberOrNull(form.liquid);
    const minEnergy = eatEnergyDisplayValue(500, settings.energyUnit);
    const maxEnergy = eatEnergyDisplayValue(15000, settings.energyUnit);
    const minLiquid = eatLiquidDisplayValue(250, settings.liquidUnit);
    const maxLiquid = eatLiquidDisplayValue(20000, settings.liquidUnit);
    if (energyDisplay !== null && (energyDisplay < minEnergy || energyDisplay > maxEnergy)) throw new Error(et("invalidEnergy", { min: minEnergy, max: maxEnergy, unit: settings.energyUnit }));
    for (const [value, name] of [[protein, et("protein")], [carbs, et("carbs")], [fat, et("fat")]] as const) if (value !== null && (value < 0 || value > 2000)) throw new Error(`${name}: ${et("invalidValue")}`);
    if (liquidDisplay !== null && (liquidDisplay < minLiquid || liquidDisplay > maxLiquid)) throw new Error(et("invalidLiquid", { min: minLiquid, max: maxLiquid, unit: settings.liquidUnit }));
    return {
      calories: energyDisplay === null ? null : eatEnergyInputToKcal(energyDisplay, settings.energyUnit),
      protein,
      carbs,
      fat,
      water: liquidDisplay === null ? null : eatLiquidInputToMl(liquidDisplay, settings.liquidUnit)
    };
  }

  async function save() {
    if (!user?.id || !editing || pending) return;
    setPending(true);
    setFeedback({ type: "info", message: `${et("saveChanges")}…` });
    try {
      const values = validateForm();
      if (editing === "fallback") {
        const saved = await upsertCalorieTargets({ userId: user.id, dailyCalories: values.calories ?? 0, proteinG: values.protein ?? 0, carbsG: values.carbs ?? 0, fatG: values.fat ?? 0, waterMl: values.water ?? 0 });
        setBase({ daily_calories: Number(saved.daily_calories), protein_g: Number(saved.protein_g), carbs_g: Number(saved.carbs_g), fat_g: Number(saved.fat_g), water_ml: Number(saved.water_ml ?? 0) });
      } else {
        const saved = await upsertNutritionTargetProfile(user.id, { target_type: editing, calories: values.calories, protein_g: values.protein, carbs_g: values.carbs, fat_g: values.fat, water_ml: values.water, notes: form.notes.trim() || null });
        setProfiles((current) => [...current.filter((item) => item.target_type !== saved.target_type), saved]);
      }
      setFeedback({ type: "info", message: et("successSaved") });
      setEditing(null);
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : et("saveFailed") });
    } finally {
      setPending(false);
    }
  }

  function calculateEstimate() {
    const age = Number(estimateForm.age);
    const heightCm = eatHeightInputToCm({ cm: estimateForm.heightCm, feet: estimateForm.heightFeet, inches: estimateForm.heightInches, unit: settings.heightUnit });
    const weightKg = eatWeightInputToKg(estimateForm.weight, settings.weightUnit);
    if (!age || !heightCm || !weightKg) { setFeedback({ type: "error", message: et("completeEstimator") }); return; }
    setEstimatePreview(estimateTdee({ age, heightCm, weightKg, sex: estimateForm.sex, activityLevel: estimateForm.activityLevel, goal: estimateForm.goal }));
  }

  function applyEstimate(targetType: NutritionTargetProfileType | "fallback") {
    if (!estimatePreview) return;
    setEditing(targetType);
    setForm({
      energy: String(eatEnergyDisplayValue(estimatePreview.daily_calories, settings.energyUnit)),
      protein: String(estimatePreview.protein_g),
      carbs: String(estimatePreview.carbs_g),
      fat: String(estimatePreview.fat_g),
      liquid: String(eatLiquidDisplayValue(estimatePreview.water_ml, settings.liquidUnit)),
      notes: et("estimatedNote")
    });
    setFeedback({ type: "info", message: et("reviewEstimate") });
  }

  function setToday(type: NutritionTargetProfileType | "auto") {
    setOverride(type);
    if (user?.id) setActiveTargetOverride(user.id, selectedDate, type);
  }

  const sexOptions = [{ value: "male", label: et("male") }, { value: "female", label: et("female") }];
  const activityOptions = [{ value: "sedentary", label: et("sedentary") }, { value: "light", label: et("light") }, { value: "moderate", label: et("moderate") }, { value: "very_active", label: et("veryActive") }];
  const goalOptions = [{ value: "fat_loss", label: et("fatLoss") }, { value: "maintenance", label: et("maintenance") }, { value: "muscle_gain", label: et("muscleGain") }, { value: "recomposition", label: et("recomposition") }];

  if (loading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">{et("loading")}</CardContent></Card>;
  return <div className="space-y-4">
    <Button asChild variant="ghost" className="min-h-11"><Link href={returnHref}><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{et("returnEat")}</Link></Button>
    <Card className="border-primary/20"><CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" />{et("activeTargetFor")} {formatDate(selectedDate)}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xl font-bold">{targetLabel(activeTarget, et)} · {activeTarget.values.daily_calories ? formatEatEnergy(activeTarget.values.daily_calories, settings.energyUnit, locale) : "—"}</p><p className="text-sm text-muted-foreground">{et("protein")}: {activeTarget.values.protein_g || "—"} g · {et("carbs")}: {activeTarget.values.carbs_g || "—"} g · {et("fat")}: {activeTarget.values.fat_g || "—"} g · {et("water")}: {activeTarget.values.water_ml ? formatEatLiquid(activeTarget.values.water_ml, settings.liquidUnit, locale) : "—"}</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><Button variant={override === "auto" ? "default" : "outline"} onClick={() => setToday("auto")}>{et("automatic")}</Button>{types.map((item) => <Button key={item.type} variant={activeType === item.type && override !== "auto" ? "default" : "outline"} onClick={() => setToday(item.type)}>{item.label}</Button>)}</div></CardContent></Card>

    <div className="grid gap-3 md:grid-cols-2">{types.map((item) => { const saved = profiles.find((profileItem) => profileItem.target_type === item.type); return <Card key={item.type}><CardContent className="flex min-h-28 items-center justify-between gap-3 p-4"><div><p className="font-semibold">{item.label}</p><p className="mt-1 text-sm text-muted-foreground">{saved?.calories ? `${formatEatEnergy(saved.calories, settings.energyUnit, locale)} · ${et("protein")}: ${saved.protein_g ?? "—"} g` : et("notSaved")}</p></div><Button variant="outline" onClick={() => edit(item.type)}>{et("edit")}</Button></CardContent></Card>; })}<Card><CardContent className="flex min-h-28 items-center justify-between gap-3 p-4"><div><p className="font-semibold">{et("fallbackEditor")}</p><p className="mt-1 text-sm text-muted-foreground">{base ? `${formatEatEnergy(base.daily_calories, settings.energyUnit, locale)} · ${et("protein")}: ${base.protein_g} g` : et("notSaved")}</p></div><Button variant="outline" onClick={() => edit("fallback")}>{et("edit")}</Button></CardContent></Card></div>

    {editing ? <Card><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-base">{et("edit")} {editing === "fallback" ? et("fallbackEditor") : types.find((item) => item.type === editing)?.label}</CardTitle><Button variant="ghost" onClick={() => setEditing(null)}>{et("close")}</Button></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><TargetInput label={`${et("calories")} (${settings.energyUnit})`} value={form.energy} onChange={(energy) => setForm({ ...form, energy })} /><TargetInput label={`${et("protein")} (g)`} value={form.protein} onChange={(protein) => setForm({ ...form, protein })} /><TargetInput label={`${et("carbs")} (g)`} value={form.carbs} onChange={(carbs) => setForm({ ...form, carbs })} /><TargetInput label={`${et("fat")} (g)`} value={form.fat} onChange={(fat) => setForm({ ...form, fat })} /><TargetInput label={`${et("water")} (${settings.liquidUnit})`} value={form.liquid} onChange={(liquid) => setForm({ ...form, liquid })} /></div>{editing !== "fallback" ? <TargetInput label={et("notes")} value={form.notes} onChange={(notes) => setForm({ ...form, notes })} text /> : null}<Button className="min-h-12" onClick={() => void save()} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{et("saveChanges")}</Button></CardContent></Card> : null}

    <Card><CardHeader><CardTitle>{et("estimateTargets")}</CardTitle><p className="text-sm text-muted-foreground">{et("targetPrefill")}</p></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><EstimateInput label={et("age")} value={estimateForm.age} onChange={(age) => setEstimateForm({ ...estimateForm, age })} />{settings.heightUnit === "cm" ? <EstimateInput label={et("heightCm")} value={estimateForm.heightCm} onChange={(heightCm) => setEstimateForm({ ...estimateForm, heightCm })} /> : <><EstimateInput label={et("heightFeet")} value={estimateForm.heightFeet} onChange={(heightFeet) => setEstimateForm({ ...estimateForm, heightFeet })} /><EstimateInput label={et("heightInches")} value={estimateForm.heightInches} onChange={(heightInches) => setEstimateForm({ ...estimateForm, heightInches })} /></>}<EstimateInput label={settings.weightUnit === "kg" ? et("weightKg") : et("weightLb")} value={estimateForm.weight} onChange={(weight) => setEstimateForm({ ...estimateForm, weight })} /><SelectInput label={et("sex")} value={estimateForm.sex} options={sexOptions} onChange={(sex) => setEstimateForm({ ...estimateForm, sex: sex as EstimateForm["sex"] })} /><SelectInput label={et("activity")} value={estimateForm.activityLevel} options={activityOptions} onChange={(activityLevel) => setEstimateForm({ ...estimateForm, activityLevel: activityLevel as EstimateForm["activityLevel"] })} /><SelectInput label={et("goal")} value={estimateForm.goal} options={goalOptions} onChange={(goal) => setEstimateForm({ ...estimateForm, goal: goal as EstimateForm["goal"] })} /></div><Button variant="outline" className="min-h-12" onClick={calculateEstimate}>{et("previewEstimate")}</Button>{estimatePreview ? <div className="rounded-[16px] border border-primary/20 bg-primary/5 p-4"><p className="font-semibold">{et("previewEstimate")}: {formatEatEnergy(estimatePreview.daily_calories, settings.energyUnit, locale)} · {et("protein")}: {estimatePreview.protein_g} g · {et("carbs")}: {estimatePreview.carbs_g} g · {et("fat")}: {estimatePreview.fat_g} g · {et("water")}: {formatEatLiquid(estimatePreview.water_ml, settings.liquidUnit, locale)}</p><p className="mt-1 text-sm text-muted-foreground">{et("estimateDisclaimer")}</p><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => applyEstimate(activeType)}>{et("useTodayOnly")}</Button><Button variant="outline" onClick={() => applyEstimate("training_day")}>{et("saveTrainingTarget")}</Button><Button variant="outline" onClick={() => applyEstimate("fallback")}><Copy className="h-4 w-4" />{et("copyFallback")}</Button></div></div> : null}</CardContent></Card>
    <InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} onClose={() => setFeedback(null)} />
  </div>;
}

function TargetInput({ label, value, onChange, text = false }: { label: string; value: string; onChange: (value: string) => void; text?: boolean }) { return <div className="space-y-2"><Label>{label}</Label><Input type={text ? "text" : "number"} min={text ? undefined : "0"} step={text ? undefined : "0.1"} value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
function EstimateInput(props: { label: string; value: string; onChange: (value: string) => void }) { return <TargetInput {...props} />; }
function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) { return <div className="space-y-2"><Label>{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-[14px] border border-input bg-card px-3 text-sm">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>; }
