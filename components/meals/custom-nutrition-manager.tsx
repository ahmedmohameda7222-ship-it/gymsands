"use client";

import { Edit3, Plus, Save, Trash2, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import {
  addCustomMealToLog,
  createFoodKitchen,
  createFoodSubcategory,
  deleteCustomMeal,
  deleteUserFood,
  getCustomMeals,
  getFoodKitchens,
  getFoodLibrary,
  getUserFoods,
  upsertCustomMeal,
  upsertUserFood,
  type CustomMealInput,
  type UserFoodInput
} from "@/services/database/nutrition";
import type { CustomMeal, FoodItem, FoodKitchen, FoodLog, FoodSubcategory, MealType, UserFoodItem } from "@/types";

const mealTypes: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

type FoodDraft = {
  id?: string;
  foodName: string;
  kitchenId: string;
  subcategoryId: string;
  servingSize: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
  sugarG: string;
  sodiumMg: string;
  notes: string;
};

type MealDraftItem = {
  foodId: string;
  quantity: string;
};

const emptyFoodDraft: FoodDraft = {
  foodName: "",
  kitchenId: "",
  subcategoryId: "",
  servingSize: "1 serving",
  calories: "0",
  proteinG: "0",
  carbsG: "0",
  fatG: "0",
  fiberG: "",
  sugarG: "",
  sodiumMg: "",
  notes: ""
};

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function foodMacros(food: FoodItem, quantity: number) {
  return {
    calories: Math.round(Number(food.calories) * quantity),
    protein_g: Math.round(Number(food.protein_g) * quantity * 10) / 10,
    carbs_g: Math.round(Number(food.carbs_g) * quantity * 10) / 10,
    fat_g: Math.round(Number(food.fat_g) * quantity * 10) / 10
  };
}

export function CustomNutritionManager({
  selectedDate,
  onLogAdded
}: {
  selectedDate: string;
  onLogAdded?: (log: FoodLog) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [kitchens, setKitchens] = useState<FoodKitchen[]>([]);
  const [subcategories, setSubcategories] = useState<FoodSubcategory[]>([]);
  const [foods, setFoods] = useState<UserFoodItem[]>([]);
  const [foodLibrary, setFoodLibrary] = useState<FoodItem[]>([]);
  const [meals, setMeals] = useState<CustomMeal[]>([]);
  const [foodDraft, setFoodDraft] = useState<FoodDraft>(emptyFoodDraft);
  const [newKitchenName, setNewKitchenName] = useState("");
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [mealName, setMealName] = useState("");
  const [mealCategory, setMealCategory] = useState("");
  const [mealNotes, setMealNotes] = useState("");
  const [mealType, setMealType] = useState<MealType>("Breakfast");
  const [mealItems, setMealItems] = useState<MealDraftItem[]>([]);
  const [editingMealId, setEditingMealId] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  async function loadData() {
    if (!user?.id) return;
    const [kitchenData, customFoods, library, customMeals] = await Promise.all([
      getFoodKitchens(user.id),
      getUserFoods(user.id),
      getFoodLibrary(user.id, "", { limit: 200 }),
      getCustomMeals(user.id)
    ]);
    setKitchens(kitchenData.kitchens);
    setSubcategories(kitchenData.subcategories);
    setFoods(customFoods);
    setFoodLibrary(library);
    setMeals(customMeals);
    setFoodDraft((current) => ({
      ...current,
      kitchenId: current.kitchenId || kitchenData.kitchens[0]?.id || "",
      subcategoryId: current.subcategoryId || kitchenData.subcategories.find((item) => item.kitchen_id === kitchenData.kitchens[0]?.id)?.id || ""
    }));
  }

  useEffect(() => {
    loadData().catch((error) =>
      toast({ title: "Could not load custom nutrition", description: error instanceof Error ? error.message : "Please refresh." })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const selectedKitchen = kitchens.find((kitchen) => kitchen.id === foodDraft.kitchenId) ?? kitchens[0];
  const visibleSubcategories = subcategories.filter((subcategory) => subcategory.kitchen_id === selectedKitchen?.id);
  const selectedSubcategory = subcategories.find((subcategory) => subcategory.id === foodDraft.subcategoryId);
  const allFoods = useMemo(() => {
    const byId = new Map<string, FoodItem>();
    [...foodLibrary, ...foods].forEach((food) => byId.set(food.id, food));
    return Array.from(byId.values()).sort((a, b) => a.food_name.localeCompare(b.food_name));
  }, [foodLibrary, foods]);
  const mealTotals = useMemo(() => {
    return mealItems.reduce(
      (sum, item) => {
        const food = allFoods.find((candidate) => candidate.id === item.foodId);
        if (!food) return sum;
        const macros = foodMacros(food, Math.max(0.1, numberOrZero(item.quantity) || 1));
        return {
          calories: sum.calories + macros.calories,
          protein_g: Math.round((sum.protein_g + macros.protein_g) * 10) / 10,
          carbs_g: Math.round((sum.carbs_g + macros.carbs_g) * 10) / 10,
          fat_g: Math.round((sum.fat_g + macros.fat_g) * 10) / 10
        };
      },
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  }, [allFoods, mealItems]);

  function patchFoodDraft(patch: Partial<FoodDraft>) {
    setFoodDraft((current) => ({ ...current, ...patch }));
  }

  async function addKitchen() {
    if (!user?.id) return;
    try {
      const kitchen = await createFoodKitchen(user.id, newKitchenName);
      setKitchens((current) => [...current, kitchen].sort((a, b) => a.name.localeCompare(b.name)));
      patchFoodDraft({ kitchenId: kitchen.id, subcategoryId: "" });
      setNewKitchenName("");
      toast({ title: "Kitchen saved", description: `${kitchen.name} is ready for foods.` });
    } catch (error) {
      toast({ title: "Could not save kitchen", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  async function addSubcategory() {
    if (!selectedKitchen) return;
    try {
      const subcategory = await createFoodSubcategory(selectedKitchen.id, newSubcategoryName);
      setSubcategories((current) => [...current, subcategory].sort((a, b) => a.name.localeCompare(b.name)));
      patchFoodDraft({ subcategoryId: subcategory.id });
      setNewSubcategoryName("");
      toast({ title: "Subcategory saved", description: `${subcategory.name} is ready.` });
    } catch (error) {
      toast({ title: "Could not save subcategory", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  function editFood(food: UserFoodItem) {
    setFoodDraft({
      id: food.id,
      foodName: food.food_name,
      kitchenId: food.kitchen_id ?? "",
      subcategoryId: food.subcategory_id ?? "",
      servingSize: food.serving_size,
      calories: String(food.calories),
      proteinG: String(food.protein_g),
      carbsG: String(food.carbs_g),
      fatG: String(food.fat_g),
      fiberG: food.fiber_g === null || food.fiber_g === undefined ? "" : String(food.fiber_g),
      sugarG: food.sugar_g === null || food.sugar_g === undefined ? "" : String(food.sugar_g),
      sodiumMg: food.sodium_mg === null || food.sodium_mg === undefined ? "" : String(food.sodium_mg),
      notes: food.notes ?? ""
    });
  }

  async function saveFood() {
    if (!user?.id || !selectedKitchen || !selectedSubcategory) return;
    const input: UserFoodInput = {
      id: foodDraft.id,
      userId: user.id,
      foodName: foodDraft.foodName,
      kitchenId: selectedKitchen.id,
      cuisine: selectedKitchen.name,
      subcategoryId: selectedSubcategory.id,
      category: selectedSubcategory.name,
      servingSize: foodDraft.servingSize,
      calories: numberOrZero(foodDraft.calories),
      proteinG: numberOrZero(foodDraft.proteinG),
      carbsG: numberOrZero(foodDraft.carbsG),
      fatG: numberOrZero(foodDraft.fatG),
      fiberG: numberOrNull(foodDraft.fiberG),
      sugarG: numberOrNull(foodDraft.sugarG),
      sodiumMg: numberOrNull(foodDraft.sodiumMg),
      notes: foodDraft.notes
    };

    try {
      setIsSaving(true);
      const saved = await upsertUserFood(input);
      setFoods((current) => [saved, ...current.filter((food) => food.id !== saved.id)].sort((a, b) => a.food_name.localeCompare(b.food_name)));
      setFoodLibrary((current) => [saved, ...current.filter((food) => food.id !== saved.id)]);
      setFoodDraft({ ...emptyFoodDraft, kitchenId: selectedKitchen.id, subcategoryId: selectedSubcategory.id });
      toast({ title: "Food saved", description: `${saved.food_name} is saved to your account.` });
    } catch (error) {
      toast({ title: "Could not save food", description: error instanceof Error ? error.message : "Check required fields and macros." });
    } finally {
      setIsSaving(false);
    }
  }

  async function removeFood(food: UserFoodItem) {
    if (!user?.id) return;
    try {
      await deleteUserFood(user.id, food.id);
      setFoods((current) => current.filter((item) => item.id !== food.id));
      setFoodLibrary((current) => current.filter((item) => item.id !== food.id));
      toast({ title: "Food deleted", description: `${food.food_name} was removed.` });
    } catch (error) {
      toast({ title: "Could not delete food", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  function editMeal(meal: CustomMeal) {
    setEditingMealId(meal.id);
    setMealName(meal.meal_name);
    setMealCategory(meal.meal_category ?? "");
    setMealNotes(meal.notes ?? "");
    setMealItems(meal.items.map((item) => ({ foodId: item.food_item_id ?? item.user_food_item_id ?? "", quantity: String(item.quantity) })).filter((item) => item.foodId));
  }

  async function saveMeal() {
    if (!user?.id) return;
    const items = mealItems
      .map((item) => ({ food: allFoods.find((food) => food.id === item.foodId), quantity: Math.max(0.1, numberOrZero(item.quantity) || 1) }))
      .filter((item): item is { food: FoodItem; quantity: number } => Boolean(item.food));
    const input: CustomMealInput = {
      id: editingMealId,
      userId: user.id,
      mealName,
      mealCategory,
      notes: mealNotes,
      items
    };
    try {
      const saved = await upsertCustomMeal(input);
      setMeals((current) => [saved, ...current.filter((meal) => meal.id !== saved.id)].sort((a, b) => a.meal_name.localeCompare(b.meal_name)));
      setEditingMealId(undefined);
      setMealName("");
      setMealCategory("");
      setMealNotes("");
      setMealItems([]);
      toast({ title: "Meal saved", description: `${saved.meal_name} totals ${saved.totals.calories} kcal.` });
    } catch (error) {
      toast({ title: "Could not save meal", description: error instanceof Error ? error.message : "Please add a name and foods." });
    }
  }

  async function removeMeal(meal: CustomMeal) {
    if (!user?.id) return;
    try {
      await deleteCustomMeal(user.id, meal.id);
      setMeals((current) => current.filter((item) => item.id !== meal.id));
      toast({ title: "Meal deleted", description: `${meal.meal_name} was removed.` });
    } catch (error) {
      toast({ title: "Could not delete meal", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  async function logMeal(meal: CustomMeal) {
    if (!user?.id) return;
    try {
      const log = await addCustomMealToLog(user.id, meal, selectedDate, mealType);
      onLogAdded?.(log);
      toast({ title: "Meal logged", description: `${meal.meal_name} was added to ${selectedDate}.` });
    } catch (error) {
      toast({ title: "Could not log meal", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Custom foods and kitchens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input value={newKitchenName} onChange={(event) => setNewKitchenName(event.target.value)} placeholder="Create kitchen, e.g. German Kitchen" />
              <Button type="button" variant="outline" onClick={addKitchen} disabled={!newKitchenName.trim()}>
                <Plus className="h-4 w-4" />
                Add Kitchen
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Food name" value={foodDraft.foodName} onChange={(foodName) => patchFoodDraft({ foodName })} />
              <Field label="Serving size" value={foodDraft.servingSize} onChange={(servingSize) => patchFoodDraft({ servingSize })} />
              <div className="space-y-2">
                <Label>Kitchen</Label>
                <select
                  value={foodDraft.kitchenId}
                  onChange={(event) => {
                    const kitchenId = event.target.value;
                    const firstSubcategory = subcategories.find((subcategory) => subcategory.kitchen_id === kitchenId);
                    patchFoodDraft({ kitchenId, subcategoryId: firstSubcategory?.id ?? "" });
                  }}
                  className="h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  {kitchens.map((kitchen) => (
                    <option key={kitchen.id} value={kitchen.id}>{kitchen.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Subcategory</Label>
                <select
                  value={foodDraft.subcategoryId}
                  onChange={(event) => patchFoodDraft({ subcategoryId: event.target.value })}
                  className="h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  {visibleSubcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 md:col-span-2 md:grid-cols-[1fr_auto]">
                <Input value={newSubcategoryName} onChange={(event) => setNewSubcategoryName(event.target.value)} placeholder="Create subcategory inside selected kitchen" />
                <Button type="button" variant="outline" onClick={addSubcategory} disabled={!newSubcategoryName.trim()}>
                  <Plus className="h-4 w-4" />
                  Add Subcategory
                </Button>
              </div>
              <Field label="Calories" type="number" value={foodDraft.calories} onChange={(calories) => patchFoodDraft({ calories })} />
              <Field label="Protein" type="number" value={foodDraft.proteinG} onChange={(proteinG) => patchFoodDraft({ proteinG })} />
              <Field label="Carbs" type="number" value={foodDraft.carbsG} onChange={(carbsG) => patchFoodDraft({ carbsG })} />
              <Field label="Fat" type="number" value={foodDraft.fatG} onChange={(fatG) => patchFoodDraft({ fatG })} />
              <Field label="Fiber optional" type="number" value={foodDraft.fiberG} onChange={(fiberG) => patchFoodDraft({ fiberG })} />
              <Field label="Sugar optional" type="number" value={foodDraft.sugarG} onChange={(sugarG) => patchFoodDraft({ sugarG })} />
              <Field label="Sodium mg optional" type="number" value={foodDraft.sodiumMg} onChange={(sodiumMg) => patchFoodDraft({ sodiumMg })} />
              <Field label="Notes optional" value={foodDraft.notes} onChange={(notes) => patchFoodDraft({ notes })} />
            </div>
            <Button onClick={saveFood} disabled={isSaving}>
              <Save className="h-4 w-4" />
              {foodDraft.id ? "Save Food Changes" : "Save Custom Food"}
            </Button>

            <div className="grid gap-2">
              {foods.map((food) => (
                <div key={food.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <p className="font-semibold">{food.food_name}</p>
                    <p className="text-sm text-muted-foreground">{food.cuisine || "Custom"} | {food.category || "Food"} | {food.calories} kcal</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="icon" variant="ghost" onClick={() => editFood(food)} aria-label={`Edit ${food.food_name}`}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeFood(food)} aria-label={`Delete ${food.food_name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custom meals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <Field label="Meal name" value={mealName} onChange={setMealName} />
              <Field label="Meal category optional" value={mealCategory} onChange={setMealCategory} />
              <Field label="Meal notes optional" value={mealNotes} onChange={setMealNotes} />
              <div className="grid gap-2">
                {mealItems.map((item, index) => (
                  <div key={`${item.foodId}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_110px_auto]">
                    <select
                      value={item.foodId}
                      onChange={(event) => setMealItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, foodId: event.target.value } : row))}
                      className="h-11 rounded-md border bg-white px-3 text-sm"
                    >
                      <option value="">Choose food</option>
                      {allFoods.map((food) => (
                        <option key={food.id} value={food.id}>{food.food_name}</option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={item.quantity}
                      onChange={(event) => setMealItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row))}
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setMealItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={() => setMealItems((current) => [...current, { foodId: allFoods[0]?.id ?? "", quantity: "1" }])}>
                  <Plus className="h-4 w-4" />
                  Add Food To Meal
                </Button>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="font-semibold">Totals</p>
                <p className="mt-1 text-muted-foreground">
                  {mealTotals.calories} kcal | {mealTotals.protein_g}g protein | {mealTotals.carbs_g}g carbs | {mealTotals.fat_g}g fat
                </p>
              </div>
              <Button type="button" onClick={saveMeal}>
                <Save className="h-4 w-4" />
                {editingMealId ? "Save Meal Changes" : "Save Custom Meal"}
              </Button>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label>Log saved meals as</Label>
                <select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)} className="h-10 rounded-md border bg-white px-3 text-sm">
                  {mealTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              {meals.map((meal) => (
                <div key={meal.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{meal.meal_name}</p>
                      <p className="text-sm text-muted-foreground">{meal.totals.calories} kcal | {meal.items.length} foods</p>
                    </div>
                    <Badge variant="outline">{meal.meal_category || "Meal"}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => logMeal(meal)}>
                      <Utensils className="h-4 w-4" />
                      Add to day
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => editMeal(meal)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => removeMeal(meal)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.1" : undefined} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
