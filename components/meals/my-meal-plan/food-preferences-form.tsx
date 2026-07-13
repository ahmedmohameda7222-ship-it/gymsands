"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Save } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/ui/tag-input";
import { useToast } from "@/components/ui/toaster";
import { useTranslation } from "@/lib/i18n/use-translation";
import { userSafeError } from "@/lib/error-formatting";
import {
  foodPreferencesCanEdit,
  foodPreferencesCanSave,
  foodPreferencesDraftToInput,
  foodPreferencesIsDirty,
  foodPreferencesReducer,
  initialFoodPreferencesState,
  validateFoodPreferencesDraft,
  type FoodPreferencesDraft,
  type FoodPreferencesValidationErrors
} from "@/lib/meals/food-preferences-state";
import { getNutritionPreferenceProfile, upsertNutritionPreferenceProfile } from "@/services/database/execution-layer";

const copy = {
  en: {
    intro: "Save practical taste, dietary, budget, preparation, and shopping context for authorized meal planning.",
    taste: "Taste and dietary preferences", tasteDesc: "Help ChatGPT avoid poor fits and propose meals you will use.",
    budget: "Budget and preparation", budgetDesc: "Keep meal and grocery suggestions realistic for your time, kitchen, and routine.",
    cuisines: "Preferred cuisines", dislikes: "Disliked foods", allergies: "Allergies", repetition: "Repetition preference",
    weeklyBudget: "Weekly budget", currency: "Currency", maxTime: "Maximum cooking time", mealsDay: "Meals per day",
    prepDays: "Meal-prep days", equipment: "Kitchen equipment", confidence: "Cooking confidence", shopping: "Shopping routine",
    save: "Save changes", saving: "Saving…", unsaved: "You have unsaved changes.", current: "Food preferences are up to date.",
    saved: "Food preferences saved.", loading: "Loading food preferences…", loadError: "Food preferences could not be loaded.",
    loadErrorHelp: "The saved profile was not replaced. Retry before editing or saving.", saveError: "Food preferences could not be saved.",
    retry: "Retry", add: "Add", remove: "Remove", signInError: "Sign in again to load food preferences.",
    budgetError: "Enter a non-negative number or leave the field empty.",
    timeError: "Enter a whole number from 1 to 1440 minutes or leave the field empty.",
    mealsError: "Enter a whole number from 1 to 12 or leave the field empty."
  },
  de: {
    intro: "Speichere Geschmack, Ernährung, Budget, Zubereitung und Einkauf für autorisierte Essensplanung.",
    taste: "Geschmack und Ernährung", tasteDesc: "Hilf ChatGPT, unpassende Vorschläge zu vermeiden und nutzbare Mahlzeiten zu planen.",
    budget: "Budget und Zubereitung", budgetDesc: "Halte Mahlzeiten und Einkäufe realistisch für Zeit, Küche und Routine.",
    cuisines: "Bevorzugte Küchen", dislikes: "Unerwünschte Lebensmittel", allergies: "Allergien", repetition: "Wiederholungspräferenz",
    weeklyBudget: "Wochenbudget", currency: "Währung", maxTime: "Maximale Kochzeit", mealsDay: "Mahlzeiten pro Tag",
    prepDays: "Meal-Prep-Tage", equipment: "Küchenausstattung", confidence: "Kocherfahrung", shopping: "Einkaufsroutine",
    save: "Änderungen speichern", saving: "Speichern…", unsaved: "Du hast ungespeicherte Änderungen.", current: "Essenspräferenzen sind aktuell.",
    saved: "Essenspräferenzen gespeichert.", loading: "Essenspräferenzen werden geladen…", loadError: "Essenspräferenzen konnten nicht geladen werden.",
    loadErrorHelp: "Das gespeicherte Profil wurde nicht ersetzt. Versuche das Laden erneut, bevor du etwas bearbeitest oder speicherst.", saveError: "Essenspräferenzen konnten nicht gespeichert werden.",
    retry: "Erneut versuchen", add: "Hinzufügen", remove: "Entfernen", signInError: "Melde dich erneut an, um Essenspräferenzen zu laden.",
    budgetError: "Gib eine nicht negative Zahl ein oder lasse das Feld leer.",
    timeError: "Gib eine ganze Zahl von 1 bis 1440 Minuten ein oder lasse das Feld leer.",
    mealsError: "Gib eine ganze Zahl von 1 bis 12 ein oder lasse das Feld leer."
  },
  ar: {
    intro: "احفظ تفضيلات المذاق والنظام الغذائي والميزانية والتحضير والتسوّق لاستخدامها في تخطيط الوجبات المصرح به.",
    taste: "تفضيلات المذاق والنظام الغذائي", tasteDesc: "ساعد ChatGPT على تجنّب الاقتراحات غير المناسبة وإنشاء وجبات عملية.",
    budget: "الميزانية والتحضير", budgetDesc: "اجعل اقتراحات الوجبات والمشتريات مناسبة لوقتك ومطبخك وروتينك.",
    cuisines: "المطابخ المفضلة", dislikes: "الأطعمة غير المرغوبة", allergies: "الحساسيات", repetition: "تفضيل التكرار",
    weeklyBudget: "الميزانية الأسبوعية", currency: "العملة", maxTime: "أقصى وقت للطهي", mealsDay: "عدد الوجبات يوميًا",
    prepDays: "أيام تحضير الوجبات", equipment: "أدوات المطبخ", confidence: "مستوى الثقة في الطهي", shopping: "روتين التسوّق",
    save: "حفظ التغييرات", saving: "جارٍ الحفظ…", unsaved: "لديك تغييرات غير محفوظة.", current: "تفضيلات الطعام محدّثة.",
    saved: "تم حفظ تفضيلات الطعام.", loading: "جارٍ تحميل تفضيلات الطعام…", loadError: "تعذّر تحميل تفضيلات الطعام.",
    loadErrorHelp: "لم يتم استبدال الملف المحفوظ. أعد المحاولة قبل التعديل أو الحفظ.", saveError: "تعذّر حفظ تفضيلات الطعام.",
    retry: "إعادة المحاولة", add: "إضافة", remove: "إزالة", signInError: "سجّل الدخول مرة أخرى لتحميل تفضيلات الطعام.",
    budgetError: "أدخل رقمًا غير سالب أو اترك الحقل فارغًا.",
    timeError: "أدخل عددًا صحيحًا من 1 إلى 1440 دقيقة أو اترك الحقل فارغًا.",
    mealsError: "أدخل عددًا صحيحًا من 1 إلى 12 أو اترك الحقل فارغًا."
  }
} as const;

