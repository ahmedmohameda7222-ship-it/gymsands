"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
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
const AGE_MIN = 13;
const AGE_MAX = 100;
const HEIGHT_MIN = 120;
const HEIGHT_MAX = 250;
const WEIGHT_MIN = 35;
const WEIGHT_MAX = 250;
const dayOptions = Array.from({ length: 7 }, (_, index) => index + 1);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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

  function updateTrainingDays(training_days_per_week: number) {
    setAnswers((current) => ({ ...current, training_days_per_week: clamp(training_days_per_week, 1, 7) }));
  }

  function updatePlanDuration(desired_duration_weeks: number) {
    setAnswers((current) => ({ ...current, desired_duration_weeks: clamp(desired_duration_weeks, 1, 52) }));
  }

  function updateMinimumSession(min: number) {
    const safeMin = clamp(min, 1, 120);
    setAnswers((current) => {
      const nextMax = Math.max(safeMin, current.max_workout_duration_minutes);
      return {
        ...current,
        min_workout_duration_minutes: safeMin,
        max_workout_duration_minutes: nextMax,
        workout_duration_minutes: Math.round((safeMin + nextMax) / 2)
      };
    });
  }

  function updateMaximumSession(max: number) {
    const safeMax = clamp(max, 1, 120);
    setAnswers((current) => {
      const nextMin = Math.min(current.min_workout_duration_minutes, safeMax);
      return {
        ...current,
        min_workout_duration_minutes: nextMin,
        max_workout_duration_minutes: safeMax,
        workout_duration_minutes: Math.round((nextMin + safeMax) / 2)
      };
    });
  }

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
              <Button
                key={item}
                type="button"
                variant={index === step ? "default" : "outline"}
                onClick={() => setStep(index)}
                className={cn(
                  "min-h-11 min-w-fit shrink-0 rounded-full px-3 text-xs shadow-none",
                  index < step && index !== step && "border-primary/35 bg-primary/10 text-primary hover:bg-primary/15",
                  index > step && "border-white/60 bg-white/35 text-muted-foreground hover:border-primary/35 hover:text-primary dark:border-white/10 dark:bg-white/5"
                )}
              >
                {index < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                {item}
              </Button>
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
                  <NumericStatInput label="Age" value={answers.age} unit="years" min={AGE_MIN} max={AGE_MAX} onChange={(age) => setAnswers((current) => ({ ...current, age }))} />
                  <NumericStatInput label="Height" value={answers.height_cm} unit="cm" min={HEIGHT_MIN} max={HEIGHT_MAX} onChange={(height_cm) => setAnswers((current) => ({ ...current, height_cm }))} />
                  <NumericStatInput label="Weight" value={answers.weight_kg} unit="kg" min={WEIGHT_MIN} max={WEIGHT_MAX} onChange={(weight_kg) => setAnswers((current) => ({ ...current, weight_kg }))} />
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
                <NumericStatInput label="Goal weight" value={answers.goal_weight_kg} unit="kg" min={WEIGHT_MIN} max={WEIGHT_MAX} onChange={(goal_weight_kg) => setAnswers((current) => ({ ...current, goal_weight_kg }))} />
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
              <div className="space-y-3 rounded-[18px] border border-border/80 bg-card p-3 sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Weekly schedule</p>
                <div className="grid gap-3">
                  <ScheduleDayGrid label="Training availability" value={answers.training_days_per_week} values={dayOptions} unit="days/week" onChange={updateTrainingDays} />
                  <ScheduleStepper label="Plan duration" value={answers.desired_duration_weeks} unit="weeks" min={1} max={52} step={1} onChange={updatePlanDuration} />
                </div>
              </div>
              <div className="space-y-3 rounded-[18px] border border-border/80 bg-card p-3 sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Session length</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ScheduleStepper label="Minimum session" value={answers.min_workout_duration_minutes} unit="minutes" min={1} max={120} step={5} onChange={updateMinimumSession} />
                  <ScheduleStepper label="Maximum session" value={answers.max_workout_duration_minutes} unit="minutes" min={1} max={120} step={5} onChange={updateMaximumSession} />
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
                        <div key={section} className="solid-row space-y-3 p-4">
                          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                            <p className="text-sm font-semibold capitalize">{section.replace("_", " ")}</p>
                            <div className="grid grid-cols-2 gap-1 rounded-[14px] border border-border/80 bg-muted/50 p-1">
                              <PermissionToggle
                                active={aiPermissions.sections[section].read}
                                label="Read"
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
                              />
                              <PermissionToggle
                                active={aiPermissions.sections[section].write}
                                label="Write"
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
                              />
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
    <div className="rounded-[18px] border border-primary/10 bg-primary/5 p-4">
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
            <OnboardingChoiceButton key={item} active={active} onClick={() => onChange(item)}>
              {item}
            </OnboardingChoiceButton>
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
            <OnboardingChoiceButton key={item} active={active} onClick={() => onChange(active ? selected.filter((value) => value !== item) : [...selected, item])}>
              {item}
            </OnboardingChoiceButton>
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

function OnboardingChoiceButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-12 items-center justify-between gap-3 rounded-[18px] border px-3.5 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
        active
          ? "border-primary/45 bg-primary/10 text-primary shadow-soft"
          : "border-border/80 bg-card text-foreground hover:border-primary/40 hover:bg-muted/45"
      )}
    >
      <span className="min-w-0">{children}</span>
      {active ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
    </button>
  );
}

function PermissionToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-[10px] px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
        active ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function NumericStatInput({
  label,
  value,
  unit,
  min,
  max,
  onChange
}: {
  label: string;
  value: number | null;
  unit: string;
  min: number;
  max: number;
  onChange: (value: number | null) => void;
}) {
  const [draftValue, setDraftValue] = useState(value === null ? "" : String(value));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) setDraftValue(value === null ? "" : String(value));
  }, [isEditing, value]);

  function commitDraft() {
    const trimmed = draftValue.trim();
    const parsed = Number(trimmed);

    if (!trimmed || !Number.isFinite(parsed)) {
      setDraftValue(value === null ? "" : String(value));
      setIsEditing(false);
      return;
    }

    const nextValue = clamp(Math.round(parsed), min, max);
    setDraftValue(String(nextValue));
    setIsEditing(false);
    onChange(nextValue);
  }

  return (
    <div className="rounded-[18px] border border-border/80 bg-card p-3 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-xs font-semibold text-muted-foreground">{min}-{max} {unit}</span>
      </div>
      <div className="mt-3 flex min-h-12 items-center overflow-hidden rounded-[14px] border border-border/70 bg-muted/25 transition-colors focus-within:border-primary/20 focus-within:bg-primary/5 focus-within:ring-2 focus-within:ring-primary/10">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={label}
          value={draftValue}
          placeholder="Not set"
          onFocus={() => setIsEditing(true)}
          onChange={(event) => setDraftValue(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-12 min-h-12 min-w-0 flex-1 appearance-none border-0 !border-transparent bg-transparent px-3 text-center text-xl font-bold text-foreground !outline-none !ring-0 shadow-none placeholder:text-sm placeholder:font-semibold placeholder:text-muted-foreground [appearance:textfield] focus:!border-transparent focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="pointer-events-none flex h-full items-center pl-1 pr-3 text-sm font-semibold text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function ScheduleDayGrid({
  label,
  value,
  values,
  unit,
  onChange
}: {
  label: string;
  value: number;
  values: number[];
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-sm font-semibold text-primary">{value} {unit}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {values.map((item) => {
          const active = item === value;
          return (
            <Button
              key={item}
              type="button"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              aria-label={`${item} ${unit}`}
              onClick={() => onChange(item)}
              className={cn("min-h-11 rounded-[14px] px-2 text-sm shadow-none", active ? "" : "bg-card")}
            >
              {item}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleStepper({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const [draftValue, setDraftValue] = useState(String(value));
  const [isEditing, setIsEditing] = useState(false);
  const atMin = value <= min;
  const atMax = value >= max;

  useEffect(() => {
    if (!isEditing) setDraftValue(String(value));
  }, [isEditing, value]);

  function commitDraft() {
    const parsed = Number(draftValue);
    if (!draftValue.trim() || !Number.isFinite(parsed)) {
      setDraftValue(String(value));
      setIsEditing(false);
      return;
    }

    const nextValue = clamp(Math.round(parsed), min, max);
    setDraftValue(String(nextValue));
    setIsEditing(false);
    onChange(nextValue);
  }

  function nudge(nextValue: number) {
    const clampedValue = clamp(nextValue, min, max);
    setDraftValue(String(clampedValue));
    setIsEditing(false);
    onChange(clampedValue);
  }

  return (
    <div className="rounded-[18px] border border-border/80 bg-muted/25 p-3">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-sm font-semibold text-primary">{isEditing && draftValue ? draftValue : value} {unit}</span>
      </div>
      <div className="mt-3 grid grid-cols-[44px_1fr_44px] items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={atMin}
          aria-label={`Decrease ${label}`}
          onClick={() => nudge(value - step)}
          className="h-11 min-h-11 w-11 rounded-[14px] shadow-none"
        >
          -
        </Button>
        <div className="group relative flex min-h-11 items-center overflow-hidden rounded-[14px] border border-border/60 bg-card/95 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition focus-within:border-primary/20 focus-within:bg-primary/5 focus-within:ring-2 focus-within:ring-primary/10">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={label}
            value={draftValue}
            onFocus={() => setIsEditing(true)}
            onChange={(event) => setDraftValue(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="h-11 min-h-11 min-w-0 flex-1 appearance-none border-0 !border-transparent bg-transparent px-3 text-center text-lg font-bold text-foreground !outline-none !ring-0 shadow-none [appearance:textfield] focus:!border-transparent focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="pointer-events-none flex h-full items-center pl-1 pr-3 text-xs font-semibold text-muted-foreground">{unit}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={atMax}
          aria-label={`Increase ${label}`}
          onClick={() => nudge(value + step)}
          className="h-11 min-h-11 w-11 rounded-[14px] shadow-none"
        >
          +
        </Button>
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