import { CookingMode } from "@/components/nutrition/cooking/cooking-mode";

export default async function RecipeCookingPage({ params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await params;
  return <CookingMode recipeId={recipeId} />;
}
