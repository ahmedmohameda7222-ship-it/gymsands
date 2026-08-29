import { RecipeEditor } from "@/components/nutrition/recipes/recipe-editor";

export default async function MyRecipeEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ assistant?: string; foodId?: string; foodName?: string }>;
}) {
  const [{ recipeId }, query] = await Promise.all([params, searchParams]);
  const assistantMode = query.assistant === "create" || query.assistant === "import" || query.assistant === "finish" ? query.assistant : null;
  const linkedFood = query.foodId && query.foodName ? { id: query.foodId, name: query.foodName } : null;
  return <RecipeEditor recipeId={recipeId} initialAssistantMode={assistantMode} linkedFood={linkedFood} />;
}
