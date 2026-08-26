import { Plus } from "lucide-react";

import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import type { PlannedOccurrenceRow } from "@/services/nutrition-v1/server/meal-plan";

function sourceLabel(source: PlannedOccurrenceRow["source_type"]) {
  if (source === "saved_meal") return "Saved Meal";
  if (source === "recipe") return "Recipe";
  if (source === "placeholder") return "Placeholder";
  return "Food";
}

export function MealSlotSection({
  label,
  items,
  allowExecution,
  markEatenLabel = "Mark eaten",
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
  onAdd: () => void;
  onMarkEaten: (item: PlannedOccurrenceRow) => void;
  onLogWithChanges: (item: PlannedOccurrenceRow) => void;
  onSkip: (item: PlannedOccurrenceRow) => void;
  onEdit: (item: PlannedOccurrenceRow) => void;
  onMove: (item: PlannedOccurrenceRow) => void;
  onCopy: (item: PlannedOccurrenceRow) => void;
}) {
  return (
    <section className="border-b border-border py-4" aria-label={label}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 className="font-semibold">{label}</h2>
        <button type="button" onClick={onAdd} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />Add</button>
      </div>
      {items.length ? <div className="divide-y divide-border">{items.map((item) => {
        const mutable = item.status === "planned" || item.status === "skipped";
        const executable = item.status === "planned" && allowExecution;
        return (
          <article key={item.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.frozen_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{sourceLabel(item.source_type)} · {item.resolved_serving_label ?? "Serving not specified"} · {item.status.replace("_", " ")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {executable ? <button type="button" onClick={() => onMarkEaten(item)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">{markEatenLabel}</button> : null}
                <ActionMenu label={`Actions for ${item.frozen_name}`} visibleLabel="More">
                  {executable ? <ActionMenuItem onSelect={() => onLogWithChanges(item)}>Log with changes</ActionMenuItem> : null}
                  {executable ? <ActionMenuItem onSelect={() => onSkip(item)}>Skip</ActionMenuItem> : null}
                  <ActionMenuItem disabled={!mutable} onSelect={() => onEdit(item)}>Edit</ActionMenuItem>
                  <ActionMenuItem disabled={!mutable} onSelect={() => onMove(item)}>Move</ActionMenuItem>
                  <ActionMenuItem onSelect={() => onCopy(item)}>Copy</ActionMenuItem>
                </ActionMenu>
              </div>
            </div>
          </article>
        );
      })}</div> : <p className="pb-1 text-sm text-muted-foreground">Nothing planned.</p>}
    </section>
  );
}
