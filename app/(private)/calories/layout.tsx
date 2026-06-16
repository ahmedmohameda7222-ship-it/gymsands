import type { ReactNode } from "react";
import { NutritionCopyCleanup } from "@/components/meals/nutrition-copy-cleanup";

export default function CaloriesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NutritionCopyCleanup />
      {children}
    </>
  );
}
