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
import { type UserAppSettings } from "@/services/database/user-settings";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { useTranslation } from "@/lib/i18n/use-translation";

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
  const { t } = useTranslation();
  return (
    <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 font-semibold text-foreground">{label}</span>
      </span>
      <div className={`${widthClass} shrink-0`}>
        <Select value={value} onChange={onChange} options={options} placeholder={t("common.select")} />
      </div>
    </div>
  );
}

function SaveStatus({ hasSaved }: { hasSaved: boolean }) {
  const { t } = useTranslation();
  return <p className="text-center text-sm text-muted-foreground">{hasSaved ? t("common.savedAccount") : t("common.syncedDevices")}</p>;
}

export default function RemindersPage() {
  const { settings, isLoadingSettings, updateSettings } = useUserSettings();
  const { t } = useTranslation();
  const [hasSaved, setHasSaved] = useState(false);

  async function updateSetting<Key extends keyof UserAppSettings>(key: Key, value: UserAppSettings[Key]) {
    await updateSettings({ [key]: value } as Partial<UserAppSettings>);
    setHasSaved(true);
  }

  if (isLoadingSettings) {
    return (
      <SettingsPageShell title={t("settings.reminders")} description={t("settings.remindersDesc")}>
        <p className="text-sm text-muted-foreground">{t("common.loadingSettings")}</p>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t("settings.reminders")} description={t("settings.remindersDesc")}>
      <Card className="border-border/70">
        <CardHeader><CardTitle className="text-base">{t("settings.workoutReminders")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow label={t("settings.enableWorkoutReminders")} defaultOn={settings.workoutReminders} onChange={(value) => void updateSetting("workoutReminders", value)} />
          <ReminderSelectRow icon={Dumbbell} label={t("settings.preferredTime")} value={settings.workoutTime ?? ""} onChange={(value) => void updateSetting("workoutTime", value)} options={[{ value: "morning", label: t("settings.morning") }, { value: "afternoon", label: t("settings.afternoon") }, { value: "evening", label: t("settings.evening") }]} />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader><CardTitle className="text-base">{t("settings.mealReminders")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow label={t("settings.enableMealReminders")} defaultOn={settings.mealReminders} onChange={(value) => void updateSetting("mealReminders", value)} />
          <SettingsToggleRow label={t("settings.remindBeforeMeals")} defaultOn={settings.remindBeforeMeals} onChange={(value) => void updateSetting("remindBeforeMeals", value)} />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader><CardTitle className="text-base">{t("settings.hydrationReminders")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow label={t("settings.enableHydrationReminders")} defaultOn={settings.hydrationReminders} onChange={(value) => void updateSetting("hydrationReminders", value)} />
          <ReminderSelectRow icon={Droplets} label={t("settings.reminderInterval")} value={settings.hydrationInterval ?? ""} onChange={(value) => void updateSetting("hydrationInterval", value)} options={[{ value: "30", label: t("option.everyThirtyMinutes") }, { value: "60", label: t("option.everyOneHour") }, { value: "120", label: t("option.everyTwoHours") }]} widthClass="w-40" />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader><CardTitle className="text-base">{t("settings.sleepReminders")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow label={t("settings.enableBedtimeReminder")} defaultOn={settings.bedtimeReminder} onChange={(value) => void updateSetting("bedtimeReminder", value)} />
          <ReminderSelectRow icon={Moon} label={t("settings.bedtime")} value={settings.bedtime ?? ""} onChange={(value) => void updateSetting("bedtime", value)} options={[{ value: "21:00", label: t("option.ninePm") }, { value: "22:00", label: t("option.tenPm") }, { value: "23:00", label: t("option.elevenPm") }, { value: "00:00", label: t("option.midnight") }]} widthClass="w-32" />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader><CardTitle className="text-base">{t("settings.supplementReminders")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow label={t("settings.enableSupplementReminders")} defaultOn={settings.supplementReminders} onChange={(value) => void updateSetting("supplementReminders", value)} />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader><CardTitle className="text-base">{t("settings.weighInReminders")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow label={t("settings.enableWeighInReminder")} defaultOn={settings.weighInReminder} onChange={(value) => void updateSetting("weighInReminder", value)} />
          <ReminderSelectRow icon={Scale} label={t("settings.preferredDay")} value={settings.weighInDay ?? ""} onChange={(value) => void updateSetting("weighInDay", value)} options={[{ value: "daily", label: t("option.daily") }, { value: "weekly", label: t("option.weekly") }]} widthClass="w-32" />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader><CardTitle className="text-base">{t("settings.progressPhotoReminders")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow label={t("settings.enablePhotoReminder")} defaultOn={settings.photoReminder} onChange={(value) => void updateSetting("photoReminder", value)} />
          <ReminderSelectRow icon={Camera} label={t("settings.frequency")} value={settings.photoFrequency ?? ""} onChange={(value) => void updateSetting("photoFrequency", value)} options={[{ value: "weekly", label: t("option.weekly") }, { value: "monthly", label: t("option.monthly") }]} widthClass="w-32" />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader><CardTitle className="text-base">{t("settings.habitReminders")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow label={t("settings.enableHabitReminders")} defaultOn={settings.habitReminders} onChange={(value) => void updateSetting("habitReminders", value)} />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader><CardTitle className="text-base">{t("settings.quietHours")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow label={t("settings.enableQuietHours")} defaultOn={settings.quietHours} onChange={(value) => void updateSetting("quietHours", value)} />
          <ReminderSelectRow icon={VolumeX} label={t("settings.startTime")} value={settings.quietStart ?? ""} onChange={(value) => void updateSetting("quietStart", value)} options={[{ value: "21:00", label: t("option.ninePm") }, { value: "22:00", label: t("option.tenPm") }, { value: "23:00", label: t("option.elevenPm") }]} widthClass="w-32" />
          <ReminderSelectRow icon={VolumeX} label={t("settings.endTime")} value={settings.quietEnd ?? ""} onChange={(value) => void updateSetting("quietEnd", value)} options={[{ value: "06:00", label: t("option.sixAm") }, { value: "07:00", label: t("option.sevenAm") }, { value: "08:00", label: t("option.eightAm") }]} widthClass="w-32" />
        </CardContent>
      </Card>

      <SaveStatus hasSaved={hasSaved} />
    </SettingsPageShell>
  );
}
