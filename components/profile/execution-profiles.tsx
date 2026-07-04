"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Save, ShieldCheck, Utensils } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/ui/tag-input";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import {
  getNutritionPreferenceProfile,
  getSafetyProfile,
  upsertNutritionPreferenceProfile,
  upsertSafetyProfile,
  type NutritionPreferenceInput,
  type SafetyProfileInput
} from "@/services/database/execution-layer";

const emptySafety: SafetyProfileInput = {
  injuries: [], pain_areas: [], medical_conditions: null, doctor_restrictions: null,
  medications_or_supplement_notes: null, pregnancy_or_postpartum: null,
  eating_disorder_risk_acknowledged: false, under_18_flag: false,
  movement_restrictions: null, nutrition_restrictions: null,
  risk_level: "green", emergency_warning_acknowledged: false
};

const emptyNutrition: NutritionPreferenceInput = {
  weekly_food_budget: null, budget_currency: "EUR", max_cooking_time_minutes: null,
  meal_prep_days: [], cooking_skill: null, kitchen_equipment: [], preferred_cuisines: [],
  disliked_foods: [], allergies: null, repeat_tolerance: null, meals_per_day: null,
  ingredient_reuse_preference: null, grocery_style_preference: null
};

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function Field({ label, value, onChange, placeholder, type = "text", multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; multiline?: boolean }) {
  const id = useId();
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{multiline ? <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-24 w-full rounded-[14px] border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" /> : <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}</div>;
}

function ProfileSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border border-border/70 bg-card p-4 sm:p-5">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function SafetyProfileCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<SafetyProfileInput>(emptySafety);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedForm, setSavedForm] = useState<SafetyProfileInput>(emptySafety);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  useEffect(() => {
    if (!user?.id) return;
    getSafetyProfile(user.id)
      .then((saved) => { if (saved) { setForm(saved); setSavedForm(saved); } })
      .catch((error) => toast({ title: "Could not load coaching context", description: userSafeError(error, "Please refresh and try again.") }))
      .finally(() => setIsLoading(false));
  }, [toast, user?.id]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  async function save() {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const saved = await upsertSafetyProfile(user.id, form);
      setForm(saved);
      setSavedForm(saved);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      toast({ title: "Training safety saved", description: "ChatGPT requests can use this only when you allow the relevant profile permission." });
    } catch (error) {
      toast({ title: "Could not save training safety", description: userSafeError(error) });
    } finally { setIsSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Training safety</CardTitle>
        <p className="text-sm text-muted-foreground">Help ChatGPT avoid suggestions that do not fit you. Everything is optional. Plaivra is not medical advice.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading training safety...</p> : (
          <>
            <ProfileSection title="Current limitations" description="Why this matters: it helps ChatGPT avoid movements that do not fit today.">
              <TagInput id="injuries" label="Injuries" value={form.injuries} onChange={(injuries) => setForm((current) => ({ ...current, injuries }))} placeholder="Add an injury" />
              <TagInput id="pain-areas" label="Pain areas" value={form.pain_areas} onChange={(pain_areas) => setForm((current) => ({ ...current, pain_areas }))} placeholder="Add a pain area" />
              <Field multiline label="Movement restrictions" value={form.movement_restrictions ?? ""} onChange={(value) => setForm((current) => ({ ...current, movement_restrictions: value || null }))} placeholder="For example: avoid overhead pressing" />
              <Field multiline label="Professional restrictions" value={form.doctor_restrictions ?? ""} onChange={(value) => setForm((current) => ({ ...current, doctor_restrictions: value || null }))} placeholder="Only if a qualified professional gave you restrictions" />
            </ProfileSection>

            <ProfileSection title="Training safety" description="Why this matters: optional context can make workout and meal requests more cautious.">
              <Field multiline label="Health context that affects training" value={form.medical_conditions ?? ""} onChange={(value) => setForm((current) => ({ ...current, medical_conditions: value || null }))} />
              <Field multiline label="Medication or supplement notes" value={form.medications_or_supplement_notes ?? ""} onChange={(value) => setForm((current) => ({ ...current, medications_or_supplement_notes: value || null }))} />
              <Field multiline label="Pregnancy or postpartum context" value={form.pregnancy_or_postpartum ?? ""} onChange={(value) => setForm((current) => ({ ...current, pregnancy_or_postpartum: value || null }))} />
              <Field multiline label="Food-related restrictions" value={form.nutrition_restrictions ?? ""} onChange={(value) => setForm((current) => ({ ...current, nutrition_restrictions: value || null }))} />
            </ProfileSection>

            <ProfileSection title="Request caution" description="Choose how conservative workout and nutrition requests should be.">
              <div className="sm:col-span-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Request caution level">
                {([['green', 'Standard'], ['yellow', 'Extra caution'], ['red', 'High caution']] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={form.risk_level === value} onClick={() => setForm((current) => ({ ...current, risk_level: value }))} className={`min-h-12 rounded-[14px] border px-2 text-xs font-semibold sm:text-sm ${form.risk_level === value ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>{label}</button>
                ))}
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-primary" checked={form.under_18_flag} onChange={(event) => setForm((current) => ({ ...current, under_18_flag: event.target.checked }))} /> Under 18</label>
              <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-primary" checked={form.eating_disorder_risk_acknowledged} onChange={(event) => setForm((current) => ({ ...current, eating_disorder_risk_acknowledged: event.target.checked }))} /> Use extra care around food targets</label>
            </ProfileSection>

            <p className="text-xs leading-5 text-muted-foreground">For urgent symptoms or questions about pain, medical conditions, pregnancy/postpartum, eating disorders, or medication, contact a qualified professional.</p>
            <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-[14px] border bg-card/95 p-3 shadow-lg sm:bottom-3 sm:flex-row sm:items-center sm:justify-between">
              <p className={`text-sm font-medium ${isDirty ? "text-warning" : "text-primary"}`}>{isDirty ? "You have unsaved training safety changes." : savedAt ? `Training safety saved at ${savedAt}.` : "Training safety is up to date."}</p>
              <Button onClick={save} disabled={isSaving || !isDirty}><Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save training safety"}</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function NutritionPreferenceCard({ onAfterSave, saveLabel }: { onAfterSave?: () => void; saveLabel?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<NutritionPreferenceInput>(emptyNutrition);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedForm, setSavedForm] = useState<NutritionPreferenceInput>(emptyNutrition);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  useEffect(() => {
    if (!user?.id) return;
    getNutritionPreferenceProfile(user.id)
      .then((saved) => { if (saved) { setForm(saved); setSavedForm(saved); } })
      .catch((error) => {
        toast({ title: "Could not load food preferences", description: userSafeError(error, "Please refresh and try again.") });
      })
      .finally(() => setIsLoading(false));
  }, [toast, user?.id]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  async function save() {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const saved = await upsertNutritionPreferenceProfile(user.id, form);
      setForm(saved);
      setSavedForm(saved);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      toast({ title: "Food preferences saved", description: "They can be included in ChatGPT meal requests you prepare." });
      onAfterSave?.();
    } catch (error) {
      toast({ title: "Could not save food preferences", description: userSafeError(error) });
    } finally { setIsSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2"><Utensils className="h-5 w-5 text-primary" /> Food preferences</CardTitle><p className="mt-1 text-sm text-muted-foreground">Everything is optional. Add only what helps ChatGPT make practical suggestions for your taste, time, budget, and kitchen.</p></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading food preferences...</p> : (
          <>
            <ProfileSection title="Food preferences" description="Why this matters: it helps ChatGPT avoid bad fits and suggest meals you will actually use.">
              <TagInput id="preferred-cuisines" label="Preferred cuisines" value={form.preferred_cuisines} onChange={(preferred_cuisines) => setForm((current) => ({ ...current, preferred_cuisines }))} placeholder="Add a cuisine" />
              <TagInput id="disliked-foods" label="Disliked foods" value={form.disliked_foods} onChange={(disliked_foods) => setForm((current) => ({ ...current, disliked_foods }))} placeholder="Add a food" />
              <Field label="Allergies" value={form.allergies ?? ""} onChange={(value) => setForm((current) => ({ ...current, allergies: value || null }))} placeholder="List confirmed allergies" />
              <Field label="How much repetition is okay?" value={form.repeat_tolerance ?? ""} onChange={(value) => setForm((current) => ({ ...current, repeat_tolerance: value || null }))} placeholder="For example: repeat lunch 3 times" />
            </ProfileSection>
            <ProfileSection title="Budget, prep time, and kitchen" description="Why this matters: practical limits keep meal and grocery suggestions realistic.">
              <Field label="Weekly food budget" type="number" value={form.weekly_food_budget === null ? "" : String(form.weekly_food_budget)} onChange={(value) => setForm((current) => ({ ...current, weekly_food_budget: optionalNumber(value) }))} />
              <Field label="Currency" value={form.budget_currency ?? ""} onChange={(value) => setForm((current) => ({ ...current, budget_currency: value || null }))} placeholder="EUR" />
              <Field label="Maximum cooking time (minutes)" type="number" value={form.max_cooking_time_minutes === null ? "" : String(form.max_cooking_time_minutes)} onChange={(value) => setForm((current) => ({ ...current, max_cooking_time_minutes: optionalNumber(value) }))} />
              <Field label="Meals per day" type="number" value={form.meals_per_day === null ? "" : String(form.meals_per_day)} onChange={(value) => setForm((current) => ({ ...current, meals_per_day: optionalNumber(value) }))} />
              <TagInput id="meal-prep-days" label="Meal prep days" value={form.meal_prep_days} onChange={(meal_prep_days) => setForm((current) => ({ ...current, meal_prep_days }))} placeholder="Add a day" />
              <TagInput id="kitchen-equipment" label="Kitchen equipment" value={form.kitchen_equipment} onChange={(kitchen_equipment) => setForm((current) => ({ ...current, kitchen_equipment }))} placeholder="Add equipment" />
              <Field label="Cooking confidence" value={form.cooking_skill ?? ""} onChange={(value) => setForm((current) => ({ ...current, cooking_skill: value || null }))} placeholder="Beginner, comfortable, confident" />
              <Field label="Shopping routine" value={form.grocery_style_preference ?? ""} onChange={(value) => setForm((current) => ({ ...current, grocery_style_preference: value || null }))} placeholder="For example: one weekly shop" />
            </ProfileSection>
            <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-[14px] border bg-card/95 p-3 shadow-lg sm:bottom-3 sm:flex-row sm:items-center sm:justify-between">
              <p className={`text-sm font-medium ${isDirty ? "text-warning" : "text-primary"}`}>{isDirty ? "You have unsaved food preference changes." : savedAt ? `Food preferences saved at ${savedAt}.` : "Food preferences are up to date."}</p>
              <Button onClick={save} disabled={isSaving || !isDirty}><Save className="h-4 w-4" /> {isSaving ? "Saving..." : (saveLabel ?? "Save food preferences")}</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
