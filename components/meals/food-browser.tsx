"use client";

import { AlertTriangle, CheckCircle2, PlusCircle, Search, Utensils } from "lucide-react";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";
import { addFoodToMealPlan, addGlobalFoodToToday, getGlobalFoods } from "@/services/database/repository";
import { defaultTargets, remainingMacros, scaleFoodMacros, validateFoodLogInput } from "@/services/nutrition/calculations";
import { egyptianFoods, nutritionDisclaimer } from "@/data/egyptian-foods";
import type { FoodItem, FoodLog, MealPlanItem, MealType } from "@/types";

const pageSize = 12;
const mealOptions: MealType[] = ["Breakfast", "Lunch", "Snack", "Dinner"];
const fallbackCategories = Array.from(new Set(egyptianFoods.map((food) => food.category).filter((category): category is string => Boolean(category)))).sort();

type FoodBrowserProps = {
  initialLogs?: FoodLog[];
  onLogAdded?: (log: FoodLog) => void;
  onPlanAdded?: (item: MealPlanItem) => void;
  defaultMealType?: MealType;
};

type Notice = {
  type: "success" | "error" | "info";
  title: string;
  description?: string;
};

class FoodBrowserBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { message: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : "The food picker could not load." };
  }

  render() {
    if (this.state.message) {
      return (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-3 pt-5 text-sm text-amber-950">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Food picker could not load
            </div>
            <p>Open Dashboard, then come back. If it keeps happening, run the latest meal-plan SQL migration and redeploy.</p>
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

export function FoodBrowser(props: FoodBrowserProps) {
  return (
    <FoodBrowserBoundary>
      <FoodBrowserInner {...props} />
    </FoodBrowserBoundary>
  );
}

function FoodBrowserInner({
  initialLogs = [],
  onLogAdded,
  onPlanAdded,
  defaultMealType = "Breakfast"
}: FoodBrowserProps) {
  const { user } = useAuth();
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<FoodLog[]>(initialLogs);
  const [isLoadingFoods, setIsLoadingFoods] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [selectedCategory, debouncedQuery]);

  useEffect(() => {
    if (!selectedCategory && !debouncedQuery) {
      setFoods([]);
      setIsLoadingFoods(false);
      return;
    }

    let active = true;
    setIsLoadingFoods(true);
    setNotice(null);

    getGlobalFoods(debouncedQuery, { category: selectedCategory || undefined, limit: 60 })
      .then((items) => {
        if (!active) return;
        setFoods(items.map(normalizeFoodItem));
      })
      .catch((error) => {
        if (!active) return;
        const localFallback = egyptianFoods
          .filter((food) => (!selectedCategory || food.category === selectedCategory) && (!debouncedQuery || food.food_name.toLowerCase().includes(debouncedQuery.toLowerCase())))
          .slice(0, 60)
          .map(normalizeFoodItem);
        setFoods(localFallback);
        setNotice({
          type: "error",
          title: "Supabase foods could not load",
          description: error instanceof Error ? error.message : "Showing local fallback foods."
        });
      })
      .finally(() => {
        if (active) setIsLoadingFoods(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery, selectedCategory]);

  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  const totals = useMemo(
    () =>
      logs.reduce(
        (sum, log) => ({
          calories: sum.calories + toNumber(log.calories),
          protein_g: sum.protein_g + toNumber(log.protein_g),
          carbs_g: sum.carbs_g + toNumber(log.carbs_g),
          fat_g: sum.fat_g + toNumber(log.fat_g)
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
      ),
    [logs]
  );

  const visibleFoods = useMemo(() => foods.slice(0, visibleCount), [foods, visibleCount]);

  async function logFoodNow(food: FoodItem) {
    const quantity = quantities[food.id] ?? 1;
    const macros = scaleFoodMacros(food, quantity);
    const validation = validateFoodLogInput(food.food_name, quantity, macros);
    if (validation) {
      setNotice({ type: "error", title: "Check this food entry", description: validation });
      return;
    }

    if (!user?.id) {
      setNotice({ type: "error", title: "Login required", description: "Please log in again before saving meals." });
      return;
    }

    try {
      const log = await addGlobalFoodToToday({ userId: user.id, food, quantity, mealType });
      setLogs((current) => [log, ...current]);
      onLogAdded?.(log);
      const remaining = remainingMacros(defaultTargets, {
        calories: totals.calories + macros.calories,
        protein_g: totals.protein_g + macros.protein_g,
        carbs_g: totals.carbs_g + macros.carbs_g,
        fat_g: totals.fat_g + macros.fat_g
      });
      setNotice({
        type: "success",
        title: "Added to today's calories",
        description: `${mealType}: +${macros.calories} kcal. Remaining target: ${remaining.calories} kcal.`
      });
    } catch (error) {
      setNotice({
        type: "error",
        title: "Could not add meal",
        description: error instanceof Error ? error.message : "Please check Supabase and try again."
      });
    }
  }

  async function addToPlan(food: FoodItem) {
    const quantity = quantities[food.id] ?? 1;
    const macros = scaleFoodMacros(food, quantity);
    const validation = validateFoodLogInput(food.food_name, quantity, macros);
    if (validation) {
      setNotice({ type: "error", title: "Check this food entry", description: validation });
      return;
    }

    if (!user?.id) {
      setNotice({ type: "error", title: "Login required", description: "Please log in again before saving your meal plan." });
      return;
    }

    try {
      const item = await addFoodToMealPlan({ userId: user.id, food, quantity, mealType });
      onPlanAdded?.(item);
      setNotice({
        type: "success",
        title: "Added to My Meal Plan",
        description: `${food.food_name} was added to ${mealType}. It counts after Mark done.`
      });
    } catch (error) {
      setNotice({
        type: "error",
        title: "Could not add to plan",
        description: error instanceof Error ? error.message : "Run the latest meal-plan SQL migration first."
      });
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-blue-50">
        <CardContent className="pt-5">
          <p className="text-sm font-semibold text-blue-950">{nutritionDisclaimer}</p>
          <p className="mt-1 text-sm text-blue-800">Choose a category or search first. The full food database is not rendered at once.</p>
        </CardContent>
      </Card>

      {notice ? <NoticeBox notice={notice} onClose={() => setNotice(null)} /> : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search food, e.g. chicken, rice, sauce"
            className="pl-10"
          />
        </div>
        <select
          value={mealType}
          onChange={(event) => setMealType(event.target.value as MealType)}
          className="h-11 w-full rounded-md border bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-ring"
          aria-label="Meal type"
        >
          {mealOptions.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-wrap lg:overflow-visible">
        {fallbackCategories.map((category) => (
          <Button
            key={category}
            type="button"
            variant={selectedCategory === category ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory((current) => (current === category ? "" : category))}
            className="shrink-0"
          >
            {category}
          </Button>
        ))}
      </div>

      {!selectedCategory && !debouncedQuery ? (
        <div className="rounded-md border bg-white p-4 text-sm text-muted-foreground">
          Choose a category or search. This keeps the page fast on mobile.
        </div>
      ) : null}

      {isLoadingFoods ? <p className="text-sm text-muted-foreground">Loading foods...</p> : null}
      {!isLoadingFoods && (selectedCategory || debouncedQuery) && !foods.length ? (
        <p className="text-sm text-muted-foreground">No foods found. Try another category or search word.</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleFoods.map((food) => {
          const quantity = quantities[food.id] ?? 1;
          const macros = scaleFoodMacros(food, quantity);
          return (
            <Card key={food.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-950">{food.food_name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{food.serving_size}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                    {food.category || "Food"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  <Macro label="kcal" value={macros.calories} />
                  <Macro label="protein" value={`${macros.protein_g}g`} />
                  <Macro label="carbs" value={`${macros.carbs_g}g`} />
                  <Macro label="fat" value={`${macros.fat_g}g`} />
                </div>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label htmlFor={`quantity-${food.id}`} className="text-sm font-medium text-slate-800">Quantity</label>
                    <span className="text-sm text-muted-foreground">{quantity} serving</span>
                  </div>
                  <Input
                    id={`quantity-${food.id}`}
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={quantity}
                    onChange={(event) => setQuantities((current) => ({ ...current, [food.id]: Math.max(0.1, Number(event.target.value) || 1) }))}
                    placeholder="Meal quantity, e.g. 1.5 servings"
                  />
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="outline" onClick={() => addToPlan(food)}>
                    <PlusCircle className="h-4 w-4" />
                    Add to plan
                  </Button>
                  <Button type="button" onClick={() => logFoodNow(food)}>
                    <CheckCircle2 className="h-4 w-4" />
                    Done now
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {foods.length > visibleCount ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => setVisibleCount((current) => current + pageSize)}>
            Load more foods
          </Button>
        </div>
      ) : null}
    </div>
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

function Macro({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function normalizeFoodItem(food: FoodItem): FoodItem {
  return {
    ...food,
    id: String(food.id || `food-${food.food_name || Math.random()}`),
    food_name: String(food.food_name || "Unnamed food"),
    serving_size: String(food.serving_size || "1 serving"),
    calories: toNumber(food.calories),
    protein_g: toNumber(food.protein_g),
    carbs_g: toNumber(food.carbs_g),
    fat_g: toNumber(food.fat_g),
    category: food.category || "Food"
  };
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
