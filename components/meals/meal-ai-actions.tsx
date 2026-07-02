"use client";

import { AiActionRequestDialog } from "@/components/ai/ai-action-request-dialog";
import { Button } from "@/components/ui/button";
import type { MealPlanItem } from "@/types";

export function MealAiActions({ item, onAddToGrocery }: { item: MealPlanItem; onAddToGrocery: (item: MealPlanItem) => void }) {
  return (
    <div className="mt-2 space-y-2">
      <details className="rounded-[14px] border bg-card">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-primary">ChatGPT meal actions</summary>
        <div className="border-t p-2">
          <AiActionRequestDialog
            actions={[
              { type: "regenerate_meal", label: "Regenerate", description: "Ask ChatGPT for a replacement meal while keeping the date, meal type, and target context." },
              { type: "make_meal_cheaper", label: "Cheaper", description: "Ask ChatGPT for a lower-cost version using the saved budget profile." },
              { type: "make_meal_faster", label: "Faster", description: "Ask ChatGPT for a faster version using the saved prep-time profile." },
              { type: "make_meal_higher_protein", label: "Higher protein", description: "Ask ChatGPT for a higher-protein version and provide complete macros." },
              { type: "replace_meal_ingredient", label: "Replace ingredient", description: "Ask ChatGPT to replace one ingredient after considering preferences and allergies." },
              { type: "make_meal_dairy_free", label: "Dairy-free", description: "Ask ChatGPT for a dairy-free version and updated macros." },
              { type: "make_meal_gluten_free", label: "Gluten-free", description: "Ask ChatGPT for a gluten-free version and updated macros." },
              { type: "make_meal_cuisine", label: "Egyptian / Middle Eastern", description: "Ask ChatGPT for an Egyptian or Middle Eastern version within saved constraints." }
            ]}
            sourceType="meal_plan_item"
            sourceId={item.id}
            context={{ meal_item: item, date: item.plan_date, meal_type: item.meal_type, saved_macros: { calories: item.calories, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g } }}
            title="Meal request"
            buttonVariant="ghost"
            className="grid gap-1 sm:grid-cols-2"
          />
        </div>
      </details>
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => onAddToGrocery(item)}>Add to grocery list</Button>
    </div>
  );
}
