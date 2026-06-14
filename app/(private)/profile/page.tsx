"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
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
      <PageHeading title="Profile" description="Keep your member details current." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your name is shown across the app.</CardDescription>
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
            <Button onClick={saveProfile} disabled={isSaving || !hasChanges}>
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save profile"}
            </Button>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Ready to train</CardTitle>
            <CardDescription>Small consistent updates make your dashboard more useful.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-emerald-900">
            <p>This app is for general fitness tracking only.</p>
            <p>It is not medical advice. Speak with a doctor if you have medical conditions.</p>
            <p>Do not train through serious pain.</p>
            <p>Nutrition values are approximate and may vary depending on preparation and portion size.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
