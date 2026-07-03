"use client";

import { PublicFooter } from "@/components/layout/public-footer";
import { PublicNav } from "@/components/layout/public-nav";
import { LEGAL_EFFECTIVE_DATE, LEGAL_EFFECTIVE_DATE_DE, LEGAL_EFFECTIVE_DATE_EN } from "@/lib/legal/operator";
import { useTranslation } from "@/lib/i18n/use-translation";

type LocalizedLegalCopy = Record<"en" | "ar", { eyebrow: string; title: string; intro: string }>;

export function LegalPage({
  eyebrow,
  title,
  intro,
  localizedCopy,
  updatedLabel = `${LEGAL_EFFECTIVE_DATE_DE} / ${LEGAL_EFFECTIVE_DATE_EN}`,
  children
}: {
  eyebrow: string;
  title: string;
  intro: string;
  localizedCopy?: LocalizedLegalCopy;
  updatedLabel?: string;
  children: React.ReactNode;
}) {
  const { language } = useTranslation();
  const selectedCopy = localizedCopy?.[language === "ar" ? "ar" : "en"];
  return (
    <div className="premium-page-bg min-h-screen text-foreground">
      <PublicNav />
      <main id="main-content" className="container py-12">
        <article className="glass-card-strong mx-auto max-w-4xl [overflow-wrap:anywhere] p-5 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{selectedCopy?.eyebrow ?? eyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold tracking-normal">{selectedCopy?.title ?? title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{language === "ar" ? "آخر تحديث" : "Last updated"}: <time dateTime={LEGAL_EFFECTIVE_DATE}>{updatedLabel}</time></p>
          <p className="mt-6 text-base leading-8 text-muted-foreground">{selectedCopy?.intro ?? intro}</p>
          <div className="mt-8 space-y-8 text-base leading-8 text-muted-foreground [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_li]:ml-5 [&_li]:list-disc">{children}</div>
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
