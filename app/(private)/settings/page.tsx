"use client";

import { useEffect, useMemo, useState } from "react";
import {
  User,
  Target,
  Bell,
  Bot,
  SlidersHorizontal,
  Shield,
} from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { useAuth } from "@/components/auth/auth-provider";
import { ProfileSummaryCard } from "@/components/settings/profile-summary-card";
import { SetupProgressCard } from "@/components/settings/setup-progress-card";
import { SettingsHubCard } from "@/components/settings/settings-hub-card";
import { getOnboarding } from "@/services/database/profile";
import { getCalorieTargets, getTodayFoodLogs, getTodayMealPlanItems } from "@/services/database/nutrition";
import { getProgressEntries } from "@/services/database/progress";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { getWorkoutHistory } from "@/services/database/workout-sessions";
import type { OnboardingAnswers } from "@/types";

export default function SettingsPage() {
  const { user, profile, session, isLoading: authLoading } = useAuth();
  const [onboarding, setOnboarding] = useState<OnboardingAnswers | null>(null);
  const [hasTargets, setHasTargets] = useState(false);
  const [hasPlan, setHasPlan] = useState(false);
  const [hasMeals, setHasMeals] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const [hasFoodLogs, setHasFoodLogs] = useState(false);
  const [chatGptConnected, setChatGptConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    async function load() {
      setIsLoading(true);
      const userId = user?.id;
      if (!userId) {
        setIsLoading(false);
        return;
      }
      try {
        const [
          onboardingData,
          targets,
          plan,
          meals,
          progress,
          foodLogs,
        ] = await Promise.all([
          getOnboarding(userId),
          getCalorieTargets(userId),
          getDefaultUserWorkoutPlan(userId),
          getTodayMealPlanItems(userId),
          getProgressEntries(userId),
          getTodayFoodLogs(userId),
        ]);

        setOnboarding(onboardingData);
        setHasTargets(Boolean(targets));
        setHasPlan(Boolean(plan));
        setHasMeals(meals.length > 0);
        setHasProgress(progress.length > 0);
        setHasFoodLogs(foodLogs.length > 0);

        if (session?.access_token) {
          fetch("/api/mcp/connections", { headers: { Authorization: `Bearer ${session.access_token}` } })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              const connections = Array.isArray(data?.connections) ? data.connections : [];
              setChatGptConnected(
                connections.some((c: { is_active?: boolean; revoked_at?: string | null }) => c.is_active && !c.revoked_at)
              );
            })
            .catch(() => setChatGptConnected(false));
        }
      } catch (error) {
        console.warn("Settings page could not load setup data.", error);
      } finally {
        setIsLoading(false);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setupChecklist = useMemo(
    () => [
      { label: "Complete profile", done: Boolean(profile?.full_name), href: "/profile", action: "Edit" },
      { label: "Set fitness goal", done: Boolean(onboarding), href: "/onboarding?edit=true", action: "Set" },
      { label: "Import workout plan", done: hasPlan, href: "/my-workout/plans", action: "Import" },
      { label: "Add meal plan", done: hasMeals || hasFoodLogs, href: "/my-meal-plan", action: "Add" },
      { label: "Set calorie target", done: hasTargets, href: "/calories", action: "Set" },
      { label: "Add hydration target", done: hasTargets, href: "/calories", action: "Set" },
      { label: "Connect ChatGPT", done: chatGptConnected, href: "/settings/ai-imports", action: "Connect" },
    ],
    [profile?.full_name, onboarding, hasPlan, hasMeals, hasFoodLogs, hasTargets, chatGptConnected]
  );

  const nextSetupItem = useMemo(() => setupChecklist.find((item) => !item.done) ?? null, [setupChecklist]);
  const completedCount = useMemo(() => setupChecklist.filter((item) => item.done).length, [setupChecklist]);

  const categories = [
    {
      icon: User,
      title: "Account",
      description: "Profile, fitness profile, and account session.",
      href: "/settings/account",
    },
    {
      icon: Target,
      title: "Goals & Tracking",
      description: "Workout, nutrition, hydration, and progress defaults.",
      href: "/settings/goals-tracking",
    },
    {
      icon: Bell,
      title: "Reminders",
      description: "Workout, meals, hydration, sleep, supplements, and quiet hours.",
      href: "/settings/reminders",
    },
    {
      icon: Bot,
      title: "AI & Imports",
      description: "ChatGPT import, AI permissions, and connected apps.",
      href: "/settings/ai-imports",
    },
    {
      icon: SlidersHorizontal,
      title: "App Preferences",
      description: "Theme, units, language, dashboard, and app behavior.",
      href: "/settings/preferences",
    },
    {
      icon: Shield,
      title: "Data & Privacy",
      description: "Export, reset, privacy, and account data.",
      href: "/settings/data-privacy",
    },
  ];

  return (
    <>
      <PageHeading
        title="Settings"
        description="Manage your account, fitness profile, reminders, connected apps, and saved data."
      />

      {/* 1. Profile summary */}
      <ProfileSummaryCard onboarding={onboarding} />

      {/* 2. Setup progress (compact, only if incomplete) */}
      {!isLoading && !authLoading && completedCount < setupChecklist.length ? (
        <div className="mt-4">
          <SetupProgressCard
            checklist={setupChecklist}
            nextItem={nextSetupItem}
            completedCount={completedCount}
            totalCount={setupChecklist.length}
          />
        </div>
      ) : null}

      {/* 3. Category cards */}
      <div className="mt-4 space-y-3">
        {categories.map((cat) => (
          <SettingsHubCard key={cat.href} {...cat} />
        ))}
      </div>

      {/* Mobile bottom spacer */}
      <div className="h-24 lg:hidden" />
    </>
  );
}
