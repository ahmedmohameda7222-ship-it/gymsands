import { PublicNav } from "@/components/layout/public-nav";
import { Card, CardContent } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />
      <main className="container py-12">
        <section className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">About FitLife Hub</p>
          <h1 className="mt-3 text-4xl font-bold tracking-normal text-slate-950">A private gym tracker for daily consistency.</h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            FitLife Hub is a simple member dashboard for logging Egyptian meals, workouts, calories, macros, body progress,
            and welcome messages from the admin team.
          </p>
        </section>
        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["Private workspace", "No public purchase flow or monetized access layer."],
            ["Member focused", "Each user keeps their own food logs, workouts, progress entries, and photos."],
            ["Safety first", "This app is for general fitness tracking only and is not medical advice."]
          ].map(([title, text]) => (
            <Card key={title}>
              <CardContent className="pt-5">
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </CardContent>
            </Card>
          ))}
        </section>
        <section className="mt-10">
          <Card>
            <CardContent className="pt-5">
              <h2 className="text-lg font-semibold">Data Sources</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Exercise imports use wger as the approved external source. Imported exercises store source, source ID,
                source URL, license, and license author metadata before admin approval. Food, wearable, coach, email,
                and maps data belongs to its respective provider and is saved only when a user confirms or connects that feature.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
