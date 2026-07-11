"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n/use-translation";

const legalLinks = [
  ["Legal notice", "/legal/impressum"],
  ["Privacy", "/legal/privacy"],
  ["Terms", "/legal/terms"],
  ["Health disclaimer", "/legal/disclaimer"]
] as const;

export function PublicFooter() {
  const { language } = useTranslation();
  const links = language === "ar"
    ? [["بيانات المشغل", "/legal/impressum"], ["الخصوصية", "/legal/privacy"], ["شروط الاستخدام", "/legal/terms"], ["إخلاء المسؤولية الصحية", "/legal/disclaimer"]] as const
    : legalLinks;
  return (
    <footer className="border-t border-border/60 bg-card/50">
      <div className="container flex flex-col gap-3 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Plaivra · {language === "ar" ? "المشغل: Ahmed Mohamed" : "Operator: Ahmed Mohamed"}</p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-primary">{label}</Link>
          ))}
          <a href="mailto:Ahmed.Mohamed04@outlook.de?subject=Plaivra%20support%20or%20security" className="inline-flex min-h-11 items-center hover:text-primary">{language === "ar" ? "الدعم والأمان" : "Support & security"}</a>
        </nav>
      </div>
    </footer>
  );
}
