
"use client";

import { CheckCircle2, PlusCircle, Search, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { addFoodToMealPlan, addGlobalFoodToToday, getDefaultFoodCategories, getGlobalFoods, mealTypes } from "@/services/database/repository";
import { defaultTargets, remainingMacros, scaleFoodMacros, validateFoodLogInput } from "@/services/nutrition/calculations";
import type { FoodItem, FoodLog, MealPlanItem, MealType } from "@/types";
import { nutritionDisclaimer } from "@/data/egyptian-foods";

const pageSize = 12;

export function FoodBrowser({
  initialLogs = [],
  onLogAdded,
  onPlanAdded,
  defaultMealType = "Breakfast"
}: {
  initialLogs?: FoodLog[];
  onLogAdded?: (log: FoodLog) => void;
  onPlanAdded?: (item: MealPlanItem) => void;
  defaultMealType?: MealType;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [categories] = useState<string[]>(() => getDefaultFoodCategories());
  const [selectedCategory, setSelectedCategory] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<FoodLog[]>(initialLogs);
  const [isLoadingFoods, setIsLoadingFoods] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [selectedCategory, debouncedQuery]);

  useEffect(() => {
    if (!selectedCategory && !debouncedQuery) {
      setFoods([]);
      setIsLoadingFoods(false);
      setLoadError("");
      return;
    }

    let active = true;
    setIsLoadingFoods(true);
    getGlobalFoods(debouncedQuery, { category: selectedCategory || undefined, limit: 48 })
      .then((items) => {
        if (!active) return;
        setFoods(items);
        setLoadError("");
      })
      .catch((error) => {
        if (!active) return;
        setFoods([]);
        setLoadError(error instanceof Error ? error.message : "Could not load foods.");
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
          calories: sum.calories + Number(log.calories),
          protein_g: sum.protein_g + Number(log.protein_g),
          carbs_g: sum.carbs_g + Number(log.carbs_g),
          fat_g: sum.fat_g + Number(log.fat_g)
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
    if (validation) return toast({ title: "Check this food entry", description: validation });

    try {
      const log = await addGlobalFoodToToday({
        userId: user?.id ?? "mock-user",
        food,
        quantity,
        mealType
      });
      setLogs((current) => [log, ...current]);
      onLogAdded?.(log);
      const remaining = remainingMacros(defaultTargets, {
        calories: totals.calories + macros.calories,
        protein_g: totals.protein_g + macros.protein_g,
        carbs_g: totals.carbs_g + macros.carbs_g,
        fat_g: totals.fat_g + macros.fat_g
      });
      toast({
        title: "Added to today's calories",
        description: `${mealType}: +${macros.calories} kcal | remaining ${remaining.calories} kcal`
      });
    } catch (error) {
      toast({
        title: "Could not add meal",
        description: error instanceof Error ? error.message : "Please check Supabase and try again."
      });
    }
  }

  async function addToPlan(food: FoodItem) {
    const quantity = quantities[food.id] ?? 1;
    const macros = scaleFoodMacros(food, quantity);
    const validation = validateFoodLogInput(food.food_name, quantity, macros);
    if (validation) return toast({ title: "Check this food entry", description: validation });

    try {
      const item = await addFoodToMealPlan({
        userId: user?.id ?? "mock-user",
        food,
        quantity,
        mealType
      });
      onPlanAdded?.(item);
      toast({ title: "Added to My Meal Plan", description: `${food.food_name} added to ${mealType}. It will count after you mark it done.` });
    } catch (error) {
      toast({ title: "Could not add to plan", description: error instanceof Error ? error.message : "Run the latest SQL migration first." });
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-blue-50">
        <CardContent className="pt-5">
          <p className="text-sm font-semibold text-blue-950">{nutritionDisclaimer}</p>
          <p className="mt-1 text-sm text-blue-800">Food does not load all at once. Choose a category or search, then add it to your plan or log it now.</p>
        </CardContent>
      </Card>

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
        <Select value={mealType} onValueChange={(value) => setMealType(value as MealType)}>
          <SelectTrigger>
            <SelectValue placeholder="Meal" />
          </SelectTrigger>
          <SelectContent>
            {mealTypes.map((type) => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-wrap lg:overflow-visible">
        {categories.map((category) => (
          <Button
            key={category}
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
          Choose a category or search. This keeps the mobile page fast and prevents the full food database from rendering at once.
        </div>
      ) : null}

      {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
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
                  <div>
                    <h3 className="font-semibold text-slate-950">{food.food_name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{food.serving_size}</p>
                  </div>
                  <Badge>{food.category ?? "Food"}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  <Macro label="kcal" value={macros.calories} />
                  <Macro label="protein" value={`${macros.protein_g}g`} />
                  <Macro label="carbs" value={`${macros.carbs_g}g`} />
                  <Macro label="fat" value={`${macros.fat_g}g`} />
                </div>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <Label htmlFor={`quantity-${food.id}`}>Quantity</Label>
                    <span className="text-sm text-muted-foreground">{quantity} serving</span>
                  </div>
                  <Input
                    id={`quantity-${food.id}`}
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={quantity}
                    onChange={(event) => setQuantities((current) => ({ ...current, [food.id]: Number(event.target.value) || 1 }))}
                    placeholder="Meal quantity, e.g. 1.5 servings"
                  />
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" onClick={() => addToPlan(food)}>
                    <PlusCircle className="h-4 w-4" />
                    Add to plan
                  </Button>
                  <Button onClick={() => logFoodNow(food)}>
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
          <Button variant="outline" onClick={() => setVisibleCount((current) => current + pageSize)}>
            Load more foods
          </Button>
        </div>
      ) : null}
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
