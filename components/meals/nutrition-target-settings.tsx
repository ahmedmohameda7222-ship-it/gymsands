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
import { useEatTranslation } from "@/lib/i18n/eat";
import { getOnboarding } from "@/services/database/profile";
import { getProgressEntries } from "@/services/database/progress";
import { getCalorieTargets, upsertCalorieTargets } from "@/services/database/nutrition";
import { getNutritionTargetProfiles, upsertNutritionTargetProfile } from "@/services/database/execution-layer";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { estimateTdee, type SavedTargets } from "@/services/nutrition/targets";
import { getActiveTargetOverride, resolveActiveNutritionTarget, setActiveTargetOverride, type ActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { NutritionTargetProfileType, OnboardingAnswers, UserNutritionTargetProfile } from "@/types";

type TargetForm = { calories: string; protein: string; carbs: string; fat: string; water: string; notes: string };
type EstimateForm = { age: string; heightCm: string; weightKg: string; sex: "male" | "female"; activityLevel: "sedentary" | "light" | "moderate" | "very_active"; goal: "fat_loss" | "maintenance" | "muscle_gain" | "recomposition" };

const emptyTarget: TargetForm = { calories: "", protein: "", carbs: "", fat: "", water: "", notes: "" };

function numberOrNull(value: string) { if (!value.trim()) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function formFromProfile(profile: UserNutritionTargetProfile | null | undefined): TargetForm { return profile ? { calories: profile.calories === null ? "" : String(profile.calories), protein: profile.protein_g === null ? "" : String(profile.protein_g), carbs: profile.carbs_g === null ? "" : String(profile.carbs_g), fat: profile.fat_g === null ? "" : String(profile.fat_g), water: profile.water_ml === null ? "" : String(profile.water_ml), notes: profile.notes ?? "" } : emptyTarget; }
function formFromBase(base: SavedTargets | null): TargetForm { return base ? { calories: String(base.daily_calories || ""), protein: String(base.protein_g || ""), carbs: String(base.carbs_g || ""), fat: String(base.fat_g || ""), water: String(base.water_ml || ""), notes: "" } : emptyTarget; }

export function NutritionTargetSettings({ selectedDate, returnHref }: { selectedDate: string; returnHref: string }) {
  const { user, profile } = useAuth();
  const { language, et, formatDate } = useEatTranslation();
  const labels = localizedLabels(language);
  const [base, setBase] = useState<SavedTargets | null>(null);
  const [profiles, setProfiles] = useState<UserNutritionTargetProfile[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingAnswers | null>(null);
  const [suggestedType, setSuggestedType] = useState<NutritionTargetProfileType>("default_day");
  const [override, setOverride] = useState<NutritionTargetProfileType | "auto">("auto");
  const [editing, setEditing] = useState<NutritionTargetProfileType | "fallback" | null>(null);
  const [form, setForm] = useState<TargetForm>(emptyTarget);
  const [estimateForm, setEstimateForm] = useState<EstimateForm>({ age: "", heightCm: "", weightKg: "", sex: "male", activityLevel: "moderate", goal: "maintenance" });
  const [estimatePreview, setEstimatePreview] = useState<ReturnType<typeof estimateTdee> | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);

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
      const weekday = new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
      const detected = planResult.status === "fulfilled" && planResult.value?.days.some((day) => day.weekday === weekday && day.exercises.length > 0) ? "training_day" : "rest_day";
      setBase(savedBase); setProfiles(savedProfiles); setOnboarding(savedOnboarding); setSuggestedType(detected); setOverride(getActiveTargetOverride(user.id, selectedDate));
      const weight = latestWeight ?? profile?.weight_kg ?? savedOnboarding?.weight_kg ?? null;
      const height = profile?.height_cm ?? savedOnboarding?.height_cm ?? null;
      const age = profile?.age ?? savedOnboarding?.age ?? null;
      const gender = String(profile?.gender ?? savedOnboarding?.gender ?? "male").toLowerCase() === "female" ? "female" : "male";
      setEstimateForm((current) => ({ ...current, age: age ? String(age) : "", heightCm: height ? String(height) : "", weightKg: weight ? String(weight) : "", sex: gender }));
      const failures = [baseResult, profilesResult, onboardingResult, progressResult, planResult].filter((result) => result.status === "rejected");
      if (failures.length) setFeedback({ type: "error", message: labels.partialLoad });
      setLoading(false);
    });
    return () => { active = false; };
  }, [labels.partialLoad, profile?.age, profile?.gender, profile?.height_cm, profile?.weight_kg, selectedDate, user?.id]);

  const activeType = override === "auto" ? suggestedType : override;
  const activeTarget: ActiveNutritionTarget = useMemo(() => resolveActiveNutritionTarget({ profiles, baseTarget: base, requestedType: activeType }), [activeType, base, profiles]);
  const types: Array<{ type: NutritionTargetProfileType; label: string }> = [
    { type: "default_day", label: et("fallbackTarget") }, { type: "training_day", label: et("trainingTarget") }, { type: "rest_day", label: et("restTarget") }, { type: "high_activity_day", label: et("highActivityTarget") }
  ];

  function edit(target: NutritionTargetProfileType | "fallback") {
    setEditing(target);
    setForm(target === "fallback" ? formFromBase(base) : formFromProfile(profiles.find((profileItem) => profileItem.target_type === target)));
    setFeedback(null);
  }

  function validateForm() {
    const calories = numberOrNull(form.calories); const protein = numberOrNull(form.protein); const carbs = numberOrNull(form.carbs); const fat = numberOrNull(form.fat); const water = numberOrNull(form.water);
    if (calories !== null && (calories < 500 || calories > 15000)) throw new Error(labels.invalidCalories);
    for (const [value, name] of [[protein, et("protein")], [carbs, et("carbs")], [fat, et("fat")]] as const) if (value !== null && (value < 0 || value > 2000)) throw new Error(`${name}: ${labels.invalidValue}`);
    if (water !== null && (water < 250 || water > 20000)) throw new Error(labels.invalidWater);
    return { calories, protein, carbs, fat, water };
  }

  async function save() {
    if (!user?.id || !editing || pending) return;
    setPending(true); setFeedback({ type: "info", message: `${et("saveChanges")}…` });
    try {
      const values = validateForm();
      if (editing === "fallback") {
        const saved = await upsertCalorieTargets({ userId: user.id, dailyCalories: values.calories ?? 0, proteinG: values.protein ?? 0, carbsG: values.carbs ?? 0, fatG: values.fat ?? 0, waterMl: values.water ?? 0 });
        setBase({ daily_calories: Number(saved.daily_calories), protein_g: Number(saved.protein_g), carbs_g: Number(saved.carbs_g), fat_g: Number(saved.fat_g), water_ml: Number(saved.water_ml ?? 0) });
      } else {
        const saved = await upsertNutritionTargetProfile(user.id, { target_type: editing, calories: values.calories, protein_g: values.protein, carbs_g: values.carbs, fat_g: values.fat, water_ml: values.water, notes: form.notes.trim() || null });
        setProfiles((current) => [...current.filter((item) => item.target_type !== saved.target_type), saved]);
      }
      setFeedback({ type: "info", message: et("successSaved") }); setEditing(null);
    } catch (error) { setFeedback({ type: "error", message: error instanceof Error ? error.message : et("saveFailed") }); }
    finally { setPending(false); }
  }

  function calculateEstimate() {
    const age = Number(estimateForm.age); const heightCm = Number(estimateForm.heightCm); const weightKg = Number(estimateForm.weightKg);
    if (!age || !heightCm || !weightKg) { setFeedback({ type: "error", message: labels.completeEstimator }); return; }
    setEstimatePreview(estimateTdee({ ...estimateForm, age, heightCm, weightKg }));
  }

  async function saveEstimate(targetType: NutritionTargetProfileType | "fallback") {
    if (!estimatePreview) return;
    setEditing(targetType);
    setForm({ calories: String(estimatePreview.daily_calories), protein: String(estimatePreview.protein_g), carbs: String(estimatePreview.carbs_g), fat: String(estimatePreview.fat_g), water: String(estimatePreview.water_ml), notes: labels.estimatedNote });
    setFeedback({ type: "info", message: labels.reviewEstimate });
  }

  function setToday(type: NutritionTargetProfileType | "auto") { setOverride(type); if (user?.id) setActiveTargetOverride(user.id, selectedDate, type); }

  if (loading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>;
  return <div className="space-y-4">
    <Button asChild variant="ghost" className="min-h-11"><Link href={returnHref}><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{et("returnEat")}</Link></Button>
    <Card className="border-primary/20"><CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" />{labels.activeOn} {formatDate(selectedDate)}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xl font-bold">{activeTarget.label} · {activeTarget.values.daily_calories || "—"} kcal</p><p className="text-sm text-muted-foreground">P {activeTarget.values.protein_g || "—"} g · C {activeTarget.values.carbs_g || "—"} g · F {activeTarget.values.fat_g || "—"} g · Water {activeTarget.values.water_ml || "—"} ml</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><Button variant={override === "auto" ? "default" : "outline"} onClick={() => setToday("auto")}>{labels.automatic}</Button>{types.map((item) => <Button key={item.type} variant={activeType === item.type && override !== "auto" ? "default" : "outline"} onClick={() => setToday(item.type)}>{item.label}</Button>)}</div></CardContent></Card>

    <div className="grid gap-3 md:grid-cols-2">{types.map((item) => { const saved = profiles.find((profileItem) => profileItem.target_type === item.type); return <Card key={item.type}><CardContent className="flex min-h-28 items-center justify-between gap-3 p-4"><div><p className="font-semibold">{item.label}</p><p className="mt-1 text-sm text-muted-foreground">{saved?.calories ? `${saved.calories} kcal · P ${saved.protein_g ?? "—"} g` : labels.notSaved}</p></div><Button variant="outline" onClick={() => edit(item.type)}>{labels.edit}</Button></CardContent></Card>; })}<Card><CardContent className="flex min-h-28 items-center justify-between gap-3 p-4"><div><p className="font-semibold">{et("fallbackEditor")}</p><p className="mt-1 text-sm text-muted-foreground">{base ? `${base.daily_calories} kcal · P ${base.protein_g} g` : labels.notSaved}</p></div><Button variant="outline" onClick={() => edit("fallback")}>{labels.edit}</Button></CardContent></Card></div>

    {editing ? <Card><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-base">{labels.edit} {editing === "fallback" ? et("fallbackEditor") : types.find((item) => item.type === editing)?.label}</CardTitle><Button variant="ghost" onClick={() => setEditing(null)}>{et("close")}</Button></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><TargetInput label={et("calories")} value={form.calories} onChange={(calories) => setForm({ ...form, calories })} /><TargetInput label={`${et("protein")} g`} value={form.protein} onChange={(protein) => setForm({ ...form, protein })} /><TargetInput label={`${et("carbs")} g`} value={form.carbs} onChange={(carbs) => setForm({ ...form, carbs })} /><TargetInput label={`${et("fat")} g`} value={form.fat} onChange={(fat) => setForm({ ...form, fat })} /><TargetInput label="Water ml" value={form.water} onChange={(water) => setForm({ ...form, water })} /></div>{editing !== "fallback" ? <TargetInput label={et("notes")} value={form.notes} onChange={(notes) => setForm({ ...form, notes })} text /> : null}<Button className="min-h-12" onClick={() => void save()} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{et("saveChanges")}</Button></CardContent></Card> : null}

    <Card><CardHeader><CardTitle>{et("estimateTargets")}</CardTitle><p className="text-sm text-muted-foreground">{labels.prefill}</p></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><EstimateInput label={labels.age} value={estimateForm.age} onChange={(age) => setEstimateForm({ ...estimateForm, age })} /><EstimateInput label={labels.height} value={estimateForm.heightCm} onChange={(heightCm) => setEstimateForm({ ...estimateForm, heightCm })} /><EstimateInput label={labels.weight} value={estimateForm.weightKg} onChange={(weightKg) => setEstimateForm({ ...estimateForm, weightKg })} /><SelectInput label={labels.sex} value={estimateForm.sex} options={["male", "female"]} onChange={(sex) => setEstimateForm({ ...estimateForm, sex: sex as EstimateForm["sex"] })} /><SelectInput label={labels.activity} value={estimateForm.activityLevel} options={["sedentary", "light", "moderate", "very_active"]} onChange={(activityLevel) => setEstimateForm({ ...estimateForm, activityLevel: activityLevel as EstimateForm["activityLevel"] })} /><SelectInput label={labels.goal} value={estimateForm.goal} options={["fat_loss", "maintenance", "muscle_gain", "recomposition"]} onChange={(goal) => setEstimateForm({ ...estimateForm, goal: goal as EstimateForm["goal"] })} /></div><Button variant="outline" className="min-h-12" onClick={calculateEstimate}>{et("previewEstimate")}</Button>{estimatePreview ? <div className="rounded-[16px] border border-primary/20 bg-primary/5 p-4"><p className="font-semibold">{et("previewEstimate")}: {estimatePreview.daily_calories} kcal · P {estimatePreview.protein_g} g · C {estimatePreview.carbs_g} g · F {estimatePreview.fat_g} g · Water {estimatePreview.water_ml} ml</p><p className="mt-1 text-sm text-muted-foreground">{labels.estimateDisclaimer}</p><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void saveEstimate(activeType)}>{labels.useToday}</Button><Button variant="outline" onClick={() => void saveEstimate("training_day")}>{labels.saveTraining}</Button><Button variant="outline" onClick={() => void saveEstimate("fallback")}><Copy className="h-4 w-4" />{labels.copyFallback}</Button></div></div> : null}</CardContent></Card>
    <InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} onClose={() => setFeedback(null)} />
  </div>;
}

