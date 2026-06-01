"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getWorkoutTemplateDurationOptions, getWorkoutTemplateWeekOptions, saveOnboarding } from "@/services/database/repository";

const steps = ["Basic info", "Goals", "Training", "Nutrition", "Finish"];
const goalOptions = [
  "Lose fat",
  "Build muscle",
  "Improve strength",
  "Improve endurance",
  "General wellness",
  "Reduce stress",
  "Improve mobility",
  "Improve health",
  "Body recomposition"
];
const trainingCycles = [
  "Full Body",
  "Upper / Lower",
  "Push Pull Legs",
  "Bro Split",
  "Strength Split",
  "Hybrid",
  "Cardio + Strength",
  "Wellness / Mobility"
];

export default function OnboardingPage() {
  const { user, session } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [answers, setAnswers] = useState({
    age_range: "25-34",
    gender: "Prefer not to say",
    height_cm: 175,
    weight_kg: 75,
    goal: "General wellness",
    goals: ["General wellness"],
    training_cycle: "Full Body",
    training_level: "Beginner",
    training_place: "Gym",
    training_days_per_week: 3,
    workout_duration_minutes: 45,
    min_workout_duration_minutes: 30,
    max_workout_duration_minutes: 60,
    desired_duration_weeks: 4,
    available_equipment: ["Full gym"],
    nutrition_preferences: ["Egyptian food preferred"],
    allergies_limitations: ""
  });
  const [weekOptions, setWeekOptions] = useState<number[]>([1, 2, 3, 4]);
  const [durationOptions, setDurationOptions] = useState<number[]>([20, 30, 45, 60, 75]);

  useEffect(() => {
    Promise.all([getWorkoutTemplateWeekOptions(), getWorkoutTemplateDurationOptions()]).then(([weekData, durationData]) => {
      setWeekOptions(weekData.values);
      setDurationOptions(durationData.values);
      setAnswers((current) => {
        const minDuration = durationData.values.includes(current.min_workout_duration_minutes)
          ? current.min_workout_duration_minutes
          : durationData.min;
        const maxDuration = durationData.values.includes(current.max_workout_duration_minutes)
          ? current.max_workout_duration_minutes
          : durationData.max;
        return {
          ...current,
          desired_duration_weeks: weekData.values.includes(current.desired_duration_weeks)
            ? current.desired_duration_weeks
            : weekData.min,
          workout_duration_minutes: Math.round((minDuration + maxDuration) / 2),
          min_workout_duration_minutes: minDuration,
          max_workout_duration_minutes: Math.max(minDuration, maxDuration)
        };
      });
    });
  }, []);

  async function finish() {
    setIsSaving(true);
    try {
      if (!session?.access_token) {
        await saveOnboarding({
          ...answers,
          goal: answers.goals.join(", "),
          user_id: user?.id ?? "mock-user"
        });
        toast({ title: "Onboarding saved", description: "Your setup is ready." });
        router.push("/my-workout/generated");
        return;
      }

      const response = await fetch("/api/workout-plan/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ answers })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not generate your workout plan.");
      toast({
        title: "Generated plans ready",
        description: data.plans?.length ? `${data.plans.length} matched plans are ready to compare.` : "Your matched plans are ready."
      });
      router.push("/my-workout/generated");
    } catch (error) {
      toast({ title: "Could not finish onboarding", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <PageHeading title="FitLife Hub Onboarding" description="Build a profile so generated workout plans can be matched by goal, cycle, equipment, and schedule." />
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{steps[step]}</CardTitle>
            <span className="text-sm text-muted-foreground">Step {step + 1} of {steps.length}</span>
          </div>
          <Progress value={((step + 1) / steps.length) * 100} />
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <ChoiceGroup label="Age range" value={answers.age_range} values={["18-24", "25-34", "35-44", "45+"]} onChange={(age_range) => setAnswers((current) => ({ ...current, age_range }))} />
              <ChoiceGroup label="Gender / sex" value={answers.gender} values={["Male", "Female", "Prefer not to say"]} onChange={(gender) => setAnswers((current) => ({ ...current, gender }))} />
              <NumberField label="Height" value={answers.height_cm} suffix="cm" onChange={(height_cm) => setAnswers((current) => ({ ...current, height_cm }))} />
              <NumberField label="Weight" value={answers.weight_kg} suffix="kg" onChange={(weight_kg) => setAnswers((current) => ({ ...current, weight_kg }))} />
            </div>
          ) : null}
          {step === 1 ? (
            <MultiChoice
              label="Goals"
              values={goalOptions}
              selected={answers.goals}
              onChange={(goals) => setAnswers((current) => ({ ...current, goals, goal: goals.join(", ") || "General wellness" }))}
            />
          ) : null}
          {step === 2 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <ChoiceGroup label="Training level" value={answers.training_level} values={["Beginner", "Intermediate", "Advanced"]} onChange={(training_level) => setAnswers((current) => ({ ...current, training_level }))} />
              <ChoiceGroup label="Training place" value={answers.training_place} values={["Gym", "Home", "Both"]} onChange={(training_place) => setAnswers((current) => ({ ...current, training_place }))} />
              <ChoiceGroup label="Training cycle" value={answers.training_cycle} values={trainingCycles} onChange={(training_cycle) => setAnswers((current) => ({ ...current, training_cycle }))} />
              <ChoiceGroup label="Training availability" value={`${answers.training_days_per_week} days/week`} values={["2 days/week", "3 days/week", "4 days/week", "5 days/week", "6 days/week"]} onChange={(value) => setAnswers((current) => ({ ...current, training_days_per_week: Number(value[0]) }))} />
              <ChoiceGroup label="Minimum duration" value={`${answers.min_workout_duration_minutes} minutes`} values={durationOptions.map((duration) => `${duration} minutes`)} onChange={(value) => {
                const min = Number(value.split(" ")[0]);
                setAnswers((current) => ({
                  ...current,
                  min_workout_duration_minutes: min,
                  max_workout_duration_minutes: Math.max(min, current.max_workout_duration_minutes),
                  workout_duration_minutes: Math.round((min + Math.max(min, current.max_workout_duration_minutes)) / 2)
                }));
              }} />
              <ChoiceGroup label="Maximum duration" value={`${answers.max_workout_duration_minutes} minutes`} values={durationOptions.map((duration) => `${duration} minutes`)} onChange={(value) => {
                const max = Number(value.split(" ")[0]);
                setAnswers((current) => ({
                  ...current,
                  min_workout_duration_minutes: Math.min(current.min_workout_duration_minutes, max),
                  max_workout_duration_minutes: max,
                  workout_duration_minutes: Math.round((Math.min(current.min_workout_duration_minutes, max) + max) / 2)
                }));
              }} />
              <ChoiceGroup label="Plan duration" value={`${answers.desired_duration_weeks} weeks`} values={weekOptions.map((week) => `${week} weeks`)} onChange={(value) => setAnswers((current) => ({ ...current, desired_duration_weeks: Number(value.split(" ")[0]) }))} />
              <div className="sm:col-span-2">
                <MultiChoice
                  label="Available equipment"
                  values={["Full gym", "Bodyweight", "Dumbbells", "Barbell", "Machines", "Cables", "Kettle Bells", "EZ Bar", "Bands", "Medicine Ball", "Exercise Ball"]}
                  selected={answers.available_equipment}
                  onChange={(available_equipment) => setAnswers((current) => ({ ...current, available_equipment }))}
                />
              </div>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="space-y-4">
              <MultiChoice
                label="Nutrition preferences"
                values={["Normal", "High protein", "Vegetarian", "Halal", "Egyptian food preferred", "Middle Eastern food preferred"]}
                selected={answers.nutrition_preferences}
                onChange={(nutrition_preferences) => setAnswers((current) => ({ ...current, nutrition_preferences }))}
              />
              <div className="space-y-2">
                <Label htmlFor="limitations">Allergies and limitations</Label>
                <Input
                  id="limitations"
                  value={answers.allergies_limitations}
                  onChange={(event) => setAnswers((current) => ({ ...current, allergies_limitations: event.target.value }))}
                  placeholder="Optional allergies or limitations, e.g. knee pain or peanut allergy"
                />
              </div>
            </div>
          ) : null}
          {step === 4 ? (
            <div className="rounded-lg border bg-card p-5">
              <h2 className="text-lg font-semibold">Ready for your plan</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                FitLife Hub will return all matching plans from the workout template library, sorted by best match first.
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep((current) => current + 1)}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={finish} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isSaving ? "Creating plan..." : "Generate my plan"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function ChoiceGroup({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid gap-2">
        {values.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={`min-h-11 rounded-md border px-3 text-left text-sm font-medium transition ${item === value ? "border-primary bg-blue-50 text-primary" : "bg-white text-slate-700"}`}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiChoice({ label, values, selected, onChange }: { label: string; values: string[]; selected: string[]; onChange: (value: string[]) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {values.map((item) => {
          const active = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onChange(active ? selected.filter((value) => value !== item) : [...selected, item])}
              className={`min-h-11 rounded-md border px-3 text-sm font-medium transition ${active ? "border-primary bg-blue-50 text-primary" : "bg-white text-slate-700"}`}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NumberField({ label, value, suffix, onChange }: { label: string; value: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
          placeholder={label}
        />
        <span className="flex h-11 items-center rounded-md border bg-card px-3 text-sm font-semibold text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function SliderField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-sm font-semibold text-primary">{value} {suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-[#d6b76a]"
      />
    </div>
  );
}
