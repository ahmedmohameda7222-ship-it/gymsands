"use client";

import { AiActionRequestDialog, type AiActionOption } from "@/components/ai/ai-action-request-dialog";
import { Disclosure } from "@/components/ui/disclosure";
import type { MealPlanItem } from "@/types";

const primaryFixes: AiActionOption[] = [
  { type: "regenerate_meal", label: "Replace", description: "Ask ChatGPT for a replacement while keeping the date, meal type, and nutrition context." },
  { type: "make_meal_cheaper", label: "Cheaper", description: "Ask ChatGPT for a lower-cost version using your saved budget." },
  { type: "make_meal_faster", label: "Faster", description: "Ask ChatGPT for a quicker version using your saved cooking preferences." }
];

const moreFixes: AiActionOption[] = [
  { type: "make_meal_higher_protein", label: "More protein", description: "Ask ChatGPT for a practical higher-protein version with complete nutrition values." },
  { type: "replace_meal_ingredient", label: "Swap ingredient", description: "Ask ChatGPT to replace one ingredient while respecting preferences and allergies." },
  { type: "make_meal_dairy_free", label: "Dairy-free", description: "Ask ChatGPT for a dairy-free version with updated nutrition values." },
  { type: "make_meal_gluten_free", label: "Gluten-free", description: "Ask ChatGPT for a gluten-free version with updated nutrition values." },
  { type: "make_meal_cuisine", label: "Change cuisine", description: "Ask ChatGPT for an Egyptian or Middle Eastern version within your saved preferences." }
];

function contextFor(item: MealPlanItem) {
  return {
    meal_item: item,
    date: item.plan_date,
    meal_type: item.meal_type,
    saved_macros: { calories: item.calories, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g }
  };
}

export function MealAiActions({ item }: { item: MealPlanItem }) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-foreground">ChatGPT help</p>
      <p className="text-xs leading-5 text-muted-foreground">Plaivra prepares a request. You review ChatGPT’s answer before saving any change.</p>
      <AiActionRequestDialog
        actions={primaryFixes}
        sourceType="meal_plan_item"
        sourceId={item.id}
        context={contextFor(item)}
        buttonVariant="outline"
        className="grid grid-cols-3 gap-2"
      />
      <Disclosure title="More ChatGPT help" description="Protein, ingredient, dietary, and cuisine options">
        <AiActionRequestDialog
          actions={moreFixes}
          sourceType="meal_plan_item"
          sourceId={item.id}
          context={contextFor(item)}
          buttonVariant="ghost"
          className="grid gap-1 sm:grid-cols-2"
        />
      </Disclosure>
    </div>
  );
}
