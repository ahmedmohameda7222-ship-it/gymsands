"use client";

import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  Dumbbell,
  FileCheck2,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Utensils
} from "lucide-react";
import { PublicNav } from "@/components/layout/public-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublicFooter } from "@/components/layout/public-footer";
import { useTranslation } from "@/lib/i18n/use-translation";
import { getPublicCopy } from "@/lib/i18n/public-copy";

const englishFeatures = [
  { icon: MessageSquareText, title: "Ask ChatGPT or upload context", text: "Use ChatGPT for the messy part: meal photos, workout plans, travel context, preferences, and notes." },
  { icon: FileCheck2, title: "Approve the structured result", text: "Plaivra shows reviewed food, meal-plan, workout, or wellness data before anything is saved." },
  { icon: BarChart3, title: "Track and correct from Plaivra", text: "After approval, Plaivra stores history, visualizes progress, and keeps correction paths open." },
  { icon: ShieldCheck, title: "Stay in control", text: "Manual edits remain available, and AI-generated data is never silently applied." }
];

const arabicFeatures = [
  { icon: MessageSquareText, title: "اسأل ChatGPT أو ارفع السياق", text: "استخدم ChatGPT لفهم الصور، الخطط، التفضيلات، والسياق اليومي." },
  { icon: FileCheck2, title: "راجع النتيجة المنظمة", text: "يعرض Plaivra البيانات للمراجعة قبل حفظ أي وجبة أو خطة أو سجل." },
  { icon: BarChart3, title: "تابع وصحح من Plaivra", text: "بعد الموافقة، يحفظ Plaivra السجل ويعرض التقدم ويترك التعديل اليدوي متاحا." },
  { icon: ShieldCheck, title: "تحكم كامل", text: "لا يتم تطبيق بيانات الذكاء الاصطناعي بصمت، ويمكنك تعديلها أو رفضها." }
];

const workflowSteps = [
  { icon: MessageSquareText, label: "ChatGPT/context", detail: "Photo, text, plan, notes" },
  { icon: FileCheck2, label: "User approval", detail: "Review and correct fields" },
  { icon: BarChart3, label: "Plaivra tracks", detail: "History, visuals, control" }
];

const trustLinks = [
  { href: "/legal/privacy", label: "Privacy", text: "User controls data" },
  { href: "/legal/disclaimer", label: "Health disclaimer", text: "Not medical advice" },
  { href: "/legal/terms", label: "Terms", text: "Consent first" }
];

export default function LandingPage() {
  const { language } = useTranslation();
  const copy = getPublicCopy(language);
  const features = language === "ar" ? arabicFeatures : englishFeatures;
  const chips = language === "ar"
    ? ["موافقة قبل الحفظ", "لا تغييرات صامتة", "تعديل يدوي", "خصوصية وتحكم"]
    : ["Approval before tracking", "No silent AI changes", "Manual corrections", "Privacy controls"];

  return (
    <div className="premium-page-bg min-h-screen text-foreground">
      <PublicNav />
      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="container grid min-h-[calc(100vh-4rem)] gap-8 pb-8 pt-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div className="max-w-3xl">
              <p className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 text-sm font-semibold text-primary">
                <Sparkles className="h-4 w-4" />
                {copy.landingMotto}
              </p>
              <h1 className="mt-5 text-5xl font-bold tracking-normal sm:text-7xl">Plaivra</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{copy.landingBody}</p>
              <div className="mt-6 grid gap-2 rounded-[18px] border border-border/70 bg-card/70 p-3 text-sm leading-6 text-muted-foreground">
                <p className="font-semibold text-foreground">Ask ChatGPT or upload context -&gt; approve result -&gt; Plaivra tracks and visualizes it.</p>
                <p>Manual edits stay available for corrections. Creating your account starts with consent and onboarding.</p>
              </div>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/register">{copy.createAccount}</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-primary/60 bg-[color-mix(in_srgb,var(--surface)_55%,transparent)] text-foreground hover:bg-[color-mix(in_srgb,var(--surface)_75%,transparent)]">
                  <Link href="/login">{copy.login}</Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {chips.map((item) => (
                  <span key={item} className="glass-chip min-h-10 px-3 py-2 text-sm">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {workflowSteps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.label} className="rounded-[18px] border border-border/70 bg-card p-4 shadow-soft">
                      <div className="flex items-center justify-between gap-3">
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="text-xs font-semibold text-muted-foreground">0{index + 1}</span>
                      </div>
                      <p className="mt-4 font-semibold">{step.label}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
                    </div>
                  );
                })}
              </div>

              <Card variant="glassStrong">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
                    <div>
                      <p className="text-sm font-semibold">Meal estimate review</p>
                      <p className="text-xs text-muted-foreground">Prepared by ChatGPT, not saved yet</p>
                    </div>
                    <span className="rounded-full bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">Needs approval</span>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-4">
                    <ProductMetric label="Calories" value="620" />
                    <ProductMetric label="Protein" value="42g" />
                    <ProductMetric label="Carbs" value="64g" />
                    <ProductMetric label="Fat" value="18g" />
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Button className="min-h-12"><CheckCircle2 className="h-4 w-4" />Approve reviewed meal</Button>
                    <Button variant="outline" className="min-h-12">Correct manually</Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] border border-border/70 bg-card p-4">
                  <Dumbbell className="h-5 w-5 text-primary" />
                  <p className="mt-3 font-semibold">Workout plan imported</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Plaivra schedules, tracks, and preserves session history after approval.</p>
                </div>
                <div className="rounded-[18px] border border-border/70 bg-card p-4">
                  <Utensils className="h-5 w-5 text-primary" />
                  <p className="mt-3 font-semibold">Nutrition stays reviewable</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Manual add, Food Hub, barcode, and quick repeats remain fallback controls.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="container py-8">
          <div className="grid gap-3 rounded-[20px] border border-border/70 bg-card/70 p-3 sm:grid-cols-3 sm:p-4">
            <TrustItem icon={LockKeyhole} title="Approval before tracking" text="Plaivra does not silently save AI-generated nutrition, workouts, progress, or wellness data." />
            <TrustItem icon={ShieldCheck} title="User controls data" text="Privacy, legal, health disclaimer, and consent are accessible before account creation." />
            <TrustItem icon={FileCheck2} title="Manual correction stays" text="Manual entry remains available for fallback, correction, repeat, and advanced control." />
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

        <section className="container pb-14">
          <div className="grid gap-4 rounded-[22px] border border-primary/25 bg-primary/5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
            <div>
              <h2 className="text-2xl font-semibold">Start with consent, then onboarding</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Create an account, review required health-data agreements, finish setup, then import approved ChatGPT results into Plaivra.</p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {trustLinks.map((item) => (
                  <Link key={item.href} href={item.href} className="inline-flex min-h-10 items-center font-semibold text-primary underline">
                    {item.label}: {item.text}
                  </Link>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:min-w-[220px]">
              <Button asChild size="lg"><Link href="/register">{copy.createAccount}</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/login">{copy.login}</Link></Button>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function ProductMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-border/70 bg-muted/30 p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function TrustItem({ icon: Icon, title, text }: { icon: typeof LockKeyhole; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-[16px] bg-background/55 p-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
