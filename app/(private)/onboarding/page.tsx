"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CardGridSkeleton } from "@/components/ui/state-views";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { getOnboarding, saveOnboarding, updateProfile } from "@/services/database/profile";
import {
  getAiPermissionSettings,
  saveAiPermissionSettings,
  type AiPermissionConfig
} from "@/services/database/ai-permissions";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";
import { MAXIMUM_PROFILE_AGE, MINIMUM_LAUNCH_AGE, launchAgeSchema } from "@/lib/auth/eligibility";
import { getFitnessConstraints, upsertFitnessConstraints, type FitnessConstraintInput } from "@/services/database/execution-layer";
import { TagInput } from "@/components/ui/tag-input";
import {
  FIRST_USEFUL_JOBS,
  ONBOARDING_STEPS,
  clampOnboardingStep,
  permissionsForFirstJob,
  type FirstUsefulJob
} from "@/lib/onboarding/progressive-setup";

const steps = ONBOARDING_STEPS;
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
const HEIGHT_MIN = 120;
const HEIGHT_MAX = 250;
const WEIGHT_MIN = 35;
const WEIGHT_MAX = 250;
const dayOptions = Array.from({ length: 7 }, (_, index) => index + 1);
const weightRelatedGoals = new Set(["Lose fat", "Build muscle", "Body recomposition", "Improve health"]);
const emptyConstraints: FitnessConstraintInput = {
  injury_or_limitation_labels: [],
  areas_to_protect: [],
  movement_restrictions: null,
  nutrition_restrictions: null,
  legacy_context_notes: null
};

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
  const [isLoadingSavedSetup, setIsLoadingSavedSetup] = useState(true);
  const [hadSavedTargetWeight, setHadSavedTargetWeight] = useState(false);
  const [existingCompletedAt, setExistingCompletedAt] = useState<string | null>(null);
  const [answers, setAnswers] = useState(defaultAnswers);
  const [firstUsefulJob, setFirstUsefulJob] = useState<FirstUsefulJob>("training_plan");
  const [constraints, setConstraints] = useState<FitnessConstraintInput>(emptyConstraints);
  const [aiPermissions, setAiPermissions] = useState<AiPermissionConfig>(() => permissionsForFirstJob("training_plan"));
  useEffect(() => {
    if (!user?.id) {
      setIsLoadingSavedSetup(false);
      return;
    }
    const isEdit = searchParams.get("edit") === "true";

    setIsLoadingSavedSetup(true);
    Promise.all([getOnboarding(user.id), getAiPermissionSettings(user.id), getFitnessConstraints(user.id)])
      .then(([saved, permissions, savedConstraints]) => {
        if (permissions) setAiPermissions(permissions);
        if (savedConstraints) setConstraints(savedConstraints);
        if (!saved) return;
        if (!isEdit && saved.completed_at) {
          router.replace("/dashboard");
          return;
        }
        const savedJob = saved.first_useful_job ?? "training_plan";
        setExistingCompletedAt(saved.completed_at ?? null);
        setFirstUsefulJob(savedJob);
        if (!permissions) setAiPermissions(permissionsForFirstJob(savedJob));
        setStep(clampOnboardingStep(saved.setup_stage));
        const goals = saved.goals?.length ? saved.goals : saved.goal ? saved.goal.split(",").map((goal) => goal.trim()).filter(Boolean) : defaultAnswers.goals;
        const existingTargetWeight = saved.goal_weight_kg ?? profile?.target_weight_kg ?? null;
        setHadSavedTargetWeight(existingTargetWeight !== null);
        setAnswers((current) => ({
          ...current,
          ...saved,
          goal_weight_kg: existingTargetWeight,
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
      })
      .finally(() => setIsLoadingSavedSetup(false));
  }, [profile?.target_weight_kg, toast, user?.id, router, searchParams]);

  function onboardingPayload(completedAt: string | null, setupStage: number) {
    const age = launchAgeSchema.safeParse(answers.age);
    if (!age.success) throw new Error(age.message);
    return {
      ...answers,
      age: age.data,
      age_range: ageToRange(age.data),
      goal: answers.goals.join(", "),
      user_id: user!.id,
      setup_stage: setupStage,
      first_useful_job: firstUsefulJob,
      completed_at: completedAt
    };
  }

  async function saveProgress(nextStep: number) {
    if (!user?.id) return;
    const age = launchAgeSchema.safeParse(answers.age);
    if (!age.success) {
      toast({ title: "Age eligibility required", description: age.message });
      setStep(0);
      return;
    }
    setIsSaving(true);
    try {
      await Promise.all([
        saveOnboarding(onboardingPayload(existingCompletedAt, nextStep)),
        upsertFitnessConstraints(user.id, constraints)
      ]);
      setStep(nextStep);
    } catch (error) {
      toast({ title: "Could not save progress", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  async function finish() {
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in before saving profile setup." });
      return;
    }
    const age = launchAgeSchema.safeParse(answers.age);
    if (!age.success) {
      toast({ title: "Age eligibility required", description: age.message });
      setStep(0);
      return;
    }
    setIsSaving(true);
    try {
      await Promise.all([
        saveOnboarding(onboardingPayload(new Date().toISOString(), steps.length - 1)),
        updateProfile(user.id, { targetWeightKg: answers.goal_weight_kg, bodyGoal: answers.goals.join(", ") }),
        upsertFitnessConstraints(user.id, constraints),
        saveAiPermissionSettings(user.id, aiPermissions)
      ]);
      await refreshProfile();
      setExistingCompletedAt(new Date().toISOString());
      toast({
        title: "Profile saved",
        description: "Connect Plaivra to ChatGPT with limited permissions when you are ready to create your first plan."
      });
      celebrate("Profile setup saved");
      router.push(FIRST_USEFUL_JOBS[firstUsefulJob].destination);
    } catch (error) {
      toast({ title: "Could not save profile", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  const progressValue = ((step + 1) / steps.length) * 100;
  const hasWeightRelatedGoal = answers.goals.some((goal) => weightRelatedGoals.has(goal));
  const shouldShowTargetWeight = hasWeightRelatedGoal || hadSavedTargetWeight;

  function updateGoals(goals: string[]) {
    const nextGoals = goals.length ? goals : ["General wellness"];
    const nextHasWeightGoal = nextGoals.some((goal) => weightRelatedGoals.has(goal));
    setAnswers((current) => ({
      ...current,
      goals: nextGoals,
      goal: nextGoals.join(", "),
      goal_weight_kg: nextHasWeightGoal || hadSavedTargetWeight ? current.goal_weight_kg : null
    }));
  }

  function updateTrainingDays(training_days_per_week: number) {
    setAnswers((current) => ({ ...current, training_days_per_week: clamp(training_days_per_week, 1, 7) }));
  }

  return (
    <>
      <PageHeading title="Profile Setup" />

      {isLoadingSavedSetup ? <CardGridSkeleton count={2} rows={3} className="mx-auto max-w-4xl" /> : null}

      {!isLoadingSavedSetup ? <Card variant="glassStrong" className="mx-auto max-w-4xl overflow-hidden border-primary/15">
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
                onClick={() => index <= step ? setStep(index) : void saveProgress(index)}
                className={cn(
                  "min-h-12 min-w-fit shrink-0 rounded-full px-3 text-xs shadow-none",
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
              <StepIntro title="Essential account context" detail={`Plaivra's initial EU launch is for people aged ${MINIMUM_LAUNCH_AGE} and over. Height, weight, and gender are optional and can be edited later.`} />
              <div className="grid gap-4 md:grid-cols-3">
                <NumericStatInput label="Age" value={answers.age} unit="years" min={MINIMUM_LAUNCH_AGE} max={MAXIMUM_PROFILE_AGE} onChange={(age) => setAnswers((current) => ({ ...current, age }))} />
                <NumericStatInput label="Height (optional)" value={answers.height_cm} unit="cm" min={HEIGHT_MIN} max={HEIGHT_MAX} onChange={(height_cm) => setAnswers((current) => ({ ...current, height_cm }))} />
                <NumericStatInput label="Weight (optional)" value={answers.weight_kg} unit="kg" min={WEIGHT_MIN} max={WEIGHT_MAX} onChange={(weight_kg) => setAnswers((current) => ({ ...current, weight_kg }))} />
              </div>
              <ChoiceGroup label="Gender / sex (optional)" value={answers.gender || "Prefer not to say"} values={["Male", "Female", "Prefer not to say"]} onChange={(gender) => setAnswers((current) => ({ ...current, gender }))} />
            </section>
          ) : null}

          {step === 1 ? (
            <section className="space-y-5">
              <StepIntro title="Goal and available schedule" detail="This is enough context to produce a useful first result. Training style and deeper preferences can wait." />
              <MultiChoice label="Goals" values={goalOptions} selected={answers.goals} onChange={updateGoals} />
              {shouldShowTargetWeight ? (
                hasWeightRelatedGoal ? (
                  <div className="max-w-sm">
                    <NumericStatInput label="Target weight (optional)" value={answers.goal_weight_kg} unit="kg" min={WEIGHT_MIN} max={WEIGHT_MAX} onChange={(goal_weight_kg) => setAnswers((current) => ({ ...current, goal_weight_kg }))} />
                  </div>
                ) : (
                  <div className="max-w-xl rounded-[18px] border border-border/80 bg-card p-4">
                    <p className="font-semibold text-foreground">Existing target weight kept</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">Your selected goals no longer require a target weight, but Plaivra will not delete the saved value unless you clear it.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="text-sm font-semibold">{answers.goal_weight_kg ? `${answers.goal_weight_kg} kg` : "No target weight value"}</span>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-12"
                        onClick={() => {
                          setHadSavedTargetWeight(false);
                          setAnswers((current) => ({ ...current, goal_weight_kg: null }));
                        }}
                      >
                        Clear target weight
                      </Button>
                    </div>
                  </div>
                )
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <ScheduleDayGrid label="Available training days" value={answers.training_days_per_week} values={dayOptions} unit="days/week" onChange={updateTrainingDays} />
                <ScheduleStepper label="Typical session" value={answers.workout_duration_minutes} unit="minutes" min={10} max={120} step={5} onChange={(workout_duration_minutes) => setAnswers((current) => ({ ...current, workout_duration_minutes, min_workout_duration_minutes: workout_duration_minutes, max_workout_duration_minutes: workout_duration_minutes }))} />
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="space-y-5">
              <StepIntro title="Optional functional constraints" detail="Use your own words to describe what planning should respect. Plaivra stores these as user-provided context, not a diagnosis, risk score, or treatment instruction." />
              <div className="grid gap-4 sm:grid-cols-2">
                <TagInput id="constraint-labels" label="Limitation labels" value={constraints.injury_or_limitation_labels} onChange={(injury_or_limitation_labels) => setConstraints((current) => ({ ...current, injury_or_limitation_labels }))} placeholder="For example: sensitive shoulder" />
                <TagInput id="areas-to-protect" label="Areas to protect" value={constraints.areas_to_protect} onChange={(areas_to_protect) => setConstraints((current) => ({ ...current, areas_to_protect }))} placeholder="For example: right shoulder" />
                <ContextField label="Movements or activities to avoid" value={constraints.movement_restrictions ?? ""} onChange={(movement_restrictions) => setConstraints((current) => ({ ...current, movement_restrictions: movement_restrictions || null }))} placeholder="Only practical movement constraints" />
                <ContextField label="Food-planning constraints" value={constraints.nutrition_restrictions ?? ""} onChange={(nutrition_restrictions) => setConstraints((current) => ({ ...current, nutrition_restrictions: nutrition_restrictions || null }))} placeholder="Only practical meal-planning constraints" />
              </div>
              {constraints.legacy_context_notes ? (
                <div className="rounded-[18px] border border-border/80 bg-card p-4">
                  <p className="font-semibold">Earlier notes retained</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{constraints.legacy_context_notes}</p>
                  <Button type="button" variant="outline" className="mt-3 min-h-12" onClick={() => setConstraints((current) => ({ ...current, legacy_context_notes: null }))}>Clear retained notes</Button>
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">Skip this step if there is nothing relevant to add.</p>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="space-y-4">
              <StepIntro title="Choose your first useful outcome" detail="Plaivra will take you directly to this job after setup instead of an empty dashboard." />
              <div className="grid gap-3">
                {(Object.entries(FIRST_USEFUL_JOBS) as [FirstUsefulJob, (typeof FIRST_USEFUL_JOBS)[FirstUsefulJob]][]).map(([job, option]) => (
                  <button key={job} type="button" aria-pressed={firstUsefulJob === job} onClick={() => { setFirstUsefulJob(job); setAiPermissions(permissionsForFirstJob(job)); }} className={cn("min-h-12 rounded-[18px] border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", firstUsefulJob === job ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50")}>
                    <span className="font-semibold">{option.label}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">{option.description}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="space-y-5">
              <StepIntro title="Connect with limited permissions" detail="For your first job, Plaivra saves only the minimum suggested access below. You can reduce or revoke it in Settings at any time." />
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(aiPermissions.sections).filter(([, permission]) => permission.read || permission.write).map(([section, permission]) => (
                  <ReviewItem key={section} label={section.replace("_", " ")} value={`${permission.read ? "Read" : ""}${permission.write ? " + write" : ""}`} />
                ))}
              </div>
              <div className="rounded-[18px] border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                Start the Plaivra connection from ChatGPT. There is no client ID, token copying, MCP configuration, or second approval queue in Plaivra. Successful authorized Plaivra tools save directly and remain editable here.
              </div>
              <a href="https://chatgpt.com" target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-[14px] border border-border bg-card px-4 py-3 font-semibold hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Open ChatGPT <ExternalLink className="h-4 w-4" />
              </a>
              <p className="text-sm text-muted-foreground">Deeper training and nutrition preferences stay available later in Settings, after you reach your first useful surface.</p>
            </section>
          ) : null}

          <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border/70 bg-card/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:static sm:mx-0 sm:border-t sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} className="min-h-12">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => saveProgress(Math.min(steps.length - 1, step + 1))} disabled={isSaving} className="min-h-12">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSaving ? "Saving..." : "Save and continue"}
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
      </Card> : null}

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
              className={cn("min-h-12 rounded-[14px] px-2 text-sm shadow-none", active ? "" : "bg-card")}
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
      <div className="mt-3 grid grid-cols-[48px_1fr_48px] items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={atMin}
          aria-label={`Decrease ${label}`}
          onClick={() => nudge(value - step)}
          className="h-12 min-h-12 w-12 rounded-[14px] shadow-none"
        >
          -
        </Button>
        <div className="group relative flex min-h-12 items-center overflow-hidden rounded-[14px] border border-border/60 bg-card/95 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition focus-within:border-primary/20 focus-within:bg-primary/5 focus-within:ring-2 focus-within:ring-primary/10">
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
            className="h-12 min-h-12 min-w-0 flex-1 appearance-none border-0 !border-transparent bg-transparent px-3 text-center text-lg font-bold text-foreground !outline-none !ring-0 shadow-none [appearance:textfield] focus:!border-transparent focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
          className="h-12 min-h-12 w-12 rounded-[14px] shadow-none"
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
