"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Moon, Save, Sun } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { userSafeError } from "@/lib/error-formatting";
import { getDailyCheckins, upsertDailyCheckin } from "@/services/database/execution-layer";
import type { UserDailyCheckin } from "@/types";

const ratingOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Okay" },
  { value: "high", label: "High" }
];

const readinessOptions = [
  { value: "high", label: "Ready" },
  { value: "medium", label: "Maybe" },
  { value: "low", label: "Not today" }
];

const morningDefaults = {
  sleep_hours: "",
  energy_level: "",
  soreness_level: "",
  stress_level: "",
  motivation_level: "",
  workout_readiness: "",
  today_main_goal: "",
  today_blocker: ""
};

const eveningDefaults = {
  workout_done: false,
  protein_hit: false,
  calories_hit: false,
  water_hit: false,
  steps_or_movement_done: false,
  meal_plan_followed: false,
  main_blocker: "",
  tomorrow_note: ""
};

function RatingField({ label, value, onChange, options = ratingOptions }: { label: string; value: string; onChange: (value: string) => void; options?: Array<{ value: string; label: string }> }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-3 overflow-hidden rounded-[14px] border bg-card" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)} className={`min-h-11 border-r px-2 text-xs font-semibold last:border-r-0 sm:text-sm ${value === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>{option.label}</button>
        ))}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="solid-row flex min-h-12 cursor-pointer items-center gap-3 p-3 text-sm font-medium"><input type="checkbox" className="h-5 w-5 accent-primary" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

