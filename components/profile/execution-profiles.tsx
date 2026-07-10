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
  getFitnessConstraints,
  getNutritionPreferenceProfile,
  upsertFitnessConstraints,
  upsertNutritionPreferenceProfile,
  type FitnessConstraintInput,
  type NutritionPreferenceInput
} from "@/services/database/execution-layer";

const emptyConstraints: FitnessConstraintInput = {
  injury_or_limitation_labels: [],
  areas_to_protect: [],
  movement_restrictions: null,
  nutrition_restrictions: null
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

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  multiline = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-h-24 w-full rounded-[14px] border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
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

export function FitnessConstraintsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<FitnessConstraintInput>(emptyConstraints);
  const [savedForm, setSavedForm] = useState<FitnessConstraintInput>(emptyConstraints);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    getFitnessConstraints(user.id)
      .then((saved: FitnessConstraintInput | null) => {
        if (!saved) return;
        setForm(saved);
        setSavedForm(saved);
      })
      .catch((error: unknown) => {
        toast({
          title: "Could not load fitness constraints",
          description: userSafeError(error, "Please refresh and try again.")
        });
      })
      .finally(() => setIsLoading(false));
  }, [toast, user?.id]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  async function save() {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const saved = await upsertFitnessConstraints(user.id, form);
      setForm(saved);
      setSavedForm(saved);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      toast({
        title: "Fitness constraints saved",
        description: "ChatGPT can use them only when you grant the relevant profile permission."
      });
    } catch (error) {
      toast({ title: "Could not save fitness constraints", description: userSafeError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Fitness constraints
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Save practical context once so ChatGPT can avoid unsuitable movements or food suggestions. Plaivra stores what you enter; it does not diagnose a condition or provide treatment.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading fitness constraints...</p>
        ) : (
          <>
            <ProfileSection
              title="Training constraints"
              description="Use your own words. These fields describe what ChatGPT should respect during fitness planning; they are not a medical assessment."
            >
              <TagInput
                id="injury-or-limitation-labels"
                label="Injury or limitation labels"
                value={form.injury_or_limitation_labels}
                onChange={(injury_or_limitation_labels) => setForm((current: FitnessConstraintInput) => ({ ...current, injury_or_limitation_labels }))}
                placeholder="For example: shoulder injury"
              />
              <TagInput
                id="areas-to-protect"
                label="Areas to protect"
                value={form.areas_to_protect}
                onChange={(areas_to_protect) => setForm((current: FitnessConstraintInput) => ({ ...current, areas_to_protect }))}
                placeholder="For example: right shoulder"
              />
              <div className="sm:col-span-2">
                <Field
                  multiline
                  label="Movements or activities to avoid"
                  value={form.movement_restrictions ?? ""}
                  onChange={(value) => setForm((current: FitnessConstraintInput) => ({ ...current, movement_restrictions: value || null }))}
                  placeholder="For example: avoid overhead pressing and painful shoulder ranges"
                />
              </div>
            </ProfileSection>

            <ProfileSection
              title="Food-planning constraints"
              description="Add only practical constraints ChatGPT should respect when creating meals. Confirmed allergies remain in Food preferences."
            >
              <div className="sm:col-span-2">
                <Field
                  multiline
                  label="Nutrition constraints"
                  value={form.nutrition_restrictions ?? ""}
                  onChange={(value) => setForm((current: FitnessConstraintInput) => ({ ...current, nutrition_restrictions: value || null }))}
                  placeholder="For example: avoid very large meals before evening training"
                />
              </div>
            </ProfileSection>

            <div className="rounded-[16px] border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
              This context stays in your Plaivra account. Saving it does not automatically share it with ChatGPT; the active Plaivra connection and profile permissions control access.
            </div>

            <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-[14px] border bg-card/95 p-3 shadow-lg sm:bottom-3 sm:flex-row sm:items-center sm:justify-between">
              <p className={`text-sm font-medium ${isDirty ? "text-warning" : "text-primary"}`}>
                {isDirty
                  ? "You have unsaved fitness-constraint changes."
                  : savedAt
                    ? `Fitness constraints saved at ${savedAt}.`
                    : "Fitness constraints are up to date."}
              </p>
              <Button onClick={save} disabled={isSaving || !isDirty}>
                <Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save fitness constraints"}
              </Button>
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
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    getNutritionPreferenceProfile(user.id)
      .then((saved) => {
        if (!saved) return;
        setForm(saved);
        setSavedForm(saved);
      })
      .catch((error: unknown) => {
        toast({ title: "Could not load food preferences", description: userSafeError(error, "Please refresh and try again.") });
      })
      .finally(() => setIsLoading(false));
  }, [toast, user?.id]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
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
      toast({ title: "Food preferences saved", description: "ChatGPT can use them only through your authorized Plaivra nutrition context." });
      onAfterSave?.();
    } catch (error) {
      toast({ title: "Could not save food preferences", description: userSafeError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Utensils className="h-5 w-5 text-primary" /> Food preferences
        </CardTitle>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Add only what helps ChatGPT create practical meals for your taste, time, budget, and kitchen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading food preferences...</p>
        ) : (
          <>
            <ProfileSection title="Food preferences" description="Help ChatGPT avoid bad fits and suggest meals you will actually use.">
              <TagInput id="preferred-cuisines" label="Preferred cuisines" value={form.preferred_cuisines} onChange={(preferred_cuisines) => setForm((current) => ({ ...current, preferred_cuisines }))} placeholder="Add a cuisine" />
              <TagInput id="disliked-foods" label="Disliked foods" value={form.disliked_foods} onChange={(disliked_foods) => setForm((current) => ({ ...current, disliked_foods }))} placeholder="Add a food" />
              <Field label="Allergies" value={form.allergies ?? ""} onChange={(value) => setForm((current) => ({ ...current, allergies: value || null }))} placeholder="List confirmed allergies" />
              <Field label="How much repetition is okay?" value={form.repeat_tolerance ?? ""} onChange={(value) => setForm((current) => ({ ...current, repeat_tolerance: value || null }))} placeholder="For example: repeat lunch 3 times" />
            </ProfileSection>

            <ProfileSection title="Budget, prep time, and kitchen" description="Practical limits keep meal and grocery suggestions realistic.">
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
              <p className={`text-sm font-medium ${isDirty ? "text-warning" : "text-primary"}`}>
                {isDirty ? "You have unsaved food-preference changes." : savedAt ? `Food preferences saved at ${savedAt}.` : "Food preferences are up to date."}
              </p>
              <Button onClick={save} disabled={isSaving || !isDirty}>
                <Save className="h-4 w-4" /> {isSaving ? "Saving..." : (saveLabel ?? "Save food preferences")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
