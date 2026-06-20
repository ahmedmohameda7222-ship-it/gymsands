"use client";

import { useState } from "react";
import {
  Palette,
  Globe,
  Ruler,
  CalendarDays,
  LayoutDashboard,
  Accessibility,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { SelectField } from "@/components/ui/select-field";

export default function PreferencesPage() {
  const [theme, setTheme] = useState("system");
  const [accent, setAccent] = useState("olive");
  const [language, setLanguage] = useState("en");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [heightUnit, setHeightUnit] = useState("cm");
  const [distanceUnit, setDistanceUnit] = useState("km");
  const [liquidUnit, setLiquidUnit] = useState("ml");
  const [energyUnit, setEnergyUnit] = useState("kcal");
  const [bodyMeasurementUnit, setBodyMeasurementUnit] = useState("cm");
  const [weekStart, setWeekStart] = useState("monday");
  const [defaultPage, setDefaultPage] = useState("today");

  return (
    <SettingsPageShell
      title="App Preferences"
      description="Theme, units, language, dashboard, and app behavior."
    >
      {/* Appearance */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Choose how the app looks and feels.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Palette className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Theme</span>
              </span>
            </span>
            <div className="min-w-0 shrink-0 sm:w-40">
              <SelectField
                label=""
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                  { value: "system", label: "System" },
                ]}
              />
            </div>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Palette className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Accent color</span>
              </span>
            </span>
            <div className="min-w-0 shrink-0 sm:w-40">
              <SelectField
                label=""
                value={accent}
                onChange={setAccent}
                options={[
                  { value: "olive", label: "Olive" },
                  { value: "champagne", label: "Champagne" },
                  { value: "sage", label: "Sage" },
                ]}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Language</CardTitle>
          <CardDescription>Select your preferred language.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Globe className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Language</span>
              </span>
            </span>
            <div className="min-w-0 shrink-0 sm:w-40">
              <SelectField
                label=""
                value={language}
                onChange={setLanguage}
                options={[
                  { value: "en", label: "English" },
                  { value: "de", label: "German" },
                  { value: "ar", label: "Arabic" },
                  { value: "system", label: "System default" },
                ]}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Units */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Units</CardTitle>
          <CardDescription>Set your preferred measurement units.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Ruler className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Weight</span>
              </span>
            </span>
            <div className="min-w-0 shrink-0 sm:w-32">
              <SelectField
                label=""
                value={weightUnit}
                onChange={setWeightUnit}
                options={[
                  { value: "kg", label: "kg" },
                  { value: "lb", label: "lb" },
                ]}
              />
            </div>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Ruler className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Height</span>
              </span>
            </span>
            <div className="min-w-0 shrink-0 sm:w-32">
              <SelectField
                label=""
                value={heightUnit}
                onChange={setHeightUnit}
                options={[
                  { value: "cm", label: "cm" },
                  { value: "ft-in", label: "ft-in" },
                ]}
              />
            </div>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Ruler className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Distance</span>
              </span>
            </span>
            <div className="min-w-0 shrink-0 sm:w-32">
              <SelectField
                label=""
                value={distanceUnit}
                onChange={setDistanceUnit}
                options={[
                  { value: "km", label: "km" },
                  { value: "miles", label: "miles" },
                ]}
              />
            </div>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Ruler className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Liquid</span>
              </span>
            </span>
            <div className="min-w-0 shrink-0 sm:w-32">
              <SelectField
                label=""
                value={liquidUnit}
                onChange={setLiquidUnit}
                options={[
                  { value: "ml", label: "ml" },
                  { value: "oz", label: "oz" },
                ]}
              />
            </div>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Ruler className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Energy</span>
              </span>
            </span>
            <div className="min-w-0 shrink-0 sm:w-32">
              <SelectField
                label=""
                value={energyUnit}
                onChange={setEnergyUnit}
                options={[
                  { value: "kcal", label: "kcal" },
                  { value: "kJ", label: "kJ" },
                ]}
              />
            </div>
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Ruler className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Body measurements</span>
              </span>
            </span>
            <div className="min-w-0 shrink-0 sm:w-32">
              <SelectField
                label=""
                value={bodyMeasurementUnit}
                onChange={setBodyMeasurementUnit}
                options={[
                  { value: "cm", label: "cm" },
                  { value: "inches", label: "inches" },
                ]}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Calendar</CardTitle>
          <CardDescription>Configure your calendar preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Week starts on</span>
              </span>
            </span>
            <div className="min-w-0 shrink-0 sm:w-40">
              <SelectField
                label=""
                value={weekStart}
                onChange={setWeekStart}
                options={[
                  { value: "monday", label: "Monday" },
                  { value: "sunday", label: "Sunday" },
                ]}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dashboard */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Dashboard</CardTitle>
          <CardDescription>Customize your default dashboard experience.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LayoutDashboard className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Default start page</span>
              </span>
            </span>
            <div className="min-w-0 shrink-0 sm:w-40">
              <SelectField
                label=""
                value={defaultPage}
                onChange={setDefaultPage}
                options={[
                  { value: "today", label: "Today" },
                  { value: "dashboard", label: "Dashboard" },
                  { value: "train", label: "Train" },
                  { value: "eat", label: "Eat" },
                  { value: "progress", label: "Progress" },
                ]}
              />
            </div>
          </div>
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

      {/* Accessibility */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Accessibility</CardTitle>
          <CardDescription>Adjust accessibility and display options.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Accessibility className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Compact mode</span>
              </span>
            </span>
            <SettingsToggleRow label="" defaultOn={false} />
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Accessibility className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Reduce animations</span>
              </span>
            </span>
            <SettingsToggleRow label="" defaultOn={false} />
          </div>
          <div className="group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Accessibility className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Large text mode</span>
              </span>
            </span>
            <SettingsToggleRow label="" defaultOn={false} />
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Preferences are stored locally for now.</p>

    </SettingsPageShell>
  );
}
