"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  Bot,
  CheckCircle2,
  CreditCard,
  RefreshCcw,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  User,
} from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { useAuth } from "@/components/auth/auth-provider";
import { ProfileSummaryCard } from "@/components/settings/profile-summary-card";
import { SetupProgressCard } from "@/components/settings/setup-progress-card";
import { SettingsHubCard, type SettingsHubCardProps } from "@/components/settings/settings-hub-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getOnboarding } from "@/services/database/profile";
import { getCalorieTargets, getTodayFoodLogs, getTodayMealPlanItems } from "@/services/database/nutrition";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import type { OnboardingAnswers } from "@/types";
import { useTranslation } from "@/lib/i18n/use-translation";

type SetupGroup = {
  title: string;
  description: string;
  cards: SettingsHubCardProps[];
};

function SetupLoadingCard() {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <RefreshCcw className="h-4 w-4 animate-spin text-primary" /> Checking setup status
        </div>
        <div className="h-2 rounded-full bg-muted" />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="h-12 rounded-xl bg-muted/70" />
          <div className="h-12 rounded-xl bg-muted/70" />
        </div>
      </CardContent>
    </Card>
  );
}

function SetupDegradedCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex gap-2 text-sm text-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold text-foreground">Some setup status could not load.</p>
            <p className="mt-1 leading-6 text-muted-foreground">{message} Your saved data was not changed.</p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={onRetry} className="min-h-12 w-full sm:w-auto">
          <RefreshCcw className="h-4 w-4" /> Retry setup status
        </Button>
      </CardContent>
    </Card>
  );
}

