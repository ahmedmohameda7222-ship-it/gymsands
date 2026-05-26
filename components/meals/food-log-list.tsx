"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FoodLog } from "@/types";
import { deleteFoodLog } from "@/services/database/repository";
import { useToast } from "@/components/ui/toaster";

export function FoodLogList({ logs = [], onDeleted }: { logs?: FoodLog[]; onDeleted?: (id: string) => void }) {
  const { toast } = useToast();

  async function remove(id: string) {
    try {
      await deleteFoodLog(id);
      onDeleted?.(id);
      toast({ title: "Food log deleted", description: "Today has been updated." });
    } catch (error) {
      toast({
        title: "Could not delete food",
        description: error instanceof Error ? error.message : "Please try again."
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s food log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {logs.length ? (
          logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-3 rounded-md border p-3 transition hover:-translate-y-0.5 hover:shadow-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{log.food_name || "Food"}</p>
                  <Badge variant="outline">{Number(log.quantity) || 1}x</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {toNumber(log.calories)} kcal | {toNumber(log.protein_g)}g protein | {toNumber(log.carbs_g)}g carbs | {toNumber(log.fat_g)}g fat
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(log.id)} aria-label={`Delete ${log.food_name || "food"}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No food logged yet today.</p>
        )}
      </CardContent>
    </Card>
  );
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
