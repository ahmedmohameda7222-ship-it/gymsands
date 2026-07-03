"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n/use-translation";

const legalLinks = [
  ["Impressum", "/legal/impressum"],
  ["Datenschutz / Privacy", "/legal/privacy"],
  ["Nutzungsbedingungen / Terms", "/legal/terms"],
  ["Gesundheitshinweis", "/legal/disclaimer"]
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
            <Link key={href} href={href} className="hover:text-primary">{label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
