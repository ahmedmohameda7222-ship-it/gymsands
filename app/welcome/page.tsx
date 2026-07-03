"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Activity, Dumbbell, Sparkles, Utensils } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useAuth } from "@/components/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/use-translation";
import { getPublicCopy } from "@/lib/i18n/public-copy";

const cards = [
  { key: "workout" as const, icon: Dumbbell },
  { key: "nutrition" as const, icon: Utensils },
  { key: "progress" as const, icon: Activity }
];

export default function WelcomePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { language } = useTranslation();
  const copy = getPublicCopy(language);
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : 0.55;

  return (
    <main id="main-content" className="premium-page-bg relative flex min-h-dvh items-center justify-center overflow-x-clip px-4 py-24">
      <LanguageSwitcher className="absolute end-4 top-4 z-20 sm:end-6 sm:top-6" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,color-mix(in_srgb,var(--color-primary)_12%,transparent),transparent_46%)]" />
      <div className="relative mx-auto w-full max-w-3xl text-center">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration }} className="mx-auto flex w-fit flex-col items-center gap-3">
          <span className="relative h-20 w-20 overflow-hidden rounded-[24px] bg-primary shadow-[var(--shadow-floating)]"><Image src="/plaivra-logo.png" alt="Plaivra logo" fill sizes="80px" className="object-cover" priority /></span>
          <span className="text-lg font-semibold">Plaivra</span>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration, delay: reduceMotion ? 0 : 0.45 }} className="glass-card-strong mx-auto mt-9 flex max-w-md items-center gap-3 p-4 text-start">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
          <p className="font-medium text-foreground">“{copy.welcomePrompt}”</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration, delay: reduceMotion ? 0 : 1.05 }} className="mx-auto mt-4 grid max-w-2xl gap-3 sm:grid-cols-3">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return <motion.div key={card.key} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration, delay: reduceMotion ? 0 : 1.05 + index * 0.12 }} className="glass-card flex items-center gap-3 p-4 sm:flex-col sm:py-6"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><p className="font-semibold">{copy[card.key]}</p></motion.div>;
          })}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration, delay: reduceMotion ? 0 : 1.55 }}>
          <p className="mt-9 text-sm font-semibold uppercase tracking-[0.2em] text-primary">{copy.landingMotto}</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">{language === "ar" ? "مرحبًا بك في مساحة لياقتك" : "Welcome to your fitness workspace"}</h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">{copy.landingBody}</p>
          <Button size="lg" className="mt-8 w-full max-w-sm" disabled={isLoading} onClick={() => router.replace(user ? "/onboarding" : "/login?next=%2Fonboarding")}>{copy.continueSetup}</Button>
        </motion.div>
      </div>
    </main>
  );
}