export function DailyCheckins({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = useTodayDate();
  const [morning, setMorning] = useState(morningDefaults);
  const [evening, setEvening] = useState(eveningDefaults);
  const [morningSaved, setMorningSaved] = useState(false);
  const [eveningSaved, setEveningSaved] = useState(false);
  const [isOpen, setIsOpen] = useState(!compact);
  const [savingType, setSavingType] = useState<"morning" | "evening" | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    getDailyCheckins(user.id, today)
      .then((items) => {
        const savedMorning = items.find((item) => item.checkin_type === "morning");
        const savedEvening = items.find((item) => item.checkin_type === "evening");
        if (savedMorning) {
          setMorning(morningFromSaved(savedMorning));
          setMorningSaved(true);
        }
        if (savedEvening) {
          setEvening(eveningFromSaved(savedEvening));
          setEveningSaved(true);
        }
      })
      .catch((error) => {
        if (!compact) toast({ title: "Could not load check-ins", description: userSafeError(error, "Please refresh and try again.") });
      });
  }, [compact, toast, today, user?.id]);

  async function saveMorning() {
    if (!user?.id) return;
    setSavingType("morning");
    try {
      await upsertDailyCheckin(user.id, {
        checkin_date: today,
        checkin_type: "morning",
        sleep_hours: morning.sleep_hours ? Number(morning.sleep_hours) : null,
        energy_level: morning.energy_level || null,
        soreness_level: morning.soreness_level || null,
        stress_level: morning.stress_level || null,
        motivation_level: morning.motivation_level || null,
        workout_readiness: morning.workout_readiness || null,
        today_main_goal: morning.today_main_goal || null,
        today_blocker: morning.today_blocker || null
      });
      setMorningSaved(true);
      toast({ title: "Morning check-in saved", description: "Today’s readiness context is available for your ChatGPT requests." });
    } catch (error) {
      toast({ title: "Could not save morning check-in", description: userSafeError(error) });
    } finally {
      setSavingType(null);
    }
  }

  async function saveEvening() {
    if (!user?.id) return;
    setSavingType("evening");
    try {
      await upsertDailyCheckin(user.id, {
        checkin_date: today,
        checkin_type: "evening",
        ...evening,
        main_blocker: evening.main_blocker || null,
        tomorrow_note: evening.tomorrow_note || null
      });
      setEveningSaved(true);
      toast({ title: "Evening review saved", description: "Today’s accountability record is complete." });
    } catch (error) {
      toast({ title: "Could not save evening review", description: userSafeError(error) });
    } finally {
      setSavingType(null);
    }
  }

  return (
    <Card variant="glass" className="border-primary/15">
      <CardHeader className={compact ? "p-4" : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{compact ? "Quick check-in" : "Daily check-ins"}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{compact ? "Energy, soreness, and readiness for today." : `A morning plan and evening review for ${today}.`}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={morningSaved ? "success" : "outline"}>{compact ? "Today" : "Morning"} {morningSaved ? "done" : "open"}</Badge>
            {!compact ? <Badge variant={eveningSaved ? "success" : "outline"}>Evening {eveningSaved ? "done" : "open"}</Badge> : null}
            {compact ? <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen((current) => !current)}>{isOpen ? "Close" : "Check in"}</Button> : null}
          </div>
        </div>
      </CardHeader>
      {isOpen ? (
        <CardContent className={compact ? "p-4 pt-0" : "grid gap-4 lg:grid-cols-2"}>
          <div className="solid-tracking-card space-y-3 p-4">
            <p className="flex items-center gap-2 font-semibold"><Sun className="h-4 w-4 text-warning" /> {compact ? "How are you feeling?" : "Morning check-in"}</p>
            <div className={`grid gap-3 ${compact ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}>
              {!compact ? <TextField label="Sleep hours" type="number" value={morning.sleep_hours} onChange={(value) => setMorning((current) => ({ ...current, sleep_hours: value }))} /> : null}
              <RatingField label="Energy" value={morning.energy_level} onChange={(value) => setMorning((current) => ({ ...current, energy_level: value }))} />
              <RatingField label="Soreness" value={morning.soreness_level} onChange={(value) => setMorning((current) => ({ ...current, soreness_level: value }))} />
              {!compact ? <RatingField label="Stress" value={morning.stress_level} onChange={(value) => setMorning((current) => ({ ...current, stress_level: value }))} /> : null}
              {!compact ? <RatingField label="Motivation" value={morning.motivation_level} onChange={(value) => setMorning((current) => ({ ...current, motivation_level: value }))} /> : null}
              <RatingField label="Ready to train?" value={morning.workout_readiness} options={readinessOptions} onChange={(value) => setMorning((current) => ({ ...current, workout_readiness: value }))} />
              {!compact ? <TextField label="Main goal" value={morning.today_main_goal} onChange={(value) => setMorning((current) => ({ ...current, today_main_goal: value }))} /> : null}
              {!compact ? <TextField label="Likely blocker" value={morning.today_blocker} onChange={(value) => setMorning((current) => ({ ...current, today_blocker: value }))} /> : null}
            </div>
            <Button onClick={saveMorning} disabled={savingType !== null}><Save className="h-4 w-4" /> {savingType === "morning" ? "Saving..." : compact ? "Save check-in" : "Save morning check-in"}</Button>
          </div>

          {!compact ? <div className="solid-tracking-card space-y-3 p-4">
            <p className="flex items-center gap-2 font-semibold"><Moon className="h-4 w-4 text-primary" /> Evening review</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["workout_done", "Workout done"],
                ["protein_hit", "Protein target hit"],
                ["calories_hit", "Calorie target hit"],
                ["water_hit", "Water target hit"],
                ["steps_or_movement_done", "Steps / movement done"],
                ["meal_plan_followed", "Meal plan followed"]
              ] as const).map(([key, label]) => <Toggle key={key} label={label} checked={evening[key]} onChange={(checked) => setEvening((current) => ({ ...current, [key]: checked }))} />)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Main blocker" value={evening.main_blocker} onChange={(value) => setEvening((current) => ({ ...current, main_blocker: value }))} />
              <TextField label="Tomorrow note" value={evening.tomorrow_note} onChange={(value) => setEvening((current) => ({ ...current, tomorrow_note: value }))} />
            </div>
            <Button onClick={saveEvening} disabled={savingType !== null}><CheckCircle2 className="h-4 w-4" /> {savingType === "evening" ? "Saving..." : "Save evening review"}</Button>
          </div> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function morningFromSaved(saved: UserDailyCheckin) {
  return {
    sleep_hours: saved.sleep_hours === null ? "" : String(saved.sleep_hours),
    energy_level: saved.energy_level ?? "",
    soreness_level: saved.soreness_level ?? "",
    stress_level: saved.stress_level ?? "",
    motivation_level: saved.motivation_level ?? "",
    workout_readiness: saved.workout_readiness ?? "",
    today_main_goal: saved.today_main_goal ?? "",
    today_blocker: saved.today_blocker ?? ""
  };
}

function eveningFromSaved(saved: UserDailyCheckin) {
  return {
    workout_done: Boolean(saved.workout_done),
    protein_hit: Boolean(saved.protein_hit),
    calories_hit: Boolean(saved.calories_hit),
    water_hit: Boolean(saved.water_hit),
    steps_or_movement_done: Boolean(saved.steps_or_movement_done),
    meal_plan_followed: Boolean(saved.meal_plan_followed),
    main_blocker: saved.main_blocker ?? "",
    tomorrow_note: saved.tomorrow_note ?? ""
  };
}
