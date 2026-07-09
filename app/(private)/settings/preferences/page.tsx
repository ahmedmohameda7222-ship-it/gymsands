"use client";

import { type ComponentType, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Globe,
  LayoutDashboard,
  Loader2,
  Palette,
  Ruler,
  Zap
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, type SelectOption } from "@/components/ui/select-field";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { type QuickLogSection, type UserAppSettings } from "@/services/database/user-settings";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { useTranslation } from "@/lib/i18n/use-translation";
import { appThemes, getThemeById, type ThemeId } from "@/lib/themes";
import { InlineFeedback } from "@/components/motion";

type IconComponent = ComponentType<{ className?: string }>;

type PreferenceStatus = {
  key: string;
  type: "info" | "error";
  message: string;
};

const quickLogOptions: { id: QuickLogSection; label: string; description: string }[] = [
  { id: "water", label: "Water", description: "Show water quick-add in the mobile Quick Log menu." },
  { id: "meal", label: "Meal", description: "Show meal logging shortcuts for reviewed or manual food entries." },
  { id: "weight", label: "Weight", description: "Show body-weight logging when you track weight directly." },
  { id: "workout", label: "Workout", description: "Show workout session and training shortcuts." },
  { id: "progress", label: "Progress", description: "Show progress measurement and photo shortcuts." },
  { id: "sleep", label: "Sleep", description: "Show sleep and recovery logging shortcuts." },
  { id: "supplements", label: "Supplements", description: "Show supplement checklist shortcuts." },
  { id: "wellness", label: "Wellness", description: "Show wellness check-in shortcuts." }
];

function PreferencesSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((item) => (
        <Card key={item} className="border-border/70">
          <CardContent className="space-y-3 p-4">
            <div className="h-4 w-36 rounded bg-muted" />
            <div className="h-12 rounded-2xl bg-muted/70" />
            <div className="h-12 rounded-2xl bg-muted/60" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SelectPreferenceRow({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  disabled,
  statusText,
  statusType,
  widthClass = "sm:w-44"
}: {
  icon: IconComponent;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  statusText?: string;
  statusType?: "info" | "error";
  widthClass?: string;
}) {
  return (
    <div className="group flex min-h-[64px] flex-col gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-foreground">{label}</span>
          {statusText ? (
            <span className={`mt-1 block text-xs font-medium ${statusType === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {statusText}
            </span>
          ) : null}
        </span>
      </span>
      <div className={`min-w-0 shrink-0 ${widthClass}`}>
        <Select value={value} onChange={onChange} options={options} disabled={disabled} />
      </div>
    </div>
  );
}

function ThemePicker({
  selectedThemeId,
  onSelect,
  disabled,
  activeStatus
}: {
  selectedThemeId: ThemeId;
  onSelect: (themeId: ThemeId) => void;
  disabled?: boolean;
  activeStatus?: PreferenceStatus | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {appThemes.map((theme) => {
        const isSelected = theme.id === selectedThemeId;
        const isPending = activeStatus?.key === "themeId" && activeStatus.message.startsWith("Saving");

        return (
          <button
            key={theme.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(theme.id)}
            disabled={disabled}
            className={`flex min-h-[132px] flex-col justify-between rounded-2xl border p-4 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              isSelected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:border-primary"
            }`}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{theme.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{theme.description}</span>
              </span>
              {isSelected ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {isPending ? "Saving" : t("common.selected")}
                </span>
              ) : null}
            </span>
            <span className="mt-4 flex h-8 overflow-hidden rounded-full border border-border/70">
              {theme.palette.map((color) => (
                <span
                  key={`${theme.id}-${color}`}
                  className="min-w-0 flex-1"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
            <span className="mt-3 text-xs text-muted-foreground">{isSelected ? t("common.savedAccount") : t("common.select")}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function PreferencesPage() {
  const { settings, isLoadingSettings, isSavingSettings, saveError, updateSettings } = useUserSettings();
  const { t } = useTranslation();
  const [lastStatus, setLastStatus] = useState<PreferenceStatus | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);
  const selectedTheme = getThemeById(settings.themeId);
  const hasLoadIssue = Boolean(saveError && !lastStatus);
  const controlsDisabled = isSavingSettings || Boolean(pendingKey) || hasLoadIssue;

  async function updatePreference<Key extends keyof UserAppSettings>(
    key: Key,
    value: UserAppSettings[Key],
    label: string
  ) {
    setPendingKey(String(key));
    setLastStatus({ key: String(key), type: "info", message: `Saving ${label}...` });
    try {
      await updateSettings({ [key]: value } as Partial<UserAppSettings>);
      setLastStatus({ key: String(key), type: "info", message: `${label} saved to your Plaivra account.` });
    } catch {
      setLastStatus({ key: String(key), type: "error", message: `${label} save failed. Plaivra restored your previous setting.` });
    } finally {
      setPendingKey(null);
    }
  }

  function toggleQuickLog(section: QuickLogSection, visible: boolean) {
    const option = quickLogOptions.find((item) => item.id === section);
    const next = visible
      ? [...settings.quickLogSections.filter((item) => item !== section), section]
      : settings.quickLogSections.filter((item) => item !== section);
    void updatePreference("quickLogSections", next, `${option?.label ?? section} Quick Log shortcut`);
  }

  function rowStatus(key: string) {
    const isPending = pendingKey === key;
    const status = lastStatus?.key === key ? lastStatus : null;
    return {
      status: isPending ? "pending" as const : status?.type === "error" ? "error" as const : status ? "saved" as const : undefined,
      statusText: isPending ? "Saving..." : status?.message,
      statusType: status?.type
    };
  }

  if (isLoadingSettings) {
    return (
      <SettingsPageShell title={t("settings.preferences")} description={t("settings.preferencesDesc")}>
        <PreferencesSkeleton />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title={t("settings.preferences")}
      description={t("settings.preferencesDesc")}
    >
      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <p className="font-semibold text-foreground">Preference sync status</p>
          <p className="text-sm leading-6 text-muted-foreground">
            Changes save automatically to your Plaivra account. Theme and language may update immediately on this device and then sync to your account.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            If saving fails, Plaivra restores your previous setting. Reduce animations limits non-essential motion across Plaivra and this route avoids decorative motion.
          </p>
          {hasLoadIssue ? (
            <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Settings could not load. Plaivra is showing cached/default preferences. {saveError}</p>
            </div>
          ) : null}
          <InlineFeedback
            message={lastStatus?.message}
            variant={lastStatus?.type === "error" ? "error" : "info"}
            onClose={() => setLastStatus(null)}
          />
          {saveError && !hasLoadIssue ? (
            <InlineFeedback
              message={`Settings save failed. Your previous setting was restored. ${saveError}`}
              variant="error"
            />
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.appearance")}</CardTitle>
          <CardDescription>{t("settings.appearanceDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <button
            type="button"
            aria-expanded={isThemePickerOpen}
            onClick={() => setIsThemePickerOpen((current) => !current)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border bg-card p-3 text-start transition-colors hover:border-primary/40 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Palette className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{t("settings.theme")}</span>
                <span className="block text-sm text-muted-foreground">{selectedTheme.name}</span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="hidden h-6 w-28 overflow-hidden rounded-full border border-border/70 sm:flex">
                {selectedTheme.palette.map((color) => (
                  <span key={`${selectedTheme.id}-summary-${color}`} className="min-w-0 flex-1" style={{ backgroundColor: color }} />
                ))}
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground ${isThemePickerOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {isThemePickerOpen ? (
            <ThemePicker
              selectedThemeId={settings.themeId}
              disabled={controlsDisabled}
              activeStatus={lastStatus}
              onSelect={(themeId) => void updatePreference("themeId", themeId, "Theme")}
            />
          ) : null}
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
            disabled={controlsDisabled}
            onChange={(value) => void updatePreference("language", value as UserAppSettings["language"], "Language")}
            options={[
              { value: "en", label: t("settings.english") },
              { value: "de", label: t("settings.german") },
              { value: "ar", label: t("settings.arabic") },
              { value: "system", label: t("settings.systemDefault") }
            ]}
            {...rowStatus("language")}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.units")}</CardTitle>
          <CardDescription>{t("settings.unitsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectPreferenceRow icon={Ruler} label={t("settings.weight")} value={settings.weightUnit} disabled={controlsDisabled} onChange={(value) => void updatePreference("weightUnit", value as UserAppSettings["weightUnit"], "Weight unit")} options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} widthClass="sm:w-32" {...rowStatus("weightUnit")} />
          <SelectPreferenceRow icon={Ruler} label={t("settings.height")} value={settings.heightUnit} disabled={controlsDisabled} onChange={(value) => void updatePreference("heightUnit", value as UserAppSettings["heightUnit"], "Height unit")} options={[{ value: "cm", label: "cm" }, { value: "ft-in", label: "ft-in" }]} widthClass="sm:w-32" {...rowStatus("heightUnit")} />
          <SelectPreferenceRow icon={Ruler} label={t("settings.distance")} value={settings.distanceUnit} disabled={controlsDisabled} onChange={(value) => void updatePreference("distanceUnit", value as UserAppSettings["distanceUnit"], "Distance unit")} options={[{ value: "km", label: "km" }, { value: "miles", label: "miles" }]} widthClass="sm:w-32" {...rowStatus("distanceUnit")} />
          <SelectPreferenceRow icon={Ruler} label={t("settings.liquid")} value={settings.liquidUnit} disabled={controlsDisabled} onChange={(value) => void updatePreference("liquidUnit", value as UserAppSettings["liquidUnit"], "Liquid unit")} options={[{ value: "ml", label: "ml" }, { value: "oz", label: "oz" }]} widthClass="sm:w-32" {...rowStatus("liquidUnit")} />
          <SelectPreferenceRow icon={Ruler} label={t("settings.energy")} value={settings.energyUnit} disabled={controlsDisabled} onChange={(value) => void updatePreference("energyUnit", value as UserAppSettings["energyUnit"], "Energy unit")} options={[{ value: "kcal", label: "kcal" }, { value: "kJ", label: "kJ" }]} widthClass="sm:w-32" {...rowStatus("energyUnit")} />
          <SelectPreferenceRow icon={Ruler} label={t("settings.bodyMeasurements")} value={settings.bodyMeasurementUnit} disabled={controlsDisabled} onChange={(value) => void updatePreference("bodyMeasurementUnit", value as UserAppSettings["bodyMeasurementUnit"], "Body measurement unit")} options={[{ value: "cm", label: "cm" }, { value: "inches", label: "inches" }]} widthClass="sm:w-32" {...rowStatus("bodyMeasurementUnit")} />
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
            disabled={controlsDisabled}
            onChange={(value) => void updatePreference("weekStartsOn", value as UserAppSettings["weekStartsOn"], "Week start")}
            options={[
              { value: "monday", label: t("settings.monday") },
              { value: "sunday", label: t("settings.sunday") }
            ]}
            {...rowStatus("weekStartsOn")}
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
            disabled={controlsDisabled}
            onChange={(value) => void updatePreference("defaultStartPage", value as UserAppSettings["defaultStartPage"], "Default start page")}
            options={[
              { value: "today", label: t("nav.today") },
              { value: "dashboard", label: t("settings.dashboard") },
              { value: "train", label: t("nav.train") },
              { value: "eat", label: t("nav.eat") },
              { value: "progress", label: t("nav.progress") }
            ]}
            {...rowStatus("defaultStartPage")}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-5 w-5 text-primary" /> Quick Log</CardTitle>
          <CardDescription>Quick Log shortcuts control the mobile quick-log menu only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {quickLogOptions.map((item) => {
            const status = rowStatus("quickLogSections");
            return (
              <SettingsToggleRow
                key={item.id}
                label={item.label}
                description={item.description}
                defaultOn={settings.quickLogSections.includes(item.id)}
                disabled={controlsDisabled}
                status={status.status}
                statusText={status.statusText}
                onChange={(visible) => toggleQuickLog(item.id, visible)}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.accessibility")}</CardTitle>
          <CardDescription>{t("settings.accessibilityDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingsToggleRow
            label={t("settings.compactMode")}
            description={`${t("settings.compactModeDesc")} Saves automatically.`}
            defaultOn={settings.compactMode}
            disabled={controlsDisabled}
            status={rowStatus("compactMode").status}
            statusText={rowStatus("compactMode").statusText}
            onChange={(value) => void updatePreference("compactMode", value, "Compact mode")}
          />
          <SettingsToggleRow
            label={t("settings.reduceAnimations")}
            description="Reduce animations limits non-essential motion across Plaivra. This page avoids decorative movement while you change it."
            defaultOn={settings.reduceAnimations}
            disabled={controlsDisabled}
            status={rowStatus("reduceAnimations").status}
            statusText={rowStatus("reduceAnimations").statusText}
            onChange={(value) => void updatePreference("reduceAnimations", value, "Reduce animations")}
          />
          <SettingsToggleRow
            label={t("settings.largeTextMode")}
            description="Large text mode increases readable UI text where supported."
            defaultOn={settings.largeTextMode}
            disabled={controlsDisabled}
            status={rowStatus("largeTextMode").status}
            statusText={rowStatus("largeTextMode").statusText}
            onChange={(value) => void updatePreference("largeTextMode", value, "Large text mode")}
          />
        </CardContent>
      </Card>
    </SettingsPageShell>
  );
}
