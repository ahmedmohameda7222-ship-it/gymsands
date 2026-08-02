"use client";

import { StickyNote } from "lucide-react";

import { useTrainTranslation } from "@/lib/i18n/train";

export function SessionHistoryNotes({ notes }: { notes: string | null }) {
  const { tr } = useTrainTranslation();
  if (!notes?.trim()) return null;
  return (
    <section className="rounded-[18px] border border-border/70 bg-card p-4 shadow-sm" aria-labelledby="session-history-notes-title" data-session-history-notes>
      <div className="flex items-center gap-2">
        <StickyNote className="size-4 text-primary" aria-hidden="true" />
        <h2 id="session-history-notes-title" className="text-base font-semibold text-foreground">{tr("historySessionNotes")}</h2>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{notes}</p>
    </section>
  );
}
