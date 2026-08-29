import { RecipeDetail } from "@/components/nutrition/recipes/recipe-detail";

export default async function MyRecipeDetailPage({ params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await params;
  return <RecipeDetail recipeId={recipeId} />;
}
