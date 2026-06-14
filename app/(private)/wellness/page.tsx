import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { WellnessDashboard } from "@/components/lifestyle/wellness-trackers";
import { Card, CardContent } from "@/components/ui/card";

const wellnessLinks = [
  { href: "/hydration", label: "Hydration", detail: "Water target and logs" },
  { href: "/habits", label: "Habits", detail: "Daily behavior streaks" },
  { href: "/sleep-recovery", label: "Sleep & Recovery", detail: "Sleep, stress, soreness" },
  { href: "/supplements", label: "Supplements", detail: "Dose, timing, taken status" },
  { href: "/daily-fit-tasks", label: "Daily Fit Tasks", detail: "Today task checklist" }
];

export default function WellnessPage() {
  return (
    <>
      <PageHeading title="Wellness" description="Daily checklist for habits, water, supplements, sleep, recovery, workouts, meals, and protein using real saved data." />
      <Card className="mb-5">
        <CardContent className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-5">
          {wellnessLinks.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md border p-3 transition hover:border-primary hover:bg-muted">
              <p className="font-semibold">{item.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
            </Link>
          ))}
        </CardContent>
      </Card>
      <WellnessDashboard />
    </>
  );
}
