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
      <div className="container flex h-16 items-center justify-between">
        <Brand />
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground sm:flex">
          <Link href="/about" className="hover:text-primary">
            {copy.about}
          </Link>
          <Link href="/legal/privacy" className="hover:text-primary">
            {copy.privacy}
          </Link>
          <Link href="/login" className="hover:text-primary">
            {copy.login}
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden md:inline-flex" />
          <Button asChild variant="ghost" size="sm" className="sm:hidden">
            <Link href="/about">{copy.about}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">{copy.createAccount}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
