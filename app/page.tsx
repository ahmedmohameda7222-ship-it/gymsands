import Link from "next/link";
import { Activity, BedDouble, Dumbbell, LineChart, Pill, Soup, Trophy, Utensils } from "lucide-react";
import { PublicNav } from "@/components/layout/public-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublicFooter } from "@/components/layout/public-footer";

const heroImages = [
  "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=1800&q=85",
  "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1800&q=85",
  "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1800&q=85"
];

const features = [
  { icon: Dumbbell, title: "Workout plans", text: "Track ChatGPT-exported plans and manually edited plans with active default selection." },
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
    <div className="premium-page-bg min-h-screen text-foreground">
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
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, color-mix(in srgb, var(--color-text-primary) 78%, transparent), color-mix(in srgb, var(--color-primary) 54%, transparent), color-mix(in srgb, var(--surface) 12%, transparent)), linear-gradient(180deg, color-mix(in srgb, var(--surface) 4%, transparent), var(--app-bg))"
            }}
          />
          <div className="container relative flex min-h-[88vh] items-center pb-16 pt-14">
            <div className="glass-card-strong max-w-3xl p-5 sm:p-8">
              <h1 className="mt-4 text-5xl font-bold tracking-normal sm:text-7xl">Plaivra</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                AI plans it. Plaivra tracks it.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/register">Create account</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-primary/60 bg-[color-mix(in_srgb,var(--surface)_55%,transparent)] text-foreground hover:bg-[color-mix(in_srgb,var(--surface)_75%,transparent)]">
                  <Link href="/login">Login</Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {["ChatGPT plan export", "Workout tracking", "Exercise library", "Meal planning", "Progress tracking", "Sleep & recovery", "Habits", "Supplements", "Personal records"].map((item) => (
                  <span key={item} className="glass-chip px-3 py-1 text-sm">
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
                <Card key={feature.title} variant="glass">
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
      <PublicFooter />
    </div>
  );
}
