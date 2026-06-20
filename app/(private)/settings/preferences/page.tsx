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
import { type AppPreferences, useAppPreferences } from "@/lib/settings/app-preferences";

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

export default function PreferencesPage() {
  const { preferences, setPreferences } = useAppPreferences();
  const [hasSaved, setHasSaved] = useState(false);

  function updatePreference<Key extends keyof AppPreferences>(key: Key, value: AppPreferences[Key]) {
    setPreferences((current) => ({ ...current, [key]: value }));
    setHasSaved(true);
  }

  return (
    <SettingsPageShell
      title="App Preferences"
      description="Theme, units, language, dashboard, and app behavior."
    >
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Choose how the app looks and feels.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectPreferenceRow
            icon={Palette}
            label="Theme"
            value={preferences.theme}
            onChange={(value) => updatePreference("theme", value as AppPreferences["theme"])}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" }
            ]}
          />
          <SelectPreferenceRow
            icon={Palette}
            label="Accent color"
            value={preferences.accentColor}
            onChange={(value) => updatePreference("accentColor", value as AppPreferences["accentColor"])}
            options={[
              { value: "olive", label: "Olive" },
              { value: "champagne", label: "Champagne" },
              { value: "sage", label: "Sage" }
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Language</CardTitle>
          <CardDescription>Select your preferred language.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectPreferenceRow
            icon={Globe}
            label="Language"
            value={preferences.language}
            onChange={(value) => updatePreference("language", value as AppPreferences["language"])}
            options={[
              { value: "en", label: "English" },
              { value: "de", label: "German" },
              { value: "ar", label: "Arabic" },
              { value: "system", label: "System default" }
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Units</CardTitle>
          <CardDescription>Set your preferred measurement units.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectPreferenceRow
            icon={Ruler}
            label="Weight"
            value={preferences.weightUnit}
            onChange={(value) => updatePreference("weightUnit", value as AppPreferences["weightUnit"])}
            options={[
              { value: "kg", label: "kg" },
              { value: "lb", label: "lb" }
            ]}
            widthClass="sm:w-32"
          />
          <SelectPreferenceRow
            icon={Ruler}
            label="Height"
            value={preferences.heightUnit}
            onChange={(value) => updatePreference("heightUnit", value as AppPreferences["heightUnit"])}
            options={[
              { value: "cm", label: "cm" },
              { value: "ft-in", label: "ft-in" }
            ]}
            widthClass="sm:w-32"
          />
          <SelectPreferenceRow
            icon={Ruler}
            label="Distance"
            value={preferences.distanceUnit}
            onChange={(value) => updatePreference("distanceUnit", value as AppPreferences["distanceUnit"])}
            options={[
              { value: "km", label: "km" },
              { value: "miles", label: "miles" }
            ]}
            widthClass="sm:w-32"
          />
          <SelectPreferenceRow
            icon={Ruler}
            label="Liquid"
            value={preferences.liquidUnit}
            onChange={(value) => updatePreference("liquidUnit", value as AppPreferences["liquidUnit"])}
            options={[
              { value: "ml", label: "ml" },
              { value: "oz", label: "oz" }
            ]}
            widthClass="sm:w-32"
          />
          <SelectPreferenceRow
            icon={Ruler}
            label="Energy"
            value={preferences.energyUnit}
            onChange={(value) => updatePreference("energyUnit", value as AppPreferences["energyUnit"])}
            options={[
              { value: "kcal", label: "kcal" },
              { value: "kJ", label: "kJ" }
            ]}
            widthClass="sm:w-32"
          />
          <SelectPreferenceRow
            icon={Ruler}
            label="Body measurements"
            value={preferences.bodyMeasurementUnit}
            onChange={(value) => updatePreference("bodyMeasurementUnit", value as AppPreferences["bodyMeasurementUnit"])}
            options={[
              { value: "cm", label: "cm" },
              { value: "inches", label: "inches" }
            ]}
            widthClass="sm:w-32"
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Calendar</CardTitle>
          <CardDescription>Configure your calendar preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectPreferenceRow
            icon={CalendarDays}
            label="Week starts on"
            value={preferences.weekStartsOn}
            onChange={(value) => updatePreference("weekStartsOn", value as AppPreferences["weekStartsOn"])}
            options={[
              { value: "monday", label: "Monday" },
              { value: "sunday", label: "Sunday" }
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Dashboard</CardTitle>
          <CardDescription>Customize your default dashboard experience.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SelectPreferenceRow
            icon={LayoutDashboard}
            label="Default start page"
            value={preferences.defaultStartPage}
            onChange={(value) => updatePreference("defaultStartPage", value as AppPreferences["defaultStartPage"])}
            options={[
              { value: "today", label: "Today" },
              { value: "dashboard", label: "Dashboard" },
              { value: "train", label: "Train" },
              { value: "eat", label: "Eat" },
              { value: "progress", label: "Progress" }
            ]}
          />
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LayoutDashboard className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Dashboard card order</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">Coming soon</span>
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Accessibility</CardTitle>
          <CardDescription>Adjust accessibility and display options.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingsToggleRow
            label="Compact mode"
            description="Saved for now. Full layout compaction will come later."
            defaultOn={preferences.compactMode}
            onChange={(value) => updatePreference("compactMode", value)}
          />
          <SettingsToggleRow
            label="Reduce animations"
            description="Minimizes transitions and CSS animations across the app."
            defaultOn={preferences.reduceAnimations}
            onChange={(value) => updatePreference("reduceAnimations", value)}
          />
          <SettingsToggleRow
            label="Large text mode"
            description="Increases the global text scale slightly."
            defaultOn={preferences.largeTextMode}
            onChange={(value) => updatePreference("largeTextMode", value)}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {hasSaved ? "Saved on this device." : "Preferences are saved locally on this device."}
      </p>
    </SettingsPageShell>
  );
}
