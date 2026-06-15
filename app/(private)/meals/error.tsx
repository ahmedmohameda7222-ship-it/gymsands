"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function MealsError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <Card className="border-warning/30 bg-warning/10">
      <CardContent className="space-y-4 pt-6 text-center">
        <h2 className="text-2xl font-semibold text-foreground">Meal Section could not load</h2>
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
          Something interrupted the food browser. Try again or return to the dashboard.
        </p>
        <p className="mx-auto max-w-2xl break-words text-xs text-muted-foreground">{error.message}</p>
        <div className="flex justify-center gap-2">
          <Button type="button" onClick={reset}>Try again</Button>
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard")}>Dashboard</Button>
        </div>
      </CardContent>
    </Card>
  );
}