function SetupCompleteCard() {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex min-h-16 items-center gap-3 p-4 text-sm">
        <CheckCircle2 className="h-5 w-5 text-primary" />
        <div>
          <p className="font-semibold text-foreground">Setup complete</p>
          <p className="text-muted-foreground">Plaivra has the core profile, training, nutrition, and hydration setup signals it needs.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsGroup({ title, description, cards }: SetupGroup) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-3">
        {cards.map((card) => (
          <SettingsHubCard key={card.href} {...card} />
        ))}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [onboarding, setOnboarding] = useState<OnboardingAnswers | null>(null);
  const [hasTargets, setHasTargets] = useState(false);
  const [hasPlan, setHasPlan] = useState(false);
  const [hasMeals, setHasMeals] = useState(false);
  const [hasFoodLogs, setHasFoodLogs] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [setupLoadError, setSetupLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    const currentUserId = userId;

    async function load() {
      setIsLoading(true);
      setSetupLoadError("");
      const [onboardingResult, targetsResult, planResult, mealsResult, foodLogsResult] = await Promise.allSettled([
        getOnboarding(currentUserId),
        getCalorieTargets(currentUserId),
        getDefaultUserWorkoutPlan(currentUserId),
        getTodayMealPlanItems(currentUserId),
        getTodayFoodLogs(currentUserId),
      ]);

      const failed = [onboardingResult, targetsResult, planResult, mealsResult, foodLogsResult].some((result) => result.status === "rejected");
      if (onboardingResult.status === "fulfilled") setOnboarding(onboardingResult.value);
      if (targetsResult.status === "fulfilled") setHasTargets(Boolean(targetsResult.value));
      if (planResult.status === "fulfilled") setHasPlan(Boolean(planResult.value));
      if (mealsResult.status === "fulfilled") setHasMeals(mealsResult.value.length > 0);
      if (foodLogsResult.status === "fulfilled") setHasFoodLogs(foodLogsResult.value.length > 0);
      if (failed) {
        setSetupLoadError("One or more setup checks failed, so Plaivra is not showing the checklist as fully reliable.");
      }
      setIsLoading(false);
    }

    void load();
  }, [reloadKey, userId]);

  const setupChecklist = useMemo(
    () => [
      { label: t("setup.completeProfile"), done: Boolean(profile?.full_name), href: "/profile", action: t("common.edit") },
      { label: t("setup.setFitnessGoal"), done: Boolean(onboarding), href: "/onboarding?edit=true&returnTo=%2Fsettings", action: t("common.edit") },
      { label: t("setup.importWorkoutPlan"), done: hasPlan, href: "/my-workout/plans", action: t("common.open") },
      { label: t("setup.addMealPlan"), done: hasMeals || hasFoodLogs, href: "/my-meal-plan", action: t("common.open") },
      { label: t("setup.setCalorieTarget"), done: hasTargets, href: "/calories", action: t("common.edit") },
      { label: t("setup.addHydrationTarget"), done: hasTargets, href: "/calories", action: t("common.edit") },
    ],
    [profile?.full_name, onboarding, hasPlan, hasMeals, hasFoodLogs, hasTargets, t]
  );

  const nextSetupItem = useMemo(() => setupChecklist.find((item) => !item.done) ?? null, [setupChecklist]);
  const completedCount = useMemo(() => setupChecklist.filter((item) => item.done).length, [setupChecklist]);

  const groups: SetupGroup[] = [
    {
      title: "Trust & data",
      description: "Sensitive controls for ChatGPT access, privacy visibility, and request context.",
      cards: [
        {
          icon: Bot,
          title: t("settings.aiImports"),
          description: "Choose the Plaivra context and tool actions ChatGPT may use, then monitor or revoke the connection.",
          href: "/settings/connections",
          badge: { label: "Permissions", variant: "warning" },
        },
        {
          icon: Shield,
          title: t("settings.dataPrivacy"),
          description: "Privacy controls affect what is shown in Plaivra and explain what data can be exported.",
          href: "/settings/data-privacy",
          badge: { label: "Sensitive", variant: "warning" },
        },
        {
          icon: ShieldAlert,
          title: "Coaching context",
          description: "Coaching context helps personalize task-specific ChatGPT context. It does not change plans automatically.",
          href: "/settings/coaching-profile",
          badge: { label: "Context", variant: "outline" },
        },
      ],
    },
    {
      title: "Preferences",
      description: "App behavior, display, reminders, and daily shortcuts.",
      cards: [
        {
          icon: SlidersHorizontal,
          title: t("settings.preferences"),
          description: t("settings.preferencesDesc"),
          href: "/settings/preferences",
          badge: { label: "App behavior", variant: "outline" },
        },
        {
          icon: Bell,
          title: t("settings.reminders"),
          description: t("settings.remindersDesc"),
          href: "/settings/reminders",
        },
      ],
    },
    {
      title: "Account",
      description: "Account actions affect sign-in, session state, and account-level requests.",
      cards: [
        {
          icon: User,
          title: t("settings.account"),
          description: t("settings.accountDesc"),
          href: "/settings/account",
          badge: { label: "Session", variant: "outline" },
        },
        {
          icon: CreditCard,
          title: "Subscription",
          description: "Review provider-neutral access and billing recovery. No price or paid capability is published before owner approval.",
          href: "/settings/subscription",
          badge: { label: "Not configured", variant: "outline" },
        },
      ],
    },
  ];

  return (
    <>
      <PageHeading
        title={t("settings.title")}
        description={t("settings.description")}
      />

      <ProfileSummaryCard onboarding={onboarding} />

      <div className="mt-4">
        {isLoading || authLoading ? (
          <SetupLoadingCard />
        ) : setupLoadError ? (
          <SetupDegradedCard message={setupLoadError} onRetry={() => setReloadKey((current) => current + 1)} />
        ) : completedCount < setupChecklist.length ? (
          <SetupProgressCard
            checklist={setupChecklist}
            nextItem={nextSetupItem}
            completedCount={completedCount}
            totalCount={setupChecklist.length}
          />
        ) : (
          <SetupCompleteCard />
        )}
      </div>

      <div className="mt-5 space-y-5">
        {groups.map((group) => (
          <SettingsGroup key={group.title} {...group} />
        ))}
      </div>

      <div className="h-24 lg:hidden" />
    </>
  );
}
