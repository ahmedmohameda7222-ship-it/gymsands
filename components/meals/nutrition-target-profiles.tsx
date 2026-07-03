"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Save, Target } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { getNutritionTargetProfiles, upsertNutritionTargetProfile } from "@/services/database/execution-layer";
import { getCurrentWeekday, getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
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

export function NutritionTargetProfiles({ onActiveTargetChange, baseTarget }: { onActiveTargetChange: (profile: UserNutritionTargetProfile | null) => void; baseTarget?: { daily_calories: number; protein_g: number; carbs_g: number; fat_g: number; water_ml: number } | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<UserNutritionTargetProfile[]>([]);
  const [suggestedType, setSuggestedType] = useState<NutritionTargetProfileType>("default_day");
  const [activeOverride, setActiveOverride] = useState<NutritionTargetProfileType | "auto">("auto");
  const [editingType, setEditingType] = useState<NutritionTargetProfileType>("training_day");
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([getNutritionTargetProfiles(user.id), getDefaultUserWorkoutPlan(user.id)])
      .then(([saved, plan]) => {
        setProfiles(saved);
        const today = getCurrentWeekday();
        const detected = plan?.days.some((day) => day.weekday === today && day.exercises.length > 0) ? "training_day" : "rest_day";
        setSuggestedType(detected);
        setEditingType(detected);
      })
      .catch((error) => toast({ title: "Could not load target profiles", description: userSafeError(error, "Please refresh and try again.") }));
  }, [toast, user?.id]);

  const activeType = activeOverride === "auto" ? suggestedType : activeOverride;
  const exactActiveProfile = useMemo(() => profiles.find((profile) => profile.target_type === activeType) ?? null, [activeType, profiles]);
  const activeProfile = useMemo(() => exactActiveProfile ?? profiles.find((profile) => profile.target_type === "default_day") ?? null, [exactActiveProfile, profiles]);
  const activeLabel = profileTypes.find((item) => item.type === activeType)?.label ?? "Default day";
  const editingLabel = profileTypes.find((item) => item.type === editingType)?.label ?? "Target";
  const activeValues = activeProfile ? { calories: activeProfile.calories, protein_g: activeProfile.protein_g, carbs_g: activeProfile.carbs_g, fat_g: activeProfile.fat_g } : { calories: baseTarget?.daily_calories ?? null, protein_g: baseTarget?.protein_g ?? null, carbs_g: baseTarget?.carbs_g ?? null, fat_g: baseTarget?.fat_g ?? null };

  useEffect(() => { onActiveTargetChange(activeProfile); }, [activeProfile, onActiveTargetChange]);
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
          <p className="text-sm font-semibold text-foreground">Today detected as: {profileTypes.find((item) => item.type === suggestedType)?.label}</p>
          <p className="mt-2 text-lg font-bold text-foreground">
            Active target: {activeValues.calories ?? "—"} kcal · P {activeValues.protein_g ?? "—"}g · C {activeValues.carbs_g ?? "—"}g · F {activeValues.fat_g ?? "—"}g
          </p>
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
            {activeOverride !== "auto" ? <Button type="button" variant="ghost" size="sm" onClick={() => setActiveOverride("auto")}>Use automatic choice</Button> : null}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {profileTypes.map((profile) => {
              const saved = profiles.find((item) => item.target_type === profile.type);
              const active = activeType === profile.type;
              return (
                <button key={profile.type} type="button" onClick={() => { setActiveOverride(profile.type); setEditingType(profile.type); }} className={`rounded-[16px] border p-3 text-left transition ${active ? "border-primary bg-primary/10" : "bg-card hover:border-primary/40"}`}>
                  <p className="text-sm font-semibold text-foreground">{profile.label}</p>
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
              <div key={key} className="space-y-2"><Label>{label}</Label><Input type="number" min="0" value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></div>
            ))}
          </div>
          <div className="mt-3 space-y-2"><Label>Notes</Label><Input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional context from you or ChatGPT" /></div>
          <Button className="mt-4" onClick={save} disabled={isSaving}><Save className="h-4 w-4" /> {isSaving ? "Saving..." : `Save ${editingLabel.toLowerCase()}`}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
