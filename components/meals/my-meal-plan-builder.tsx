"use client";

import { AlertTriangle, CheckCircle2, PlusCircle, Trash2, Utensils } from "lucide-react";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { FoodBrowser } from "@/components/meals/food-browser";
import { deleteMealPlanItem, getTodayMealPlanItems, markMealPlanItemDone, mealTypes } from "@/services/database/repository";
import type { MealPlanItem, MealType } from "@/types";

type MacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type Notice = {
  type: "success" | "error" | "info";
  title: string;
  description?: string;
};

class MealPlanBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { message: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : "My Meal Plan could not load." };
  }

  render() {
    if (this.state.message) {
      return (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-3 pt-5 text-sm text-amber-950">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              My Meal Plan could not load
            </div>
            <p>The page stayed open, but one meal-plan widget crashed. Try again after redeploying the fixed files.</p>
            <p className="break-words text-xs text-amber-800">{this.state.message}</p>
            <Button variant="outline" size="sm" onClick={() => this.setState({ message: null })}>
              Try again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

function emptyTotals(): MacroTotals {
  return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
}

function addItemToTotals(total: MacroTotals, item: Pick<MealPlanItem, "calories" | "protein_g" | "carbs_g" | "fat_g">): MacroTotals {
  return {
    calories: total.calories + toNumber(item.calories),
    protein_g: total.protein_g + toNumber(item.protein_g),
    carbs_g: total.carbs_g + toNumber(item.carbs_g),
    fat_g: total.fat_g + toNumber(item.fat_g)
  };
}

export function MyMealPlanBuilder() {
  return (
    <MealPlanBoundary>
      <MyMealPlanBuilderInner />
    </MealPlanBoundary>
  );
}

function MyMealPlanBuilderInner() {
  const { user } = useAuth();
  const [items, setItems] = useState<MealPlanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [showFoodPicker, setShowFoodPicker] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPlan() {
      if (!user?.id) {
        if (active) setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setNotice(null);

      try {
        const planItems = await getTodayMealPlanItems(user.id);
        if (active) setItems(planItems.map(normalizeMealPlanItem));
      } catch (error) {
        if (!active) return;
        setItems([]);
        setNotice({
          type: "error",
          title: "Saved meal plan could not load",
          description: error instanceof Error ? error.message : "Run the latest meal-plan SQL migration."
        });
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadPlan();

    return () => {
      active = false;
    };
  }, [user]);

  const plannedTotals = useMemo(() => {
    return items.filter((item) => item.status === "planned").reduce(addItemToTotals, emptyTotals());
  }, [items]);

  const doneTotals = useMemo(() => {
    return items.filter((item) => item.status === "done").reduce(addItemToTotals, emptyTotals());
  }, [items]);

  async function markDone(item: MealPlanItem) {
    if (item.status === "done") return;

    try {
      setIsUpdatingId(item.id);
      setNotice(null);
      const result = await markMealPlanItemDone(item);
      setItems((current) => current.map((currentItem) => (currentItem.id === result.item.id ? normalizeMealPlanItem(result.item) : currentItem)));
      setNotice({ type: "success", title: "Meal marked done", description: `${item.food_name} was added to today's calories.` });
    } catch (error) {
      setNotice({
        type: "error",
        title: "Could not mark meal done",
        description: error instanceof Error ? error.message : "Please run the latest Supabase SQL migration and try again."
      });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function removeItem(item: MealPlanItem) {
    try {
      setIsUpdatingId(item.id);
      setNotice(null);
      await deleteMealPlanItem(item);
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setNotice({ title: "Meal removed", type: "success", description: item.status === "done" ? "Linked calorie log was removed too." : "Planned meal was removed." });
    } catch (error) {
      setNotice({ title: "Could not remove meal", type: "error", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  function addPlannedItem(item: MealPlanItem) {
    const normalizedItem = normalizeMealPlanItem(item);
    setItems((current) => {
      if (current.some((currentItem) => currentItem.id === normalizedItem.id)) return current;
      return [normalizedItem, ...current];
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Planned" value={plannedTotals.calories} detail={`${Math.round(plannedTotals.protein_g)}g protein planned`} />
        <SummaryCard label="Done today" value={doneTotals.calories} detail={`${Math.round(doneTotals.protein_g)}g protein logged`} />
        <SummaryCard label="Planned carbs" value={plannedTotals.carbs_g} suffix="g" detail={`${Math.round(plannedTotals.fat_g)}g fat planned`} />
        <SummaryCard label="Done carbs" value={doneTotals.carbs_g} suffix="g" detail={`${Math.round(doneTotals.fat_g)}g fat logged`} />
      </div>

      {notice ? <NoticeBox notice={notice} onClose={() => setNotice(null)} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Today's meals</h2>
          <p className="text-sm text-muted-foreground">Planned food counts only after you press Mark done.</p>
        </div>
        <Button type="button" onClick={() => setShowFoodPicker((current) => !current)}>
          <PlusCircle className="h-4 w-4" />
          {showFoodPicker ? "Hide food picker" : "Add food"}
        </Button>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading today's meal plan...</p> : null}

      <div className="grid gap-4 xl:grid-cols-4">
        {mealTypes.map((type) => (
          <MealColumn key={type} type={type} items={items.filter((item) => item.meal_type === type)} onDone={markDone} onDelete={removeItem} updatingId={isUpdatingId} />
        ))}
      </div>

      {showFoodPicker ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5" />
              Add food to My Meal Plan
            </CardTitle>
            <p className="text-sm text-muted-foreground">Choose Breakfast, Lunch, Snack, or Dinner before adding food.</p>
          </CardHeader>
          <CardContent>
            <FoodBrowser onPlanAdded={addPlannedItem} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, detail, suffix = " kcal" }: { label: string; value: number; detail: string; suffix?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-bold">
          {Math.round(toNumber(value))}{suffix}
        </p>
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
      calories: sum.calories + toNumber(item.calories),
      protein_g: sum.protein_g + toNumber(item.protein_g)
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
                <p className="mt-1 text-xs text-muted-foreground">{Math.round(toNumber(item.calories))} kcal | {Math.round(toNumber(item.protein_g))}g protein</p>
              </div>
              <Badge variant={item.status === "done" ? "success" : "outline"}>{item.status}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <Button type="button" size="sm" onClick={() => onDone(item)} disabled={item.status === "done" || updatingId === item.id}>
                <CheckCircle2 className="h-4 w-4" />
                {item.status === "done" ? "Done" : "Mark done"}
              </Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => onDelete(item)} disabled={updatingId === item.id} aria-label={`Remove ${item.food_name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function NoticeBox({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const styles =
    notice.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : notice.type === "error"
        ? "border-red-200 bg-red-50 text-red-950"
        : "border-blue-200 bg-blue-50 text-blue-950";

  return (
    <div className={`rounded-md border p-4 text-sm ${styles}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{notice.title}</p>
          {notice.description ? <p className="mt-1 break-words opacity-90">{notice.description}</p> : null}
        </div>
        <button type="button" onClick={onClose} className="text-xs font-semibold underline">
          close
        </button>
      </div>
    </div>
  );
}

function normalizeMealPlanItem(item: MealPlanItem): MealPlanItem {
  return {
    ...item,
    food_name: String(item.food_name || "Unnamed food"),
    serving_size: String(item.serving_size || "1 serving"),
    quantity: toNumber(item.quantity) || 1,
    calories: toNumber(item.calories),
    protein_g: toNumber(item.protein_g),
    carbs_g: toNumber(item.carbs_g),
    fat_g: toNumber(item.fat_g),
    meal_type: mealTypes.includes(item.meal_type) ? item.meal_type : "Breakfast",
    status: item.status === "done" ? "done" : "planned"
  };
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