function TargetInput({ label, value, onChange, text = false }: { label: string; value: string; onChange: (value: string) => void; text?: boolean }) { return <div className="space-y-2"><Label>{label}</Label><Input type={text ? "text" : "number"} min={text ? undefined : "0"} value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
function EstimateInput(props: { label: string; value: string; onChange: (value: string) => void }) { return <TargetInput {...props} />; }
function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <div className="space-y-2"><Label>{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-[14px] border border-input bg-card px-3 text-sm">{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></div>; }

function localizedLabels(language: "en" | "de" | "ar") {
  const values = {
    en: { partialLoad: "Some target sources could not load. Available saved data remains editable.", activeOn: "Active target for", automatic: "Automatic", edit: "Edit", notSaved: "Not saved", invalidCalories: "Calories must be between 500 and 15000.", invalidValue: "Enter a realistic non-negative value.", invalidWater: "Water must be between 250 and 20000 ml.", completeEstimator: "Enter age, height, and weight before estimating.", estimatedNote: "Estimated from the reviewed profile inputs.", reviewEstimate: "Review the estimated values before saving.", prefill: "Inputs are prefilled from the canonical profile, onboarding, and latest saved weight when available.", age: "Age", height: "Height cm", weight: "Weight kg", sex: "Sex", activity: "Activity", goal: "Goal", estimateDisclaimer: "Estimated values are not saved until you choose an explicit action.", useToday: "Use for today only", saveTraining: "Save training-day target", copyFallback: "Copy to fallback target" },
    de: { partialLoad: "Einige Zielquellen konnten nicht geladen werden. Verfügbare gespeicherte Daten bleiben bearbeitbar.", activeOn: "Aktives Ziel für", automatic: "Automatisch", edit: "Bearbeiten", notSaved: "Nicht gespeichert", invalidCalories: "Kalorien müssen zwischen 500 und 15000 liegen.", invalidValue: "Gib einen realistischen nichtnegativen Wert ein.", invalidWater: "Wasser muss zwischen 250 und 20000 ml liegen.", completeEstimator: "Alter, Größe und Gewicht vor der Schätzung eingeben.", estimatedNote: "Aus den geprüften Profilwerten geschätzt.", reviewEstimate: "Prüfe die geschätzten Werte vor dem Speichern.", prefill: "Eingaben werden aus Profil, Onboarding und dem neuesten gespeicherten Gewicht vorausgefüllt.", age: "Alter", height: "Größe cm", weight: "Gewicht kg", sex: "Geschlecht", activity: "Aktivität", goal: "Ziel", estimateDisclaimer: "Geschätzte Werte werden erst nach einer ausdrücklichen Aktion gespeichert.", useToday: "Nur für heute verwenden", saveTraining: "Trainingstag-Ziel speichern", copyFallback: "Zum Fallback-Ziel kopieren" },
    ar: { partialLoad: "تعذر تحميل بعض مصادر الأهداف. تظل البيانات المحفوظة المتاحة قابلة للتعديل.", activeOn: "الهدف النشط ليوم", automatic: "تلقائي", edit: "تعديل", notSaved: "غير محفوظ", invalidCalories: "يجب أن تكون السعرات بين 500 و15000.", invalidValue: "أدخل قيمة واقعية غير سالبة.", invalidWater: "يجب أن تكون المياه بين 250 و20000 مل.", completeEstimator: "أدخل العمر والطول والوزن قبل التقدير.", estimatedNote: "تم التقدير من بيانات الملف التي تمت مراجعتها.", reviewEstimate: "راجع القيم المقدرة قبل الحفظ.", prefill: "يتم ملء المدخلات من الملف الشخصي والإعداد الأولي وأحدث وزن محفوظ عند توفره.", age: "العمر", height: "الطول سم", weight: "الوزن كجم", sex: "الجنس", activity: "النشاط", goal: "الهدف", estimateDisclaimer: "لا يتم حفظ القيم المقدرة حتى تختار إجراءً صريحًا.", useToday: "استخدام لليوم فقط", saveTraining: "حفظ هدف يوم التمرين", copyFallback: "نسخ إلى الهدف الاحتياطي" }
  } as const;
  return values[language];
}
