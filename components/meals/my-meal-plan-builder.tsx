
"use client";

import { CheckCircle2, PlusCircle, Trash2, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FoodBrowser } from "@/components/meals/food-browser";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { deleteMealPlanItem, getTodayMealPlanItems, markMealPlanItemDone, mealTypes } from "@/services/database/repository";
import { sumFoodLogs } from "@/services/nutrition/calculations";
import type { FoodLog, MealPlanItem, MealType } from "@/types";

function emptyTotals() {
  return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
}

export function MyMealPlanBuilder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<MealPlanItem[]>([]);
  const [createdLogs, setCreatedLogs] = useState<FoodLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);

  async function loadPlan() {
    if (!user) return;
    setIsLoading(true);
    try {
      setItems(await getTodayMealPlanItems(user.id));
    } catch (error) {
      toast({ title: "Could not load My Meal Plan", description: error instanceof Error ? error.message : "Run the latest SQL migration first." });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPlan();
  }, [user]);

  const plannedTotals = useMemo(() => {
    return items
      .filter((item) => item.status === "planned")
      .reduce(
        (sum, item) => ({
          calories: sum.calories + Number(item.calories),
          protein_g: sum.protein_g + Number(item.protein_g),
          carbs_g: sum.carbs_g + Number(item.carbs_g),
          fat_g: sum.fat_g + Number(item.fat_g)
        }),
        emptyTotals()
      );
  }, [items]);

  const doneTotals = useMemo(() => {
    const doneItems = items
      .filter((item) => item.status === "done")
      .map((item) => ({
        calories: Number(item.calories),
        protein_g: Number(item.protein_g),
        carbs_g: Number(item.carbs_g),
        fat_g: Number(item.fat_g)
      })) as FoodLog[];
    return sumFoodLogs([...doneItems, ...createdLogs]);
  }, [createdLogs, items]);

  async function markDone(item: MealPlanItem) {
    try {
      setIsUpdatingId(item.id);
      const result = await markMealPlanItemDone(item);
      setItems((current) => current.map((currentItem) => (currentItem.id === result.item.id ? result.item : currentItem)));
      if (result.log) setCreatedLogs((current) => [result.log, ...current]);
      toast({ title: "Meal marked done", description: `${item.food_name} was added to today's calories.` });
    } catch (error) {
      toast({ title: "Could not mark meal done", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function removeItem(item: MealPlanItem) {
    try {
      setIsUpdatingId(item.id);
      await deleteMealPlanItem(item);
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      toast({ title: "Meal removed", description: item.status === "done" ? "Linked calorie log was removed too." : "Planned meal was removed." });
    } catch (error) {
      toast({ title: "Could not remove meal", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  function addPlannedItem(item: MealPlanItem) {
    setItems((current) => [item, ...current]);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Planned left" value={plannedTotals.calories} detail={`${plannedTotals.protein_g}g protein planned`} />
        <SummaryCard label="Done today" value={doneTotals.calories} detail={`${doneTotals.protein_g}g protein logged`} />
        <SummaryCard label="Planned carbs" value={plannedTotals.carbs_g} suffix="g" detail={`${plannedTotals.fat_g}g fat planned`} />
        <SummaryCard label="Done carbs" value={doneTotals.carbs_g} suffix="g" detail={`${doneTotals.fat_g}g fat logged`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {mealTypes.map((type) => (
          <MealColumn key={type} type={type} items={items.filter((item) => item.meal_type === type)} onDone={markDone} onDelete={removeItem} updatingId={isUpdatingId} />
        ))}
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading today's meal plan...</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5" />
            Add food to My Meal Plan
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Planned food does not count in calories yet. It counts only when you mark it done.
          </p>
        </CardHeader>
        <CardContent>
          <FoodBrowser onPlanAdded={addPlannedItem} />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, detail, suffix = " kcal" }: { label: string; value: number; detail: string; suffix?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-bold">{Math.round(Number(value) || 0)}{suffix}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function MealColumn({
  type,
  items,
  onDone,
  onDelete,
  updatingId
}: {
  type: MealType;
  items: MealPlanItem[];
  onDone: (item: MealPlanItem) => void;
  onDelete: (item: MealPlanItem) => void;
  updatingId: string | null;
}) {
  const totals = items.reduce(
    (sum, item) => ({
      calories: sum.calories + Number(item.calories),
      protein_g: sum.protein_g + Number(item.protein_g)
    }),
    { calories: 0, protein_g: 0 }
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><Utensils className="h-4 w-4" /> {type}</span>
          <Badge variant="outline">{items.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{Math.round(totals.calories)} kcal | {Math.round(totals.protein_g)}g protein</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!items.length ? <p className="text-sm text-muted-foreground">No food planned yet.</p> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-md border bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold leading-5">{item.food_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.quantity}x {item.serving_size}</p>
                <p className="mt-1 text-xs text-muted-foreground">{Math.round(Number(item.calories))} kcal | {Math.round(Number(item.protein_g))}g protein</p>
              </div>
              <Badge variant={item.status === "done" ? "success" : "outline"}>{item.status}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <Button size="sm" onClick={() => onDone(item)} disabled={item.status === "done" || updatingId === item.id}>
                <CheckCircle2 className="h-4 w-4" />
                {item.status === "done" ? "Done" : "Mark done"}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => onDelete(item)} disabled={updatingId === item.id} aria-label={`Remove ${item.food_name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
