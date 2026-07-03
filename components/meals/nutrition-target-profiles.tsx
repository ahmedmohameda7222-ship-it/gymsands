"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Save, Target } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { getNutritionTargetProfiles, upsertNutritionTargetProfile } from "@/services/database/execution-layer";
import { getCurrentWeekday, getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { getActiveTargetOverride, resolveActiveNutritionTarget, setActiveTargetOverride, type ActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { NutritionTargetProfileType, UserNutritionTargetProfile } from "@/types";

const profileTypes: Array<{ type: NutritionTargetProfileType; label: string; description: string }> = [
  { type: "default_day", label: "Default day", description: "Fallback for any day" },
  { type: "training_day", label: "Training day", description: "Days with a planned workout" },
  { type: "rest_day", label: "Rest day", description: "Days without training" },
  { type: "high_activity_day", label: "High activity day", description: "Especially active days" }
];

const emptyForm = { calories: "", protein: "", carbs: "", fat: "", water: "", notes: "" };

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formFromProfile(profile: UserNutritionTargetProfile | null | undefined) {
  return profile ? {
    calories: profile.calories === null ? "" : String(profile.calories),
    protein: profile.protein_g === null ? "" : String(profile.protein_g),
    carbs: profile.carbs_g === null ? "" : String(profile.carbs_g),
    fat: profile.fat_g === null ? "" : String(profile.fat_g),
    water: profile.water_ml === null ? "" : String(profile.water_ml),
    notes: profile.notes ?? ""
  } : emptyForm;
}

export function NutritionTargetProfiles({ onActiveTargetChange, baseTarget }: { onActiveTargetChange: (target: ActiveNutritionTarget) => void; baseTarget?: { daily_calories: number; protein_g: number; carbs_g: number; fat_g: number; water_ml: number } | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = useTodayDate();
  const [profiles, setProfiles] = useState<UserNutritionTargetProfile[]>([]);
  const [suggestedType, setSuggestedType] = useState<NutritionTargetProfileType>("default_day");
  const [activeOverride, setActiveOverride] = useState<NutritionTargetProfileType | "auto">("auto");
  const [editingType, setEditingType] = useState<NutritionTargetProfileType>("training_day");
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([user.id === "mock-user" ? Promise.resolve([]) : getNutritionTargetProfiles(user.id), getDefaultUserWorkoutPlan(user.id)])
      .then(([saved, plan]) => {
        setProfiles(saved);
        const weekday = getCurrentWeekday();
        const detected = plan?.days.some((day) => day.weekday === weekday && day.exercises.length > 0) ? "training_day" : "rest_day";
        setSuggestedType(detected);
        setEditingType(detected);
        setActiveOverride(getActiveTargetOverride(user.id, today));
      })
      .catch((error) => toast({ title: "Could not load target profiles", description: userSafeError(error, "Please refresh and try again.") }));
  }, [toast, today, user?.id]);

  const activeType = activeOverride === "auto" ? suggestedType : activeOverride;
  const exactActiveProfile = useMemo(() => profiles.find((profile) => profile.target_type === activeType) ?? null, [activeType, profiles]);
  const activeTarget = useMemo(() => resolveActiveNutritionTarget({ profiles, baseTarget: baseTarget ?? null, requestedType: activeType }), [activeType, baseTarget, profiles]);
  const activeProfile = activeTarget.profile;
  const activeLabel = activeTarget.label;
  const editingLabel = profileTypes.find((item) => item.type === editingType)?.label ?? "Target";
  const activeValues = activeTarget.values;

  useEffect(() => { onActiveTargetChange(activeTarget); }, [activeTarget, onActiveTargetChange]);
  useEffect(() => { setForm(formFromProfile(profiles.find((item) => item.target_type === editingType))); }, [editingType, profiles]);

  async function saveType(targetType: NutritionTargetProfileType, values = form) {
    if (!user?.id) return null;
    const saved = await upsertNutritionTargetProfile(user.id, {
      target_type: targetType,
      calories: numberOrNull(values.calories), protein_g: numberOrNull(values.protein), carbs_g: numberOrNull(values.carbs),
      fat_g: numberOrNull(values.fat), water_ml: numberOrNull(values.water), notes: values.notes.trim() || null
    });
    setProfiles((current) => [...current.filter((item) => item.target_type !== saved.target_type), saved]);
    return saved;
  }

  async function save() {
    setIsSaving(true);
    try {
      await saveType(editingType);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      toast({ title: `${editingLabel} saved`, description: "Plaivra stored the values you entered. It did not generate targets." });
    } catch (error) {
      toast({ title: "Could not save target", description: userSafeError(error) });
    } finally { setIsSaving(false); }
  }

  async function useActiveAsDefault() {
    if (!activeProfile) return;
    setIsSaving(true);
    try {
      await saveType("default_day", formFromProfile(activeProfile));
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      toast({ title: "Default target updated", description: `${activeLabel} values are now your fallback target.` });
    } catch (error) {
      toast({ title: "Could not update default", description: userSafeError(error) });
    } finally { setIsSaving(false); }
  }

  function copyFromDefault() {
    const defaultProfile = profiles.find((profile) => profile.target_type === "default_day");
    if (!defaultProfile) {
      toast({ title: "No default target yet", description: "Save a Default day target first." });
      return;
    }
    setForm(formFromProfile(defaultProfile));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> Targets by day type</CardTitle>
        <p className="text-sm text-muted-foreground">Use different targets for training, rest, or especially active days. Values come from you or a ChatGPT recommendation you approve.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-[18px] border border-primary/25 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">Active today: {activeLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">{activeTarget.reason}</p>
          <p className="mt-2 text-lg font-bold text-foreground">
            {activeValues.daily_calories || "-"} kcal · P {activeValues.protein_g || "-"}g · C {activeValues.carbs_g || "-"}g · F {activeValues.fat_g || "-"}g
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Water {activeValues.water_ml ? `${activeValues.water_ml} ml / ${(activeValues.water_ml / 1000).toFixed(2)} L` : "not set"}</p>
          {!exactActiveProfile && activeProfile ? <p className="mt-1 text-xs text-muted-foreground">Using your Default day values because {activeLabel} has no saved target yet.</p> : null}
          {!activeProfile && baseTarget ? <p className="mt-1 text-xs text-muted-foreground">Using your base target because no day-type profile is saved yet.</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setEditingType(activeType)}>Edit active target</Button>
            <Button type="button" variant="outline" size="sm" onClick={useActiveAsDefault} disabled={!activeProfile || isSaving}>Use as default</Button>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Override today</p>
            {activeOverride !== "auto" ? <Button type="button" variant="ghost" size="sm" onClick={() => { setActiveOverride("auto"); if (user?.id) setActiveTargetOverride(user.id, today, "auto"); }}>Use automatic choice</Button> : null}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {profileTypes.map((profile) => {
              const saved = profiles.find((item) => item.target_type === profile.type);
              const active = activeType === profile.type;
              return (
                <button key={profile.type} type="button" aria-pressed={active} onClick={() => { setActiveOverride(profile.type); setEditingType(profile.type); if (user?.id) setActiveTargetOverride(user.id, today, profile.type); }} className={`min-h-20 rounded-[16px] border p-3 text-left transition ${active ? "border-2 border-primary bg-primary/10" : "bg-card hover:border-primary/40"}`}>
                  <p className="text-sm font-semibold text-foreground">{profile.label}</p>
                  <p className="mt-1 text-xs font-semibold text-primary">{active ? "Active today" : "Choose for today"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{saved?.calories ? `${saved.calories} kcal · P ${saved.protein_g ?? "—"}g` : profile.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[18px] border border-border/70 bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="font-semibold text-foreground">Edit {editingLabel}</p><p className="text-xs text-muted-foreground">Enter only values you want to use.</p></div>
            {editingType !== "default_day" ? <Button type="button" variant="ghost" size="sm" onClick={copyFromDefault}><Copy className="h-4 w-4" /> Copy from default</Button> : null}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {([['calories', 'Calories'], ['protein', 'Protein g'], ['carbs', 'Carbs g'], ['fat', 'Fat g'], ['water', 'Water ml']] as const).map(([key, label]) => (
              <div key={key} className="space-y-2"><Label htmlFor={`nutrition-target-${key}`}>{label}</Label><Input id={`nutrition-target-${key}`} type="number" min="0" value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></div>
            ))}
          </div>
          <div className="mt-3 space-y-2"><Label htmlFor="nutrition-target-notes">Notes</Label><Input id="nutrition-target-notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional context from you or ChatGPT" /></div>
          <Button className="mt-4" onClick={save} disabled={isSaving}><Save className="h-4 w-4" /> {isSaving ? "Saving..." : `Save ${editingLabel.toLowerCase()}`}</Button>
          {savedAt ? <p className="mt-3 text-sm font-medium text-primary" role="status">Saved at {savedAt}. The active summary above is now up to date.</p> : null}
        </div>

        <Disclosure title="What are day types?" description="Plaivra uses the profile that matches today, with a safe fallback.">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold">Default</dt><dd className="text-muted-foreground">Your normal-day fallback.</dd></div>
            <div><dt className="font-semibold">Training</dt><dd className="text-muted-foreground">A day with a workout in your active plan.</dd></div>
            <div><dt className="font-semibold">Rest</dt><dd className="text-muted-foreground">A day without a scheduled workout.</dd></div>
            <div><dt className="font-semibold">High activity</dt><dd className="text-muted-foreground">A high-movement day you choose manually.</dd></div>
            <div><dt className="font-semibold">Base</dt><dd className="text-muted-foreground">Used only when no day-type profile exists.</dd></div>
          </dl>
        </Disclosure>
      </CardContent>
    </Card>
  );
}
