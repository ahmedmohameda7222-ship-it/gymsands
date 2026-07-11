"use client";

import { AlertTriangle, CheckCircle2, Edit3, Loader2, Plus, Save, Trash2, Utensils, XCircle } from "lucide-react";
import { useEffect, useMemo, useState, type InputHTMLAttributes } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CardSkeleton, ErrorState } from "@/components/ui/state-views";
import { userSafeError } from "@/lib/error-formatting";
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
const nativeSelectClassName = "h-12 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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

type Status = { type: "pending" | "success" | "error" | "info"; title: string; description?: string } | null;

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
  onLogAdded,
  onDirtyChange
}: {
  selectedDate: string;
  onLogAdded?: (log: FoodLog) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { user } = useAuth();
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();
  const [activeSection, setActiveSection] = useState<"foods" | "meals">("foods");
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [isSavingFood, setIsSavingFood] = useState(false);
  const [isSavingMeal, setIsSavingMeal] = useState(false);
  const [isSavingKitchen, setIsSavingKitchen] = useState(false);
  const [isSavingSubcategory, setIsSavingSubcategory] = useState(false);
  const [deletingFoodId, setDeletingFoodId] = useState<string | null>(null);
  const [deletingMealId, setDeletingMealId] = useState<string | null>(null);
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null);
  const [foodSubmitted, setFoodSubmitted] = useState(false);
  const [mealSubmitted, setMealSubmitted] = useState(false);
  const [foodStatus, setFoodStatus] = useState<Status>(null);
  const [mealStatus, setMealStatus] = useState<Status>(null);
  const [setupStatus, setSetupStatus] = useState<Status>(null);

  async function loadData() {
    if (!user?.id) {
      setIsLoading(false);
      setLoadError("Please log in again before managing custom foods and saved meals.");
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setLoadWarning(null);
    const [kitchenResult, customFoodsResult, libraryResult, customMealsResult] = await Promise.allSettled([
      getFoodKitchens(user.id),
      getUserFoods(user.id),
      getFoodLibrary(user.id, "", { limit: 200 }),
      getCustomMeals(user.id)
    ]);

    const warnings: string[] = [];
    if (kitchenResult.status === "fulfilled") {
      setKitchens(kitchenResult.value.kitchens);
      setSubcategories(kitchenResult.value.subcategories);
      setFoodDraft((current) => ({
        ...current,
        kitchenId: current.kitchenId || kitchenResult.value.kitchens[0]?.id || "",
        subcategoryId: current.subcategoryId || kitchenResult.value.subcategories.find((item) => item.kitchen_id === kitchenResult.value.kitchens[0]?.id)?.id || ""
      }));
    } else {
      warnings.push(userSafeError(kitchenResult.reason, "Kitchens could not fully load. Save custom foods after retrying."));
    }

    if (customFoodsResult.status === "fulfilled") {
      setFoods(customFoodsResult.value);
    } else {
      warnings.push(userSafeError(customFoodsResult.reason, "Custom foods could not load."));
      setFoods([]);
    }

    if (libraryResult.status === "fulfilled") {
      setFoodLibrary(libraryResult.value);
      if (libraryResult.value.length > 0 && libraryResult.value.every(isApproximateFood)) {
        warnings.push("Showing fallback food library data. Some live library foods may be unavailable.");
      }
    } else {
      warnings.push(userSafeError(libraryResult.reason, "Food library could not load. Custom foods may still be available."));
      setFoodLibrary([]);
    }

    if (customMealsResult.status === "fulfilled") {
      setMeals(customMealsResult.value);
    } else {
      warnings.push(userSafeError(customMealsResult.reason, "Saved meals could not load."));
      setMeals([]);
    }

    setLoadWarning(warnings.length ? Array.from(new Set(warnings)).join(" ") : null);
    setIsLoading(false);
  }

  useEffect(() => {
    loadData().catch((error) => {
      setLoadError(userSafeError(error, "Custom nutrition tools could not load."));
      setIsLoading(false);
    });
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

  const foodDraftDirty = isFoodDraftDirty(foodDraft);
  const mealDraftDirty = Boolean(editingMealId || mealName.trim() || mealCategory.trim() || mealNotes.trim() || mealItems.length);
  const foodValidationErrors = validateFoodDraft(foodDraft, selectedKitchen, selectedSubcategory);
  const mealValidationErrors = validateMealDraft(mealName, mealItems, allFoods);

  useEffect(() => {
    onDirtyChange?.(foodDraftDirty || mealDraftDirty);
  }, [foodDraftDirty, mealDraftDirty, onDirtyChange]);

  function patchFoodDraft(patch: Partial<FoodDraft>) {
    setFoodDraft((current) => ({ ...current, ...patch }));
    setFoodStatus(null);
  }

  function resetFoodDraft() {
    setFoodDraft({
      ...emptyFoodDraft,
      kitchenId: selectedKitchen?.id ?? kitchens[0]?.id ?? "",
      subcategoryId: selectedSubcategory?.id ?? visibleSubcategories[0]?.id ?? ""
    });
    setFoodSubmitted(false);
    setFoodStatus(null);
  }

  function resetMealDraft() {
    setEditingMealId(undefined);
    setMealName("");
    setMealCategory("");
    setMealNotes("");
    setMealItems([]);
    setMealSubmitted(false);
    setMealStatus(null);
  }

  function requestFoodDiscard() {
    if (!foodDraftDirty) {
      resetFoodDraft();
      return;
    }
    confirmAsk({
      title: "Discard custom food changes?",
      description: "Your custom food draft has not been saved. Discarding only clears this draft.",
      confirmLabel: "Discard draft",
      cancelLabel: "Keep editing",
      variant: "destructive",
      onConfirm: resetFoodDraft
    });
  }

  function requestMealDiscard() {
    if (!mealDraftDirty) {
      resetMealDraft();
      return;
    }
    confirmAsk({
      title: "Discard saved meal changes?",
      description: "Your saved meal draft has not been saved. Discarding only clears this draft.",
      confirmLabel: "Discard draft",
      cancelLabel: "Keep editing",
      variant: "destructive",
      onConfirm: resetMealDraft
    });
  }

  async function addKitchen() {
    if (!user?.id || isSavingKitchen) return;
    setSetupStatus(null);
    setIsSavingKitchen(true);
    try {
      const kitchen = await createFoodKitchen(user.id, newKitchenName);
      setKitchens((current) => [...current, kitchen].sort((a, b) => a.name.localeCompare(b.name)));
      patchFoodDraft({ kitchenId: kitchen.id, subcategoryId: "" });
      setNewKitchenName("");
      setSetupStatus({ type: "success", title: "Kitchen saved.", description: `${kitchen.name} is ready for custom foods.` });
    } catch (error) {
      setSetupStatus({ type: "error", title: "Could not save kitchen.", description: userSafeError(error) });
    } finally {
      setIsSavingKitchen(false);
    }
  }

  async function addSubcategory() {
    if (!selectedKitchen || isSavingSubcategory) return;
    setSetupStatus(null);
    setIsSavingSubcategory(true);
    try {
      const subcategory = await createFoodSubcategory(selectedKitchen.id, newSubcategoryName);
      setSubcategories((current) => [...current, subcategory].sort((a, b) => a.name.localeCompare(b.name)));
      patchFoodDraft({ subcategoryId: subcategory.id });
      setNewSubcategoryName("");
      setSetupStatus({ type: "success", title: "Subcategory saved.", description: `${subcategory.name} is ready.` });
    } catch (error) {
      setSetupStatus({ type: "error", title: "Could not save subcategory.", description: userSafeError(error) });
    } finally {
      setIsSavingSubcategory(false);
    }
  }

  function populateFood(food: UserFoodItem) {
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
    setFoodSubmitted(false);
    setFoodStatus({ type: "info", title: "Editing custom food.", description: "Changes are draft-only until you save." });
    setActiveSection("foods");
  }

  function editFood(food: UserFoodItem) {
    if (foodDraftDirty && foodDraft.id !== food.id) {
      confirmAsk({
        title: "Replace current custom food draft?",
        description: "Your unsaved custom food changes will be discarded before editing this food.",
        confirmLabel: "Edit this food",
        cancelLabel: "Keep draft",
        variant: "destructive",
        onConfirm: () => populateFood(food)
      });
      return;
    }
    populateFood(food);
  }

  async function saveFood() {
    setFoodSubmitted(true);
    setFoodStatus(null);
    if (!user?.id) {
      setFoodStatus({ type: "error", title: "Login required.", description: "Please log in again before saving custom foods." });
      return;
    }
    if (!selectedKitchen || !selectedSubcategory || foodValidationErrors.length) {
      setFoodStatus({ type: "error", title: "Save failed. Your draft is still here.", description: foodValidationErrors[0] ?? "Check required fields and nutrition values." });
      return;
    }

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
      setIsSavingFood(true);
      setFoodStatus({ type: "pending", title: "Saving custom food..." });
      const saved = await upsertUserFood(input);
      setFoods((current) => [saved, ...current.filter((food) => food.id !== saved.id)].sort((a, b) => a.food_name.localeCompare(b.food_name)));
      setFoodLibrary((current) => [saved, ...current.filter((food) => food.id !== saved.id)]);
      setFoodStatus({ type: "success", title: "Custom food saved.", description: `${saved.food_name} is saved to your account.` });
      setFoodDraft({ ...emptyFoodDraft, kitchenId: selectedKitchen.id, subcategoryId: selectedSubcategory.id });
      setFoodSubmitted(false);
    } catch (error) {
      setFoodStatus({ type: "error", title: "Save failed. Your draft is still here.", description: userSafeError(error, "Check required fields and nutrition values.") });
    } finally {
      setIsSavingFood(false);
    }
  }

  function removeFood(food: UserFoodItem) {
    confirmAsk({
      title: "Delete this custom food?",
      description: "Past food logs will not be removed, but this custom food will no longer be available for future reuse.",
      confirmLabel: "Delete food",
      cancelLabel: "Keep food",
      variant: "destructive",
      onConfirm: () => void confirmRemoveFood(food)
    });
  }

  async function confirmRemoveFood(food: UserFoodItem) {
    if (!user?.id || deletingFoodId) return;
    setDeletingFoodId(food.id);
    setFoodStatus({ type: "pending", title: `Deleting ${food.food_name}...` });
    try {
      await deleteUserFood(user.id, food.id);
      setFoods((current) => current.filter((item) => item.id !== food.id));
      setFoodLibrary((current) => current.filter((item) => item.id !== food.id));
      if (foodDraft.id === food.id) resetFoodDraft();
      setFoodStatus({ type: "success", title: "Custom food deleted.", description: "Past food logs were not removed." });
    } catch (error) {
      setFoodStatus({ type: "error", title: "Could not delete food.", description: userSafeError(error) });
    } finally {
      setDeletingFoodId(null);
    }
  }

  function populateMeal(meal: CustomMeal) {
    setEditingMealId(meal.id);
    setMealName(meal.meal_name);
    setMealCategory(meal.meal_category ?? "");
    setMealNotes(meal.notes ?? "");
    setMealItems(meal.items.map((item) => ({ foodId: item.food_item_id ?? item.user_food_item_id ?? "", quantity: String(item.quantity) })).filter((item) => item.foodId));
    setMealSubmitted(false);
    setMealStatus({ type: "info", title: "Editing saved meal.", description: "Changes are draft-only until you save." });
    setActiveSection("meals");
  }

  function editMeal(meal: CustomMeal) {
    if (mealDraftDirty && editingMealId !== meal.id) {
      confirmAsk({
        title: "Replace current saved meal draft?",
        description: "Your unsaved saved-meal changes will be discarded before editing this meal.",
        confirmLabel: "Edit this meal",
        cancelLabel: "Keep draft",
        variant: "destructive",
        onConfirm: () => populateMeal(meal)
      });
      return;
    }
    populateMeal(meal);
  }

  async function saveMeal() {
    setMealSubmitted(true);
    setMealStatus(null);
    if (!user?.id) {
      setMealStatus({ type: "error", title: "Login required.", description: "Please log in again before saving custom meals." });
      return;
    }
    if (mealValidationErrors.length) {
      setMealStatus({ type: "error", title: "Save failed. Your draft is still here.", description: mealValidationErrors[0] });
      return;
    }

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
      setIsSavingMeal(true);
      setMealStatus({ type: "pending", title: "Saving custom meal..." });
      const saved = await upsertCustomMeal(input);
      setMeals((current) => [saved, ...current.filter((meal) => meal.id !== saved.id)].sort((a, b) => a.meal_name.localeCompare(b.meal_name)));
      resetMealDraft();
      setMealStatus({ type: "success", title: "Custom meal saved.", description: `${saved.meal_name} totals ${saved.totals.calories} kcal.` });
    } catch (error) {
      setMealStatus({ type: "error", title: "Save failed. Your draft is still here.", description: userSafeError(error, "Please add a name and foods.") });
    } finally {
      setIsSavingMeal(false);
    }
  }

  function removeMeal(meal: CustomMeal) {
    confirmAsk({
      title: "Delete this saved meal?",
      description: "Food logs already created from it will stay. The saved meal will no longer be available for future reuse.",
      confirmLabel: "Delete meal",
      cancelLabel: "Keep meal",
      variant: "destructive",
      onConfirm: () => void confirmRemoveMeal(meal)
    });
  }

  async function confirmRemoveMeal(meal: CustomMeal) {
    if (!user?.id || deletingMealId) return;
    setDeletingMealId(meal.id);
    setMealStatus({ type: "pending", title: `Deleting ${meal.meal_name}...` });
    try {
      await deleteCustomMeal(user.id, meal.id);
      setMeals((current) => current.filter((item) => item.id !== meal.id));
      if (editingMealId === meal.id) resetMealDraft();
      setMealStatus({ type: "success", title: "Saved meal deleted.", description: "Food logs already created from it stayed unchanged." });
    } catch (error) {
      setMealStatus({ type: "error", title: "Could not delete meal.", description: userSafeError(error) });
    } finally {
      setDeletingMealId(null);
    }
  }

  async function logMeal(meal: CustomMeal) {
    if (!user?.id || loggingMealId) return;
    setLoggingMealId(meal.id);
    setMealStatus({ type: "pending", title: `Logging ${meal.meal_name}...` });
    try {
      const log = await addCustomMealToLog(user.id, meal, selectedDate, mealType);
      onLogAdded?.(log);
      setMealStatus({ type: "success", title: "Saved meal logged.", description: `${meal.meal_name} was added to ${selectedDate} as ${mealType}.` });
    } catch (error) {
      setMealStatus({ type: "error", title: "Could not log meal.", description: userSafeError(error) });
    } finally {
      setLoggingMealId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <CardSkeleton rows={5} />
        <CardSkeleton rows={5} />
      </div>
    );
  }

  if (loadError) {
    return <ErrorState title="Custom nutrition tools did not load" description={loadError} onRetry={() => void loadData()} />;
  }

  return (
    <div className="space-y-5">
      {confirmDialog}
      <div className="rounded-md border border-border/70 bg-card/80 p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Builder for manual corrections and reusable foods</p>
        <p className="mt-1 leading-6">Use this to correct a ChatGPT tool result, create a reusable custom food, or save a meal for quick repeat logging.</p>
        {loadWarning ? (
          <p className="mt-2 flex gap-2 text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{loadWarning}</span>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" className="min-h-12" variant={activeSection === "foods" ? "default" : "outline"} onClick={() => setActiveSection("foods")}>
          Custom foods
        </Button>
        <Button type="button" className="min-h-12" variant={activeSection === "meals" ? "default" : "outline"} onClick={() => setActiveSection("meals")}>
          Saved meals
        </Button>
      </div>

      {activeSection === "foods" ? (
        <Card>
          <CardHeader>
            <CardTitle>Custom foods and kitchens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(foodDraftDirty || foodDraft.id) ? (
              <DraftBanner
                title={foodDraft.id ? "Editing custom food" : "Unsaved custom food draft"}
                description="Changes are draft-only until you save."
                onDiscard={requestFoodDiscard}
              />
            ) : null}

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input className="h-12" value={newKitchenName} onChange={(event) => setNewKitchenName(event.target.value)} placeholder="Create kitchen, e.g. German Kitchen" />
              <Button type="button" className="min-h-12" variant="outline" onClick={addKitchen} disabled={!newKitchenName.trim() || isSavingKitchen}>
                {isSavingKitchen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Kitchen
              </Button>
            </div>
            <InlineStatus status={setupStatus} />

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
                  className={nativeSelectClassName}
                >
                  {kitchens.map((kitchen) => (
                    <option key={kitchen.id} value={kitchen.id}>{kitchen.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Subcategory</Label>
                <select value={foodDraft.subcategoryId} onChange={(event) => patchFoodDraft({ subcategoryId: event.target.value })} className={nativeSelectClassName}>
                  {visibleSubcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 md:col-span-2 md:grid-cols-[1fr_auto]">
                <Input className="h-12" value={newSubcategoryName} onChange={(event) => setNewSubcategoryName(event.target.value)} placeholder="Create subcategory inside selected kitchen" />
                <Button type="button" className="min-h-12" variant="outline" onClick={addSubcategory} disabled={!newSubcategoryName.trim() || isSavingSubcategory || !selectedKitchen}>
                  {isSavingSubcategory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add Subcategory
                </Button>
              </div>
              <Field label="Calories" type="number" inputMode="decimal" enterKeyHint="done" value={foodDraft.calories} onChange={(calories) => patchFoodDraft({ calories })} />
              <Field label="Protein" type="number" inputMode="decimal" enterKeyHint="done" value={foodDraft.proteinG} onChange={(proteinG) => patchFoodDraft({ proteinG })} />
              <Field label="Carbs" type="number" inputMode="decimal" enterKeyHint="done" value={foodDraft.carbsG} onChange={(carbsG) => patchFoodDraft({ carbsG })} />
              <Field label="Fat" type="number" inputMode="decimal" enterKeyHint="done" value={foodDraft.fatG} onChange={(fatG) => patchFoodDraft({ fatG })} />
              <Field label="Fiber optional" type="number" inputMode="decimal" enterKeyHint="done" value={foodDraft.fiberG} onChange={(fiberG) => patchFoodDraft({ fiberG })} />
              <Field label="Sugar optional" type="number" inputMode="decimal" enterKeyHint="done" value={foodDraft.sugarG} onChange={(sugarG) => patchFoodDraft({ sugarG })} />
              <Field label="Sodium mg optional" type="number" inputMode="decimal" enterKeyHint="done" value={foodDraft.sodiumMg} onChange={(sodiumMg) => patchFoodDraft({ sodiumMg })} />
              <Field label="Notes optional" value={foodDraft.notes} onChange={(notes) => patchFoodDraft({ notes })} />
            </div>
            <ValidationList errors={foodSubmitted ? foodValidationErrors : []} />
            <InlineStatus status={foodStatus} />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button className="min-h-12" onClick={saveFood} disabled={isSavingFood}>
                {isSavingFood ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {foodDraft.id ? "Save Food Changes" : "Save Custom Food"}
              </Button>
              {foodDraftDirty ? (
                <Button type="button" className="min-h-12" variant="outline" onClick={requestFoodDiscard}>
                  <XCircle className="h-4 w-4" />
                  Cancel / Discard
                </Button>
              ) : null}
            </div>

            <div className="grid gap-2">
              {foods.length ? <p className="text-sm font-semibold text-foreground">Your custom foods</p> : null}
              {foods.map((food) => (
                <div key={food.id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="font-semibold">{food.food_name}</p>
                    <p className="text-sm text-muted-foreground">{food.cuisine || "Custom"} | {food.category || "Food"} | {food.calories} kcal</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button className="min-h-12 min-w-12" variant="ghost" onClick={() => editFood(food)} aria-label={`Edit ${food.food_name}`}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button className="min-h-12 min-w-12" variant="ghost" onClick={() => removeFood(food)} disabled={deletingFoodId === food.id} aria-label={`Delete ${food.food_name}`}>
                      {deletingFoodId === food.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeSection === "meals" ? (
        <Card>
          <CardHeader>
            <CardTitle>Custom meals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(mealDraftDirty || editingMealId) ? (
              <DraftBanner
                title={editingMealId ? "Editing saved meal" : "Unsaved saved meal draft"}
                description="Changes are draft-only until you save."
                onDiscard={requestMealDiscard}
              />
            ) : null}

            <div className="grid gap-3">
              <Field label="Meal name" value={mealName} onChange={(value) => { setMealName(value); setMealStatus(null); }} />
              <Field label="Meal category optional" value={mealCategory} onChange={(value) => { setMealCategory(value); setMealStatus(null); }} />
              <Field label="Meal notes optional" value={mealNotes} onChange={(value) => { setMealNotes(value); setMealStatus(null); }} />
              <div className="grid gap-2">
                {mealItems.map((item, index) => (
                  <div key={`${item.foodId}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                    <select
                      value={item.foodId}
                      onChange={(event) => {
                        setMealStatus(null);
                        setMealItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, foodId: event.target.value } : row));
                      }}
                      className={nativeSelectClassName}
                    >
                      <option value="">Choose food</option>
                      {allFoods.map((food) => (
                        <option key={food.id} value={food.id}>{food.food_name}</option>
                      ))}
                    </select>
                    <Input
                      className="h-12"
                      type="number"
                      min="0.1"
                      step="0.1"
                      inputMode="decimal"
                      enterKeyHint="done"
                      value={item.quantity}
                      onChange={(event) => {
                        setMealStatus(null);
                        setMealItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row));
                      }}
                    />
                    <Button type="button" className="min-h-12 min-w-12" variant="ghost" onClick={() => setMealItems((current) => current.filter((_, rowIndex) => rowIndex !== index))} aria-label="Remove food from saved meal draft">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" className="min-h-12" variant="outline" onClick={() => setMealItems((current) => [...current, { foodId: allFoods[0]?.id ?? "", quantity: "1" }])} disabled={!allFoods.length}>
                  <Plus className="h-4 w-4" />
                  Add Food To Meal
                </Button>
              </div>
              <div className="rounded-md border border-border/70 bg-card p-3 text-sm">
                <p className="font-semibold">Totals</p>
                <p className="mt-1 text-muted-foreground">
                  {mealTotals.calories} kcal | {mealTotals.protein_g}g protein | {mealTotals.carbs_g}g carbs | {mealTotals.fat_g}g fat
                </p>
              </div>
              <ValidationList errors={mealSubmitted ? mealValidationErrors : []} />
              <InlineStatus status={mealStatus} />
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="button" className="min-h-12" onClick={saveMeal} disabled={isSavingMeal}>
                  {isSavingMeal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingMealId ? "Save Meal Changes" : "Save Custom Meal"}
                </Button>
                {mealDraftDirty ? (
                  <Button type="button" className="min-h-12" variant="outline" onClick={requestMealDiscard}>
                    <XCircle className="h-4 w-4" />
                    Cancel / Discard
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="grid gap-2 sm:grid-cols-[auto_180px] sm:items-center">
                <Label>Log saved meals as</Label>
                <select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)} className={nativeSelectClassName}>
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
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <Button className="min-h-12" onClick={() => logMeal(meal)} disabled={loggingMealId === meal.id}>
                      {loggingMealId === meal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Utensils className="h-4 w-4" />}
                      {loggingMealId === meal.id ? "Adding..." : "Add to day"}
                    </Button>
                    <Button className="min-h-12" variant="outline" onClick={() => editMeal(meal)}>Edit</Button>
                    <Button className="min-h-12" variant="ghost" onClick={() => removeMeal(meal)} disabled={deletingMealId === meal.id}>
                      {deletingMealId === meal.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function DraftBanner({ title, description, onDiscard }: { title: string; description: string; onDiscard: () => void }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-muted-foreground">{description}</p>
        </div>
        <Button type="button" className="min-h-12" variant="outline" onClick={onDiscard}>
          Discard draft
        </Button>
      </div>
    </div>
  );
}

function InlineStatus({ status }: { status: Status }) {
  if (!status) return null;
  const styles =
    status.type === "success"
      ? "border-success/30 bg-success/10"
      : status.type === "error"
        ? "border-destructive/30 bg-destructive/10"
        : status.type === "pending"
          ? "border-primary/30 bg-primary/5"
          : "border-border/70 bg-card";
  return (
    <div className={`rounded-md border p-3 text-sm ${styles}`} aria-live="polite">
      <p className="flex items-center gap-2 font-semibold text-foreground">
        {status.type === "pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : status.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : status.type === "error" ? <AlertTriangle className="h-4 w-4" /> : null}
        {status.title}
      </p>
      {status.description ? <p className="mt-1 text-muted-foreground">{status.description}</p> : null}
    </div>
  );
}

function ValidationList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground" aria-live="polite">
      <p className="font-semibold">Check these fields before saving:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        {errors.map((error) => <li key={error}>{error}</li>)}
      </ul>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  enterKeyHint
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  enterKeyHint?: InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input className="h-12" type={type} inputMode={inputMode} enterKeyHint={enterKeyHint} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.1" : undefined} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function validateFoodDraft(draft: FoodDraft, kitchen: FoodKitchen | undefined, subcategory: FoodSubcategory | undefined) {
  const errors: string[] = [];
  if (!draft.foodName.trim()) errors.push("Food name is required.");
  if (!draft.servingSize.trim()) errors.push("Serving size is required.");
  if (!kitchen) errors.push("Choose or create a kitchen before saving.");
  if (!subcategory) errors.push("Choose or create a subcategory before saving.");
  [
    ["Calories", draft.calories],
    ["Protein", draft.proteinG],
    ["Carbs", draft.carbsG],
    ["Fat", draft.fatG]
  ].forEach(([label, value]) => {
    if (!String(value).trim() || numberOrNull(String(value)) === null || Number(value) < 0) errors.push(`${label} must be a number 0 or higher.`);
  });
  [
    ["Fiber", draft.fiberG],
    ["Sugar", draft.sugarG],
    ["Sodium", draft.sodiumMg]
  ].forEach(([label, value]) => {
    if (String(value).trim() && (numberOrNull(String(value)) === null || Number(value) < 0)) errors.push(`${label} must be a number 0 or higher when provided.`);
  });
  return errors;
}

function validateMealDraft(mealName: string, mealItems: MealDraftItem[], allFoods: FoodItem[]) {
  const errors: string[] = [];
  if (!mealName.trim()) errors.push("Meal name is required.");
  if (!mealItems.length) errors.push("Add at least one food to the meal.");
  mealItems.forEach((item, index) => {
    if (!allFoods.some((food) => food.id === item.foodId)) errors.push(`Choose a food for row ${index + 1}.`);
    if (!item.quantity.trim() || numberOrNull(item.quantity) === null || Number(item.quantity) <= 0) errors.push(`Quantity for row ${index + 1} must be greater than zero.`);
  });
  return errors;
}

function isFoodDraftDirty(draft: FoodDraft) {
  return Boolean(
    draft.id ||
    draft.foodName.trim() ||
    draft.servingSize.trim() !== "1 serving" ||
    numberOrZero(draft.calories) !== 0 ||
    numberOrZero(draft.proteinG) !== 0 ||
    numberOrZero(draft.carbsG) !== 0 ||
    numberOrZero(draft.fatG) !== 0 ||
    draft.fiberG.trim() ||
    draft.sugarG.trim() ||
    draft.sodiumMg.trim() ||
    draft.notes.trim()
  );
}

function isApproximateFood(food: FoodItem) {
  const source = String(food.source_type || "").toLowerCase();
  return source.includes("approximate_macro_table") || food.cuisine === "Egyptian";
}
