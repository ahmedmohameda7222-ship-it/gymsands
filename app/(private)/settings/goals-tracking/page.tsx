"use client";

import { type ComponentType, useState } from "react";
import {
  Apple,
  Droplets,
  Dumbbell,
  Footprints,
  Moon
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select-field";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { type UserAppSettings } from "@/services/database/user-settings";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { useTranslation } from "@/lib/i18n/use-translation";

type IconComponent = ComponentType<{ className?: string }>;

function SelectSettingsRow({
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

function InputSettingsRow({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder
}: {
  icon: IconComponent;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 font-semibold text-foreground">{label}</span>
      </span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-32 shrink-0" />
    </div>
  );
}

function SaveStatus({ hasSaved }: { hasSaved: boolean }) {
  const { t } = useTranslation();
  return <p className="text-xs text-muted-foreground">{hasSaved ? t("common.savedAccount") : t("common.syncedDevices")}</p>;
}

export default function GoalsTrackingPage() {
  const { settings, isLoadingSettings, updateSettings } = useUserSettings();
  const { t } = useTranslation();
  const [hasSaved, setHasSaved] = useState(false);

  async function updateSetting<Key extends keyof UserAppSettings>(key: Key, value: UserAppSettings[Key]) {
    await updateSettings({ [key]: value } as Partial<UserAppSettings>);
    setHasSaved(true);
  }

  if (isLoadingSettings) {
    return (
      <SettingsPageShell title={t("settings.goalsTracking")} description={t("settings.goalsTrackingDesc")}>
        <p className="text-sm text-muted-foreground">{t("common.loadingSettings")}</p>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title={t("settings.goalsTracking")}
      description={t("settings.goalsTrackingDesc")}
    >
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.workoutDefaults")}</CardTitle>
          <CardDescription>{t("settings.workoutDefaultsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <SelectSettingsRow icon={Dumbbell} label={t("settings.daysPerWeek")} value={settings.daysPerWeek ?? ""} onChange={(value) => void updateSetting("daysPerWeek", value)} options={[{ value: "3", label: "3 days" }, { value: "4", label: "4 days" }, { value: "5", label: "5 days" }, { value: "6", label: "6 days" }]} widthClass="w-32" />
          <SelectSettingsRow icon={Dumbbell} label={t("settings.defaultDuration")} value={settings.workoutDuration ?? ""} onChange={(value) => void updateSetting("workoutDuration", value)} options={[{ value: "30", label: "30 min" }, { value: "45", label: "45 min" }, { value: "60", label: "60 min" }, { value: "75", label: "75 min" }, { value: "90", label: "90 min" }]} widthClass="w-32" />
          <SelectSettingsRow icon={Dumbbell} label={t("settings.preferredSplit")} value={settings.preferredSplit ?? ""} onChange={(value) => void updateSetting("preferredSplit", value)} options={[{ value: "full-body", label: "Full body" }, { value: "upper-lower", label: "Upper-Lower" }, { value: "ppl", label: "PPL" }, { value: "bro-split", label: "Bro split" }]} widthClass="w-40" />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.nutritionTargets")}</CardTitle>
          <CardDescription>{t("settings.nutritionTargetsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <InputSettingsRow icon={Apple} label={t("settings.dailyCalories")} value={settings.dailyCalories ?? ""} onChange={(value) => void updateSetting("dailyCalories", value)} placeholder="2200 kcal" />
          <InputSettingsRow icon={Apple} label={t("settings.proteinTarget")} value={settings.proteinTarget ?? ""} onChange={(value) => void updateSetting("proteinTarget", value)} placeholder="160 g" />
          <InputSettingsRow icon={Apple} label={t("settings.carbsTarget")} value={settings.carbsTarget ?? ""} onChange={(value) => void updateSetting("carbsTarget", value)} placeholder="250 g" />
          <InputSettingsRow icon={Apple} label={t("settings.fatTarget")} value={settings.fatTarget ?? ""} onChange={(value) => void updateSetting("fatTarget", value)} placeholder="70 g" />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.hydrationTarget")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <InputSettingsRow icon={Droplets} label={t("settings.dailyWaterGoal")} value={settings.dailyWaterGoal ?? ""} onChange={(value) => void updateSetting("dailyWaterGoal", value)} placeholder="2500 ml" />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.progressTracking")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow label={t("settings.trackBodyWeight")} description={t("settings.trackBodyWeightDesc")} defaultOn={settings.trackBodyWeight} onChange={(value) => void updateSetting("trackBodyWeight", value)} />
          <SettingsToggleRow label={t("settings.trackBodyMeasurements")} description={t("settings.trackBodyMeasurementsDesc")} defaultOn={settings.trackBodyMeasurements} onChange={(value) => void updateSetting("trackBodyMeasurements", value)} />
          <SettingsToggleRow label={t("settings.trackProgressPhotos")} description={t("settings.trackProgressPhotosDesc")} defaultOn={settings.trackProgressPhotos} onChange={(value) => void updateSetting("trackProgressPhotos", value)} />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.sleepRecovery")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SelectSettingsRow icon={Moon} label={t("settings.sleepTarget")} value={settings.sleepTarget ?? ""} onChange={(value) => void updateSetting("sleepTarget", value)} options={[{ value: "6", label: "6 hours" }, { value: "7", label: "7 hours" }, { value: "8", label: "8 hours" }, { value: "9", label: "9 hours" }, { value: "10", label: "10 hours" }]} widthClass="w-32" />
          <SettingsToggleRow label={t("settings.trackSleepQuality")} description={t("settings.trackSleepQualityDesc")} defaultOn={settings.trackSleepQuality} onChange={(value) => void updateSetting("trackSleepQuality", value)} />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.dailyActivity")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <InputSettingsRow icon={Footprints} label={t("settings.stepTarget")} value={settings.stepTarget ?? ""} onChange={(value) => void updateSetting("stepTarget", value)} placeholder="8000 steps" />
          <SettingsToggleRow label={t("settings.trackSteps")} description={t("settings.trackStepsDesc")} defaultOn={settings.trackSteps} onChange={(value) => void updateSetting("trackSteps", value)} />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("nav.habits")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingsToggleRow label={t("settings.trackHabits")} description={t("settings.trackHabitsDesc")} defaultOn={settings.trackHabits} onChange={(value) => void updateSetting("trackHabits", value)} />
        </CardContent>
      </Card>

      <SaveStatus hasSaved={hasSaved} />
    </SettingsPageShell>
  );
}
