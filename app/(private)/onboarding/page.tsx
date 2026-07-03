"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { WheelPicker } from "@/components/ui/wheel-picker";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getOnboarding, saveOnboarding, updateProfile } from "@/services/database/profile";
import {
  getDefaultAiPermissionConfig,
  getAiPermissionSettings,
  saveAiPermissionSettings,
  type AiPermissionConfig,
  ALL_AI_PERMISSION_SECTIONS
} from "@/services/database/ai-permissions";
import { NutritionPreferenceCard } from "@/components/profile/execution-profiles";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";

const steps = ["Basic info", "Goals", "Training", "Schedule", "Food preferences", "Coaching context", "AI Permissions", "Review"];
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
  "Wellness / Mobility",
  "I don't know"
];
const ageOptions = Array.from({ length: 88 }, (_, index) => index + 13);
const heightOptions = Array.from({ length: 131 }, (_, index) => index + 120);
const weightOptions = Array.from({ length: 216 }, (_, index) => index + 35);
const dayOptions = Array.from({ length: 7 }, (_, index) => index + 1);
const weekOptions = Array.from({ length: 52 }, (_, index) => index + 1);
const minuteOptions = Array.from({ length: 120 }, (_, index) => index + 1);

function ageToRange(age: number | null): string {
  if (!age) return "Prefer not to say";
  if (age < 18) return "Under 18";
  if (age < 25) return "18-24";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  return "45+";
}

const defaultAnswers = {
  age: null as number | null,
  gender: "",
  height_cm: null as number | null,
  weight_kg: null as number | null,
  goal_weight_kg: null as number | null,
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
  allergies_limitations: "",
  injuries_limitations: "",
  training_preferences: "",
  food_preferences: "",
  lifestyle_notes: "",
  workout_constraints: "",
  coaching_notes: ""
};

