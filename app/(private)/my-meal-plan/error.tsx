"use client";

import { RouteError } from "@/components/ui/route-error";
import { useTranslation } from "@/lib/i18n/use-translation";
import { getMealPlanCopy } from "@/lib/meals/meal-plan-copy";

export default function MyMealPlanError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { language, dir } = useTranslation();
  const c = getMealPlanCopy(language);
  return <div dir={dir}><RouteError error={error} reset={reset} title={c.unexpectedTitle} description={c.unexpectedDesc} retryLabel={c.retry} dashboardLabel={c.dashboard} /></div>;
}
