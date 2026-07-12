"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/ui/tag-input";
import { useToast } from "@/components/ui/toaster";
import { useTranslation } from "@/lib/i18n/use-translation";
import { userSafeError } from "@/lib/error-formatting";
import { getNutritionPreferenceProfile, upsertNutritionPreferenceProfile, type NutritionPreferenceInput } from "@/services/database/execution-layer";

const emptyForm: NutritionPreferenceInput = {
  weekly_food_budget: null, budget_currency: "EUR", max_cooking_time_minutes: null,
  meal_prep_days: [], cooking_skill: null, kitchen_equipment: [], preferred_cuisines: [],
  disliked_foods: [], allergies: null, repeat_tolerance: null, meals_per_day: null,
  ingredient_reuse_preference: null, grocery_style_preference: null
};

const copy = {
  en: { intro: "Save practical taste, dietary, budget, preparation, and shopping context for authorized meal planning.", taste: "Taste and dietary preferences", tasteDesc: "Help ChatGPT avoid poor fits and propose meals you will use.", budget: "Budget and preparation", budgetDesc: "Keep meal and grocery suggestions realistic for your time, kitchen, and routine.", cuisines: "Preferred cuisines", dislikes: "Disliked foods", allergies: "Allergies", repetition: "Repetition preference", weeklyBudget: "Weekly budget", currency: "Currency", maxTime: "Maximum cooking time", mealsDay: "Meals per day", prepDays: "Meal-prep days", equipment: "Kitchen equipment", confidence: "Cooking confidence", shopping: "Shopping routine", save: "Save changes", saving: "Saving…", unsaved: "You have unsaved changes.", current: "Food preferences are up to date.", saved: "Food preferences saved.", loading: "Loading food preferences…", loadError: "Food preferences could not be loaded.", saveError: "Food preferences could not be saved." },
  de: { intro: "Speichere Geschmack, Ernährung, Budget, Zubereitung und Einkauf für autorisierte Essensplanung.", taste: "Geschmack und Ernährung", tasteDesc: "Hilf ChatGPT, unpassende Vorschläge zu vermeiden und nutzbare Mahlzeiten zu planen.", budget: "Budget und Zubereitung", budgetDesc: "Halte Mahlzeiten und Einkäufe realistisch für Zeit, Küche und Routine.", cuisines: "Bevorzugte Küchen", dislikes: "Unerwünschte Lebensmittel", allergies: "Allergien", repetition: "Wiederholungspräferenz", weeklyBudget: "Wochenbudget", currency: "Währung", maxTime: "Maximale Kochzeit", mealsDay: "Mahlzeiten pro Tag", prepDays: "Meal-Prep-Tage", equipment: "Küchenausstattung", confidence: "Kocherfahrung", shopping: "Einkaufsroutine", save: "Änderungen speichern", saving: "Speichern…", unsaved: "Du hast ungespeicherte Änderungen.", current: "Essenspräferenzen sind aktuell.", saved: "Essenspräferenzen gespeichert.", loading: "Essenspräferenzen werden geladen…", loadError: "Essenspräferenzen konnten nicht geladen werden.", saveError: "Essenspräferenzen konnten nicht gespeichert werden." },
  ar: { intro: "احفظ تفضيلات المذاق والنظام الغذائي والميزانية والتحضير والتسوّق لاستخدامها في تخطيط الوجبات المصرح به.", taste: "تفضيلات المذاق والنظام الغذائي", tasteDesc: "ساعد ChatGPT على تجنّب الاقتراحات غير المناسبة وإنشاء وجبات عملية.", budget: "الميزانية والتحضير", budgetDesc: "اجعل اقتراحات الوجبات والمشتريات مناسبة لوقتك ومطبخك وروتينك.", cuisines: "المطابخ المفضلة", dislikes: "الأطعمة غير المرغوبة", allergies: "الحساسيات", repetition: "تفضيل التكرار", weeklyBudget: "الميزانية الأسبوعية", currency: "العملة", maxTime: "أقصى وقت للطهي", mealsDay: "عدد الوجبات يوميًا", prepDays: "أيام تحضير الوجبات", equipment: "أدوات المطبخ", confidence: "مستوى الثقة في الطهي", shopping: "روتين التسوّق", save: "حفظ التغييرات", saving: "جارٍ الحفظ…", unsaved: "لديك تغييرات غير محفوظة.", current: "تفضيلات الطعام محدّثة.", saved: "تم حفظ تفضيلات الطعام.", loading: "جارٍ تحميل تفضيلات الطعام…", loadError: "تعذّر تحميل تفضيلات الطعام.", saveError: "تعذّر حفظ تفضيلات الطعام." }
} as const;

