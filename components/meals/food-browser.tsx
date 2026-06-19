"use client";

import { AlertTriangle, BookOpen, CheckCircle2, Clock, Heart, PlusCircle, RotateCcw, Save, Search, Trash2, Utensils } from "lucide-react";
import { Component, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth/auth-provider";
import Link from "next/link";
import {
  addCustomMealToLog,
  addCustomMealToMealPlan,
  addFoodToMealPlan,
  addGlobalFoodToToday,
  egyptianFoodKitchenName,
  egyptianFoodSubcategories,
  getCustomMeals,
  getFoodKitchens,
  getFoodLibrary
} from "@/services/database/nutrition";
import {
  deleteRecipe,
  deleteRecipeAsync,
  favoriteKeyForFood,
  favoriteKeyForLog,
  getFavoriteFoodKeys,
  getFavoriteFoodKeysAsync,
  getRecentFoodLogs,
  getSavedRecipes,
  getSavedRecipesAsync,
  logFoodFromPreviousLog,
  logRecipePortion,

  recipeTotals,
  saveRecipe,
  saveRecipeAsync,
  setFavoriteFood,
  setFavoriteFoodAsync,
  type RecipeIngredient,
  type SavedRecipe,
  type ServingUnit
} from "@/services/meals/food-logging-speed";
import { scaleFoodMacros, validateFoodLogInput } from "@/services/nutrition/calculations";
import { egyptianFoods } from "@/data/egyptian-foods";
import type { CustomMeal, FoodItem, FoodKitchen, FoodLog, FoodSubcategory, MealPlanItem, MealType } from "@/types";

const pageSize = 12;
const mealOptions: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const servingUnits: ServingUnit[] = ["serving", "grams", "pieces", "cups", "tablespoons", "portion"];
const fallbackCategories = [...egyptianFoodSubcategories];
const emptyFoodLogs: FoodLog[] = [];

const emptyIngredient = { foodName: "", quantity: "1", servingUnit: "serving" as ServingUnit, calories: "0", protein: "0", carbs: "0", fat: "0" };
const emptyRecipeDraft = { name: "", portions: "4", notes: "" };

type FoodBrowserProps = { initialLogs?: FoodLog[]; onLogAdded?: (log: FoodLog) => void; onPlanAdded?: (item: MealPlanItem) => void; defaultMealType?: MealType; logDate?: string; };
type Notice = { type: "success" | "error" | "info"; title: string; description?: string };
type IngredientDraft = typeof emptyIngredient;


type RecipeDraftState = typeof emptyRecipeDraft;

function fallbackSubcategory(value: string | null | undefined) {
  if (value && fallbackCategories.includes(value as (typeof fallbackCategories)[number])) return value;
  if (value === "Rice") return "Carb";
  if (value === "Sauce" || value === "Salad") return "Dip";
  if (value === "Protein" || value === "Sandwich" || value === "Meal" || value === "Side") return "Breakfast";
  return "Snack";
}

class FoodBrowserBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { message: null };
  }
  static getDerivedStateFromError(error: unknown) { return { message: error instanceof Error ? error.message : "The food picker could not load." }; }
  render() {
    if (this.state.message) {
      return <Card className="border-warning/30 bg-warning/10"><CardContent className="space-y-3 pt-5 text-sm text-foreground"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Food picker could not load</div><p>The food picker stayed open. Try again or choose another kitchen.</p><p className="break-words text-xs text-muted-foreground">{this.state.message}</p><Button variant="outline" size="sm" onClick={() => this.setState({ message: null })}>Try again</Button></CardContent></Card>;
    }
    return this.props.children;
  }
}

export function FoodBrowser(props: FoodBrowserProps) { return <FoodBrowserBoundary><FoodBrowserInner {...props} /></FoodBrowserBoundary>; }

