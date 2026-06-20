"use client";

import { useState } from "react";
import {
  Dumbbell,
  Apple,
  Droplets,
  Moon,
  Footprints,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select-field";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";

export default function GoalsTrackingPage() {
  const [daysPerWeek, setDaysPerWeek] = useState("");
  const [workoutDuration, setWorkoutDuration] = useState("");
  const [preferredSplit, setPreferredSplit] = useState("");
  const [sleepTarget, setSleepTarget] = useState("");

  const [trackBodyWeight, setTrackBodyWeight] = useState(false);
  const [trackBodyMeasurements, setTrackBodyMeasurements] = useState(false);
  const [trackProgressPhotos, setTrackProgressPhotos] = useState(false);
  const [trackSleepQuality, setTrackSleepQuality] = useState(false);
  const [trackSteps, setTrackSteps] = useState(false);
  const [trackHabits, setTrackHabits] = useState(false);

  return (
    <SettingsPageShell
      title="Goals & Tracking"
      description="Workout, nutrition, hydration, and progress defaults."
    >
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Workout defaults</CardTitle>
          <CardDescription>
            Configure your default workout schedule and preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Dumbbell className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Days per week
              </span>
            </span>
            <div className="w-32 shrink-0">
              <Select
                value={daysPerWeek}
                onChange={setDaysPerWeek}
                options={[
                  { value: "3", label: "3 days" },
                  { value: "4", label: "4 days" },
                  { value: "5", label: "5 days" },
                  { value: "6", label: "6 days" },
                ]}
                placeholder="Select"
              />
            </div>
          </div>

          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Dumbbell className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Default duration
              </span>
            </span>
            <div className="w-32 shrink-0">
              <Select
                value={workoutDuration}
                onChange={setWorkoutDuration}
                options={[
                  { value: "30", label: "30 min" },
                  { value: "45", label: "45 min" },
                  { value: "60", label: "60 min" },
                  { value: "75", label: "75 min" },
                  { value: "90", label: "90 min" },
                ]}
                placeholder="Select"
              />
            </div>
          </div>

          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Dumbbell className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Preferred split
              </span>
            </span>
            <div className="w-40 shrink-0">
              <Select
                value={preferredSplit}
                onChange={setPreferredSplit}
                options={[
                  { value: "full-body", label: "Full body" },
                  { value: "upper-lower", label: "Upper-Lower" },
                  { value: "ppl", label: "PPL" },
                  { value: "bro-split", label: "Bro split" },
                ]}
                placeholder="Select"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Nutrition targets</CardTitle>
          <CardDescription>
            Set your daily macronutrient goals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Apple className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Daily calories
              </span>
            </span>
            <Input
              disabled
              placeholder="Coming soon"
              className="w-28 shrink-0"
            />
          </div>

          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Apple className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Protein target
              </span>
            </span>
            <Input
              disabled
              placeholder="Coming soon"
              className="w-28 shrink-0"
            />
          </div>

          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Apple className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Carbs target
              </span>
            </span>
            <Input
              disabled
              placeholder="Coming soon"
              className="w-28 shrink-0"
            />
          </div>

          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Apple className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Fat target
              </span>
            </span>
            <Input
              disabled
              placeholder="Coming soon"
              className="w-28 shrink-0"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Hydration target</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Droplets className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Daily water goal
              </span>
            </span>
            <Input
              disabled
              placeholder="Coming soon"
              className="w-28 shrink-0"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Progress tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Track body weight"
            description="Log your weight over time."
            defaultOn={trackBodyWeight}
            onChange={setTrackBodyWeight}
          />
          <SettingsToggleRow
            label="Track body measurements"
            description="Log chest, waist, arms, etc."
            defaultOn={trackBodyMeasurements}
            onChange={setTrackBodyMeasurements}
          />
          <SettingsToggleRow
            label="Track progress photos"
            description="Save visual progress snapshots."
            defaultOn={trackProgressPhotos}
            onChange={setTrackProgressPhotos}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Sleep &amp; recovery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Moon className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Sleep target
              </span>
            </span>
            <div className="w-32 shrink-0">
              <Select
                value={sleepTarget}
                onChange={setSleepTarget}
                options={[
                  { value: "6", label: "6 hours" },
                  { value: "7", label: "7 hours" },
                  { value: "8", label: "8 hours" },
                  { value: "9", label: "9 hours" },
                  { value: "10", label: "10 hours" },
                ]}
                placeholder="Select"
              />
            </div>
          </div>

          <SettingsToggleRow
            label="Track sleep quality"
            description="Rate your sleep each morning."
            defaultOn={trackSleepQuality}
            onChange={setTrackSleepQuality}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Daily activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Footprints className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Step target
              </span>
            </span>
            <Input
              disabled
              placeholder="Coming soon"
              className="w-28 shrink-0"
            />
          </div>

          <SettingsToggleRow
            label="Track steps"
            description="Sync or log your daily steps."
            defaultOn={trackSteps}
            onChange={setTrackSteps}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Habits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Track habits"
            description="Build and monitor daily habits."
            defaultOn={trackHabits}
            onChange={setTrackHabits}
          />
        </CardContent>
      </Card>

    </SettingsPageShell>
  );
}
