"use client";

import { type ComponentType, useState } from "react";
import {
  Camera,
  Droplets,
  Dumbbell,
  Moon,
  Scale,
  VolumeX
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, type SelectOption } from "@/components/ui/select-field";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { type ReminderSettings, useReminderSettings } from "@/lib/settings/reminder-settings";

type IconComponent = ComponentType<{ className?: string }>;

function ReminderSelectRow({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  widthClass = "w-36"
}: {
  icon: IconComponent;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  widthClass?: string;
}) {
  return (
    <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 font-semibold text-foreground">{label}</span>
      </span>
      <div className={`${widthClass} shrink-0`}>
        <Select value={value} onChange={onChange} options={options} placeholder="Select" />
      </div>
    </div>
  );
}

export default function RemindersPage() {
  const { settings, setSettings } = useReminderSettings();
  const [hasSaved, setHasSaved] = useState(false);

  function updateSetting<Key extends keyof ReminderSettings>(key: Key, value: ReminderSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setHasSaved(true);
  }

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
            defaultOn={settings.workoutReminders}
            onChange={(value) => updateSetting("workoutReminders", value)}
          />
          <ReminderSelectRow
            icon={Dumbbell}
            label="Preferred time"
            value={settings.workoutTime}
            onChange={(value) => updateSetting("workoutTime", value)}
            options={[
              { value: "morning", label: "Morning" },
              { value: "afternoon", label: "Afternoon" },
              { value: "evening", label: "Evening" }
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Meal reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable meal reminders"
            defaultOn={settings.mealReminders}
            onChange={(value) => updateSetting("mealReminders", value)}
          />
          <SettingsToggleRow
            label="Remind before meals"
            defaultOn={settings.remindBeforeMeals}
            onChange={(value) => updateSetting("remindBeforeMeals", value)}
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
            defaultOn={settings.hydrationReminders}
            onChange={(value) => updateSetting("hydrationReminders", value)}
          />
          <ReminderSelectRow
            icon={Droplets}
            label="Reminder interval"
            value={settings.hydrationInterval}
            onChange={(value) => updateSetting("hydrationInterval", value)}
            options={[
              { value: "30", label: "Every 30 min" },
              { value: "60", label: "Every 1 hour" },
              { value: "120", label: "Every 2 hours" }
            ]}
            widthClass="w-40"
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Sleep reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable bedtime reminder"
            defaultOn={settings.bedtimeReminder}
            onChange={(value) => updateSetting("bedtimeReminder", value)}
          />
          <ReminderSelectRow
            icon={Moon}
            label="Bedtime"
            value={settings.bedtime}
            onChange={(value) => updateSetting("bedtime", value)}
            options={[
              { value: "21:00", label: "9:00 PM" },
              { value: "22:00", label: "10:00 PM" },
              { value: "23:00", label: "11:00 PM" },
              { value: "00:00", label: "12:00 AM" }
            ]}
            widthClass="w-32"
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Supplement reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable supplement reminders"
            defaultOn={settings.supplementReminders}
            onChange={(value) => updateSetting("supplementReminders", value)}
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
            defaultOn={settings.weighInReminder}
            onChange={(value) => updateSetting("weighInReminder", value)}
          />
          <ReminderSelectRow
            icon={Scale}
            label="Preferred day"
            value={settings.weighInDay}
            onChange={(value) => updateSetting("weighInDay", value)}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" }
            ]}
            widthClass="w-32"
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Progress photo reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable photo reminder"
            defaultOn={settings.photoReminder}
            onChange={(value) => updateSetting("photoReminder", value)}
          />
          <ReminderSelectRow
            icon={Camera}
            label="Frequency"
            value={settings.photoFrequency}
            onChange={(value) => updateSetting("photoFrequency", value)}
            options={[
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" }
            ]}
            widthClass="w-32"
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Habit reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow
            label="Enable habit reminders"
            defaultOn={settings.habitReminders}
            onChange={(value) => updateSetting("habitReminders", value)}
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
            defaultOn={settings.quietHours}
            onChange={(value) => updateSetting("quietHours", value)}
          />
          <ReminderSelectRow
            icon={VolumeX}
            label="Start time"
            value={settings.quietStart}
            onChange={(value) => updateSetting("quietStart", value)}
            options={[
              { value: "21:00", label: "9:00 PM" },
              { value: "22:00", label: "10:00 PM" },
              { value: "23:00", label: "11:00 PM" }
            ]}
            widthClass="w-32"
          />
          <ReminderSelectRow
            icon={VolumeX}
            label="End time"
            value={settings.quietEnd}
            onChange={(value) => updateSetting("quietEnd", value)}
            options={[
              { value: "06:00", label: "6:00 AM" },
              { value: "07:00", label: "7:00 AM" },
              { value: "08:00", label: "8:00 AM" }
            ]}
            widthClass="w-32"
          />
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        {hasSaved ? "Saved on this device. " : ""}
        Reminder preferences are saved on this device. Browser notifications will be added later.
      </p>
    </SettingsPageShell>
  );
}
