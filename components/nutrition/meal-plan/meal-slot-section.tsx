"use client";

import { Plus } from "lucide-react";

import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import type { PlannedOccurrenceRow } from "@/services/nutrition-v1/server/meal-plan";

function localizedSlot(label: string, language: "en" | "de" | "ar") {
  const slots: Record<string, Record<"en" | "de" | "ar", string>> = {
    Breakfast: { en: "Breakfast", de: "Frühstück", ar: "الإفطار" },
    Lunch: { en: "Lunch", de: "Mittagessen", ar: "الغداء" },
    Dinner: { en: "Dinner", de: "Abendessen", ar: "العشاء" },
    Snacks: { en: "Snacks", de: "Snacks", ar: "الوجبات الخفيفة" },
  };
  return slots[label]?.[language] ?? label;
}

function sourceLabel(source: PlannedOccurrenceRow["source_type"], language: "en" | "de" | "ar") {
  const labels = {
    en: { saved_meal: "Saved Meal", recipe: "Recipe", placeholder: "Placeholder", food: "Food" },
    de: { saved_meal: "Gespeicherte Mahlzeit", recipe: "Rezept", placeholder: "Platzhalter", food: "Lebensmittel" },
    ar: { saved_meal: "وجبة محفوظة", recipe: "وصفة", placeholder: "عنصر مؤقت", food: "طعام" },
  } as const;
  return labels[language][source === "saved_meal" || source === "recipe" || source === "placeholder" ? source : "food"];
}

export function MealSlotSection({
  label,
  items,
  allowExecution,
  markEatenLabel = "Mark eaten",
  logWithChangesLabel = "Log with changes",
  onAdd,
  onMarkEaten,
  onLogWithChanges,
  onSkip,
  onEdit,
  onMove,
  onCopy,
}: {
  label: string;
  items: PlannedOccurrenceRow[];
  allowExecution: boolean;
  markEatenLabel?: string;
  logWithChangesLabel?: string;
  onAdd: () => void;
  onMarkEaten: (item: PlannedOccurrenceRow) => void;
  onLogWithChanges: (item: PlannedOccurrenceRow) => void;
  onSkip: (item: PlannedOccurrenceRow) => void;
  onEdit: (item: PlannedOccurrenceRow) => void;
  onMove: (item: PlannedOccurrenceRow) => void;
  onCopy: (item: PlannedOccurrenceRow) => void;
}) {
  const { language, dir } = useNutritionV1Translation();
  const visibleLabel = localizedSlot(label, language);
  const text = language === "ar"
    ? { add: "إضافة", nothing: "لا يوجد شيء مخطط.", serving: "الحصة غير محددة", planned: "مخطط", skipped: "تم التخطي", markEaten: "تم تناوله", logChanges: "تسجيل مع تعديلات", more: "المزيد", actions: "إجراءات", skip: "تخطي", edit: "تعديل", move: "نقل", copy: "نسخ" }
    : language === "de"
      ? { add: "Hinzufügen", nothing: "Nichts geplant.", serving: "Portion nicht angegeben", planned: "geplant", skipped: "übersprungen", markEaten: "Als gegessen markieren", logChanges: "Mit Änderungen protokollieren", more: "Mehr", actions: "Aktionen", skip: "Überspringen", edit: "Bearbeiten", move: "Verschieben", copy: "Kopieren" }
      : { add: "Add", nothing: "Nothing planned.", serving: "Serving not specified", planned: "planned", skipped: "skipped", markEaten: markEatenLabel, logChanges: logWithChangesLabel, more: "More", actions: "Actions", skip: "Skip", edit: "Edit", move: "Move", copy: "Copy" };
  return (
    <section className="border-b border-border py-4" aria-label={visibleLabel} dir={dir}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 className="font-semibold">{visibleLabel}</h2>
        <button type="button" onClick={onAdd} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />{text.add}</button>
      </div>
      {items.length ? <div className="divide-y divide-border">{items.map((item) => {
        const mutable = item.status === "planned" || item.status === "skipped";
        const executable = item.status === "planned" && allowExecution;
        return (
          <article key={item.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold"><bdi dir="auto">{item.frozen_name}</bdi></p>
                <p className="mt-0.5 text-xs text-muted-foreground">{sourceLabel(item.source_type, language)} · <bdi dir="auto">{item.resolved_serving_label ?? text.serving}</bdi> · {item.status === "skipped" ? text.skipped : text.planned}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {executable ? <button type="button" onClick={() => onMarkEaten(item)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">{text.markEaten}</button> : null}
                <ActionMenu label={`${text.actions} ${item.frozen_name}`} visibleLabel={text.more}>
                  {executable ? <ActionMenuItem onSelect={() => onLogWithChanges(item)}>{text.logChanges}</ActionMenuItem> : null}
                  {executable ? <ActionMenuItem onSelect={() => onSkip(item)}>{text.skip}</ActionMenuItem> : null}
                  <ActionMenuItem disabled={!mutable} onSelect={() => onEdit(item)}>{text.edit}</ActionMenuItem>
                  <ActionMenuItem disabled={!mutable} onSelect={() => onMove(item)}>{text.move}</ActionMenuItem>
                  <ActionMenuItem onSelect={() => onCopy(item)}>{text.copy}</ActionMenuItem>
                </ActionMenu>
              </div>
            </div>
          </article>
        );
      })}</div> : <p className="pb-1 text-sm text-muted-foreground">{text.nothing}</p>}
    </section>
  );
}
