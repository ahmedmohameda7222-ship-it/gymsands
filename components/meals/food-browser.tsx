"use client";

import { AlertTriangle, BookOpen, CheckCircle2, Heart, PlusCircle, RotateCcw, Search } from "lucide-react";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
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
  favoriteKeyForFood,
  favoriteKeyForLog,
  getFavoriteFoodKeys,
  getFavoriteFoodKeysAsync,
  setFavoriteFood,
  setFavoriteFoodAsync,
  type ServingUnit
} from "@/services/meals/food-logging-speed";
import { scaleFoodMacros, validateFoodLogInput } from "@/services/nutrition/calculations";
import { egyptianFoods } from "@/data/egyptian-foods";
import type { CustomMeal, FoodItem, FoodKitchen, FoodLog, FoodSubcategory, MealPlanItem, MealType } from "@/types";

const pageSize = 12;
const mealOptions: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const servingUnits: ServingUnit[] = ["serving", "grams", "pieces", "cups", "tablespoons", "portion"];
const selectClassName = "h-11 w-full rounded-[14px] border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const compactSelectClassName = "h-10 w-full rounded-[14px] border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const fallbackCategories = [...egyptianFoodSubcategories];
const emptyFoodLogs: FoodLog[] = [];

type FoodBrowserProps = { initialLogs?: FoodLog[]; onLogAdded?: (log: FoodLog) => void; onPlanAdded?: (item: MealPlanItem) => void; defaultMealType?: MealType; logDate?: string; };
type Notice = { type: "success" | "error" | "info"; title: string; description?: string };

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
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
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
  const [libraryMode, setLibraryMode] = useState<"foods" | "savedMeals">("foods");

  const selectedKitchen = kitchens.find((kitchen) => kitchen.id === selectedKitchenId) ?? kitchens[0];
  const visibleSubcategories = useMemo(() => subcategories.filter((subcategory) => subcategory.kitchen_id === selectedKitchen?.id), [selectedKitchen?.id, subcategories]);
  const selectedSubcategory = visibleSubcategories.find((subcategory) => subcategory.id === selectedSubcategoryId) ?? visibleSubcategories[0];

  useEffect(() => setMealType(mealOptions.includes(defaultMealType) ? defaultMealType : "Breakfast"), [defaultMealType]);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => setLogs(initialLogs), [initialLogs]);

  useEffect(() => {
    let active = true;
    setIsLoadingKitchenData(true);
    Promise.all([
      getFoodKitchens(user?.id ?? ""),
      user?.id ? getCustomMeals(user.id) : Promise.resolve<CustomMeal[]>([]),
      getFavoriteFoodKeysAsync(user?.id)
    ])
      .then(([kitchenData, meals, favorites]) => {
        if (!active) return;
        setKitchens(kitchenData.kitchens);
        setSubcategories(kitchenData.subcategories);
        setCustomMeals(meals);
        setFavoriteKeys(favorites);
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

  const visibleFoods = useMemo(() => foods.filter((food) => !favoritesOnly || favoriteKeys.includes(favoriteKeyForFood(food))).slice(0, visibleCount), [favoriteKeys, favoritesOnly, foods, visibleCount]);

  function selectKitchen(kitchenId: string) { const firstSubcategory = subcategories.find((subcategory) => subcategory.kitchen_id === kitchenId); setSelectedKitchenId(kitchenId); setSelectedSubcategoryId(firstSubcategory?.id ?? ""); }
  function resetFilters() { const firstKitchen = kitchens[0]; const firstSubcategory = subcategories.find((subcategory) => subcategory.kitchen_id === firstKitchen?.id); setQuery(""); setFavoritesOnly(false); setLibraryMode("foods"); setSelectedKitchenId(firstKitchen?.id ?? ""); setSelectedSubcategoryId(firstSubcategory?.id ?? ""); }
  function pushLoggedFood(log: FoodLog) { setLogs((current) => [log, ...current]); onLogAdded?.(log); }

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

  return <div className="space-y-4">{notice ? <NoticeBox notice={notice} onClose={() => setNotice(null)} /> : null}<div className="glass-card grid gap-3 p-4 sm:p-5 lg:grid-cols-[1fr_190px_190px_auto_auto_auto_auto]"><div className="relative"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search food, e.g. chicken, rice, sauce" className="pl-10" /></div><select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)} className={selectClassName} aria-label="Meal type">{mealOptions.map((type) => <option key={type} value={type}>{displayMealType(type)}</option>)}</select><select value={selectedKitchen?.id ?? ""} onChange={(event) => selectKitchen(event.target.value)} className={selectClassName} aria-label="Kitchen">{kitchens.map((kitchen) => <option key={kitchen.id} value={kitchen.id}>{kitchen.name}</option>)}</select><Button variant={favoritesOnly ? "default" : "outline"} onClick={() => setFavoritesOnly((current) => !current)}><Heart className="h-4 w-4" /> Favorites</Button><Button variant={libraryMode === "savedMeals" ? "default" : "outline"} onClick={() => setLibraryMode((current) => current === "foods" ? "savedMeals" : "foods")}><BookOpen className="h-4 w-4" /> Saved Meals</Button><Button asChild variant="outline"><Link href="/calories/food-hub?builder=1">Add Food/Meal</Link></Button><Button variant="outline" onClick={resetFilters} disabled={!query && !favoritesOnly && libraryMode === "foods" && selectedKitchen?.id === kitchens[0]?.id && selectedSubcategory?.id === visibleSubcategories[0]?.id}><RotateCcw className="h-4 w-4" /> Reset</Button></div>{libraryMode === "foods" ? <div className="glass-card p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-foreground">{selectedKitchen?.name ?? "Kitchen"}</p><p className="text-xs text-muted-foreground">{isLoadingKitchenData ? "Loading kitchen data..." : `${visibleSubcategories.length} subcategories available`}</p></div>{selectedSubcategory ? <span className="text-xs font-semibold text-primary">{selectedSubcategory.name}</span> : null}</div><div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">{visibleSubcategories.map((subcategory) => <Button key={subcategory.id} type="button" variant={selectedSubcategory?.id === subcategory.id ? "default" : "outline"} size="sm" onClick={() => setSelectedSubcategoryId((current) => (current === subcategory.id ? "" : subcategory.id))} className="shrink-0">{subcategory.name}</Button>)}{!visibleSubcategories.length ? <p className="text-sm text-muted-foreground">No subcategories for this kitchen yet. Use search, recent foods, or create custom foods.</p> : null}</div></div> : null}{libraryMode === "savedMeals" ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{!customMeals.length ? <div className="glass-card border-dashed p-4 text-sm text-muted-foreground"><p className="font-semibold text-foreground">No saved meals yet</p><p className="mt-1">Create one in Food Builder.</p></div> : null}{customMeals.map((meal) => <Card key={meal.id} variant="glass"><CardContent className="pt-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-foreground">{meal.meal_name}</h3><p className="mt-1 text-sm text-muted-foreground">{meal.items.length} foods</p></div><Badge>{customMealCategory(meal)}</Badge></div><div className="mt-4 grid grid-cols-2 gap-2 text-center"><Macro label="kcal" value={meal.totals.calories} /><Macro label="protein" value={`${meal.totals.protein_g}g`} /></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><Button variant="outline" onClick={() => addCustomMealPlan(meal)}><PlusCircle className="h-4 w-4" /> Add to plan</Button><Button onClick={() => logCustomMealNow(meal)}><CheckCircle2 className="h-4 w-4" /> Log to {displayMealType(mealType)}</Button><Button asChild variant="outline"><Link href="/calories/food-hub?builder=1">Edit</Link></Button></div></CardContent></Card>)}</div> : null}{libraryMode === "foods" && isLoadingFoods ? <p className="text-sm text-muted-foreground">Loading foods...</p> : null}{libraryMode === "foods" && !isLoadingFoods && !foods.length ? <div className="solid-row border-dashed p-4 text-sm text-muted-foreground"><p className="font-semibold text-foreground">No foods found</p><p className="mt-1">Try another kitchen, clear filters, use Add Food/Meal, or create a saved custom food/meal.</p></div> : null}{libraryMode === "foods" ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleFoods.map((food) => { const quantity = quantities[food.id] ?? 1; const selectedUnit = units[food.id] ?? "serving"; const macros = scaleFoodMacros(food, quantity); const favoriteKey = favoriteKeyForFood(food); const favorite = favoriteKeys.includes(favoriteKey); return <Card key={food.id}><CardContent className="pt-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-foreground">{food.food_name}</h3><p className="mt-1 text-sm text-muted-foreground">{food.serving_size}</p></div><div className="flex flex-col items-end gap-2"><Badge>{food.category || "Food"}</Badge><ConfidenceBadge source={confidenceForFood(food)} /><FoodAccuracyBadges food={food} /></div></div><p className="mt-2 text-xs text-muted-foreground">{food.cuisine || selectedKitchen?.name || egyptianFoodKitchenName}</p><div className="mt-4 grid grid-cols-4 gap-2 text-center"><Macro label="kcal" value={macros.calories} /><Macro label="protein" value={`${macros.protein_g}g`} /><Macro label="carbs" value={`${macros.carbs_g}g`} /><Macro label="fat" value={`${macros.fat_g}g`} /></div><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px]"><div><label htmlFor={`quantity-${food.id}`} className="mb-2 block text-sm font-medium text-foreground">Quantity</label><Input id={`quantity-${food.id}`} type="number" min="0.1" step="0.1" value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [food.id]: Math.max(0.1, Number(event.target.value) || 1) }))} placeholder="1" /></div><div><label htmlFor={`unit-${food.id}`} className="mb-2 block text-sm font-medium text-foreground">Unit</label><select id={`unit-${food.id}`} value={selectedUnit} onChange={(event) => setUnits((current) => ({ ...current, [food.id]: event.target.value as ServingUnit }))} className={compactSelectClassName}>{servingUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><Button type="button" variant="outline" onClick={() => addToPlan(food)}><PlusCircle className="h-4 w-4" /> Add to plan</Button><Button type="button" onClick={() => logFoodNow(food)}><CheckCircle2 className="h-4 w-4" /> Done now - log food</Button><Button className="sm:col-span-2" type="button" variant={favorite ? "default" : "outline"} onClick={() => toggleFavoriteForKey(favoriteKey, food.food_name)}><Heart className="h-4 w-4" /> {favorite ? "Favorited" : "Favorite food"}</Button></div></CardContent></Card>; })}</div> : null}{libraryMode === "foods" && foods.length > visibleCount && !favoritesOnly ? <div className="flex justify-center"><Button type="button" variant="outline" onClick={() => setVisibleCount((current) => current + pageSize)}>Load more foods</Button></div> : null}</div>;
}

function NoticeBox({ notice, onClose }: { notice: Notice; onClose: () => void }) { const styles = notice.type === "success" ? "border-success/30 bg-success/10 text-foreground" : notice.type === "error" ? "border-destructive/30 bg-destructive/10 text-foreground" : "border-primary/40 bg-primary/5 text-foreground"; return <div className={`rounded-md border p-4 text-sm ${styles}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{notice.title}</p>{notice.description ? <p className="mt-1 break-words opacity-90">{notice.description}</p> : null}</div><button type="button" onClick={onClose} className="text-xs font-semibold underline">close</button></div></div>; }
function Macro({ label, value }: { label: string; value: string | number }) { return <div className="rounded-md bg-muted px-2 py-2"><p className="text-sm font-bold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>; }
function ConfidenceBadge({ source }: { source: string }) { return <Badge variant={source === "verified" ? "success" : source === "imported" || source.includes("library") || source === "admin-reviewed" ? "navy" : "outline"}>{source}</Badge>; }
function FoodAccuracyBadges({ food }: { food: FoodItem }) { const source = sourceLabelForFood(food); return <>{hasUnknownMacros(food) ? <Badge variant="outline">unknown macros</Badge> : null}<Badge variant="outline">{source}</Badge></>; }
function displayMealType(type: MealType) { return type === "Snack" ? "Snacks" : type; }
function normalizeFoodItem(food: FoodItem): FoodItem { const fallbackId = `food-${food.food_name || "item"}-${food.serving_size || "serving"}-${food.category || "general"}`; return { ...food, id: String(food.id || fallbackId), food_name: String(food.food_name || "Unnamed food"), serving_size: String(food.serving_size || "1 serving"), calories: toNumber(food.calories), protein_g: toNumber(food.protein_g), carbs_g: toNumber(food.carbs_g), fat_g: toNumber(food.fat_g), category: food.category || "Food", cuisine: food.cuisine || egyptianFoodKitchenName }; }
function toNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function uniqueLogs(logs: FoodLog[]) { const map = new Map<string, FoodLog>(); logs.forEach((log) => { const key = favoriteKeyForLog(log); if (!map.has(key)) map.set(key, log); }); return Array.from(map.values()); }
function frequentLogs(logs: FoodLog[]) { const map = new Map<string, FoodLog & { usageCount: number }>(); logs.forEach((log) => { const key = favoriteKeyForLog(log); const current = map.get(key); if (current) current.usageCount += 1; else map.set(key, { ...log, usageCount: 1 }); }); return Array.from(map.values()).sort((a, b) => b.usageCount - a.usageCount || a.food_name.localeCompare(b.food_name)); }
function customMealCategory(meal: CustomMeal) { const category = (meal as { meal_category?: unknown }).meal_category; return typeof category === "string" && category.trim() ? category : "Meal"; }
function confidenceForFood(food: FoodItem) { const source = String(food.source_type || "").toLowerCase(); if (source.includes("verified")) return "verified"; if (source.includes("admin")) return "admin-reviewed"; if (source.includes("import")) return "imported"; if (source.includes("manual")) return "manual"; if (source.includes("user")) return "user-created"; return food.is_global ? "unverified library" : "estimated"; }
function confidenceForLog(log: FoodLog) { const notes = (log.notes || "").toLowerCase(); if (notes.includes("estimated")) return "estimated"; if (log.user_food_item_id) return "user-created"; if (log.food_item_id) return "library"; if (notes.includes("import")) return "imported"; return "estimated"; }
function hasUnknownMacros(food: Pick<FoodItem, "calories" | "protein_g" | "carbs_g" | "fat_g">) { return [food.calories, food.protein_g, food.carbs_g, food.fat_g].every((value) => toNumber(value) === 0); }
function sourceLabelForFood(food: Pick<FoodItem, "source_type" | "is_global">) { const source = String(food.source_type || "").trim(); if (!source) return "unknown source"; if (source.toLowerCase().includes("admin")) return "admin review"; if (source.toLowerCase().includes("verified")) return "verified source"; if (source.toLowerCase().includes("import")) return "imported source"; if (source.toLowerCase().includes("manual")) return "manual source"; if (source.toLowerCase().includes("user")) return "user source"; return food.is_global ? "library source" : "estimated source"; }