function FoodBrowserInner({ initialLogs = emptyFoodLogs, onLogAdded, onPlanAdded, defaultMealType = "Breakfast", logDate }: FoodBrowserProps) {
  const { user } = useAuth();
  const [kitchens, setKitchens] = useState<FoodKitchen[]>([]);
  const [subcategories, setSubcategories] = useState<FoodSubcategory[]>([]);
  const [customMeals, setCustomMeals] = useState<CustomMeal[]>([]);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [recentLogs, setRecentLogs] = useState<FoodLog[]>([]);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [selectedKitchenId, setSelectedKitchenId] = useState("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [units, setUnits] = useState<Record<string, ServingUnit>>({});
  const [logs, setLogs] = useState<FoodLog[]>(initialLogs);
  const [isLoadingFoods, setIsLoadingFoods] = useState(false);
  const [isLoadingKitchenData, setIsLoadingKitchenData] = useState(true);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [recipeDraft, setRecipeDraft] = useState<RecipeDraftState>(emptyRecipeDraft);
  const [ingredientDraft, setIngredientDraft] = useState<IngredientDraft>(emptyIngredient);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);

  const selectedKitchen = kitchens.find((kitchen) => kitchen.id === selectedKitchenId) ?? kitchens[0];
  const visibleSubcategories = useMemo(() => subcategories.filter((subcategory) => subcategory.kitchen_id === selectedKitchen?.id), [selectedKitchen?.id, subcategories]);
  const selectedSubcategory = visibleSubcategories.find((subcategory) => subcategory.id === selectedSubcategoryId) ?? visibleSubcategories[0];

  useEffect(() => setMealType(mealOptions.includes(defaultMealType) ? defaultMealType : "Breakfast"), [defaultMealType]);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => setLogs(initialLogs), [initialLogs]);

  async function loadSpeedData() {
    setFavoriteKeys(await getFavoriteFoodKeysAsync(user?.id));
    setRecipes(await getSavedRecipesAsync(user?.id));
    if (!user?.id) return setRecentLogs([]);
    setRecentLogs(await getRecentFoodLogs(user.id, 100));
  }

  useEffect(() => {
    let active = true;
    setIsLoadingKitchenData(true);
    Promise.all([
      getFoodKitchens(user?.id ?? ""),
      user?.id ? getCustomMeals(user.id) : Promise.resolve<CustomMeal[]>([]),
      user?.id ? getRecentFoodLogs(user.id, 100) : Promise.resolve<FoodLog[]>([]),
      getFavoriteFoodKeysAsync(user?.id),
      getSavedRecipesAsync(user?.id)
    ])
      .then(([kitchenData, meals, recent, favorites, recipes]) => {
        if (!active) return;
        setKitchens(kitchenData.kitchens);
        setSubcategories(kitchenData.subcategories);
        setCustomMeals(meals);
        setRecentLogs(recent);
        setFavoriteKeys(favorites);
        setRecipes(recipes);
        const currentKitchen = kitchenData.kitchens.find((kitchen) => kitchen.id === selectedKitchenId) ?? kitchenData.kitchens[0];
        const firstSubcategory = kitchenData.subcategories.find((subcategory) => subcategory.kitchen_id === currentKitchen?.id);
        setSelectedKitchenId(currentKitchen?.id ?? "");
        setSelectedSubcategoryId((current) => kitchenData.subcategories.some((subcategory) => subcategory.id === current && subcategory.kitchen_id === currentKitchen?.id) ? current : firstSubcategory?.id ?? "");
      })
      .catch((error) => { if (active) setNotice({ type: "error", title: "Could not load kitchens", description: error instanceof Error ? error.message : "Showing the default food categories." }); })
      .finally(() => { if (active) setIsLoadingKitchenData(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => setVisibleCount(pageSize), [selectedKitchenId, selectedSubcategoryId, debouncedQuery, favoritesOnly]);

  useEffect(() => {
    if (!selectedKitchen && !debouncedQuery) { setFoods([]); setIsLoadingFoods(false); return; }
    let active = true;
    setIsLoadingFoods(true);
    setNotice(null);
    getFoodLibrary(user?.id ?? "", debouncedQuery, { kitchen: selectedKitchen?.name, kitchenId: selectedKitchen?.id, subcategoryId: selectedSubcategory?.id, category: selectedSubcategory?.name, limit: 90 })
      .then((items) => { if (active) setFoods(items.map(normalizeFoodItem)); })
      .catch((error) => {
        if (!active) return;
        const localFallback = egyptianFoods.map((food) => ({ ...food, cuisine: egyptianFoodKitchenName, category: fallbackSubcategory(food.category) })).filter((food) => (!selectedSubcategory?.name || food.category === selectedSubcategory.name) && (!debouncedQuery || food.food_name.toLowerCase().includes(debouncedQuery.toLowerCase()))).slice(0, 90).map(normalizeFoodItem);
        setFoods(localFallback);
        setNotice({ type: "error", title: "Could not load every food", description: error instanceof Error ? error.message : "Showing available foods." });
      })
      .finally(() => { if (active) setIsLoadingFoods(false); });
    return () => { active = false; };
  }, [debouncedQuery, selectedKitchen, selectedSubcategory, user?.id]);

  const recentFoods = useMemo(() => uniqueLogs(recentLogs).slice(0, 8), [recentLogs]);
  const frequentFoods = useMemo(() => frequentLogs(recentLogs).slice(0, 8), [recentLogs]);
  const favoriteLogs = useMemo(() => uniqueLogs(recentLogs).filter((log) => favoriteKeys.includes(favoriteKeyForLog(log))).slice(0, 8), [favoriteKeys, recentLogs]);
  const visibleFoods = useMemo(() => foods.filter((food) => !favoritesOnly || favoriteKeys.includes(favoriteKeyForFood(food))).slice(0, visibleCount), [favoriteKeys, favoritesOnly, foods, visibleCount]);

  function selectKitchen(kitchenId: string) { const firstSubcategory = subcategories.find((subcategory) => subcategory.kitchen_id === kitchenId); setSelectedKitchenId(kitchenId); setSelectedSubcategoryId(firstSubcategory?.id ?? ""); }
  function resetFilters() { const firstKitchen = kitchens[0]; const firstSubcategory = subcategories.find((subcategory) => subcategory.kitchen_id === firstKitchen?.id); setQuery(""); setFavoritesOnly(false); setSelectedKitchenId(firstKitchen?.id ?? ""); setSelectedSubcategoryId(firstSubcategory?.id ?? ""); }
  function pushLoggedFood(log: FoodLog) { setLogs((current) => [log, ...current]); setRecentLogs((current) => [log, ...current.filter((item) => item.id !== log.id)].slice(0, 120)); onLogAdded?.(log); }

  async function logFoodNow(food: FoodItem) {
    const quantity = quantities[food.id] ?? 1;
    const macros = scaleFoodMacros(food, quantity);
    const validation = validateFoodLogInput(food.food_name, quantity, macros);
    if (validation) return setNotice({ type: "error", title: "Check this food entry", description: validation });
    if (!user?.id) return setNotice({ type: "error", title: "Login required", description: "Please log in again before saving meals." });
    try {
      const selectedUnit = units[food.id] ?? "serving";
      const log = await addGlobalFoodToToday({ userId: user.id, food: { ...food, serving_size: `${food.serving_size} (${selectedUnit})` }, quantity, mealType, date: logDate });
      pushLoggedFood(log);
      setNotice({ type: "success", title: "Food logged", description: `${mealType}: +${macros.calories} kcal logged.` });
    } catch (error) { setNotice({ type: "error", title: "Could not add food", description: error instanceof Error ? error.message : "Please try again." }); }
  }

  async function logPrevious(logSource: FoodLog) {
    if (!user?.id) return setNotice({ type: "error", title: "Login required", description: "Please log in again before saving meals." });
    try { const log = await logFoodFromPreviousLog(user.id, logSource, logDate, mealType); pushLoggedFood(log); setNotice({ type: "success", title: "Logged again", description: `${log.food_name} was added from real history.` }); }
    catch (error) { setNotice({ type: "error", title: "Could not log recent food", description: error instanceof Error ? error.message : "Please try again." }); }
  }











  async function addToPlan(food: FoodItem) {
    const quantity = quantities[food.id] ?? 1;
    const macros = scaleFoodMacros(food, quantity);
    const validation = validateFoodLogInput(food.food_name, quantity, macros);
    if (validation) return setNotice({ type: "error", title: "Check this food entry", description: validation });
    if (!user?.id) return setNotice({ type: "error", title: "Login required", description: "Please log in again before saving your meal plan." });
    try { const selectedUnit = units[food.id] ?? "serving"; const item = await addFoodToMealPlan({ userId: user.id, food: { ...food, serving_size: `${food.serving_size} (${selectedUnit})` }, quantity, mealType }); onPlanAdded?.(item); setNotice({ type: "success", title: "Added to My Meal Plan", description: `${food.food_name} was added to ${displayMealType(mealType)}.` }); }
    catch (error) { setNotice({ type: "error", title: "Could not add to plan", description: error instanceof Error ? error.message : "Please try again." }); }
  }

  async function logCustomMealNow(meal: CustomMeal) { if (!user?.id) return setNotice({ type: "error", title: "Login required", description: "Please log in again before saving meals." }); try { const log = await addCustomMealToLog(user.id, meal, logDate, mealType); pushLoggedFood(log); setNotice({ type: "success", title: "Saved meal logged", description: `${meal.meal_name} was added to ${displayMealType(mealType)}.` }); } catch (error) { setNotice({ type: "error", title: "Could not log saved meal", description: error instanceof Error ? error.message : "Please try again." }); } }
  async function addCustomMealPlan(meal: CustomMeal) { if (!user?.id) return setNotice({ type: "error", title: "Login required", description: "Please log in again before saving your meal plan." }); try { const item = await addCustomMealToMealPlan(user.id, meal, mealType); onPlanAdded?.(item); setNotice({ type: "success", title: "Saved meal added to plan", description: `${meal.meal_name} was added to ${displayMealType(mealType)}.` }); } catch (error) { setNotice({ type: "error", title: "Could not add saved meal", description: error instanceof Error ? error.message : "Please try again." }); } }
  async function toggleFavoriteForKey(key: string, label: string) { const nextFavorite = !favoriteKeys.includes(key); setFavoriteKeys(await setFavoriteFoodAsync(user?.id, key, nextFavorite, label)); setNotice({ type: "success", title: nextFavorite ? "Food favorited" : "Food unfavorited", description: label }); }
  function addIngredient() { if (!ingredientDraft.foodName.trim()) return setNotice({ type: "error", title: "Ingredient name required" }); setRecipeIngredients((current) => [...current, { id: crypto.randomUUID(), foodName: ingredientDraft.foodName, quantity: Math.max(0.1, Number(ingredientDraft.quantity) || 1), servingUnit: ingredientDraft.servingUnit, calories: Math.max(0, Number(ingredientDraft.calories) || 0), proteinG: Math.max(0, Number(ingredientDraft.protein) || 0), carbsG: Math.max(0, Number(ingredientDraft.carbs) || 0), fatG: Math.max(0, Number(ingredientDraft.fat) || 0) }]); setIngredientDraft(emptyIngredient); }
  async function saveCurrentRecipe() { try { const saved = await saveRecipeAsync(user?.id, { name: recipeDraft.name, portions: Number(recipeDraft.portions), ingredients: recipeIngredients, notes: recipeDraft.notes }); setRecipes((current) => [saved, ...current]); setRecipeDraft(emptyRecipeDraft); setRecipeIngredients([]); setNotice({ type: "success", title: "Recipe saved", description: `${saved.name} is synced to your account when signed in.` }); } catch (error) { setNotice({ type: "error", title: "Could not save recipe", description: error instanceof Error ? error.message : "Please check the recipe." }); } }
  async function logRecipe(recipe: SavedRecipe) { if (!user?.id) return setNotice({ type: "error", title: "Login required", description: "Please log in again before saving meals." }); try { const log = await logRecipePortion(user.id, recipe, logDate, mealType); pushLoggedFood(log); setNotice({ type: "success", title: "Recipe portion logged", description: `${recipe.name} was logged with scaled per-portion macros.` }); } catch (error) { setNotice({ type: "error", title: "Could not log recipe", description: error instanceof Error ? error.message : "Please try again." }); } }
  async function removeRecipe(recipe: SavedRecipe) { try { await deleteRecipeAsync(user?.id, recipe.id); setRecipes((current) => current.filter((item) => item.id !== recipe.id)); setNotice({ type: "success", title: "Recipe deleted", description: recipe.name }); } catch (error) { setNotice({ type: "error", title: "Could not delete recipe", description: error instanceof Error ? error.message : "Please try again." }); } }

  return <div className="space-y-4">{notice ? <NoticeBox notice={notice} onClose={() => setNotice(null)} /> : null}<div className="grid gap-3 lg:grid-cols-[1fr_190px_190px_auto_auto]"><div className="relative"><Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search food, e.g. chicken, rice, sauce" className="pl-10" /></div><select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)} className="h-11 w-full rounded-md border bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-ring" aria-label="Meal type">{mealOptions.map((type) => <option key={type} value={type}>{displayMealType(type)}</option>)}</select><select value={selectedKitchen?.id ?? ""} onChange={(event) => selectKitchen(event.target.value)} className="h-11 w-full rounded-md border bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-ring" aria-label="Kitchen">{kitchens.map((kitchen) => <option key={kitchen.id} value={kitchen.id}>{kitchen.name}</option>)}</select><Button variant={favoritesOnly ? "default" : "outline"} onClick={() => setFavoritesOnly((current) => !current)}><Heart className="h-4 w-4" /> Favorites</Button><Button asChild variant="outline"><Link href="/calories/custom-food-meal">Add Food/Meal</Link></Button><Button variant="outline" onClick={resetFilters} disabled={!query && !favoritesOnly && selectedKitchen?.id === kitchens[0]?.id && selectedSubcategory?.id === visibleSubcategories[0]?.id}><RotateCcw className="h-4 w-4" /> Reset</Button></div><div className="rounded-md border bg-card p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-foreground">{selectedKitchen?.name ?? "Kitchen"}</p><p className="text-xs text-muted-foreground">{isLoadingKitchenData ? "Loading kitchen data..." : `${visibleSubcategories.length} subcategories available`}</p></div>{selectedSubcategory ? <span className="text-xs font-semibold text-primary">{selectedSubcategory.name}</span> : null}</div><div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">{visibleSubcategories.map((subcategory) => <Button key={subcategory.id} type="button" variant={selectedSubcategory?.id === subcategory.id ? "default" : "outline"} size="sm" onClick={() => setSelectedSubcategoryId((current) => (current === subcategory.id ? "" : subcategory.id))} className="shrink-0">{subcategory.name}</Button>)}{!visibleSubcategories.length ? <p className="text-sm text-muted-foreground">No subcategories for this kitchen yet. Use search, recent foods, or create custom foods.</p> : null}</div></div><SpeedPanels recentFoods={recentFoods} frequentFoods={frequentFoods} favoriteLogs={favoriteLogs} favoriteKeys={favoriteKeys} onLog={logPrevious} onFavorite={toggleFavoriteForKey} onRefresh={() => loadSpeedData().catch(() => undefined)} /><SavedMealsPanel customMeals={customMeals} mealType={mealType} onLog={logCustomMealNow} onPlan={addCustomMealPlan} /><RecipePanel recipeDraft={recipeDraft} setRecipeDraft={setRecipeDraft} ingredientDraft={ingredientDraft} setIngredientDraft={setIngredientDraft} ingredients={recipeIngredients} setIngredients={setRecipeIngredients} recipes={recipes} onAddIngredient={addIngredient} onSaveRecipe={saveCurrentRecipe} onLogRecipe={logRecipe} onDeleteRecipe={removeRecipe} />{isLoadingFoods ? <p className="text-sm text-muted-foreground">Loading foods...</p> : null}{!isLoadingFoods && !foods.length ? <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground"><p className="font-semibold text-foreground">No foods found</p><p className="mt-1">Try another kitchen, clear filters, use Add Food/Meal, or create a saved custom food/meal.</p></div> : null}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleFoods.map((food) => { const quantity = quantities[food.id] ?? 1; const selectedUnit = units[food.id] ?? "serving"; const macros = scaleFoodMacros(food, quantity); const favoriteKey = favoriteKeyForFood(food); const favorite = favoriteKeys.includes(favoriteKey); return <Card key={food.id}><CardContent className="pt-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-foreground">{food.food_name}</h3><p className="mt-1 text-sm text-muted-foreground">{food.serving_size}</p></div><div className="flex flex-col items-end gap-2"><Badge>{food.category || "Food"}</Badge><ConfidenceBadge source={confidenceForFood(food)} /><FoodAccuracyBadges food={food} /></div></div><p className="mt-2 text-xs text-muted-foreground">{food.cuisine || selectedKitchen?.name || egyptianFoodKitchenName}</p><div className="mt-4 grid grid-cols-4 gap-2 text-center"><Macro label="kcal" value={macros.calories} /><Macro label="protein" value={`${macros.protein_g}g`} /><Macro label="carbs" value={`${macros.carbs_g}g`} /><Macro label="fat" value={`${macros.fat_g}g`} /></div><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px]"><div><label htmlFor={`quantity-${food.id}`} className="mb-2 block text-sm font-medium text-foreground">Quantity</label><Input id={`quantity-${food.id}`} type="number" min="0.1" step="0.1" value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [food.id]: Math.max(0.1, Number(event.target.value) || 1) }))} placeholder="1" /></div><div><label htmlFor={`unit-${food.id}`} className="mb-2 block text-sm font-medium text-foreground">Unit</label><select id={`unit-${food.id}`} value={selectedUnit} onChange={(event) => setUnits((current) => ({ ...current, [food.id]: event.target.value as ServingUnit }))} className="h-10 w-full rounded-md border bg-white px-3 text-sm">{servingUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><Button type="button" variant="outline" onClick={() => addToPlan(food)}><PlusCircle className="h-4 w-4" /> Add to plan</Button><Button type="button" onClick={() => logFoodNow(food)}><CheckCircle2 className="h-4 w-4" /> Done now - log food</Button><Button className="sm:col-span-2" type="button" variant={favorite ? "default" : "outline"} onClick={() => toggleFavoriteForKey(favoriteKey, food.food_name)}><Heart className="h-4 w-4" /> {favorite ? "Favorited" : "Favorite food"}</Button></div></CardContent></Card>; })}</div>{foods.length > visibleCount && !favoritesOnly ? <div className="flex justify-center"><Button type="button" variant="outline" onClick={() => setVisibleCount((current) => current + pageSize)}>Load more foods</Button></div> : null}</div>;
}