type FoodPreferencesCopy = { [Key in keyof typeof copy.en]: string };

export function FoodPreferencesForm() {
  const { user } = useAuth();
  const userId = user?.id;
  const { language, dir } = useTranslation();
  const c = copy[language];
  const { toast } = useToast();
  const [state, dispatch] = useReducer(foodPreferencesReducer, initialFoodPreferencesState);
  const requestId = useRef(0);
  const dirty = foodPreferencesIsDirty(state);
  const editable = foodPreferencesCanEdit(state);
  const validation = useMemo(() => state.form ? validateFoodPreferencesDraft(state.form) : {}, [state.form]);

  const loadPreferences = useCallback(async () => {
    const currentRequest = ++requestId.current;
    dispatch({ type: "load-start" });
    if (!userId) {
      dispatch({ type: "load-error", message: c.signInError });
      return;
    }
    try {
      const value = await getNutritionPreferenceProfile(userId);
      if (requestId.current === currentRequest) dispatch({ type: "load-success", value });
    } catch (error) {
      if (requestId.current === currentRequest) {
        dispatch({ type: "load-error", message: userSafeError(error, c.loadError) });
      }
    }
  }, [c.loadError, c.signInError, userId]);

  useEffect(() => {
    void loadPreferences();
    return () => { requestId.current += 1; };
  }, [loadPreferences]);

  useEffect(() => {
    if (!dirty || !editable) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, editable]);

  function change(patch: Partial<FoodPreferencesDraft>) {
    if (!state.form || !editable) return;
    dispatch({ type: "change", value: { ...state.form, ...patch } });
  }

  async function save() {
    if (!userId || !state.form || !foodPreferencesCanSave(state)) return;
    dispatch({ type: "save-start" });
    try {
      const value = await upsertNutritionPreferenceProfile(userId, foodPreferencesDraftToInput(state.form));
      dispatch({ type: "save-success", value });
      toast({ title: c.saved });
    } catch (error) {
      dispatch({ type: "save-error", message: userSafeError(error, c.saveError) });
    }
  }

  if (state.phase === "idle" || state.phase === "loading") {
    return <div className="space-y-5" dir={dir}><p className="max-w-3xl text-sm leading-6 text-muted-foreground">{c.intro}</p><p className="text-sm text-muted-foreground" role="status" aria-live="polite">{c.loading}</p></div>;
  }

  if (state.phase === "load-error") {
    return <div className="space-y-5" dir={dir}><p className="max-w-3xl text-sm leading-6 text-muted-foreground">{c.intro}</p><div className="rounded-[18px] border border-destructive/30 bg-destructive/10 p-4" role="alert"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5" />{c.loadError}</div><p className="mt-2 text-sm text-muted-foreground">{state.loadError}</p><p className="mt-1 text-sm text-muted-foreground">{c.loadErrorHelp}</p><Button className="mt-4 min-h-11" onClick={() => void loadPreferences()}><RefreshCw className="h-4 w-4" />{c.retry}</Button></div></div>;
  }

  const form = state.form!;
  const disabled = state.phase === "saving";
  return <div className="space-y-5" dir={dir}>
    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{c.intro}</p>
    <PreferenceSection title={c.taste} description={c.tasteDesc}>
      <TagInput id="preferred-cuisines" label={c.cuisines} value={form.preferred_cuisines} onChange={(preferred_cuisines) => change({ preferred_cuisines })} addLabel={c.add} removeLabel={c.remove} disabled={disabled} />
      <TagInput id="disliked-foods" label={c.dislikes} value={form.disliked_foods} onChange={(disliked_foods) => change({ disliked_foods })} addLabel={c.add} removeLabel={c.remove} disabled={disabled} />
      <Field id="allergies" label={c.allergies} value={form.allergies ?? ""} disabled={disabled} onChange={(value) => change({ allergies: value || null })} />
      <Field id="repeat-tolerance" label={c.repetition} value={form.repeat_tolerance ?? ""} disabled={disabled} onChange={(value) => change({ repeat_tolerance: value || null })} />
    </PreferenceSection>
    <PreferenceSection title={c.budget} description={c.budgetDesc}>
      <Field id="weekly-budget" type="number" inputMode="decimal" min="0" step="0.01" label={c.weeklyBudget} value={form.weekly_food_budget} error={validationMessage(validation.weekly_food_budget, c)} disabled={disabled} onChange={(weekly_food_budget) => change({ weekly_food_budget })} />
      <Field id="currency" label={c.currency} value={form.budget_currency ?? ""} disabled={disabled} onChange={(value) => change({ budget_currency: value || null })} />
      <Field id="max-time" type="number" inputMode="numeric" min="1" max="1440" step="1" label={c.maxTime} value={form.max_cooking_time_minutes} error={validationMessage(validation.max_cooking_time_minutes, c)} disabled={disabled} onChange={(max_cooking_time_minutes) => change({ max_cooking_time_minutes })} />
      <Field id="meals-day" type="number" inputMode="numeric" min="1" max="12" step="1" label={c.mealsDay} value={form.meals_per_day} error={validationMessage(validation.meals_per_day, c)} disabled={disabled} onChange={(meals_per_day) => change({ meals_per_day })} />
      <TagInput id="meal-prep-days" label={c.prepDays} value={form.meal_prep_days} onChange={(meal_prep_days) => change({ meal_prep_days })} addLabel={c.add} removeLabel={c.remove} disabled={disabled} />
      <TagInput id="kitchen-equipment" label={c.equipment} value={form.kitchen_equipment} onChange={(kitchen_equipment) => change({ kitchen_equipment })} addLabel={c.add} removeLabel={c.remove} disabled={disabled} />
      <Field id="cooking-skill" label={c.confidence} value={form.cooking_skill ?? ""} disabled={disabled} onChange={(value) => change({ cooking_skill: value || null })} />
      <Field id="shopping-routine" label={c.shopping} value={form.grocery_style_preference ?? ""} disabled={disabled} onChange={(value) => change({ grocery_style_preference: value || null })} />
    </PreferenceSection>
    {state.saveError ? <div className="rounded-[14px] border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert">{state.saveError}</div> : null}
    <div className="sticky bottom-20 z-10 flex flex-col gap-3 rounded-[16px] border bg-card/95 p-3 shadow-lg backdrop-blur sm:bottom-3 sm:flex-row sm:items-center sm:justify-between"><p className={dirty ? "text-sm font-medium text-warning" : "text-sm text-muted-foreground"}>{dirty ? c.unsaved : c.current}</p><Button className="min-h-12" onClick={() => void save()} disabled={!foodPreferencesCanSave(state)}><Save className="h-4 w-4" />{state.phase === "saving" ? c.saving : c.save}</Button></div>
  </div>;
}

function validationMessage(code: FoodPreferencesValidationErrors[keyof FoodPreferencesValidationErrors], c: FoodPreferencesCopy) {
  if (code === "non-negative-number") return c.budgetError;
  if (code === "cooking-time") return c.timeError;
  if (code === "meals-per-day") return c.mealsError;
  return undefined;
}

function PreferenceSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="border-t pt-5 first:border-t-0 first:pt-0"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div></section>;
}

function Field({ id, label, value, onChange, type = "text", inputMode, min, max, step, error, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; min?: string; max?: string; step?: string; error?: string; disabled?: boolean }) {
  const errorId = `${id}-error`;
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} inputMode={inputMode} min={min} max={max} step={step} value={value} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} />{error ? <p id={errorId} className="text-xs text-destructive" role="alert">{error}</p> : null}</div>;
}
