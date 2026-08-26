import { FoodLibraryPage } from "@/components/nutrition/food-library/food-library-page";

// Compatibility boundary: the canonical Food Library replaces the former
// CustomNutritionManager date-aware returnHref builder contract.
export default function FoodHubPage() {
  return <FoodLibraryPage />;
}
