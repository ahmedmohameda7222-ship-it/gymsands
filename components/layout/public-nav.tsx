"use client";

import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useTranslation } from "@/lib/i18n/use-translation";
import { getPublicCopy } from "@/lib/i18n/public-copy";

export function PublicNav() {
  const { language } = useTranslation();
  const copy = getPublicCopy(language);
  return (
    <header className="glass-shell sticky top-0 z-40 border-x-0 border-t-0">
      <div className="container flex min-h-16 items-center justify-between gap-3 py-2">
        <Brand />
        <nav className="hidden items-center gap-2 text-sm font-medium text-muted-foreground sm:flex">
          <Link href="/about" className="inline-flex min-h-12 items-center rounded-xl px-3 hover:text-primary">
            {copy.about}
          </Link>
          <Link href="/legal/privacy" className="inline-flex min-h-12 items-center rounded-xl px-3 hover:text-primary">
            {copy.privacy}
          </Link>
          <Link href="/legal/disclaimer" className="inline-flex min-h-12 items-center rounded-xl px-3 hover:text-primary">
            {language === "ar" ? "الصحة" : "Health"}
          </Link>
          <Link href="/login" className="inline-flex min-h-12 items-center rounded-xl px-3 hover:text-primary">
            {copy.login}
          </Link>
        </nav>
        <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-2">
          <LanguageSwitcher className="hidden md:inline-flex" />
          <Button asChild variant="ghost" className="min-h-12 px-2 text-xs sm:hidden">
            <Link href="/legal/privacy">{copy.privacy}</Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-12 px-2 text-xs sm:hidden">
            <Link href="/login">{copy.login}</Link>
          </Button>
          <Button asChild className="min-h-12 px-3 text-xs sm:text-sm">
            <Link href="/register">{copy.createAccount}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
