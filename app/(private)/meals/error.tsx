"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function MealsError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="space-y-4 pt-6 text-center">
        <h2 className="text-2xl font-bold text-slate-950">Meal Section could not load</h2>
        <p className="mx-auto max-w-2xl text-sm text-amber-900">
          Something interrupted the food browser. Try again or return to the dashboard.
        </p>
        <p className="mx-auto max-w-2xl break-words text-xs text-amber-800">{error.message}</p>
        <div className="flex justify-center gap-2">
          <Button type="button" onClick={reset}>Try again</Button>
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard")}>Dashboard</Button>
        </div>
      </CardContent>
    </Card>
  );
}
