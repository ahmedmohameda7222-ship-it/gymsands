"use client";

import { type ComponentType, useState } from "react";
import {
  Accessibility,
  CalendarDays,
  Globe,
  LayoutDashboard,
  Palette,
  Ruler
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, type SelectOption } from "@/components/ui/select-field";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { type UserAppSettings } from "@/services/database/user-settings";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { useTranslation } from "@/lib/i18n/use-translation";

type IconComponent = ComponentType<{ className?: string }>;

function SelectPreferenceRow({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  widthClass = "sm:w-40"
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
        <span className="min-w-0">
          <span className="block font-semibold text-foreground">{label}</span>
        </span>
      </span>
      <div className={`min-w-0 shrink-0 ${widthClass}`}>
        <Select value={value} onChange={onChange} options={options} />
      </div>
    </div>
  );
}

function SaveStatus({ hasSaved }: { hasSaved: boolean }) {
  const { t } = useTranslation();
  return (
    <p className="text-xs text-muted-foreground">
      {hasSaved ? `${t("common.savedAccount")} ${t("common.syncedDevices")}` : t("common.syncedDevices")}
    </p>
  );
}

export default function PreferencesPage() {
  const { settings, isLoadingSettings, updateSettings } = useUserSettings();
  const { t } = useTranslation();
  const [hasSaved, setHasSaved] = useState(false);

  async function updatePreference<Key extends keyof UserAppSettings>(key: Key, value: UserAppSettings[Key]) {
    await updateSettings({ [key]: value } as Partial<UserAppSettings>);
    setHasSaved(true);
  }

  if (isLoadingSettings) {
    return (
      <SettingsPageShell title={t("settings.preferences")} description={t("settings.preferencesDesc")}>
        <p className="text-sm text-muted-foreground">{t("common.loadingSettings")}</p>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title={t("settings.preferences")}
      description={t("settings.preferencesDesc")}
    >
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.appearance")}</CardTitle>
          <CardDescription>{t("settings.appearanceDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectPreferenceRow
            icon={Palette}
            label={t("settings.theme")}
            value={settings.theme}
            onChange={(value) => void updatePreference("theme", value as UserAppSettings["theme"])}
            options={[
              { value: "light", label: t("settings.light") },
              { value: "dark", label: t("settings.dark") },
              { value: "system", label: t("settings.system") }
            ]}
          />
          <SelectPreferenceRow
            icon={Palette}
            label={t("settings.accentColor")}
            value={settings.accentColor}
            onChange={(value) => void updatePreference("accentColor", value as UserAppSettings["accentColor"])}
            options={[
              { value: "olive", label: t("settings.olive") },
              { value: "champagne", label: t("settings.champagne") },
              { value: "sage", label: t("settings.sage") }
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.language")}</CardTitle>
          <CardDescription>{t("settings.languageDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectPreferenceRow
            icon={Globe}
            label={t("settings.appLanguage")}
            value={settings.language}
            onChange={(value) => void updatePreference("language", value as UserAppSettings["language"])}
            options={[
              { value: "en", label: t("settings.english") },
              { value: "de", label: t("settings.german") },
              { value: "ar", label: t("settings.arabic") },
              { value: "system", label: t("settings.systemDefault") }
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.units")}</CardTitle>
          <CardDescription>{t("settings.unitsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectPreferenceRow icon={Ruler} label={t("settings.weight")} value={settings.weightUnit} onChange={(value) => void updatePreference("weightUnit", value as UserAppSettings["weightUnit"])} options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} widthClass="sm:w-32" />
          <SelectPreferenceRow icon={Ruler} label={t("settings.height")} value={settings.heightUnit} onChange={(value) => void updatePreference("heightUnit", value as UserAppSettings["heightUnit"])} options={[{ value: "cm", label: "cm" }, { value: "ft-in", label: "ft-in" }]} widthClass="sm:w-32" />
          <SelectPreferenceRow icon={Ruler} label={t("settings.distance")} value={settings.distanceUnit} onChange={(value) => void updatePreference("distanceUnit", value as UserAppSettings["distanceUnit"])} options={[{ value: "km", label: "km" }, { value: "miles", label: "miles" }]} widthClass="sm:w-32" />
          <SelectPreferenceRow icon={Ruler} label={t("settings.liquid")} value={settings.liquidUnit} onChange={(value) => void updatePreference("liquidUnit", value as UserAppSettings["liquidUnit"])} options={[{ value: "ml", label: "ml" }, { value: "oz", label: "oz" }]} widthClass="sm:w-32" />
          <SelectPreferenceRow icon={Ruler} label={t("settings.energy")} value={settings.energyUnit} onChange={(value) => void updatePreference("energyUnit", value as UserAppSettings["energyUnit"])} options={[{ value: "kcal", label: "kcal" }, { value: "kJ", label: "kJ" }]} widthClass="sm:w-32" />
          <SelectPreferenceRow icon={Ruler} label={t("settings.bodyMeasurements")} value={settings.bodyMeasurementUnit} onChange={(value) => void updatePreference("bodyMeasurementUnit", value as UserAppSettings["bodyMeasurementUnit"])} options={[{ value: "cm", label: "cm" }, { value: "inches", label: "inches" }]} widthClass="sm:w-32" />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.calendar")}</CardTitle>
          <CardDescription>{t("settings.calendarDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectPreferenceRow
            icon={CalendarDays}
            label={t("settings.weekStartsOn")}
            value={settings.weekStartsOn}
            onChange={(value) => void updatePreference("weekStartsOn", value as UserAppSettings["weekStartsOn"])}
            options={[
              { value: "monday", label: t("settings.monday") },
              { value: "sunday", label: t("settings.sunday") }
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.dashboard")}</CardTitle>
          <CardDescription>{t("settings.dashboardDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectPreferenceRow
            icon={LayoutDashboard}
            label={t("settings.defaultStartPage")}
            value={settings.defaultStartPage}
            onChange={(value) => void updatePreference("defaultStartPage", value as UserAppSettings["defaultStartPage"])}
            options={[
              { value: "today", label: t("nav.today") },
              { value: "dashboard", label: t("settings.dashboard") },
              { value: "train", label: t("nav.train") },
              { value: "eat", label: t("nav.eat") },
              { value: "progress", label: t("nav.progress") }
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.accessibility")}</CardTitle>
          <CardDescription>{t("settings.accessibilityDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingsToggleRow label={t("settings.compactMode")} description={t("settings.compactModeDesc")} defaultOn={settings.compactMode} onChange={(value) => void updatePreference("compactMode", value)} />
          <SettingsToggleRow label={t("settings.reduceAnimations")} description={t("settings.reduceAnimationsDesc")} defaultOn={settings.reduceAnimations} onChange={(value) => void updatePreference("reduceAnimations", value)} />
          <SettingsToggleRow label={t("settings.largeTextMode")} description={t("settings.largeTextModeDesc")} defaultOn={settings.largeTextMode} onChange={(value) => void updatePreference("largeTextMode", value)} />
        </CardContent>
      </Card>

      <SaveStatus hasSaved={hasSaved} />
    </SettingsPageShell>
  );
}
