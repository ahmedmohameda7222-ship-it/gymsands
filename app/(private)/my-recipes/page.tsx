import { Suspense } from "react";

import { AddToHandoffConsumer } from "@/components/nutrition/handoffs/add-to-handoff-consumer";
import { RecipeHome } from "@/components/nutrition/recipes/recipe-home";

export default function MyRecipesPage() {
  return <><RecipeHome /><Suspense fallback={null}><AddToHandoffConsumer destination="recipe" /></Suspense></>;
}
