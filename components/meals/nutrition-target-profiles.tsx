"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Target } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { getNutritionTargetProfiles, upsertNutritionTargetProfile } from "@/services/database/execution-layer";
import { getCurrentWeekday, getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import type { NutritionTargetProfileType, UserNutritionTargetProfile } from "@/types";

const profileTypes: Array<{ type: NutritionTargetProfileType; label: string }> = [
  { type: "default_day", label: "Default day" },
  { type: "training_day", label: "Training day" },
  { type: "rest_day", label: "Rest day" },
  { type: "high_activity_day", label: "High activity day" }
];

const emptyForm = { calories: "", protein: "", carbs: "", fat: "", water: "", notes: "" };

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function NutritionTargetProfiles({ onActiveTargetChange }: { onActiveTargetChange: (profile: UserNutritionTargetProfile | null) => void }) {
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
        setSuggestedType(plan?.days.some((day) => day.weekday === today && day.exercises.length > 0) ? "training_day" : "rest_day");
      })
      .catch((error) => toast({ title: "Could not load target profiles", description: error instanceof Error ? error.message : "Please try again." }));
  }, [toast, user?.id]);

  const activeType = activeOverride === "auto" ? suggestedType : activeOverride;
  const activeProfile = useMemo(() => profiles.find((profile) => profile.target_type === activeType) ?? profiles.find((profile) => profile.target_type === "default_day") ?? null, [activeType, profiles]);

  useEffect(() => { onActiveTargetChange(activeProfile); }, [activeProfile, onActiveTargetChange]);

  useEffect(() => {
    const profile = profiles.find((item) => item.target_type === editingType);
    setForm(profile ? {
      calories: profile.calories === null ? "" : String(profile.calories),
      protein: profile.protein_g === null ? "" : String(profile.protein_g),
      carbs: profile.carbs_g === null ? "" : String(profile.carbs_g),
      fat: profile.fat_g === null ? "" : String(profile.fat_g),
      water: profile.water_ml === null ? "" : String(profile.water_ml),
      notes: profile.notes ?? ""
    } : emptyForm);
  }, [editingType, profiles]);

  async function save() {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const saved = await upsertNutritionTargetProfile(user.id, {
        target_type: editingType,
        calories: numberOrNull(form.calories),
        protein_g: numberOrNull(form.protein),
        carbs_g: numberOrNull(form.carbs),
        fat_g: numberOrNull(form.fat),
        water_ml: numberOrNull(form.water),
        notes: form.notes.trim() || null
      });
      setProfiles((current) => [...current.filter((item) => item.target_type !== saved.target_type), saved]);
      toast({ title: "Target profile saved", description: "Plaivra stored the values you provided; it did not generate targets." });
    } catch (error) {
      toast({ title: "Could not save target profile", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2 text-base"><Target className="h-5 w-5 text-primary" /> Day-type target profiles</CardTitle><p className="mt-1 text-sm text-muted-foreground">Optional targets supplied by you or ChatGPT. No targets are generated here.</p></div>
          <Badge>{profileTypes.find((item) => item.type === activeType)?.label ?? activeType} active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label>Today’s active profile</Label><select value={activeOverride} onChange={(event) => setActiveOverride(event.target.value as typeof activeOverride)} className="h-11 w-full rounded-[14px] border bg-card px-3 text-sm"><option value="auto">Auto from workout status ({suggestedType.replaceAll("_", " ")})</option>{profileTypes.map((profile) => <option key={profile.type} value={profile.type}>{profile.label}</option>)}</select></div>
          <div className="space-y-2"><Label>Edit profile</Label><select value={editingType} onChange={(event) => setEditingType(event.target.value as NutritionTargetProfileType)} className="h-11 w-full rounded-[14px] border bg-card px-3 text-sm">{profileTypes.map((profile) => <option key={profile.type} value={profile.type}>{profile.label}</option>)}</select></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {([
            ["calories", "Calories"], ["protein", "Protein g"], ["carbs", "Carbs g"], ["fat", "Fat g"], ["water", "Water ml"]
          ] as const).map(([key, label]) => <div key={key} className="space-y-2"><Label>{label}</Label><Input type="number" min="0" value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></div>)}
          <Button className="self-end" onClick={save} disabled={isSaving}><Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save profile"}</Button>
        </div>
        <div className="space-y-2"><Label>Notes</Label><Input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional context from you or ChatGPT" /></div>
        {activeProfile ? <p className="text-xs text-muted-foreground">Active values: {activeProfile.calories ?? "—"} kcal · P {activeProfile.protein_g ?? "—"}g · C {activeProfile.carbs_g ?? "—"}g · F {activeProfile.fat_g ?? "—"}g · water {activeProfile.water_ml ?? "—"} ml</p> : <p className="text-xs text-muted-foreground">No saved profile for today; the existing default calorie target remains active.</p>}
      </CardContent>
    </Card>
  );
}