export default function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { celebrate } = useSuccessFeedback();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [answers, setAnswers] = useState(defaultAnswers);
  const [aiPermissions, setAiPermissions] = useState<AiPermissionConfig>(getDefaultAiPermissionConfig);
  useEffect(() => {
    if (!user?.id) return;
    const isEdit = searchParams.get("edit") === "true";

    Promise.all([getOnboarding(user.id), getAiPermissionSettings(user.id)])
      .then(([saved, permissions]) => {
        if (permissions) setAiPermissions(permissions);
        if (!saved) return;
        if (!isEdit) {
          router.replace("/dashboard");
          return;
        }
        const goals = saved.goals?.length ? saved.goals : saved.goal ? saved.goal.split(",").map((goal) => goal.trim()).filter(Boolean) : defaultAnswers.goals;
        setAnswers((current) => ({
          ...current,
          ...saved,
          goal_weight_kg: saved.goal_weight_kg ?? profile?.target_weight_kg ?? null,
          goals: goals.length ? goals : defaultAnswers.goals,
          training_cycle: saved.training_cycle || current.training_cycle,
          available_equipment: saved.available_equipment?.length ? saved.available_equipment : current.available_equipment,
          nutrition_preferences: saved.nutrition_preferences?.length ? saved.nutrition_preferences : current.nutrition_preferences,
          allergies_limitations: saved.allergies_limitations ?? "",
          injuries_limitations: saved.injuries_limitations ?? "",
          training_preferences: saved.training_preferences ?? "",
          food_preferences: saved.food_preferences ?? "",
          lifestyle_notes: saved.lifestyle_notes ?? "",
          workout_constraints: saved.workout_constraints ?? "",
          coaching_notes: saved.coaching_notes ?? ""
        }));
      })
      .catch((error) => {
        console.warn("Plaivra could not load saved onboarding answers.", error);
        toast({ title: "Could not load saved setup", description: "You can still review and save this setup again." });
      });
  }, [profile?.target_weight_kg, toast, user?.id, router, searchParams]);

  async function finish() {
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in before saving profile setup." });
      return;
    }
    setIsSaving(true);
    try {
      await Promise.all([
        saveOnboarding({
          ...answers,
          age_range: ageToRange(answers.age),
          goal: answers.goals.join(", "),
          user_id: user.id
        }),
        updateProfile(user.id, { targetWeightKg: answers.goal_weight_kg, bodyGoal: answers.goals.join(", ") }),
        saveAiPermissionSettings(user.id, aiPermissions)
      ]);
      await refreshProfile();
      toast({
        title: "Profile saved",
        description: "Create your plan in ChatGPT, then export it to Plaivra for tracking."
      });
      celebrate("Profile setup saved");
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
      <PageHeading title="Profile Setup" />

      <Card variant="glassStrong" className="mx-auto max-w-4xl overflow-hidden border-primary/15">
        <CardHeader className="space-y-4 border-b border-white/50 dark:border-white/10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Step {step + 1} of {steps.length}</p>
              <CardTitle className="mt-1 text-2xl tracking-tight">{steps[step]}</CardTitle>
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
              <StepIntro title="Basic body profile" />
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Body stats</p>
                <div className="grid gap-4 md:grid-cols-3">
                  <WheelPicker label="Age" value={answers.age} values={ageOptions} suffix="years" onChange={(age) => setAnswers((current) => ({ ...current, age }))} />
                  <WheelPicker label="Height" value={answers.height_cm} values={heightOptions} suffix="cm" onChange={(height_cm) => setAnswers((current) => ({ ...current, height_cm }))} />
                  <WheelPicker label="Weight" value={answers.weight_kg} values={weightOptions} suffix="kg" onChange={(weight_kg) => setAnswers((current) => ({ ...current, weight_kg }))} />
                </div>
                <div className="pt-2">
                  <ChoiceGroup label="Gender / sex" value={answers.gender} values={["Male", "Female", "Prefer not to say"]} onChange={(gender) => setAnswers((current) => ({ ...current, gender }))} />
                </div>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="space-y-4">
              <StepIntro title="Choose your goals" />
              <MultiChoice label="Goals" values={goalOptions} selected={answers.goals} onChange={(goals) => setAnswers((current) => ({ ...current, goals, goal: goals.join(", ") || "General wellness" }))} />
              <div className="max-w-sm">
                <WheelPicker label="Goal weight" value={answers.goal_weight_kg} values={weightOptions} suffix="kg" onChange={(goal_weight_kg) => setAnswers((current) => ({ ...current, goal_weight_kg }))} />
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="space-y-4">
              <StepIntro title="Training style" />
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
                    <MultiChoice label="Available equipment" values={["Full gym", "Bodyweight", "Dumbbells", "Barbell", "Cables", "Kettle Bells", "EZ Bar", "Bands", "Medicine Ball", "Exercise Ball"]} selected={answers.available_equipment} onChange={(available_equipment) => setAnswers((current) => ({ ...current, available_equipment }))} />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="space-y-4">
              <StepIntro title="Schedule and duration" />
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Weekly schedule</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <WheelPicker label="Training availability" value={answers.training_days_per_week} values={dayOptions} suffix="days/week" onChange={(training_days_per_week) => setAnswers((current) => ({ ...current, training_days_per_week }))} />
                  <WheelPicker label="Plan duration" value={answers.desired_duration_weeks} values={weekOptions} suffix="weeks" onChange={(desired_duration_weeks) => setAnswers((current) => ({ ...current, desired_duration_weeks }))} />
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Session length</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <WheelPicker label="Minimum session" value={answers.min_workout_duration_minutes} values={minuteOptions} suffix="minutes" onChange={(min) => {
                    setAnswers((current) => ({
                      ...current,
                      min_workout_duration_minutes: min,
                      max_workout_duration_minutes: Math.max(min, current.max_workout_duration_minutes),
                      workout_duration_minutes: Math.round((min + Math.max(min, current.max_workout_duration_minutes)) / 2)
                    }));
                  }} />
                  <WheelPicker label="Maximum session" value={answers.max_workout_duration_minutes} values={minuteOptions} suffix="minutes" onChange={(max) => {
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
              <StepIntro title="Food preferences" detail="Use the same preference workspace as Meal Plan so your saved tastes, allergies, budget, and kitchen constraints stay consistent." />
              <NutritionPreferenceCard />
            </section>
          ) : null}

          {step === 5 ? (
            <section className="space-y-4">
              <StepIntro title="Coaching context" detail="Tell ChatGPT what makes a plan practical for your life. Everything here is optional and stays under your approval." />
              <div className="grid gap-4 sm:grid-cols-2">
                <ContextField label="Injuries or limitations" value={answers.injuries_limitations} onChange={(injuries_limitations) => setAnswers((current) => ({ ...current, injuries_limitations }))} placeholder="Movements, pain, or limitations to consider" />
                <ContextField label="Training preferences" value={answers.training_preferences} onChange={(training_preferences) => setAnswers((current) => ({ ...current, training_preferences }))} placeholder="Styles, exercises, or pacing you enjoy" />
                <ContextField label="Food preferences" value={answers.food_preferences} onChange={(food_preferences) => setAnswers((current) => ({ ...current, food_preferences }))} placeholder="Foods, cuisines, or routines that work for you" />
                <ContextField label="Lifestyle notes" value={answers.lifestyle_notes} onChange={(lifestyle_notes) => setAnswers((current) => ({ ...current, lifestyle_notes }))} placeholder="Work, family, sleep, travel, or schedule context" />
                <ContextField label="Workout constraints" value={answers.workout_constraints} onChange={(workout_constraints) => setAnswers((current) => ({ ...current, workout_constraints }))} placeholder="Time, space, equipment, or recovery limits" />
                <ContextField label="Personal coaching notes" value={answers.coaching_notes} onChange={(coaching_notes) => setAnswers((current) => ({ ...current, coaching_notes }))} placeholder="Anything ChatGPT should consider when helping" />
              </div>
            </section>
          ) : null}

          {step === 6 ? (
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

          {step === 7 ? (
            <section className="space-y-4">
              <div className="glass-card p-4 sm:p-5">
                <h2 className="text-lg font-semibold">Review before saving</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Plaivra will not generate plans internally. Create workout and meal plans externally, then import them for storage, scheduling, editing, display, and tracking.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ReviewItem label="Goals" value={answers.goals.join(", ")} />
                <ReviewItem label="Goal weight" value={answers.goal_weight_kg ? `${answers.goal_weight_kg} kg` : "Not added"} />
                <ReviewItem label="Training" value={`${answers.training_level} · ${answers.training_place} · ${answers.training_cycle}`} />
                <ReviewItem label="Schedule" value={`${answers.training_days_per_week} days/week · ${answers.min_workout_duration_minutes}-${answers.max_workout_duration_minutes} min · ${answers.desired_duration_weeks} weeks`} />
                <ReviewItem label="Equipment" value={answers.available_equipment.join(", ")} />
                <ReviewItem label="Nutrition" value={answers.nutrition_preferences.join(", ")} />
                <ReviewItem label="Limitations" value={answers.allergies_limitations || "None added"} />
                <ReviewItem label="Coaching context" value={answers.coaching_notes || answers.lifestyle_notes || "None added"} />
                <ReviewItem label="AI Access" value={aiPermissions.accessMode === "full" ? "Full AI Access" : "Custom AI Access"} />
              </div>
            </section>
          ) : null}

          <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border/70 bg-card/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:static sm:mx-0 sm:border-t sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none">
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

      <div className="h-[calc(env(safe-area-inset-bottom)+1rem)]" aria-hidden="true" />
    </>
  );
}

function StepIntro({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="glass-card p-4">
      <p className="font-semibold text-foreground">{title}</p>
      {detail ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p> : null}
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

function ContextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-28 w-full resize-y rounded-[14px] border border-input bg-card px-3 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
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
