"use client";

import { useEffect, useState } from "react";
import { Save, ShieldAlert, Utensils } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import {
  getNutritionPreferenceProfile,
  getSafetyProfile,
  upsertNutritionPreferenceProfile,
  upsertSafetyProfile,
  type NutritionPreferenceInput,
  type SafetyProfileInput
} from "@/services/database/execution-layer";

const emptySafety: SafetyProfileInput = {
  injuries: [],
  pain_areas: [],
  medical_conditions: null,
  doctor_restrictions: null,
  medications_or_supplement_notes: null,
  pregnancy_or_postpartum: null,
  eating_disorder_risk_acknowledged: false,
  under_18_flag: false,
  movement_restrictions: null,
  nutrition_restrictions: null,
  risk_level: "green",
  emergency_warning_acknowledged: false
};

const emptyNutrition: NutritionPreferenceInput = {
  weekly_food_budget: null,
  budget_currency: "EUR",
  max_cooking_time_minutes: null,
  meal_prep_days: [],
  cooking_skill: null,
  kitchen_equipment: [],
  preferred_cuisines: [],
  disliked_foods: [],
  allergies: null,
  repeat_tolerance: null,
  meals_per_day: null,
  ingredient_reuse_preference: null,
  grocery_style_preference: null
};

function csv(value: string[]) {
  return value.join(", ");
}

function parseCsv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></div>;
}

