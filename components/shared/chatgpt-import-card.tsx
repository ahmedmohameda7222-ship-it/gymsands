"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { getOnboarding } from "@/services/database/profile";
import { getAllUserWorkoutPlans } from "@/services/database/workout-plan-loader";
import type { OnboardingAnswers, UserWorkoutPlan } from "@/types";

function isChatGptPlan(plan: UserWorkoutPlan | null) {
  if (!plan) return false;
  return plan.source === "chatgpt" || plan.source === "imported" || plan.chatgpt_source;
}

function buildWorkoutPrompt(onboarding: OnboardingAnswers | null, profile: { full_name?: string | null; weight_kg?: number | null; height_cm?: number | null; age?: number | null; gender?: string | null; body_goal?: string | null; activity_level?: string | null; training_level?: string | null } | null): string {
  const lines: string[] = [];
  lines.push("Create a structured weekly workout plan for me using the following profile data.");
  lines.push("");
  lines.push("USER PROFILE:");

  const age = onboarding?.age_range ?? (profile?.age ? String(profile.age) : null) ?? "Not specified";
  const gender = onboarding?.gender ?? profile?.gender ?? "Not specified";
  const height = onboarding?.height_cm ?? profile?.height_cm ?? null;
  const weight = onboarding?.weight_kg ?? profile?.weight_kg ?? null;
  const goals = onboarding?.goals?.length ? onboarding.goals.join(", ") : onboarding?.goal ?? profile?.body_goal ?? "General fitness";
  const level = onboarding?.training_level ?? profile?.training_level ?? "Beginner";
  const place = onboarding?.training_place ?? "Gym";
  const split = onboarding?.training_cycle ?? "Full Body";
  const daysPerWeek = onboarding?.training_days_per_week ?? 3;
  const duration = onboarding?.workout_duration_minutes ?? 45;
  const minDuration = onboarding?.min_workout_duration_minutes ?? duration;
  const maxDuration = onboarding?.max_workout_duration_minutes ?? duration;
  const weeks = onboarding?.desired_duration_weeks ?? 4;
  const equipment = onboarding?.available_equipment?.length ? onboarding.available_equipment.join(", ") : "Full gym";
  const limitations = onboarding?.allergies_limitations ?? "None";
  const nutrition = onboarding?.nutrition_preferences?.length ? onboarding.nutrition_preferences.join(", ") : "Normal";

  lines.push(`- Age: ${age}`);
  lines.push(`- Gender: ${gender}`);
  if (height) lines.push(`- Height: ${height} cm`);
  if (weight) lines.push(`- Weight: ${weight} kg`);
  lines.push(`- Fitness goal: ${goals}`);
  lines.push(`- Workout level: ${level}`);
  lines.push(`- Training location: ${place}`);
  lines.push(`- Preferred split: ${split}`);
  lines.push(`- Available days per week: ${daysPerWeek}`);
  lines.push(`- Session duration: ${minDuration}-${maxDuration} minutes`);
  lines.push(`- Plan duration: ${weeks} weeks`);
  lines.push(`- Available equipment: ${equipment}`);
  lines.push(`- Nutrition preferences: ${nutrition}`);
  lines.push(`- Limitations / injuries: ${limitations}`);
  lines.push("");
  lines.push("REQUIREMENTS:");
  lines.push("- Create a complete weekly schedule with clear day names and weekday assignments.");
  lines.push("- For each exercise, include: name, sets, reps, rest seconds, equipment, and target muscle.");
  lines.push("- Make the plan compatible with Plaivra import format.");
  lines.push("- When you're satisfied with the plan, export it to Plaivra using the import tool.");
  lines.push("");
  lines.push("You can adjust the plan with me before finalizing.");

  return lines.join("\n");
}

export function ChatGptImportCard({ mode, className }: { mode: "workout" | "meal"; className?: string }) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [onboarding, setOnboarding] = useState<OnboardingAnswers | null>(null);
  const [plans, setPlans] = useState<UserWorkoutPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    async function load() {
      try {
        const [onb, allPlans] = await Promise.all([
          getOnboarding(user!.id),
          getAllUserWorkoutPlans(user!.id)
        ]);
        setOnboarding(onb);
        setPlans(allPlans);
      } catch {
        // silently fail; card degrades gracefully
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [user?.id]);

  const hasImportedPlan = plans.some(isChatGptPlan);
  const setupComplete = Boolean(onboarding);

  const prompt = useMemo(() => {
    if (mode !== "workout" || !setupComplete) return "";
    return buildWorkoutPrompt(onboarding, profile);
  }, [mode, onboarding, profile, setupComplete]);

  async function handleImportWorkout() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Prompt copied", description: "Paste it into ChatGPT to create your plan." });
    } catch {
      toast({ title: "Could not copy prompt", description: "Please copy it manually after opening ChatGPT." });
    }
    window.open("https://chatgpt.com", "_blank", "noopener,noreferrer");
  }

  // Hide completely if user already has any imported plan
  if (!isLoading && hasImportedPlan) return null;

  const noun = mode === "workout" ? "workout plan" : "meal plan";

  return (
    <Card className={className}>
      <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold">Import your {noun} from ChatGPT</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {setupComplete
                ? "Your profile is set up. Generate a personalized prompt and open ChatGPT to create your plan."
                : "Complete your profile setup so Plaivra can build a personalized prompt for ChatGPT."}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
          {!setupComplete ? (
            <Button asChild className="min-h-12">
              <Link href="/settings">
                <Settings2 className="h-4 w-4" />
                Set up import
              </Link>
            </Button>
          ) : (
            <Button type="button" className="min-h-12" onClick={handleImportWorkout}>
              {copied ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              Import {noun} from ChatGPT
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
