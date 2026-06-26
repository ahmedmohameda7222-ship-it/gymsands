"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getOnboarding, saveOnboarding } from "@/services/database/profile";
import {
  getDefaultAiPermissionConfig,
  saveAiPermissionSettings,
  type AiPermissionConfig,
  ALL_AI_PERMISSION_SECTIONS
} from "@/services/database/ai-permissions";
import { getWorkoutPlanDurationOptions, getWorkoutPlanWeekOptions } from "@/services/database/workout-plans";

const steps = ["Basic info", "Goals", "Training", "Schedule", "Nutrition", "AI Permissions", "Review"];
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

const defaultAnswers = {
  age_range: "25-34",
  gender: "Prefer not to say",
  height_cm: null as number | null,
  weight_kg: null as number | null,
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
};

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [answers, setAnswers] = useState(defaultAnswers);
  const [aiPermissions, setAiPermissions] = useState<AiPermissionConfig>(getDefaultAiPermissionConfig);
  const [weekOptions, setWeekOptions] = useState<number[]>([1, 2, 3, 4]);
  const [durationOptions, setDurationOptions] = useState<number[]>([20, 30, 45, 60, 75]);

  useEffect(() => {
    Promise.all([getWorkoutPlanWeekOptions(), getWorkoutPlanDurationOptions()]).then(([weekData, durationData]) => {
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

  useEffect(() => {
    if (!user?.id) return;
    const isEdit = searchParams.get("edit") === "true";

    getOnboarding(user.id)
      .then((saved) => {
        if (!saved) return;
        if (!isEdit) {
          router.replace("/dashboard");
          return;
        }
        const goals = saved.goals?.length ? saved.goals : saved.goal ? saved.goal.split(",").map((goal) => goal.trim()).filter(Boolean) : defaultAnswers.goals;
        setAnswers((current) => ({
          ...current,
          ...saved,
          goals: goals.length ? goals : defaultAnswers.goals,
          training_cycle: saved.training_cycle || current.training_cycle,
          available_equipment: saved.available_equipment?.length ? saved.available_equipment : current.available_equipment,
          nutrition_preferences: saved.nutrition_preferences?.length ? saved.nutrition_preferences : current.nutrition_preferences,
          allergies_limitations: saved.allergies_limitations ?? ""
        }));
      })
      .catch((error) => {
        console.warn("Plaivra could not load saved onboarding answers.", error);
        toast({ title: "Could not load saved setup", description: "You can still review and save this setup again." });
      });
  }, [toast, user?.id, router, searchParams]);

  async function finish() {
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in before saving profile setup." });
      return;
    }
    setIsSaving(true);
    try {
      await saveOnboarding({
        ...answers,
        goal: answers.goals.join(", "),
        user_id: user.id
      });
      await saveAiPermissionSettings(user.id, aiPermissions);
      toast({
        title: "Profile saved",
        description: "Create your plan in ChatGPT, then export it to Plaivra for tracking."
      });
      router.push("/my-workout/plans");
    } catch (error) {
      toast({ title: "Could not save profile", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  const progressValue = ((step + 1) / steps.length) * 100;

  return (
    <>
      <PageHeading title="Profile Setup" description="A clean setup flow for real imported plans. Plaivra uses this profile to store, schedule, edit, display, and track plans created outside the app." />

      <Card variant="glassStrong" className="mx-auto max-w-4xl overflow-hidden border-primary/15">
        <CardHeader className="space-y-4 border-b border-white/50 dark:border-white/10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Step {step + 1} of {steps.length}</p>
              <CardTitle className="mt-1 text-2xl tracking-tight">{steps[step]}</CardTitle>
            </div>
            <div className="glass-chip flex items-center gap-2 px-3 py-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              Premium setup
            </div>
          </div>
          <Progress value={progressValue} />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {steps.map((item, index) => (
              <button
                key={item}
                type="button"
                onClick={() => setStep(index)}
                className={`min-w-fit rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${index === step ? "border-primary bg-primary text-primary-foreground" : index < step ? "border-primary/30 bg-primary/10 text-primary" : "border-white/50 bg-white/35 text-muted-foreground dark:border-white/10 dark:bg-white/5"}`}
              >
                {index < step ? "✓ " : ""}{item}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-6 p-4 sm:p-6">
          {step === 0 ? (
            <section className="space-y-4">
              <StepIntro title="Basic body profile" detail="Use real values when known. Leave optional values empty if you are not sure yet." />
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Body stats</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChoiceGroup label="Age range" value={answers.age_range} values={["18-24", "25-34", "35-44", "45+"]} onChange={(age_range) => setAnswers((current) => ({ ...current, age_range }))} />
                  <ChoiceGroup label="Gender / sex" value={answers.gender} values={["Male", "Female", "Prefer not to say"]} onChange={(gender) => setAnswers((current) => ({ ...current, gender }))} />
                  <NumberField label="Height" value={answers.height_cm} suffix="cm" onChange={(height_cm) => setAnswers((current) => ({ ...current, height_cm }))} />
                  <NumberField label="Weight" value={answers.weight_kg} suffix="kg" onChange={(weight_kg) => setAnswers((current) => ({ ...current, weight_kg }))} />
                </div>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="space-y-4">
              <StepIntro title="Choose your goals" detail="Select one or more goals. These labels guide imported plans and dashboard priorities only." />
              <MultiChoice label="Goals" values={goalOptions} selected={answers.goals} onChange={(goals) => setAnswers((current) => ({ ...current, goals, goal: goals.join(", ") || "General wellness" }))} />
            </section>
          ) : null}

          {step === 2 ? (
            <section className="space-y-4">
              <StepIntro title="Training style" detail="Keep this focused on how you train. Schedule and session length are handled separately in the next step." />
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Experience & location</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChoiceGroup label="Training level" value={answers.training_level} values={["Beginner", "Intermediate", "Advanced"]} onChange={(training_level) => setAnswers((current) => ({ ...current, training_level }))} />
                  <ChoiceGroup label="Training place" value={answers.training_place} values={["Gym", "Home", "Both"]} onChange={(training_place) => setAnswers((current) => ({ ...current, training_place }))} />
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Training preferences</p>
                <div className="grid gap-4">
                  <div className="sm:col-span-2">
                    <ChoiceGroup label="Preferred split" value={answers.training_cycle} values={trainingCycles} onChange={(training_cycle) => setAnswers((current) => ({ ...current, training_cycle }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <MultiChoice label="Available equipment" values={["Full gym", "Bodyweight", "Dumbbells", "Barbell", "Machines", "Cables", "Kettle Bells", "EZ Bar", "Bands", "Medicine Ball", "Exercise Ball"]} selected={answers.available_equipment} onChange={(available_equipment) => setAnswers((current) => ({ ...current, available_equipment }))} />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="space-y-4">
              <StepIntro title="Schedule and duration" detail="This keeps imported workout plans realistic and prevents crowded sessions." />
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Weekly schedule</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChoiceGroup label="Training availability" value={`${answers.training_days_per_week} days/week`} values={["2 days/week", "3 days/week", "4 days/week", "5 days/week", "6 days/week"]} onChange={(value) => setAnswers((current) => ({ ...current, training_days_per_week: Number(value[0]) }))} />
                  <ChoiceGroup label="Plan duration" value={`${answers.desired_duration_weeks} weeks`} values={weekOptions.map((week) => `${week} weeks`)} onChange={(value) => setAnswers((current) => ({ ...current, desired_duration_weeks: Number(value.split(" ")[0]) }))} />
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Session length</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChoiceGroup label="Minimum session" value={`${answers.min_workout_duration_minutes} minutes`} values={durationOptions.map((duration) => `${duration} minutes`)} onChange={(value) => {
                    const min = Number(value.split(" ")[0]);
                    setAnswers((current) => ({
                      ...current,
                      min_workout_duration_minutes: min,
                      max_workout_duration_minutes: Math.max(min, current.max_workout_duration_minutes),
                      workout_duration_minutes: Math.round((min + Math.max(min, current.max_workout_duration_minutes)) / 2)
                    }));
                  }} />
                  <ChoiceGroup label="Maximum session" value={`${answers.max_workout_duration_minutes} minutes`} values={durationOptions.map((duration) => `${duration} minutes`)} onChange={(value) => {
                    const max = Number(value.split(" ")[0]);
                    setAnswers((current) => ({
                      ...current,
                      min_workout_duration_minutes: Math.min(current.min_workout_duration_minutes, max),
                      max_workout_duration_minutes: max,
                      workout_duration_minutes: Math.round((Math.min(current.min_workout_duration_minutes, max) + max) / 2)
                    }));
                  }} />
                </div>
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="space-y-4">
              <StepIntro title="Nutrition preferences" detail="Use clear preferences and limitations. Unknown macros should stay reviewable, not invented." />
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Diet preferences</p>
                <MultiChoice label="Nutrition preferences" values={["Normal", "High protein", "Vegetarian", "Halal", "Egyptian food preferred", "Middle Eastern food preferred"]} selected={answers.nutrition_preferences} onChange={(nutrition_preferences) => setAnswers((current) => ({ ...current, nutrition_preferences }))} />
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Limitations / allergies</p>
                <div className="space-y-2">
                  <Label htmlFor="limitations">Allergies and limitations</Label>
                  <Input id="limitations" value={answers.allergies_limitations} onChange={(event) => setAnswers((current) => ({ ...current, allergies_limitations: event.target.value }))} placeholder="Optional allergies, injuries, weak areas, or foods to avoid" />
                </div>
              </div>
            </section>
          ) : null}

          {step === 5 ? (
            <section className="space-y-4">
              <StepIntro title="AI Permissions" detail="Choose what access AI should have to your Plaivra account during setup." />
              <div className="space-y-4">
                <div className="space-y-3">
                  <ChoiceGroup
                    label="AI Access Mode"
                    value={aiPermissions.accessMode === "full" ? "Full AI Access" : "Custom AI Access"}
                    values={["Full AI Access", "Custom AI Access"]}
                    onChange={(value) =>
                      setAiPermissions((current) => ({
                        ...current,
                        accessMode: value === "Full AI Access" ? "full" : "custom"
                      }))
                    }
                  />
                </div>

                {aiPermissions.accessMode === "full" ? (
                  <div className="glass-card p-4 sm:p-5">
                    <p className="font-semibold text-foreground">Full AI Access</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      AI can read and manage your workouts, nutrition, meal plans, food logs, hydration, wellness, progress, and profile data.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Choose sections AI can access</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {ALL_AI_PERMISSION_SECTIONS.map((section) => (
                        <div key={section} className="solid-row p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold capitalize">{section.replace("_", " ")}</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setAiPermissions((current) => ({
                                    ...current,
                                    sections: {
                                      ...current.sections,
                                      [section]: {
                                        ...current.sections[section],
                                        read: !current.sections[section].read
                                      }
                                    }
                                  }))
                                }
                                className={`rounded-lg border px-2 py-1 text-xs font-medium transition ${
                                  aiPermissions.sections[section].read
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                Read
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setAiPermissions((current) => {
                                    const nextWrite = !current.sections[section].write;
                                    return {
                                      ...current,
                                      sections: {
                                        ...current.sections,
                                        [section]: {
                                          read: nextWrite ? true : current.sections[section].read,
                                          write: nextWrite
                                        }
                                      }
                                    };
                                  })
                                }
                                className={`rounded-lg border px-2 py-1 text-xs font-medium transition ${
                                  aiPermissions.sections[section].write
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                Write
                              </button>
                            </div>
                          </div>
                          {aiPermissions.sections[section].write ? (
                            <p className="text-xs text-muted-foreground">Write access includes read access for this section.</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="glass-card p-3 text-sm text-muted-foreground">
                  You can change or revoke AI access anytime from Settings.
                </div>
              </div>
            </section>
          ) : null}

          {step === 6 ? (
            <section className="space-y-4">
              <div className="glass-card p-4 sm:p-5">
                <h2 className="text-lg font-semibold">Review before saving</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Plaivra will not generate plans internally. Create workout and meal plans externally, then import them for storage, scheduling, editing, display, and tracking.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ReviewItem label="Goals" value={answers.goals.join(", ")} />
                <ReviewItem label="Training" value={`${answers.training_level} · ${answers.training_place} · ${answers.training_cycle}`} />
                <ReviewItem label="Schedule" value={`${answers.training_days_per_week} days/week · ${answers.min_workout_duration_minutes}-${answers.max_workout_duration_minutes} min · ${answers.desired_duration_weeks} weeks`} />
                <ReviewItem label="Equipment" value={answers.available_equipment.join(", ")} />
                <ReviewItem label="Nutrition" value={answers.nutrition_preferences.join(", ")} />
                <ReviewItem label="Limitations" value={answers.allergies_limitations || "None added"} />
                <ReviewItem label="AI Access" value={aiPermissions.accessMode === "full" ? "Full AI Access" : "Custom AI Access"} />
              </div>
            </section>
          ) : null}

          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border/70 bg-card/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-t sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} className="min-h-12">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))} className="min-h-12">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={finish} disabled={isSaving} className="min-h-12">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isSaving ? "Saving profile..." : "Save profile"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mobile bottom spacer for nav */}
      <div className="h-24 lg:hidden" />
    </>
  );
}

function StepIntro({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="glass-card p-4">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ChoiceGroup({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid gap-2">
        {values.map((item) => {
          const active = item === value;
          return (
            <button key={item} type="button" onClick={() => onChange(item)} className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-3 text-left text-sm font-medium transition ${active ? "border-primary bg-primary/10 text-primary shadow-soft" : "bg-card text-foreground hover:border-primary/40 hover:bg-muted/45"}`}>
              <span>{item}</span>
              {active ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MultiChoice({ label, values, selected, onChange }: { label: string; values: string[]; selected: string[]; onChange: (value: string[]) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {values.map((item) => {
          const active = selected.includes(item);
          return (
            <button key={item} type="button" onClick={() => onChange(active ? selected.filter((value) => value !== item) : [...selected, item])} className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-3 text-left text-sm font-medium transition ${active ? "border-primary bg-primary/10 text-primary shadow-soft" : "bg-card text-foreground hover:border-primary/40 hover:bg-muted/45"}`}>
              <span>{item}</span>
              {active ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NumberField({ label, value, suffix, onChange }: { label: string; value: number | null; suffix: string; onChange: (value: number | null) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input type="text" inputMode="decimal" value={value ?? ""} onChange={(event) => { const nextValue = event.target.value.trim(); onChange(nextValue ? Math.max(0, Number(nextValue) || 0) : null); }} placeholder={label} />
        <span className="flex h-11 items-center rounded-xl border bg-card px-3 text-sm font-semibold text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-foreground">{value}</p>
    </div>
  );
}
