import Link from "next/link";
import { Bell, Database, Download, Goal, Lock, PlugZap, Settings, Shield, UserRound } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectedApps } from "@/components/settings/connected-apps";

const settingGroups = [
  {
    title: "Account",
    description: "Identity, profile, and setup details used across FitLife Hub.",
    rows: [
      { icon: UserRound, title: "Profile", detail: "Name, account details, and safety guidance.", href: "/profile", action: "Open" },
      { icon: Goal, title: "Fitness profile", detail: "Goals, training availability, equipment, nutrition preferences, and limitations.", href: "/onboarding?edit=true", action: "Edit" }
    ]
  },
  {
    title: "Preferences",
    description: "Keep the app focused without adding native-only behavior.",
    rows: [
      { icon: Bell, title: "Browser reminders", detail: "Manage optional browser-only reminders from Wellness. No native push notifications are used.", href: "/wellness", action: "Review" },
      { icon: PlugZap, title: "ChatGPT import", detail: "Connect external plan creation. FitLife Hub stores, schedules, edits, displays, and tracks imported plans only.", href: "#connected-apps", action: "Connect" }
    ]
  },
  {
    title: "Data and privacy",
    description: "Clear data boundaries for a real pre-launch web app.",
    rows: [
      { icon: Database, title: "Saved app data", detail: "Workouts, meals, progress, wellness, and settings remain tied to your signed-in account.", href: "/dashboard", action: "View" },
      { icon: Download, title: "Exports", detail: "Export tools should be added only when they use real saved Supabase data.", href: "/calories/weekly-overview", action: "Reports" },
      { icon: Lock, title: "Privacy note", detail: "No fake health data, demo scores, or internal workout-plan generation should be added.", href: "/profile", action: "Read" }
    ]
  }
];

export default function SettingsPage() {
  return (
    <>
      <PageHeading
        title="Settings"
        description="A focused control center for account setup, connected apps, browser preferences, and data boundaries."
      />

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden border-primary/15 bg-primary text-primary-foreground">
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-foreground/15">
              <Settings className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">FitLife Hub setup</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Keep the app premium, clean, and data-grounded.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-foreground/80">
                Settings should help users understand where to change profile data, connect ChatGPT import, and manage real saved information without creating fake or native-only features.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="secondary">
                <Link href="/profile">Open profile</Link>
              </Button>
              <Button asChild variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
                <Link href="/onboarding?edit=true">Edit fitness profile</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-primary" />
              Product guardrails
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {[
              "Do not generate workout plans internally.",
              "Do not show fake dashboard or progress data.",
              "Keep mobile navigation simple and uncluttered.",
              "Preserve Supabase auth, RLS, and existing saved user data."
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-xl border bg-muted/35 p-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-3">
        {settingGroups.map((group) => (
          <SettingsGroup key={group.title} title={group.title} description={group.description} rows={group.rows} />
        ))}
      </section>

      <section id="connected-apps" className="mt-5 scroll-mt-24">
        <ConnectedApps />
      </section>
    </>
  );
}

function SettingsGroup({
  title,
  description,
  rows
}: {
  title: string;
  description: string;
  rows: Array<{ icon: typeof Settings; title: string; detail: string; href: string; action: string }>;
}) {
  return (
    <Card className="h-full border-border/70">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <Link
              key={row.title}
              href={row.href}
              className="group flex min-h-20 items-center justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/45"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-foreground">{row.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">{row.detail}</span>
                </span>
              </span>
              <span className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground group-hover:border-primary/40 group-hover:text-primary">
                {row.action}
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
