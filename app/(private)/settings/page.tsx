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
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import type { OnboardingAnswers } from "@/types";
import { useTranslation } from "@/lib/i18n/use-translation";

export default function SettingsPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [onboarding, setOnboarding] = useState<OnboardingAnswers | null>(null);
  const [hasTargets, setHasTargets] = useState(false);
  const [hasPlan, setHasPlan] = useState(false);
  const [hasMeals, setHasMeals] = useState(false);
  const [hasFoodLogs, setHasFoodLogs] = useState(false);
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
          foodLogs,
        ] = await Promise.all([
          getOnboarding(userId),
          getCalorieTargets(userId),
          getDefaultUserWorkoutPlan(userId),
          getTodayMealPlanItems(userId),
          getTodayFoodLogs(userId),
        ]);

        setOnboarding(onboardingData);
        setHasTargets(Boolean(targets));
        setHasPlan(Boolean(plan));
        setHasMeals(meals.length > 0);
        setHasFoodLogs(foodLogs.length > 0);
      } catch (error) {
        console.warn("Settings page could not load setup data.", error);
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [user?.id]);

  const setupChecklist = useMemo(
    () => [
      { label: t("setup.completeProfile"), done: Boolean(profile?.full_name), href: "/profile", action: t("common.edit") },
      { label: t("setup.setFitnessGoal"), done: Boolean(onboarding), href: "/onboarding?edit=true", action: t("common.edit") },
      { label: t("setup.importWorkoutPlan"), done: hasPlan, href: "/my-workout/plans", action: t("common.open") },
      { label: t("setup.addMealPlan"), done: hasMeals || hasFoodLogs, href: "/my-meal-plan", action: t("common.open") },
      { label: t("setup.setCalorieTarget"), done: hasTargets, href: "/calories", action: t("common.edit") },
      { label: t("setup.addHydrationTarget"), done: hasTargets, href: "/calories", action: t("common.edit") },
    ],
    [profile?.full_name, onboarding, hasPlan, hasMeals, hasFoodLogs, hasTargets, t]
  );

  const nextSetupItem = useMemo(() => setupChecklist.find((item) => !item.done) ?? null, [setupChecklist]);
  const completedCount = useMemo(() => setupChecklist.filter((item) => item.done).length, [setupChecklist]);

  const categories = [
    {
      icon: User,
      title: t("settings.account"),
      description: t("settings.accountDesc"),
      href: "/settings/account",
    },
    {
      icon: Target,
      title: t("settings.goalsTracking"),
      description: t("settings.goalsTrackingDesc"),
      href: "/settings/goals-tracking",
    },
    {
      icon: Bell,
      title: t("settings.reminders"),
      description: t("settings.remindersDesc"),
      href: "/settings/reminders",
    },
    {
      icon: Bot,
      title: t("settings.aiImports"),
      description: t("settings.aiImportsDesc"),
      href: "/settings/ai-imports",
    },
    {
      icon: SlidersHorizontal,
      title: t("settings.preferences"),
      description: t("settings.preferencesDesc"),
      href: "/settings/preferences",
    },
    {
      icon: Shield,
      title: t("settings.dataPrivacy"),
      description: t("settings.dataPrivacyDesc"),
      href: "/settings/data-privacy",
    },
  ];

  return (
    <>
      <PageHeading
        title={t("settings.title")}
        description={t("settings.description")}
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
