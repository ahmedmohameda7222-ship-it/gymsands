"use client";

import { Trash2, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FoodLog } from "@/types";
import { deleteFoodLog } from "@/services/database/nutrition";
import { useToast } from "@/components/ui/toaster";

export function FoodLogList({
  logs = [],
  onDeleted,
  title = "Today's food log",
  onAddAction,
}: {
  logs?: FoodLog[];
  onDeleted?: (id: string) => void;
  title?: string;
  onAddAction?: () => void;
}) {
  const { toast } = useToast();

  async function remove(id: string) {
    try {
      await deleteFoodLog(id);
      onDeleted?.(id);
      toast({ title: "Food log deleted", description: "Today has been updated." });
    } catch (error) {
      toast({
        title: "Could not delete food",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  const grouped = groupByMealType(logs);
  const mealOrder = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
  const hasLogs = logs.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Utensils className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasLogs ? (
          mealOrder.map((meal) => {
            const items = grouped[meal];
            if (!items?.length) return null;
            return (
              <div key={meal} className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{meal === "Snack" ? "Snacks" : meal}</p>
                  <div className="flex-1 border-t border-border/70" />
                  <Badge variant="outline" className="text-[11px]">
                    {items.reduce((s, l) => s + toNumber(l.calories), 0)} kcal
                  </Badge>
                </div>
                {items.map((log) => (
                  <div
                    key={log.id}
                    className="solid-row flex items-center justify-between gap-3 p-3 transition-colors hover:border-primary/40 hover:bg-muted/20"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{log.food_name || "Food"}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">{Number(log.quantity) || 1}x</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {toNumber(log.calories)} kcal · {toNumber(log.protein_g)}g P · {toNumber(log.carbs_g)}g C · {toNumber(log.fat_g)}g F
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => remove(log.id)}
                      aria-label={`Delete ${log.food_name || "food"}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            );
          })
        ) : (
          <div className="solid-row flex flex-col items-start gap-3 border-dashed p-5">
            <div>
              <p className="text-sm font-semibold text-foreground">No food logged yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Log your first meal to start tracking today.</p>
            </div>
            {onAddAction ? (
              <Button className="min-h-11" onClick={onAddAction}>
                <Utensils className="mr-2 h-4 w-4" />
                Log food
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function groupByMealType(logs: FoodLog[]) {
  return logs.reduce<Record<string, FoodLog[]>>((acc, log) => {
    const meal = log.meal_type || "Other";
    acc[meal] = acc[meal] || [];
    acc[meal].push(log);
    return acc;
  }, {});
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
