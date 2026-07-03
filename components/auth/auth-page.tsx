"use client";

import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { Brand } from "@/components/layout/brand";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getPublicCopy } from "@/lib/i18n/public-copy";
import { useTranslation } from "@/lib/i18n/use-translation";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { language } = useTranslation();
  const copy = getPublicCopy(language);

  return (
    <main id="main-content" className="premium-page-bg relative grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      <div className="absolute end-4 top-4 z-20 sm:end-6 sm:top-6">
        <LanguageSwitcher />
      </div>
      <section className="glass-shell m-6 hidden rounded-[32px] p-10 text-foreground lg:flex lg:flex-col lg:justify-between">
        <Brand />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">{copy.landingMotto}</p>
          <h1 className="mt-3 max-w-lg text-5xl font-bold tracking-normal">Plaivra</h1>
          <p className="mt-4 max-w-md text-lg leading-8 text-muted-foreground">{copy.landingBody}</p>
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-4 pb-8 pt-24 sm:px-6 lg:py-8">
        <div className="w-full max-w-md">
          <Brand className="mb-6 lg:hidden" />
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
            <AuthForm mode={mode} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