export function SafetyProfileCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<SafetyProfileInput>(emptySafety);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    getSafetyProfile(user.id)
      .then((saved) => { if (saved) setForm(saved); })
      .catch((error) => toast({ title: "Could not load safety profile", description: error instanceof Error ? error.message : "Please try again." }))
      .finally(() => setIsLoading(false));
  }, [toast, user?.id]);

  async function save() {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const saved = await upsertSafetyProfile(user.id, form);
      setForm(saved);
      toast({ title: "Safety profile saved", description: "Relevant user-triggered ChatGPT requests can now include this context." });
    } catch (error) {
      toast({ title: "Could not save safety profile", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="border-warning/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-5 w-5 text-warning" /> Safety context</CardTitle>
        <p className="text-sm text-muted-foreground">Optional context for safer workout and nutrition conversations. Plaivra does not diagnose or provide medical advice.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading safety context...</p> : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Injuries (comma separated)" value={csv(form.injuries)} onChange={(value) => setForm((current) => ({ ...current, injuries: parseCsv(value) }))} placeholder="Previous ankle sprain" />
              <Field label="Pain areas (comma separated)" value={csv(form.pain_areas)} onChange={(value) => setForm((current) => ({ ...current, pain_areas: parseCsv(value) }))} placeholder="Shoulder, knee" />
              <Field label="Doctor restrictions" value={form.doctor_restrictions ?? ""} onChange={(value) => setForm((current) => ({ ...current, doctor_restrictions: value || null }))} />
              <Field label="Movement restrictions" value={form.movement_restrictions ?? ""} onChange={(value) => setForm((current) => ({ ...current, movement_restrictions: value || null }))} />
              <Field label="Medical conditions (optional)" value={form.medical_conditions ?? ""} onChange={(value) => setForm((current) => ({ ...current, medical_conditions: value || null }))} />
              <Field label="Medication / supplement notes" value={form.medications_or_supplement_notes ?? ""} onChange={(value) => setForm((current) => ({ ...current, medications_or_supplement_notes: value || null }))} />
              <Field label="Pregnancy / postpartum context" value={form.pregnancy_or_postpartum ?? ""} onChange={(value) => setForm((current) => ({ ...current, pregnancy_or_postpartum: value || null }))} />
              <Field label="Nutrition restrictions" value={form.nutrition_restrictions ?? ""} onChange={(value) => setForm((current) => ({ ...current, nutrition_restrictions: value || null }))} />
              <div className="space-y-2">
                <Label>Self-selected caution level</Label>
                <select value={form.risk_level} onChange={(event) => setForm((current) => ({ ...current, risk_level: event.target.value as SafetyProfileInput["risk_level"] }))} className="h-11 w-full rounded-[14px] border bg-card px-3 text-sm">
                  <option value="green">Green — normal tracking</option>
                  <option value="yellow">Yellow — include caution</option>
                  <option value="red">Red — pause aggressive requests</option>
                </select>
              </div>
              <div className="grid gap-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.under_18_flag} onChange={(event) => setForm((current) => ({ ...current, under_18_flag: event.target.checked }))} /> User is under 18</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.eating_disorder_risk_acknowledged} onChange={(event) => setForm((current) => ({ ...current, eating_disorder_risk_acknowledged: event.target.checked }))} /> Eating-disorder risk acknowledged</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.emergency_warning_acknowledged} onChange={(event) => setForm((current) => ({ ...current, emergency_warning_acknowledged: event.target.checked }))} /> Emergency warning acknowledged</label>
              </div>
            </div>
            <div className="rounded-[14px] border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">For pain, medical conditions, pregnancy/postpartum, eating-disorder concerns, medication questions, or urgent symptoms, consult a qualified professional. Do not use Plaivra or ChatGPT for emergencies.</div>
            <Button onClick={save} disabled={isSaving}><Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save safety context"}</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function NutritionPreferenceCard({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<NutritionPreferenceInput>(emptyNutrition);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(!compact);

  useEffect(() => {
    if (!user?.id) return;
    getNutritionPreferenceProfile(user.id)
      .then((saved) => { if (saved) setForm(saved); })
      .catch((error) => toast({ title: "Could not load meal preferences", description: error instanceof Error ? error.message : "Please try again." }))
      .finally(() => setIsLoading(false));
  }, [toast, user?.id]);

  async function save() {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const saved = await upsertNutritionPreferenceProfile(user.id, form);
      setForm(saved);
      toast({ title: "Meal-planning preferences saved", description: "They will be included in relevant ChatGPT meal requests." });
      if (compact) setIsOpen(false);
    } catch (error) {
      toast({ title: "Could not save preferences", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card variant="glass">
      <CardHeader className={compact ? "p-4" : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Utensils className="h-5 w-5 text-primary" /> Budget & prep preferences</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Optional constraints for practical ChatGPT meal requests.</p>
          </div>
          {compact ? <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen((current) => !current)}>{isOpen ? "Close" : "Edit"}</Button> : null}
        </div>
      </CardHeader>
      {isOpen ? (
        <CardContent className={compact ? "space-y-4 p-4 pt-0" : "space-y-4"}>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading meal preferences...</p> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Weekly food budget" type="number" value={form.weekly_food_budget === null ? "" : String(form.weekly_food_budget)} onChange={(value) => setForm((current) => ({ ...current, weekly_food_budget: optionalNumber(value) }))} />
                <Field label="Currency" value={form.budget_currency ?? ""} onChange={(value) => setForm((current) => ({ ...current, budget_currency: value || null }))} placeholder="EUR" />
                <Field label="Max cooking time (minutes)" type="number" value={form.max_cooking_time_minutes === null ? "" : String(form.max_cooking_time_minutes)} onChange={(value) => setForm((current) => ({ ...current, max_cooking_time_minutes: optionalNumber(value) }))} />
                <Field label="Meal prep days" value={csv(form.meal_prep_days)} onChange={(value) => setForm((current) => ({ ...current, meal_prep_days: parseCsv(value) }))} placeholder="Sunday, Wednesday" />
                <Field label="Cooking skill" value={form.cooking_skill ?? ""} onChange={(value) => setForm((current) => ({ ...current, cooking_skill: value || null }))} placeholder="Beginner" />
                <Field label="Kitchen equipment" value={csv(form.kitchen_equipment)} onChange={(value) => setForm((current) => ({ ...current, kitchen_equipment: parseCsv(value) }))} placeholder="Oven, air fryer" />
                <Field label="Preferred cuisines" value={csv(form.preferred_cuisines)} onChange={(value) => setForm((current) => ({ ...current, preferred_cuisines: parseCsv(value) }))} placeholder="Egyptian, Middle Eastern" />
                <Field label="Disliked foods" value={csv(form.disliked_foods)} onChange={(value) => setForm((current) => ({ ...current, disliked_foods: parseCsv(value) }))} />
                <Field label="Allergies" value={form.allergies ?? ""} onChange={(value) => setForm((current) => ({ ...current, allergies: value || null }))} />
                <Field label="Repeat tolerance" value={form.repeat_tolerance ?? ""} onChange={(value) => setForm((current) => ({ ...current, repeat_tolerance: value || null }))} placeholder="Happy to repeat lunch 3 times" />
                <Field label="Meals per day" type="number" value={form.meals_per_day === null ? "" : String(form.meals_per_day)} onChange={(value) => setForm((current) => ({ ...current, meals_per_day: optionalNumber(value) }))} />
                <Field label="Ingredient reuse" value={form.ingredient_reuse_preference ?? ""} onChange={(value) => setForm((current) => ({ ...current, ingredient_reuse_preference: value || null }))} placeholder="Prefer high reuse" />
                <Field label="Grocery style" value={form.grocery_style_preference ?? ""} onChange={(value) => setForm((current) => ({ ...current, grocery_style_preference: value || null }))} placeholder="One weekly shop" />
              </div>
              <Button onClick={save} disabled={isSaving}><Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save meal preferences"}</Button>
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
