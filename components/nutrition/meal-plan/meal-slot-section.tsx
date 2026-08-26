import { Plus } from "lucide-react";

import type { PlannedOccurrenceRow } from "@/services/nutrition-v1/server/meal-plan";

function sourceLabel(source: PlannedOccurrenceRow["source_type"]) {
  if (source === "saved_meal") return "Saved Meal";
  if (source === "recipe") return "Recipe";
  if (source === "placeholder") return "Placeholder";
  return "Food";
}

export function MealSlotSection({ label, items, allowExecution, onAdd, onMarkEaten, onLogWithChanges }: {
  label: string;
  items: PlannedOccurrenceRow[];
  allowExecution: boolean;
  onAdd: () => void;
  onMarkEaten: (id: string) => void;
  onLogWithChanges: (id: string) => void;
}) {
  return (
    <section className="border-b border-border py-4" aria-label={label}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 className="font-semibold">{label}</h2>
        <button type="button" onClick={onAdd} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />Add</button>
      </div>
      {items.length ? <div className="divide-y divide-border">{items.map((item) => (
        <article key={item.id} className="py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.frozen_name}</p><p className="mt-0.5 text-xs text-muted-foreground">{sourceLabel(item.source_type)} · {item.resolved_serving_label ?? "Serving not specified"} · {item.status.replace("_", " ")}</p></div>
            {item.status === "planned" && allowExecution ? <div className="flex flex-wrap gap-1"><button type="button" onClick={() => onMarkEaten(item.id)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">Mark eaten</button><button type="button" onClick={() => onLogWithChanges(item.id)} className="min-h-11 rounded-xl px-3 text-sm font-medium hover:bg-muted">Log with changes</button></div> : null}
          </div>
        </article>
      ))}</div> : <p className="pb-1 text-sm text-muted-foreground">Nothing planned.</p>}
    </section>
  );
}
