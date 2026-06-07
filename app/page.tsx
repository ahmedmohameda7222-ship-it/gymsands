import Link from "next/link";
import { Activity, BedDouble, Dumbbell, LineChart, Pill, Soup, Trophy, Utensils } from "lucide-react";
import { PublicNav } from "@/components/layout/public-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const heroImages = [
  "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=1800&q=85",
  "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1800&q=85",
  "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1800&q=85"
];

const features = [
  { icon: Dumbbell, title: "Workout plans", text: "Generated and custom plans with active default selection." },
  { icon: Activity, title: "Exercise library", text: "Filter exercises by muscle, equipment, mechanics, level, and force type." },
  { icon: Soup, title: "Meal planning", text: "Plan meals, build custom foods, and track daily nutrition." },
  { icon: Utensils, title: "Calorie tracking", text: "Calories, macros, water, and weekly summaries in one flow." },
  { icon: LineChart, title: "Progress tracking", text: "Body metrics, charts, and consistency history." },
  { icon: BedDouble, title: "Sleep & recovery", text: "Recovery, soreness, fatigue, sleep quality, and notes." },
  { icon: Pill, title: "Habits & supplements", text: "Daily tasks, habits, hydration, and supplement check-ins." },
  { icon: Trophy, title: "Personal records", text: "Track best sets, max reps, 1RM, and custom milestones." }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />
      <main>
        <section className="relative min-h-[88vh] overflow-hidden">
          {heroImages.map((image, index) => (
            <div
              key={image}
              className="hero-slide absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${image})`, animationDelay: `${index * 6}s` }}
            />
          ))}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(58,44,31,0.78),rgba(85,96,61,0.48),rgba(245,240,232,0.18)),linear-gradient(180deg,rgba(245,240,232,0.06),#F5F0E8)]" />
          <div className="container relative flex min-h-[88vh] items-center pb-16 pt-14">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Luxury wellness dashboard</p>
              <h1 className="mt-4 text-5xl font-bold tracking-normal sm:text-7xl">FitLife Hub</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#f4efe6]/85">
                A calm premium space for generated workout plans, exercise guidance, meal planning, calorie tracking, recovery, habits, supplements, and personal records.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/register">Create account</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-primary/60 bg-card/50 text-foreground hover:bg-card/80">
                  <Link href="/login">Login</Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {["Workout plans", "Generated plans", "Exercise library", "Meal planning", "Progress tracking", "Sleep & recovery", "Habits", "Supplements", "Personal records"].map((item) => (
                  <span key={item} className="rounded-md border border-primary/25 bg-card/50 px-3 py-1 text-sm text-[#f4efe6]/85 backdrop-blur">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="container py-12">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title}>
                  <CardContent className="pt-5">
                    <Icon className="h-8 w-8 text-primary" />
                    <h2 className="mt-4 text-lg font-semibold">{feature.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.text}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
