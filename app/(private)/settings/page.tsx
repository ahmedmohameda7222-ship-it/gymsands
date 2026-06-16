"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Database,
  Download,
  Goal,
  LogOut,
  Lock,
  PlugZap,
  ShieldAlert,
  UserRound
} from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { ProfileSummaryCard } from "@/components/settings/profile-summary-card";
import { SetupProgressCard } from "@/components/settings/setup-progress-card";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { ConnectedApps } from "@/components/settings/connected-apps";
import { AiPermissionsCard } from "@/components/settings/ai-permissions-card";
import { getOnboarding } from "@/services/database/profile";
import { getCalorieTargets, getTodayFoodLogs, getTodayMealPlanItems } from "@/services/database/nutrition";
import { getProgressEntries } from "@/services/database/progress";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { getWorkoutHistory } from "@/services/database/workout-sessions";
import type { OnboardingAnswers } from "@/types";

export default function SettingsPage() {
  const { user, profile, session, signOut, isLoading: authLoading } = useAuth();
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
          history
        ] = await Promise.all([
          getOnboarding(userId),
          getCalorieTargets(userId),
          getDefaultUserWorkoutPlan(userId),
          getTodayMealPlanItems(userId),
          getProgressEntries(userId),
          getTodayFoodLogs(userId),
          getWorkoutHistory(userId)
        ]);

        setOnboarding(onboardingData);
        setHasTargets(Boolean(targets));
        setHasPlan(Boolean(plan));
        setHasMeals(meals.length > 0);
        setHasProgress(progress.length > 0);
        setHasFoodLogs(foodLogs.length > 0);

        if (session?.access_token) {
          fetch("/api/mcp/connections", { headers: { Authorization: `Bearer ${session.access_token}` } })
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
              const connections = Array.isArray(data?.connections) ? data.connections : [];
              setChatGptConnected(connections.some((c: { is_active?: boolean; revoked_at?: string | null }) => c.is_active && !c.revoked_at));
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

  const setupChecklist = useMemo(() => [
    { label: "Complete profile", done: Boolean(profile?.full_name), href: "/profile", action: "Edit" },
    { label: "Set fitness goal", done: Boolean(onboarding), href: "/onboarding?edit=true", action: "Set" },
    { label: "Import workout plan", done: hasPlan, href: "/my-workout/plans", action: "Import" },
    { label: "Add meal plan", done: hasMeals || hasFoodLogs, href: "/my-meal-plan", action: "Add" },
    { label: "Set calorie target", done: hasTargets, href: "/calories", action: "Set" },
    { label: "Add hydration target", done: hasTargets, href: "/calories", action: "Set" },
    { label: "Connect ChatGPT", done: chatGptConnected, href: "/settings", action: "Connect" }
  ], [profile?.full_name, onboarding, hasPlan, hasMeals, hasFoodLogs, hasTargets, chatGptConnected]);

  const nextSetupItem = useMemo(() => setupChecklist.find((item) => !item.done) ?? null, [setupChecklist]);
  const completedCount = useMemo(() => setupChecklist.filter((item) => item.done).length, [setupChecklist]);

  const preferenceRows = [
    { icon: Bell, title: "Browser reminders", detail: "Review optional reminders for wellness, habits, hydration, sleep, and daily tasks.", href: "/wellness", action: "Review" },
    { icon: PlugZap, title: "ChatGPT import", detail: "Connect ChatGPT to import workout and meal plans into FitLife Hub.", href: "#connected-apps", action: "Connect" }
  ];

  const dataRows = [
    { icon: Database, title: "Saved app data", detail: "Workouts, meals, progress, wellness, and settings stay connected to your signed-in account.", href: "/dashboard", action: "View" },
    { icon: Download, title: "Reports", detail: "Review nutrition summaries, weekly trends, and saved tracking history.", href: "/calories/weekly-overview", action: "Reports" },
    { icon: Lock, title: "Privacy", detail: "Review account privacy and profile information.", href: "/profile", action: "Read" }
  ];

  const accountRows = [
    { icon: UserRound, title: "Profile", detail: "Update your name, account details, and profile information.", href: "/profile", action: "Open" },
    { icon: Goal, title: "Fitness profile", detail: "Edit goals, training availability, equipment, nutrition preferences, and limitations.", href: "/onboarding?edit=true", action: "Edit" }
  ];

  return (
    <>
      <PageHeading
        title="Settings"
        description="Manage your account, fitness profile, reminders, connected apps, and saved data."
      />

      {/* 1. Profile / Account summary */}
      <ProfileSummaryCard onboarding={onboarding} />

      {/* 2. Setup progress (if incomplete) */}
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

      {/* 3. Account & Fitness profile */}
      <div className="mt-4">
        <SettingsSectionCard
          title="Account"
          description="Manage your identity, profile, and app setup."
          rows={accountRows}
        />
      </div>

      {/* 4. App preferences */}
      <div className="mt-4">
        <SettingsSectionCard
          title="Preferences"
          description="Control reminders and connected app setup."
          rows={preferenceRows}
        />
      </div>

      {/* 5. AI Permissions */}
      <section id="ai-permissions" className="mt-4 scroll-mt-24">
        <AiPermissionsCard />
      </section>

      {/* 6. Connected apps / ChatGPT import / MCP */}
      <section id="connected-apps" className="mt-4 scroll-mt-24">
        <ConnectedApps />
      </section>

      {/* 6. Data and privacy */}
      <div className="mt-4">
        <SettingsSectionCard
          title="Data and privacy"
          description="Review saved app data and reports."
          rows={dataRows}
        />
      </div>

      {/* 7. Danger zone — sign out */}
      <div className="mt-4">
        <Card className="border-destructive/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">Account session</p>
                <p className="text-sm text-muted-foreground">Sign out of FitLife Hub on this device.</p>
              </div>
              <Button variant="outline" onClick={signOut} className="shrink-0">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobile bottom spacer for nav */}
      <div className="h-24 lg:hidden" />
    </>
  );
}