function SpeedPanels({ recentFoods, frequentFoods, favoriteLogs, favoriteKeys, onLog, onFavorite, onRefresh }: { recentFoods: FoodLog[]; frequentFoods: Array<FoodLog & { usageCount: number }>; favoriteLogs: FoodLog[]; favoriteKeys: string[]; onLog: (log: FoodLog) => void; onFavorite: (key: string, label: string) => void; onRefresh: () => void }) { return <div className="grid gap-4 xl:grid-cols-3"><FoodLogSpeedCard title="Recent foods" icon={<Clock className="h-5 w-5 text-primary" />} logs={recentFoods} favoriteKeys={favoriteKeys} onLog={onLog} onFavorite={onFavorite} onRefresh={onRefresh} empty="No recent foods yet." /><FoodLogSpeedCard title="Frequent foods" icon={<Utensils className="h-5 w-5 text-primary" />} logs={frequentFoods} favoriteKeys={favoriteKeys} onLog={onLog} onFavorite={onFavorite} empty="No frequent foods yet." showCount /><FoodLogSpeedCard title="Favorite foods" icon={<Heart className="h-5 w-5 text-primary" />} logs={favoriteLogs} favoriteKeys={favoriteKeys} onLog={onLog} onFavorite={onFavorite} empty="No favorite foods from your history yet." /></div>; }
function FoodLogSpeedCard({ title, icon, logs, favoriteKeys, onLog, onFavorite, onRefresh, empty, showCount = false }: { title: string; icon: ReactNode; logs: Array<FoodLog & { usageCount?: number }>; favoriteKeys: string[]; onLog: (log: FoodLog) => void; onFavorite: (key: string, label: string) => void; onRefresh?: () => void; empty: string; showCount?: boolean }) { return <Card><CardHeader><CardTitle className="flex items-center justify-between gap-2 text-base"><span className="flex items-center gap-2">{icon}{title}</span>{onRefresh ? <Button variant="ghost" size="icon" onClick={onRefresh}><RotateCcw className="h-4 w-4" /></Button> : null}</CardTitle></CardHeader><CardContent className="space-y-3">{!logs.length ? <p className="text-sm text-muted-foreground">{empty}</p> : null}{logs.map((log) => { const key = favoriteKeyForLog(log); const favorite = favoriteKeys.includes(key); return <div key={`${title}-${key}`} className="rounded-md border p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{log.food_name}</p><p className="text-xs text-muted-foreground">{log.quantity}x {log.serving_size} | {Math.round(log.calories)} kcal | {Math.round(log.protein_g)}g protein {showCount && log.usageCount ? `| used ${log.usageCount}x` : ""}</p></div><ConfidenceBadge source={confidenceForLog(log)} /></div><div className="mt-3 grid grid-cols-2 gap-2"><Button size="sm" onClick={() => onLog(log)}><CheckCircle2 className="h-4 w-4" /> Log again</Button><Button size="sm" variant={favorite ? "default" : "outline"} onClick={() => onFavorite(key, log.food_name)}><Heart className="h-4 w-4" /> {favorite ? "Saved" : "Favorite"}</Button></div></div>; })}</CardContent></Card>; }
function SavedMealsPanel({ customMeals, mealType, onLog, onPlan }: { customMeals: CustomMeal[]; mealType: MealType; onLog: (meal: CustomMeal) => void; onPlan: (meal: CustomMeal) => void }) { return <Card><CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base"><span className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> Saved meals</span><Button asChild variant="outline" size="sm"><Link href="/calories/custom-food-meal">Edit/delete saved meals</Link></Button></CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{!customMeals.length ? <p className="text-sm text-muted-foreground">No saved meals yet. Create one in Food Builder.</p> : null}{customMeals.map((meal) => <div key={meal.id} className="rounded-md border p-3"><p className="font-semibold">{meal.meal_name}</p><p className="text-sm text-muted-foreground">{meal.items.length} foods | {meal.totals.calories} kcal | {meal.totals.protein_g}g protein</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={() => onPlan(meal)}><PlusCircle className="h-4 w-4" /> Add to plan</Button><Button onClick={() => onLog(meal)}><CheckCircle2 className="h-4 w-4" /> Log to {displayMealType(mealType)}</Button></div></div>)}</CardContent></Card>; }
function RecipePanel({ recipeDraft, setRecipeDraft, ingredientDraft, setIngredientDraft, ingredients, setIngredients, recipes, onAddIngredient, onSaveRecipe, onLogRecipe, onDeleteRecipe }: { recipeDraft: RecipeDraftState; setRecipeDraft: Dispatch<SetStateAction<RecipeDraftState>>; ingredientDraft: IngredientDraft; setIngredientDraft: Dispatch<SetStateAction<IngredientDraft>>; ingredients: RecipeIngredient[]; setIngredients: Dispatch<SetStateAction<RecipeIngredient[]>>; recipes: SavedRecipe[]; onAddIngredient: () => void; onSaveRecipe: () => void; onLogRecipe: (recipe: SavedRecipe) => void; onDeleteRecipe: (recipe: SavedRecipe) => void }) { const draftTotals = recipeTotals({ ingredients, portions: Number(recipeDraft.portions) || 1 }); return <Card><CardHeader><CardTitle className="text-base">Recipe builder</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-4"><Input value={recipeDraft.name} onChange={(e) => setRecipeDraft((current) => ({ ...current, name: e.target.value }))} placeholder="Recipe name" /><Input type="number" min="1" inputMode="numeric" enterKeyHint="done" value={recipeDraft.portions} onChange={(e) => setRecipeDraft((current) => ({ ...current, portions: e.target.value }))} placeholder="Portions" /><Input className="md:col-span-2" value={recipeDraft.notes} onChange={(e) => setRecipeDraft((current) => ({ ...current, notes: e.target.value }))} placeholder="Notes" /></div><div className="grid gap-2 md:grid-cols-7"><Input value={ingredientDraft.foodName} onChange={(e) => setIngredientDraft((current) => ({ ...current, foodName: e.target.value }))} placeholder="Ingredient" /><Input type="number" min="0.1" inputMode="decimal" enterKeyHint="done" value={ingredientDraft.quantity} onChange={(e) => setIngredientDraft((current) => ({ ...current, quantity: e.target.value }))} placeholder="Qty" /><select value={ingredientDraft.servingUnit} onChange={(e) => setIngredientDraft((current) => ({ ...current, servingUnit: e.target.value as ServingUnit }))} className="h-10 rounded-md border bg-white px-3 text-sm">{servingUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select><Input type="number" value={ingredientDraft.calories} onChange={(e) => setIngredientDraft((current) => ({ ...current, calories: e.target.value }))} placeholder="kcal" /><Input type="number" value={ingredientDraft.protein} onChange={(e) => setIngredientDraft((current) => ({ ...current, protein: e.target.value }))} placeholder="protein" /><Input type="number" value={ingredientDraft.carbs} onChange={(e) => setIngredientDraft((current) => ({ ...current, carbs: e.target.value }))} placeholder="carbs" /><Input type="number" value={ingredientDraft.fat} onChange={(e) => setIngredientDraft((current) => ({ ...current, fat: e.target.value }))} placeholder="fat" /><Button className="md:col-span-7" variant="outline" onClick={onAddIngredient}>Add ingredient</Button></div><div className="rounded-md bg-slate-50 p-3 text-sm text-muted-foreground">Total: {draftTotals.total.calories} kcal | P {draftTotals.total.protein_g}g | C {draftTotals.total.carbs_g}g | F {draftTotals.total.fat_g}g. Per portion: {draftTotals.perPortion.calories} kcal | P {draftTotals.perPortion.protein_g}g.</div>{ingredients.length ? <div className="grid gap-2 md:grid-cols-2">{ingredients.map((ingredient) => <div key={ingredient.id} className="rounded-md border p-2 text-sm"><div className="flex justify-between gap-2"><span>{ingredient.foodName}</span><button className="text-xs underline" onClick={() => setIngredients((current) => current.filter((item) => item.id !== ingredient.id))}>remove</button></div><p className="text-muted-foreground">{ingredient.quantity} {ingredient.servingUnit} | {ingredient.calories} kcal</p></div>)}</div> : null}<Button onClick={onSaveRecipe} disabled={!ingredients.length}><Save className="h-4 w-4" /> Save recipe</Button><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{recipes.map((recipe) => { const totals = recipeTotals(recipe); return <div key={recipe.id} className="rounded-md border p-3"><p className="font-semibold">{recipe.name}</p><p className="text-sm text-muted-foreground">{recipe.ingredients.length} ingredients | {recipe.portions} portions | {totals.perPortion.calories} kcal/portion</p><div className="mt-3 grid grid-cols-2 gap-2"><Button size="sm" onClick={() => onLogRecipe(recipe)}>Log portion</Button><Button size="sm" variant="outline" onClick={() => onDeleteRecipe(recipe)}><Trash2 className="h-4 w-4" /> Delete</Button></div></div>; })}</div></CardContent></Card>; }
function NoticeBox({ notice, onClose }: { notice: Notice; onClose: () => void }) { const styles = notice.type === "success" ? "border-success/30 bg-success/10 text-foreground" : notice.type === "error" ? "border-destructive/30 bg-destructive/10 text-foreground" : "border-primary/40 bg-primary/5 text-foreground"; return <div className={`rounded-md border p-4 text-sm ${styles}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{notice.title}</p>{notice.description ? <p className="mt-1 break-words opacity-90">{notice.description}</p> : null}</div><button type="button" onClick={onClose} className="text-xs font-semibold underline">close</button></div></div>; }
function Macro({ label, value }: { label: string; value: string | number }) { return <div className="rounded-md bg-muted px-2 py-2"><p className="text-sm font-bold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>; }
function ConfidenceBadge({ source }: { source: string }) { return <Badge variant={source === "verified" ? "success" : source === "imported" || source.includes("library") || source === "admin-reviewed" ? "navy" : "outline"}>{source}</Badge>; }
function FoodAccuracyBadges({ food }: { food: FoodItem }) { const source = sourceLabelForFood(food); return <>{hasUnknownMacros(food) ? <Badge variant="outline">unknown macros</Badge> : null}<Badge variant="outline">{source}</Badge></>; }
function displayMealType(type: MealType) { return type === "Snack" ? "Snacks" : type; }
function normalizeFoodItem(food: FoodItem): FoodItem { const fallbackId = `food-${food.food_name || "item"}-${food.serving_size || "serving"}-${food.category || "general"}`; return { ...food, id: String(food.id || fallbackId), food_name: String(food.food_name || "Unnamed food"), serving_size: String(food.serving_size || "1 serving"), calories: toNumber(food.calories), protein_g: toNumber(food.protein_g), carbs_g: toNumber(food.carbs_g), fat_g: toNumber(food.fat_g), category: food.category || "Food", cuisine: food.cuisine || egyptianFoodKitchenName }; }
function toNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function uniqueLogs(logs: FoodLog[]) { const map = new Map<string, FoodLog>(); logs.forEach((log) => { const key = favoriteKeyForLog(log); if (!map.has(key)) map.set(key, log); }); return Array.from(map.values()); }
function frequentLogs(logs: FoodLog[]) { const map = new Map<string, FoodLog & { usageCount: number }>(); logs.forEach((log) => { const key = favoriteKeyForLog(log); const current = map.get(key); if (current) current.usageCount += 1; else map.set(key, { ...log, usageCount: 1 }); }); return Array.from(map.values()).sort((a, b) => b.usageCount - a.usageCount || a.food_name.localeCompare(b.food_name)); }
function confidenceForFood(food: FoodItem) { const source = String(food.source_type || "").toLowerCase(); if (source.includes("verified")) return "verified"; if (source.includes("admin")) return "admin-reviewed"; if (source.includes("import")) return "imported"; if (source.includes("manual")) return "manual"; if (source.includes("user")) return "user-created"; return food.is_global ? "unverified library" : "estimated"; }
function confidenceForLog(log: FoodLog) { const notes = (log.notes || "").toLowerCase(); if (notes.includes("estimated")) return "estimated"; if (log.user_food_item_id) return "user-created"; if (log.food_item_id) return "library"; if (notes.includes("import")) return "imported"; return "estimated"; }
function hasUnknownMacros(food: Pick<FoodItem, "calories" | "protein_g" | "carbs_g" | "fat_g">) { return [food.calories, food.protein_g, food.carbs_g, food.fat_g].every((value) => toNumber(value) === 0); }
function sourceLabelForFood(food: Pick<FoodItem, "source_type" | "is_global">) { const source = String(food.source_type || "").trim(); if (!source) return "unknown source"; if (source.toLowerCase().includes("admin")) return "admin review"; if (source.toLowerCase().includes("verified")) return "verified source"; if (source.toLowerCase().includes("import")) return "imported source"; if (source.toLowerCase().includes("manual")) return "manual source"; if (source.toLowerCase().includes("user")) return "user source"; return food.is_global ? "library source" : "estimated source"; }
