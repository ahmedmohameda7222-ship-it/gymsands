"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTrainTranslation } from "@/lib/i18n/train";

export function WorkoutHistorySearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { tr } = useTrainTranslation();
  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground rtl:left-auto rtl:right-3" aria-hidden="true" />
      <Input
        type="search"
        value={value}
        maxLength={120}
        onChange={(event) => onChange(event.target.value)}
        placeholder={tr("historySearchPlaceholder")}
        aria-label={tr("historySearchLabel")}
        className="h-12 rounded-2xl pl-10 pr-10 rtl:pl-10 rtl:pr-10"
      />
      {value ? (
        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-10 -translate-y-1/2 rtl:left-1 rtl:right-auto" onClick={() => onChange("")} aria-label={tr("historyClearFilters")}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
