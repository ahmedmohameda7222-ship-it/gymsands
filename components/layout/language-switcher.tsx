"use client";

import { Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { settings, updateSettings } = useUserSettings();
  const { language } = useTranslation();

  async function choose(nextLanguage: "en" | "ar") {
    if (nextLanguage === language) return;
    await updateSettings({ language: nextLanguage });
  }

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-full border border-border/80 bg-card/90 p-1 shadow-sm", className)} role="group" aria-label="Language">
      <Globe2 className="mx-1 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      {(["en", "ar"] as const).map((item) => (
        <Button
          key={item}
          type="button"
          variant={language === item ? "default" : "ghost"}
          size="sm"
          className="h-11 min-h-11 min-w-11 rounded-full px-2.5 text-xs"
          aria-pressed={language === item}
          onClick={() => void choose(item)}
        >
          {item === "en" ? "EN" : "العربية"}
        </Button>
      ))}
    </div>
  );
}
