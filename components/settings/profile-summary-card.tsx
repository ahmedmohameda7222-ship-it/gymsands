"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight, ExternalLink, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import type { OnboardingAnswers } from "@/types";

type ProfileSummaryCardProps = {
  onboarding?: OnboardingAnswers | null;
};

export function ProfileSummaryCard({ onboarding }: ProfileSummaryCardProps) {
  const { profile, isLoading } = useAuth();

  const initials = useMemo(() => {
    const source = profile?.full_name || profile?.email || "FH";
    return source
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "FH";
  }, [profile?.email, profile?.full_name]);

  const completionLabel = useMemo(() => {
    if (!profile?.full_name) return "Profile incomplete";
    if (!onboarding) return "Fitness profile not set";
    return "Profile active";
  }, [profile?.full_name, onboarding]);

  const goalLabel = onboarding?.goals?.length
    ? onboarding.goals.join(", ")
    : onboarding?.goal
      ? onboarding.goal
      : null;

  if (isLoading) {
    return (
      <Card className="border-border/70">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 animate-pulse rounded-3xl bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-56 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/70 bg-card">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-primary/10 text-xl font-semibold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {completionLabel}
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold tracking-tight text-foreground">
              {profile?.full_name || "Complete your profile"}
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {profile?.email ?? "Email loading..."}
            </p>
            {goalLabel ? (
              <p className="mt-1 truncate text-sm text-primary">
                Goal: {goalLabel}
              </p>
            ) : null}
          </div>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="hidden h-10 w-10 shrink-0 sm:inline-flex"
            aria-label="Edit profile"
          >
            <Link href="/profile">
              <UserRound className="h-5 w-5" />
            </Link>
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button asChild variant="outline" className="w-full">
            <Link href="/profile">
              <UserRound className="h-4 w-4" />
              Edit profile
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/onboarding?edit=true">
              <ExternalLink className="h-4 w-4" />
              Fitness profile
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
