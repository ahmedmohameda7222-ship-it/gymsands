"use client";

import { Barcode, ChefHat, Copy, Search, Trash2, Utensils } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FoodLog } from "@/types";
import { deleteFoodLog } from "@/services/database/nutrition";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { InlineFeedback } from "@/components/motion";
import { motion } from "framer-motion";

export function FoodLogList({
  logs = [],
  onDeleted,
  title = "Today's food log",
  onAddAction,
  onCustomFoodAction,
  onScanAction,
  onCopyPrevious,
  copyStatus,
}: {
  logs?: FoodLog[];
  onDeleted?: (id: string) => void;
  title?: string;
  onAddAction?: () => void;
  onCustomFoodAction?: () => void;
  onScanAction?: () => void;
  onCopyPrevious?: () => void;
  copyStatus?: string;
}) {
  const { toast } = useToast();
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const [deleteFeedback, setDeleteFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);

  async function remove(log: FoodLog) {
    if (pendingDeleteIds.has(log.id)) return;
    setPendingDeleteIds((current) => new Set(current).add(log.id));
    setDeleteFeedback({ type: "info", message: `Deleting ${log.food_name || "food"}...` });
    try {
      await deleteFoodLog(log.id);
      onDeleted?.(log.id);
      setDeleteFeedback({ type: "info", message: `${log.food_name || "Food"} was deleted.` });
      toast({ title: "Food log deleted", description: "Today has been updated." });
    } catch (error) {
      setDeleteFeedback({ type: "error", message: `Could not delete ${log.food_name || "food"}. Your log is unchanged. ${userSafeError(error)}` });
      toast({
        title: "Could not delete food",
        description: userSafeError(error),
      });
    } finally {
      setPendingDeleteIds((current) => {
        const next = new Set(current);
        next.delete(log.id);
        return next;
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
        <InlineFeedback message={deleteFeedback?.message} variant={deleteFeedback?.type === "error" ? "error" : "info"} onClose={() => setDeleteFeedback(null)} />
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
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
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
                      className="h-12 w-12 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => remove(log)}
                      disabled={pendingDeleteIds.has(log.id)}
                      aria-label={`Delete ${log.food_name || "food"}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </motion.div>
                ))}
              </div>
            );
          })
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="solid-row flex flex-col items-start gap-4 border-dashed p-5"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">No food logged yet</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Manual add is available when you want to correct or enter something yourself. Search, custom food, barcode, and copy-yesterday stay available as fallback controls.</p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {onAddAction ? <Button className="min-h-12" onClick={onAddAction}><Search className="h-4 w-4" /> Search and add food</Button> : null}
              {onCustomFoodAction ? <Button className="min-h-12" variant="outline" onClick={onCustomFoodAction}><ChefHat className="h-4 w-4" /> Custom food or meal</Button> : null}
              {onScanAction ? <Button className="min-h-12" variant="outline" onClick={onScanAction}><Barcode className="h-4 w-4" /> Scan barcode</Button> : null}
              {onCopyPrevious ? <Button className="min-h-12" variant="outline" onClick={onCopyPrevious}><Copy className="h-4 w-4" /> Copy previous day</Button> : null}
            </div>
            <InlineFeedback message={copyStatus} />
          </motion.div>
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
