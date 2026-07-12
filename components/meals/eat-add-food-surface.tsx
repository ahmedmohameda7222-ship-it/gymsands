"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Barcode, BookOpen, Camera, ChefHat, Copy, History, Loader2, Search } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { EatBarcodeMethod } from "@/components/meals/eat-barcode-method";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InlineFeedback } from "@/components/motion";
import { findCopyDuplicates, supportedServingOptions, type RepeatFoodOption, type SourceState } from "@/lib/eat/eat-model";
import { formatEatEnergy } from "@/lib/eat/eat-units";
import { useEatTranslation } from "@/lib/i18n/eat";
import { addGlobalFoodToToday, getCustomMeals, getFoodCategories, getFoodLibrary } from "@/services/database/nutrition";
import { copyEatFoodLogs, getEatFoodLogs, logRepeatFood } from "@/services/database/eat";
import { logSavedMealToEat } from "@/services/database/eat-food-logging";
import { scaleFoodMacros } from "@/services/nutrition/calculations";
import type { UserAppSettings } from "@/services/database/user-settings";
import type { CustomMeal, FoodItem, FoodLog, MealType } from "@/types";

type AddFoodViewName = "home" | "repeat" | "search" | "saved-meals" | "barcode" | "custom" | "photo" | "copy-day";

const mealTypes: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

