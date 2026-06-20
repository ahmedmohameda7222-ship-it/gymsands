"use client";

import { useState } from "react";
import {
  Dumbbell,
  Droplets,
  Moon,
  Scale,
  Camera,
  VolumeX,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select-field";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";

export default function RemindersPage() {
  const [workoutReminders, setWorkoutReminders] = useState(false);
  const [workoutTime, setWorkoutTime] = useState("");

  const [mealReminders, setMealReminders] = useState(false);
  const [remindBeforeMeals, setRemindBeforeMeals] = useState(false);

  const [hydrationReminders, setHydrationReminders] = useState(false);
  const [hydrationInterval, setHydrationInterval] = useState("");

  const [bedtimeReminder, setBedtimeReminder] = useState(false);
  const [bedtime, setBedtime] = useState("");

  const [supplementReminders, setSupplementReminders] = useState(false);

  const [weighInReminder, setWeighInReminder] = useState(false);
  const [weighInDay, setWeighInDay] = useState("");

  const [photoReminder, setPhotoReminder] = useState(false);
  const [photoFrequency, setPhotoFrequency] = useState("");

  const [habitReminders, setHabitReminders] = useState(false);

  const [quietHours, setQuietHours] = useState(false);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");

  return (
    <SettingsPageShell
      title="Reminders"
      description="Workout, meals, hydration, sleep, supplements, and quiet hours."
    >
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Workout reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable workout reminders"
            defaultOn={workoutReminders}
            onChange={setWorkoutReminders}
          />
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Dumbbell className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Preferred time
              </span>
            </span>
            <div className="w-36 shrink-0">
              <Select
                value={workoutTime}
                onChange={setWorkoutTime}
                options={[
                  { value: "morning", label: "Morning" },
                  { value: "afternoon", label: "Afternoon" },
                  { value: "evening", label: "Evening" },
                ]}
                placeholder="Select"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Meal reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable meal reminders"
            defaultOn={mealReminders}
            onChange={setMealReminders}
          />
          <SettingsToggleRow
            label="Remind before meals"
            defaultOn={remindBeforeMeals}
            onChange={setRemindBeforeMeals}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Hydration reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable hydration reminders"
            defaultOn={hydrationReminders}
            onChange={setHydrationReminders}
          />
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Droplets className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Reminder interval
              </span>
            </span>
            <div className="w-40 shrink-0">
              <Select
                value={hydrationInterval}
                onChange={setHydrationInterval}
                options={[
                  { value: "30", label: "Every 30 min" },
                  { value: "60", label: "Every 1 hour" },
                  { value: "120", label: "Every 2 hours" },
                ]}
                placeholder="Select"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Sleep reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable bedtime reminder"
            defaultOn={bedtimeReminder}
            onChange={setBedtimeReminder}
          />
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Moon className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Bedtime
              </span>
            </span>
            <div className="w-32 shrink-0">
              <Select
                value={bedtime}
                onChange={setBedtime}
                options={[
                  { value: "21:00", label: "9:00 PM" },
                  { value: "22:00", label: "10:00 PM" },
                  { value: "23:00", label: "11:00 PM" },
                  { value: "00:00", label: "12:00 AM" },
                ]}
                placeholder="Select"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Supplement reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable supplement reminders"
            defaultOn={supplementReminders}
            onChange={setSupplementReminders}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Weigh-in reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable weigh-in reminder"
            defaultOn={weighInReminder}
            onChange={setWeighInReminder}
          />
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Scale className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Preferred day
              </span>
            </span>
            <div className="w-32 shrink-0">
              <Select
                value={weighInDay}
                onChange={setWeighInDay}
                options={[
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                ]}
                placeholder="Select"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Progress photo reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable photo reminder"
            defaultOn={photoReminder}
            onChange={setPhotoReminder}
          />
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Camera className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Frequency
              </span>
            </span>
            <div className="w-32 shrink-0">
              <Select
                value={photoFrequency}
                onChange={setPhotoFrequency}
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                ]}
                placeholder="Select"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Habit reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable habit reminders"
            defaultOn={habitReminders}
            onChange={setHabitReminders}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Quiet hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable quiet hours"
            defaultOn={quietHours}
            onChange={setQuietHours}
          />
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <VolumeX className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                Start time
              </span>
            </span>
            <div className="w-32 shrink-0">
              <Select
                value={quietStart}
                onChange={setQuietStart}
                options={[
                  { value: "21:00", label: "9:00 PM" },
                  { value: "22:00", label: "10:00 PM" },
                  { value: "23:00", label: "11:00 PM" },
                ]}
                placeholder="Select"
              />
            </div>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <VolumeX className="h-5 w-5" />
              </span>
              <span className="min-w-0 font-semibold text-foreground">
                End time
              </span>
            </span>
            <div className="w-32 shrink-0">
              <Select
                value={quietEnd}
                onChange={setQuietEnd}
                options={[
                  { value: "06:00", label: "6:00 AM" },
                  { value: "07:00", label: "7:00 AM" },
                  { value: "08:00", label: "8:00 AM" },
                ]}
                placeholder="Select"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        These preferences are stored locally in your browser.
      </p>

    </SettingsPageShell>
  );
}
