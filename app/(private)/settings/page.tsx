import Link from "next/link";
import { Bell, Database, Download, Goal, Lock, PlugZap, Settings, UserRound } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectedApps } from "@/components/settings/connected-apps";

const settingGroups = [
  {
    title: "Account",
    description: "Manage your identity, profile, and app setup.",
    rows: [
      { icon: UserRound, title: "Profile", detail: "Update your name, account details, and profile information.", href: "/profile", action: "Open" },
      { icon: Goal, title: "Fitness profile", detail: "Edit goals, training availability, equipment, nutrition preferences, and limitations.", href: "/onboarding?edit=true", action: "Edit" }
    ]
  },
  {
    title: "Preferences",
    description: "Control reminders and connected app setup.",
    rows: [
      { icon: Bell, title: "Browser reminders", detail: "Review optional reminders for wellness, habits, hydration, sleep, and daily tasks.", href: "/wellness", action: "Review" },
      { icon: PlugZap, title: "ChatGPT import", detail: "Connect ChatGPT to import workout and meal plans into FitLife Hub.", href: "#connected-apps", action: "Connect" }
    ]
  },
  {
    title: "Data and privacy",
    description: "Review saved app data and reports.",
    rows: [
      { icon: Database, title: "Saved app data", detail: "Workouts, meals, progress, wellness, and settings stay connected to your signed-in account.", href: "/dashboard", action: "View" },
      { icon: Download, title: "Reports", detail: "Review nutrition summaries, weekly trends, and saved tracking history.", href: "/calories/weekly-overview", action: "Reports" },
      { icon: Lock, title: "Privacy", detail: "Review account privacy and profile information.", href: "/profile", action: "Read" }
    ]
  }
];

export default function SettingsPage() {
  return (
    <>
      <PageHeading
        title="Settings"
        description="Manage your account, fitness profile, reminders, connected apps, and saved data."
      />

      <Card className="overflow-hidden border-primary/15 bg-primary text-primary-foreground">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-foreground/15">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">FitLife Hub setup</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Personalize your fitness hub.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-foreground/80">
              Update your profile, manage connected apps, and review the data linked to your account from one place.
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
