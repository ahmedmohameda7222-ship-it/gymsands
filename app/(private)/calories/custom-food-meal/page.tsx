import { redirect } from "next/navigation";

export default function CustomFoodMealPage() {
  redirect("/calories/food-hub?builder=1");
}