function optionalNumber(value: string) { if (!value.trim()) return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }

export function FoodPreferencesForm() {
  const { user } = useAuth();
  const { language, dir } = useTranslation();
  const c = copy[language];
  const { toast } = useToast();
  const [form, setForm] = useState<NutritionPreferenceInput>(emptyForm);
  const [saved, setSaved] = useState<NutritionPreferenceInput>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let active = true;
    void getNutritionPreferenceProfile(user.id).then((value) => { if (!active || !value) return; setForm(value); setSaved(value); }).catch((error) => toast({ title: c.loadError, description: userSafeError(error) })).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [c.loadError, toast, user?.id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    if (!user?.id || !dirty) return;
    setSaving(true);
    try { const value = await upsertNutritionPreferenceProfile(user.id, form); setForm(value); setSaved(value); toast({ title: c.saved }); }
    catch (error) { toast({ title: c.saveError, description: userSafeError(error), variant: "error" }); }
    finally { setSaving(false); }
  }

  return <div className="space-y-5" dir={dir}>
    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{c.intro}</p>
    {loading ? <p className="text-sm text-muted-foreground" role="status">{c.loading}</p> : <>
      <PreferenceSection title={c.taste} description={c.tasteDesc}>
        <TagInput id="preferred-cuisines" label={c.cuisines} value={form.preferred_cuisines} onChange={(preferred_cuisines) => setForm((current) => ({ ...current, preferred_cuisines }))} />
        <TagInput id="disliked-foods" label={c.dislikes} value={form.disliked_foods} onChange={(disliked_foods) => setForm((current) => ({ ...current, disliked_foods }))} />
        <Field id="allergies" label={c.allergies} value={form.allergies ?? ""} onChange={(value) => setForm((current) => ({ ...current, allergies: value || null }))} />
        <Field id="repeat-tolerance" label={c.repetition} value={form.repeat_tolerance ?? ""} onChange={(value) => setForm((current) => ({ ...current, repeat_tolerance: value || null }))} />
      </PreferenceSection>
      <PreferenceSection title={c.budget} description={c.budgetDesc}>
        <Field id="weekly-budget" type="number" label={c.weeklyBudget} value={form.weekly_food_budget === null ? "" : String(form.weekly_food_budget)} onChange={(value) => setForm((current) => ({ ...current, weekly_food_budget: optionalNumber(value) }))} />
        <Field id="currency" label={c.currency} value={form.budget_currency ?? ""} onChange={(value) => setForm((current) => ({ ...current, budget_currency: value || null }))} />
        <Field id="max-time" type="number" label={c.maxTime} value={form.max_cooking_time_minutes === null ? "" : String(form.max_cooking_time_minutes)} onChange={(value) => setForm((current) => ({ ...current, max_cooking_time_minutes: optionalNumber(value) }))} />
        <Field id="meals-day" type="number" label={c.mealsDay} value={form.meals_per_day === null ? "" : String(form.meals_per_day)} onChange={(value) => setForm((current) => ({ ...current, meals_per_day: optionalNumber(value) }))} />
        <TagInput id="meal-prep-days" label={c.prepDays} value={form.meal_prep_days} onChange={(meal_prep_days) => setForm((current) => ({ ...current, meal_prep_days }))} />
        <TagInput id="kitchen-equipment" label={c.equipment} value={form.kitchen_equipment} onChange={(kitchen_equipment) => setForm((current) => ({ ...current, kitchen_equipment }))} />
        <Field id="cooking-skill" label={c.confidence} value={form.cooking_skill ?? ""} onChange={(value) => setForm((current) => ({ ...current, cooking_skill: value || null }))} />
        <Field id="shopping-routine" label={c.shopping} value={form.grocery_style_preference ?? ""} onChange={(value) => setForm((current) => ({ ...current, grocery_style_preference: value || null }))} />
      </PreferenceSection>
      <div className="sticky bottom-20 z-10 flex flex-col gap-3 rounded-[16px] border bg-card/95 p-3 shadow-lg backdrop-blur sm:bottom-3 sm:flex-row sm:items-center sm:justify-between"><p className={dirty ? "text-sm font-medium text-warning" : "text-sm text-muted-foreground"}>{dirty ? c.unsaved : c.current}</p><Button className="min-h-12" onClick={save} disabled={!dirty || saving}><Save className="h-4 w-4" />{saving ? c.saving : c.save}</Button></div>
    </>}
  </div>;
}

function PreferenceSection({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <section className="border-t pt-5 first:border-t-0 first:pt-0"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div></section>; }
function Field({ id, label, value, onChange, type = "text" }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
