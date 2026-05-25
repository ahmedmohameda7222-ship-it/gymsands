"use client";

import { Search, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { getFoodCategories, getGlobalFoods, addGlobalFoodToToday } from "@/services/database/repository";
import { defaultTargets, remainingMacros, scaleFoodMacros, validateFoodLogInput } from "@/services/nutrition/calculations";
import type { FoodItem, FoodLog } from "@/types";
import { nutritionDisclaimer } from "@/data/egyptian-foods";

const pageSize = 36;

export function FoodBrowser({
  initialLogs = [],
  onLogAdded
}: {
  initialLogs?: FoodLog[];
  onLogAdded?: (log: FoodLog) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<FoodLog[]>(initialLogs);
  const [isLoadingFoods, setIsLoadingFoods] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getFoodCategories()
      .then(setCategories)
      .catch((error) => {
        setCategories([]);
        setLoadError(error instanceof Error ? error.message : "Could not load food categories.");
      });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!selectedCategory && !debouncedQuery) {
      setFoods([]);
      setIsLoadingFoods(false);
      return;
    }

    let active = true;
    setIsLoadingFoods(true);
    getGlobalFoods(debouncedQuery, { category: selectedCategory || undefined, limit: pageSize })
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
          calories: sum.calories + log.calories,
          protein_g: sum.protein_g + log.protein_g,
          carbs_g: sum.carbs_g + log.carbs_g,
          fat_g: sum.fat_g + log.fat_g
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
      ),
    [logs]
  );

  async function addFood(food: FoodItem) {
    const quantity = quantities[food.id] ?? 1;
    const macros = scaleFoodMacros(food, quantity);
    const validation = validateFoodLogInput(food.food_name, quantity, macros);
    if (validation) return toast({ title: "Check this food entry", description: validation });

    try {
      const log = await addGlobalFoodToToday({
        userId: user?.id ?? "mock-user",
        food,
        quantity
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
        title: "Meal added to today",
        description: `+${macros.calories} kcal | +${macros.protein_g}g protein | remaining ${remaining.calories} kcal`
      });
    } catch (error) {
      toast({
        title: "Could not add meal",
        description: error instanceof Error ? error.message : "Please try again after checking Supabase setup."
      });
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-blue-50">
        <CardContent className="pt-5">
          <p className="text-sm font-semibold text-blue-900">{nutritionDisclaimer}</p>
          <p className="mt-1 text-sm text-blue-800">
            Choose a category first. This keeps the Meals page fast and stops all foods loading at once.
          </p>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Egyptian food, e.g. chicken, rice, sauce"
          className="pl-10"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={!selectedCategory ? "default" : "outline"} size="sm" onClick={() => setSelectedCategory("")}>
          Search only
        </Button>
        {categories.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </Button>
        ))}
      </div>

      {!selectedCategory && !debouncedQuery ? (
        <div className="rounded-md border bg-white p-4 text-sm text-muted-foreground">
          Pick Protein Meal, Side, Sauce, Breakfast, Snack, etc. or search by food name.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoadingFoods ? <p className="text-sm text-muted-foreground">Loading foods...</p> : null}
        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
        {!isLoadingFoods && (selectedCategory || debouncedQuery) && !foods.length ? (
          <p className="text-sm text-muted-foreground">No foods found. Try another category or search word.</p>
        ) : null}
        {foods.map((food) => {
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
                    onChange={(event) => setQuantities((current) => ({ ...current, [food.id]: Number(event.target.value) }))}
                    placeholder="Meal quantity, e.g. 1.5 servings"
                  />
                </div>
                <Progress value={Math.min(100, (macros.calories / defaultTargets.calories) * 100)} className="mt-4" />
                <Button className="mt-4 w-full" onClick={() => addFood(food)}>
                  <Utensils className="h-4 w-4" />
                  Add to Today
                </Button>
              </CardContent>
            </Card>
          );
        })}
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