export function EatAddFoodSurface({
  open,
  onOpenChange,
  selectedDate,
  initialMealType,
  repeats,
  targetLogs,
  energyUnit,
  initialView = "home",
  onFoodLogged,
  onPhotoPrompt
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  initialMealType: MealType;
  repeats: RepeatFoodOption[];
  targetLogs: FoodLog[];
  energyUnit: UserAppSettings["energyUnit"];
  initialView?: AddFoodViewName;
  onFoodLogged: (logs: FoodLog[]) => void;
  onPhotoPrompt: (date: string, mealType: MealType) => void;
}) {
  const { et, formatDate, mealLabel } = useEatTranslation();
  const [view, setView] = useState<AddFoodViewName>(initialView);
  const [date, setDate] = useState(selectedDate);
  const [mealType, setMealType] = useState<MealType>(initialMealType);

  useEffect(() => {
    if (!open) return;
    setDate(selectedDate);
    setMealType(initialMealType);
    setView(initialView);
  }, [initialMealType, initialView, open, selectedDate]);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) setView("home");
  }

  const customHref = `/calories/food-hub?builder=1&date=${encodeURIComponent(date)}&meal=${encodeURIComponent(mealType.toLowerCase())}&return=${encodeURIComponent(`/calories?date=${selectedDate}&view=day`)}`;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent layout="responsive-drawer" variant="glass" closeLabel={et("close")}>
        <div className="shrink-0 border-b border-border/70 px-5 py-4">
          <DialogHeader className="mb-0">
            <div className="flex items-center gap-2">
              {view !== "home" ? <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={() => setView("home")} aria-label={et("back")}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Button> : null}
              <div><DialogTitle>{viewTitle(view, et)}</DialogTitle><DialogDescription>{et("noNested")}</DialogDescription></div>
            </div>
          </DialogHeader>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-semibold text-muted-foreground"><span>{et("date")}</span><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label={et("date")} /></label>
            <label className="space-y-1 text-xs font-semibold text-muted-foreground"><span>{et("meal")}</span><select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)} className="h-12 w-full rounded-[14px] border border-input bg-card px-3 text-sm text-foreground" aria-label={et("meal")}>{mealTypes.map((type) => <option key={type} value={type}>{mealLabel(type)}</option>)}</select></label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{et("destination")}: {formatDate(date)} · {mealLabel(mealType)}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          {view === "home" ? <AddFoodHome setView={setView} customHref={customHref} onPhoto={() => { onPhotoPrompt(date, mealType); close(false); }} /> : null}
          {view === "repeat" ? <RepeatMethod options={repeats} date={date} mealType={mealType} energyUnit={energyUnit} onLogged={(log) => onFoodLogged([log])} /> : null}
          {view === "search" ? <SearchMethod date={date} mealType={mealType} energyUnit={energyUnit} onLogged={(log) => onFoodLogged([log])} /> : null}
          {view === "saved-meals" ? <SavedMealsMethod date={date} mealType={mealType} customHref={customHref} energyUnit={energyUnit} onLogged={(log) => onFoodLogged([log])} /> : null}
          {view === "barcode" ? <EatBarcodeMethod date={date} mealType={mealType} energyUnit={energyUnit} onLogged={(log) => onFoodLogged([log])} /> : null}
          {view === "custom" ? <CustomMethod href={customHref} /> : null}
          {view === "photo" ? <PhotoMethod onOpen={() => { onPhotoPrompt(date, mealType); close(false); }} /> : null}
          {view === "copy-day" ? <CopyDayMethod targetDate={date} targetLogs={targetLogs} energyUnit={energyUnit} onCopied={onFoodLogged} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function viewTitle(name: AddFoodViewName, et: ReturnType<typeof useEatTranslation>["et"]) {
  if (name === "repeat") return et("quickRepeat");
  if (name === "search") return et("searchFoods");
  if (name === "saved-meals") return et("savedMeals");
  if (name === "barcode") return et("barcode");
  if (name === "custom") return et("customFoodMeal");
  if (name === "photo") return et("photoEstimate");
  if (name === "copy-day") return et("copyDay");
  return et("addFoodTitle");
}

function AddFoodHome({ setView, customHref, onPhoto }: { setView: (view: AddFoodViewName) => void; customHref: string; onPhoto: () => void }) {
  const { et } = useEatTranslation();
  const methods = [
    { name: "repeat" as const, icon: History, label: et("quickRepeat") },
    { name: "search" as const, icon: Search, label: et("searchFoods") },
    { name: "saved-meals" as const, icon: BookOpen, label: et("savedMeals") },
    { name: "barcode" as const, icon: Barcode, label: et("barcode") },
    { name: "copy-day" as const, icon: Copy, label: et("copyDay") }
  ];
  return <div className="grid gap-3 sm:grid-cols-2">
    {methods.map((method) => { const Icon = method.icon; return <button key={method.name} type="button" onClick={() => setView(method.name)} className="flex min-h-16 items-center gap-3 rounded-[16px] border border-border/70 bg-card p-4 text-start transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon className="h-5 w-5 text-primary" /><span className="font-semibold">{method.label}</span></button>; })}
    <Link href={customHref} className="flex min-h-16 items-center gap-3 rounded-[16px] border border-border/70 bg-card p-4 font-semibold transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChefHat className="h-5 w-5 text-primary" />{et("customFoodMeal")}</Link>
    <button type="button" onClick={onPhoto} className="flex min-h-16 items-center gap-3 rounded-[16px] border border-border/70 bg-card p-4 text-start transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Camera className="h-5 w-5 text-primary" /><span className="font-semibold">{et("photoEstimate")}</span></button>
  </div>;
}

function RepeatMethod({ options, date, mealType, energyUnit, onLogged }: { options: RepeatFoodOption[]; date: string; mealType: MealType; energyUnit: UserAppSettings["energyUnit"]; onLogged: (log: FoodLog) => void }) {
  const { user } = useAuth();
  const { et, locale } = useEatTranslation();
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);
  if (!options.length) return <p className="text-sm text-muted-foreground">{et("noFoods")}</p>;
  async function repeat(option: RepeatFoodOption) {
    if (!user?.id || pending) return;
    setPending(option.repeatKey); setFeedback({ type: "info", message: et("logging") });
    try { const log = await logRepeatFood(user.id, option, date, mealType); onLogged(log); setFeedback({ type: "info", message: et("logged") }); }
    catch { setFeedback({ type: "error", message: et("saveFailed") }); }
    finally { setPending(null); }
  }
  return <div className="space-y-3">{options.map((option) => <Card key={option.repeatKey}><CardContent className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate font-semibold">{option.food_name}</p><p className="mt-1 text-xs text-muted-foreground">{option.quantity} × {option.serving_size} · {formatEatEnergy(option.calories, energyUnit, locale)}</p></div><Button type="button" className="min-h-12 shrink-0" onClick={() => void repeat(option)} disabled={Boolean(pending)}>{pending === option.repeatKey ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{et("logFood")}</Button></CardContent></Card>)}<InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} /></div>;
}

function SearchMethod({ date, mealType, energyUnit, onLogged }: { date: string; mealType: MealType; energyUnit: UserAppSettings["energyUnit"]; onLogged: (log: FoodLog) => void }) {
  const { user } = useAuth();
  const { et, locale } = useEatTranslation();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);

  useEffect(() => { void getFoodCategories().then(setCategories).catch(() => setCategories([])); }, []);
  useEffect(() => {
    let active = true; setState("loading");
    const timer = window.setTimeout(() => {
      void getFoodLibrary(user?.id ?? "", query.trim(), { category: category || undefined, limit: 24 })
        .then((items) => { if (active) { setFoods(items); setState("loaded"); } })
        .catch(() => { if (active) { setFoods([]); setState("failed"); } });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [category, query, user?.id]);

  async function log(food: FoodItem) {
    if (!user?.id || pending) return;
    const quantity = quantities[food.id] ?? 1;
    if (!Number.isFinite(quantity) || quantity <= 0) { setFeedback({ type: "error", message: et("quantityPositive") }); return; }
    setPending(food.id); setFeedback({ type: "info", message: et("logging") });
    try { const saved = await addGlobalFoodToToday({ userId: user.id, food, quantity, mealType, date }); onLogged(saved); setFeedback({ type: "info", message: et("logged") }); }
    catch { setFeedback({ type: "error", message: et("saveFailed") }); }
    finally { setPending(null); }
  }

  return <div className="space-y-4">
    <div className="grid gap-2 sm:grid-cols-[1fr_180px]"><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={et("foodSearchPlaceholder")} aria-label={et("searchFoods")} /><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-12 rounded-[14px] border border-input bg-card px-3 text-sm" aria-label={et("allCategories")}><option value="">{et("allCategories")}</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
    {state === "loading" ? <p className="text-sm text-muted-foreground">{et("loading")}</p> : state === "failed" ? <p className="text-sm text-destructive">{et("searchFailed")}</p> : !foods.length ? <p className="text-sm text-muted-foreground">{et("noFoods")}</p> : null}
    <div className="grid gap-3">{foods.map((food) => { const quantity = quantities[food.id] ?? 1; const macros = scaleFoodMacros(food, quantity); const serving = supportedServingOptions(food)[0]; return <Card key={food.id}><CardContent className="space-y-3 p-3"><div><p className="font-semibold">{food.food_name}</p><p className="mt-1 text-xs text-muted-foreground">{serving.label} · {et("storedServingOnly")}</p><p className="mt-2 text-sm">{formatEatEnergy(macros.calories, energyUnit, locale)} · P {macros.protein_g} g · C {macros.carbs_g} g · F {macros.fat_g} g</p></div><div className="grid gap-2 sm:grid-cols-[120px_1fr]"><Input type="number" min="0.1" step="0.1" value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [food.id]: Number(event.target.value) }))} aria-label={`${et("quantity")} · ${food.food_name}`} /><Button type="button" className="min-h-12" onClick={() => void log(food)} disabled={Boolean(pending)}>{pending === food.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{et("logFood")}</Button></div></CardContent></Card>; })}</div>
    <InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} />
  </div>;
}

function SavedMealsMethod({ date, mealType, customHref, energyUnit, onLogged }: { date: string; mealType: MealType; customHref: string; energyUnit: UserAppSettings["energyUnit"]; onLogged: (log: FoodLog) => void }) {
  const { user } = useAuth();
  const { et, locale } = useEatTranslation();
  const [meals, setMeals] = useState<SourceState<CustomMeal[]>>({ status: "loading" });
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);
  useEffect(() => { if (!user?.id) return; let active = true; getCustomMeals(user.id).then((data) => { if (active) setMeals({ status: "loaded", data }); }).catch(() => { if (active) setMeals({ status: "failed", error: et("savedMealsFailed") }); }); return () => { active = false; }; }, [et, user?.id]);
  async function log(meal: CustomMeal) {
    if (!user?.id || pending) return;
    const quantity = quantities[meal.id] ?? 1;
    if (!Number.isFinite(quantity) || quantity <= 0) { setFeedback({ type: "error", message: et("quantityPositive") }); return; }
    setPending(meal.id); setFeedback({ type: "info", message: et("logging") });
    try { const saved = await logSavedMealToEat({ userId: user.id, meal, date, mealType, quantity }); onLogged(saved); setFeedback({ type: "info", message: et("logged") }); }
    catch { setFeedback({ type: "error", message: et("saveFailed") }); }
    finally { setPending(null); }
  }
  if (meals.status === "loading") return <p className="text-sm text-muted-foreground">{et("loading")}</p>;
  if (meals.status === "failed") return <p className="text-sm text-destructive">{meals.error}</p>;
  return <div className="space-y-3">{!meals.data.length ? <div className="space-y-3"><p className="text-sm text-muted-foreground">{et("noSavedMeals")}</p><Button asChild variant="outline"><Link href={customHref}>{et("customFoodMeal")}</Link></Button></div> : meals.data.map((meal) => { const quantity = quantities[meal.id] ?? 1; return <Card key={meal.id}><CardContent className="space-y-3 p-3"><div><p className="font-semibold">{meal.meal_name}</p><p className="mt-1 text-sm text-muted-foreground">{et("foodItemsCount", { count: meal.items.length })} · {formatEatEnergy(meal.totals.calories * quantity, energyUnit, locale)} · P {Math.round(meal.totals.protein_g * quantity * 10) / 10} g</p></div><div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]"><Input type="number" min="0.1" step="0.1" value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [meal.id]: Number(event.target.value) }))} aria-label={`${et("quantity")} · ${meal.meal_name}`} /><Button type="button" className="min-h-12" onClick={() => void log(meal)} disabled={Boolean(pending)}>{pending === meal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{et("logFood")}</Button><Button asChild variant="outline" className="min-h-12"><Link href={customHref}>{et("editSavedMeal")}</Link></Button></div></CardContent></Card>; })}<InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} /></div>;
}

function CustomMethod({ href }: { href: string }) { const { et } = useEatTranslation(); return <div className="space-y-3 rounded-[16px] border border-border/70 p-4"><ChefHat className="h-6 w-6 text-primary" /><p className="font-semibold">{et("customFoodMeal")}</p><p className="text-sm text-muted-foreground">{et("customPreserved")}</p><Button asChild className="min-h-12"><Link href={href}>{et("customFoodMeal")}</Link></Button></div>; }
function PhotoMethod({ onOpen }: { onOpen: () => void }) { const { et } = useEatTranslation(); return <div className="space-y-3 rounded-[16px] border border-border/70 p-4"><Camera className="h-6 w-6 text-primary" /><p className="font-semibold">{et("photoEstimate")}</p><p className="text-sm text-muted-foreground">{et("photoPrivacy")}</p><Button type="button" className="min-h-12" onClick={onOpen}>{et("askChatGpt")}</Button></div>; }

function CopyDayMethod({ targetDate, targetLogs, energyUnit, onCopied }: { targetDate: string; targetLogs: FoodLog[]; energyUnit: UserAppSettings["energyUnit"]; onCopied: (logs: FoodLog[]) => void }) {
  const { user } = useAuth();
  const { et, mealLabel, locale } = useEatTranslation();
  const [sourceDate, setSourceDate] = useState("");
  const [source, setSource] = useState<SourceState<FoodLog[]> | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);
  const duplicates = useMemo(() => source?.status === "loaded" ? findCopyDuplicates(source.data.filter((log) => selected.includes(log.id)), targetLogs) : [], [selected, source, targetLogs]);
  async function load() { if (!user?.id || !sourceDate) return; setSource({ status: "loading" }); setFeedback(null); try { const logs = await getEatFoodLogs(user.id, sourceDate); setSource({ status: "loaded", data: logs }); setSelected(logs.map((log) => log.id)); } catch { setSource({ status: "failed", error: et("sourceFailed") }); } }
  async function copy() { if (!user?.id || pending || !sourceDate || !selected.length) return; setPending(true); try { const logs = await copyEatFoodLogs({ userId: user.id, sourceDate, targetDate, selectedIds: selected }); onCopied(logs); setFeedback({ type: "info", message: et("copiedCount", { count: logs.length }) }); } catch { setFeedback({ type: "error", message: et("saveFailed") }); } finally { setPending(false); } }
  return <div className="space-y-4"><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Input type="date" value={sourceDate} onChange={(event) => setSourceDate(event.target.value)} aria-label={et("sourceDate")} /><Button type="button" className="min-h-12" onClick={() => void load()} disabled={!sourceDate || source?.status === "loading"}>{source?.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{et("loadSource")}</Button></div>{source?.status === "failed" ? <p className="text-sm text-destructive">{source.error}</p> : null}{source?.status === "loaded" && !source.data.length ? <p className="text-sm text-muted-foreground">{et("sourceEmpty")}</p> : null}{source?.status === "loaded" && source.data.length ? <div className="space-y-2">{source.data.map((log) => <label key={log.id} className="flex min-h-14 items-center gap-3 rounded-[14px] border border-border/70 p-3"><input type="checkbox" checked={selected.includes(log.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, log.id] : current.filter((id) => id !== log.id))} /><span className="min-w-0"><span className="block truncate font-semibold">{log.food_name}</span><span className="block text-xs text-muted-foreground">{mealLabel(log.meal_type)} · {formatEatEnergy(log.calories, energyUnit, locale)}</span></span></label>)}</div> : null}{duplicates.length ? <p className="rounded-[14px] border border-warning/30 bg-warning/5 p-3 text-sm text-warning">{et("duplicatesFound")}</p> : null}<Button type="button" className="min-h-12 w-full" onClick={() => void copy()} disabled={pending || !selected.length}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{et("copySelected")}</Button><InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} /></div>;
}
