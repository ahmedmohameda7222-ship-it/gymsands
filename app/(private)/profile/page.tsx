"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Save, ShieldCheck, UserRound } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { updateProfile } from "@/services/database/profile";

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const trimmedName = fullName.trim();
  const hasChanges = useMemo(() => trimmedName !== (profile?.full_name ?? "").trim(), [profile?.full_name, trimmedName]);
  const initials = useMemo(() => {
    const source = trimmedName || profile?.email || "FH";
    return source
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "FH";
  }, [profile?.email, trimmedName]);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
  }, [profile?.full_name]);

  async function saveProfile() {
    if (!profile?.id) {
      toast({ title: "Profile is still loading", description: "Try again in a moment." });
      return;
    }
    if (trimmedName.length < 2) {
      toast({ title: "Enter your name", description: "Use at least two characters." });
      return;
    }

    try {
      setIsSaving(true);
      await updateProfile(profile.id, { fullName: trimmedName });
      await refreshProfile();
      toast({ title: "Profile saved", description: "Your profile is up to date." });
    } catch (error) {
      toast({ title: "Profile update failed", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <PageHeading title="Profile" description="Your account identity and safety notes for a real fitness-tracking web app." />

      <Card variant="glassStrong" className="mb-5 overflow-hidden border-primary/20">
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-primary text-xl font-semibold text-primary-foreground shadow-soft">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Plaivra member</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{trimmedName || "Complete your profile"}</h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">{profile?.email ?? "Email loading..."}</p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link href="/onboarding?edit=true">
              Edit fitness profile
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" />
              Account details
            </CardTitle>
            <CardDescription>Your name is shown across the app. Email comes from your signed-in account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={profile?.email ?? ""} disabled placeholder="Email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-name">Full name</Label>
              <Input id="profile-name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name, e.g. Ahmed" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={saveProfile} disabled={isSaving || !hasChanges} className="min-h-12">
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save profile"}
              </Button>
              <Button asChild variant="outline" className="min-h-12">
                <Link href="/settings">Open settings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-success/30 bg-success/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-success" /> Safety and data notes</CardTitle>
            <CardDescription>Clear rules for a responsible pre-launch fitness app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground">
            {[
              "This app is for general fitness tracking only.",
              "It is not medical advice. Speak with a doctor if you have medical conditions.",
              "Do not train through serious pain.",
              "Nutrition values are approximate and may vary by preparation and portion size.",
              "Workout and meal plans should be created externally, then imported for tracking."
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-xl border border-success/20 bg-card/70 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Mobile bottom spacer for nav */}
      <div className="h-24 lg:hidden" />
    </>
  );
}
