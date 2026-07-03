"use client";

import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Edit3, PlusCircle, RefreshCw, Save, ShoppingCart, Trash2, Utensils, X } from "lucide-react";
import { Component, useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { cn } from "@/lib/utils";
import {
  createDirectMealPlanItem,
  deleteDirectMealPlanItem,
  getMealPlanDatesWithItems,
  getMealPlanItemsForDate,
  getMealPlanItemsForRange,
  markDirectMealPlanItemDone,
  normalizeMealPlanType,
  updateDirectMealPlanItem
} from "@/services/database/meal-plan";
import {
  CompactCalendar,
  addDays,
  calendarRangeEnd,
  calendarRangeStart,
  displayDate,
  longDate,
  monthStart,
  safeDate,
  weekStart
} from "@/components/meals/meal-plan-calendar";
import type { MealPlanItem, MealType, OnboardingAnswers } from "@/types";
import { NutritionPreferenceCard } from "@/components/profile/execution-profiles";
import { GroceryListPanel } from "@/components/meals/grocery-list-panel";
import { MealAiActions } from "@/components/meals/meal-ai-actions";
import { validateMealItem, validateMealPlanDay } from "@/services/meals/meal-validation";
import { getGroceryItems, upsertGroceryItem } from "@/services/database/execution-layer";
import { getCalorieTargets } from "@/services/database/nutrition";
import { userSafeError } from "@/lib/error-formatting";
import { getOnboarding } from "@/services/database/profile";
import { AiActionRequestDialog } from "@/components/ai/ai-action-request-dialog";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";

type MacroTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type Notice = { type: "success" | "error" | "info"; title: string; description?: string };
type Draft = { foodName: string; mealType: MealType; quantity: string; servingInfo: string; calories: string; protein: string; carbs: string; fat: string; notes: string };

const mealTypes: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const emptyDraft: Draft = { foodName: "", mealType: "Breakfast", quantity: "1", servingInfo: "1 serving", calories: "", protein: "", carbs: "", fat: "", notes: "" };

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

class MealPlanBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { message: null };
  }

  static getDerivedStateFromError() {
    return { message: "Please refresh and try again." };
  }

  render() {
    if (this.state.message) {
      return (
        <Card className="border-warning/30 bg-warning/10">
          <CardContent className="space-y-3 pt-5 text-sm text-foreground">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> My Meal Plan could not load</div>
            <p>The page stayed open, but one meal-plan widget could not load. Please try again.</p>
            <p className="text-xs text-muted-foreground">{this.state.message}</p>
            <Button variant="outline" size="sm" onClick={() => this.setState({ message: null })}>Try again</Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

export function MyMealPlanBuilder() {
  return <MealPlanBoundary><MyMealPlanBuilderInner /></MealPlanBoundary>;
}

function MyMealPlanBuilderInner() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = useTodayDate();
  const isMobile = useIsMobile();
  const [selectedDate, setSelectedDate] = useState(() => safeDate(searchParams.get("date")) ?? today);
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(selectedDate));
  const [plannedDates, setPlannedDates] = useState<string[]>([]);
  const [items, setItems] = useState<MealPlanItem[]>([]);
  const [weekItems, setWeekItems] = useState<MealPlanItem[]>([]);
  const [targetCalories, setTargetCalories] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [shoppingStats, setShoppingStats] = useState({ count: 0, checked: 0 });
  const [groceryRefreshKey, setGroceryRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState("day");
  const [activeMealType, setActiveMealType] = useState<MealType>("Breakfast");
  const [addMealDialogOpen, setAddMealDialogOpen] = useState(false);
  const [addSourceDialogOpen, setAddSourceDialogOpen] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingAnswers | null>(null);
  const { dialog } = useConfirm();
  const { celebrate } = useSuccessFeedback();

  const selectedWeekStart = useMemo(() => weekStart(selectedDate), [selectedDate]);
  const selectedWeekEnd = useMemo(() => addDays(selectedWeekStart, 6), [selectedWeekStart]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index)), [selectedWeekStart]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("date", selectedDate);
    const nextUrl = `${pathname}?${params.toString()}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextUrl) window.history.replaceState(null, "", nextUrl);
  }, [pathname, selectedDate]);

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
        const [dayItems, weekPlanItems, dates, calorieTargets, onboardingAnswers] = await Promise.all([
          getMealPlanItemsForDate(user.id, selectedDate),
          getMealPlanItemsForRange(user.id, selectedWeekStart, selectedWeekEnd),
          getMealPlanDatesWithItems(user.id, calendarRangeStart(calendarMonth), calendarRangeEnd(calendarMonth)),
          getCalorieTargets(user.id),
          getOnboarding(user.id)
        ]);
        if (!active) return;
        setItems(dayItems.map(normalizeMealPlanItem));
        setWeekItems(weekPlanItems.map(normalizeMealPlanItem));
        setPlannedDates(dates);
        setTargetCalories(calorieTargets?.daily_calories ?? null);
        setOnboarding(onboardingAnswers);
      } catch (error) {
        if (!active) return;
        setItems([]);
        setWeekItems([]);
        setNotice({ type: "error", title: "Saved meal plan could not load", description: userSafeError(error, "Please refresh and try again.") });
      } finally {
        if (active) setIsLoading(false);
      }
    }
    loadPlan();
    return () => {
      active = false;
    };
  }, [user?.id, selectedDate, selectedWeekStart, selectedWeekEnd, calendarMonth, reloadNonce]);

  const plannedTotals = useMemo(() => items.filter((item) => item.status === "planned").reduce(addItemToTotals, emptyTotals()), [items]);
  const doneTotals = useMemo(() => items.filter((item) => item.status === "done").reduce(addItemToTotals, emptyTotals()), [items]);
  const dayValidation = useMemo(() => validateMealPlanDay(items, targetCalories), [items, targetCalories]);

  const dayStats = useMemo(() => {
    const totalPlanned = items.filter((i) => i.status === "planned").length;
    const totalDone = items.filter((i) => i.status === "done").length;
    return { totalPlanned, totalDone };
  }, [items]);

  const shoppingShortcutCount = shoppingStats.count;
  const shoppingCheckedCount = shoppingStats.checked;
  const updateShoppingStats = useCallback((count: number, checked: number) => {
    setShoppingStats((current) => current.count === count && current.checked === checked ? current : { count, checked });
  }, []);

  function changeDate(nextDate: string) {
    setSelectedDate(nextDate);
    setCalendarMonth(monthStart(nextDate));
  }

  function upsertLocalItems(newItems: MealPlanItem[]) {
    setItems((current) => mergeItems(current, newItems.filter((item) => item.plan_date === selectedDate)));
    setWeekItems((current) => mergeItems(current, newItems.filter((item) => item.plan_date >= selectedWeekStart && item.plan_date <= selectedWeekEnd)));
    setPlannedDates((current) => Array.from(new Set([...current, ...newItems.map((item) => item.plan_date)])));
  }

  async function addPlannedFood() {
    if (!user?.id) return setNotice({ type: "error", title: "Login required", description: "Please log in again before saving your meal plan." });
    try {
      setIsUpdatingId("new");
      const item = await createItemFromDraft(selectedDate, draft);
      upsertLocalItems([item]);
      setDraft(emptyDraft);
      setAddMealDialogOpen(false);
      setNotice({ type: "success", title: "Planned food added", description: `${item.food_name} was added to ${displayDate(selectedDate)}.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not add planned food", description: userSafeError(error) });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function createItemFromDraft(date: string, input: Draft) {
    if (!user?.id) throw new Error("Login required.");
    return normalizeMealPlanItem(await createDirectMealPlanItem({ userId: user.id, date, mealType: input.mealType, foodName: input.foodName, quantity: Number(input.quantity), servingInfo: input.servingInfo, calories: Number(input.calories), protein: Number(input.protein), carbs: Number(input.carbs), fat: Number(input.fat), notes: input.notes }));
  }

  async function markDone(item: MealPlanItem) {
    if (item.status === "done") return;
    try {
      setIsUpdatingId(item.id);
      const result = await markDirectMealPlanItemDone(item);
      const normalized = normalizeMealPlanItem(result.item);
      upsertLocalItems([normalized]);
      setNotice({ type: "success", title: result.already_done ? "Meal already done" : "Meal marked done", description: result.already_done ? "No duplicate calorie log was created." : `${item.food_name} was added to logged calories.` });
      if (!result.already_done) celebrate("Meal logged");
    } catch (error) {
      setNotice({ type: "error", title: "Could not mark meal done", description: userSafeError(error) });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function removeItem(item: MealPlanItem) {
    try {
      setIsUpdatingId(item.id);
      await deleteDirectMealPlanItem(item);
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setWeekItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setNotice({ title: "Meal removed", type: "success", description: item.status === "done" ? "Linked food log was kept to avoid hiding eaten calories." : "Planned meal was removed." });
    } catch (error) {
      setNotice({ title: "Could not remove meal", type: "error", description: userSafeError(error) });
    } finally {
      setIsUpdatingId(null);
    }
  }

  function startEditing(item: MealPlanItem) {
    setEditingId(item.id);
    setEditDraft(draftFromItem(item));
  }

  async function saveEdit(item: MealPlanItem) {
    if (!user?.id) return;
    try {
      setIsUpdatingId(item.id);
      const updated = normalizeMealPlanItem(await updateDirectMealPlanItem(user.id, item.id, { date: item.plan_date, mealType: editDraft.mealType, foodName: editDraft.foodName, quantity: Number(editDraft.quantity), servingInfo: editDraft.servingInfo, calories: Number(editDraft.calories), protein: Number(editDraft.protein), carbs: Number(editDraft.carbs), fat: Number(editDraft.fat), notes: editDraft.notes.trim() || null }));
      upsertLocalItems([updated]);
      setEditingId(null);
      setNotice({ title: "Meal updated", type: "success", description: `${updated.food_name} is now in ${displayMealType(updated.meal_type)}.` });
    } catch (error) {
      setNotice({ title: "Could not update meal", type: "error", description: userSafeError(error) });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function addMealToGrocery(item: MealPlanItem) {
    if (!user?.id) return;
    try {
      const existing = await getGroceryItems(user.id, selectedWeekStart);
      if (existing.some((groceryItem) => groceryItem.source_meal_plan_item_id === item.id)) {
        setNotice({ type: "info", title: "Already in grocery list", description: `${item.food_name} is already linked to this week’s list.` });
        return;
      }
      await upsertGroceryItem(user.id, {
        week_start: selectedWeekStart,
        source_meal_plan_item_id: item.id,
        item_name: item.food_name,
        quantity: item.quantity,
        unit: item.serving_size,
        store_section: "Other",
        notes: `From ${item.meal_type} on ${item.plan_date}`,
        created_by: "meal_plan"
      });
      setGroceryRefreshKey((current) => current + 1);
      setNotice({ type: "success", title: "Added to grocery list", description: `${item.food_name} is in the ${selectedWeekStart} list.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not add grocery item", description: userSafeError(error) });
    }
  }

  function openAddMeal(type: MealType) {
    setDraft((current) => ({ ...current, mealType: type }));
    setAddSourceDialogOpen(true);
  }

  function openQuickAdd() {
    setAddSourceDialogOpen(false);
    setAddMealDialogOpen(true);
  }

  const mealPlanRequestContext = {
    planning_profile: {
      goal: onboarding?.goals?.length ? onboarding.goals.join(", ") : onboarding?.goal ?? profile?.body_goal ?? "General wellness",
      goal_weight_kg: onboarding?.goal_weight_kg ?? profile?.target_weight_kg ?? null,
      training_days_per_week: onboarding?.training_days_per_week ?? null,
      session_duration: onboarding ? `${onboarding.min_workout_duration_minutes ?? onboarding.workout_duration_minutes}-${onboarding.max_workout_duration_minutes ?? onboarding.workout_duration_minutes}` : null,
      plan_duration_weeks: onboarding?.desired_duration_weeks ?? null,
      nutrition_preferences: onboarding?.nutrition_preferences ?? [],
      food_preferences: onboarding?.food_preferences ?? null,
      allergies_limitations: onboarding?.allergies_limitations ?? null,
      lifestyle_notes: onboarding?.lifestyle_notes ?? null,
      workout_constraints: onboarding?.workout_constraints ?? null,
      coaching_notes: onboarding?.coaching_notes ?? null
    },
    requested_start_date: selectedDate
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <NutritionPreferenceCard compact />
      <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
        <SummaryCard label="Planned" value={plannedTotals.calories} detail={`${Math.round(plannedTotals.protein_g)}g protein`} />
        <SummaryCard label="Done" value={doneTotals.calories} detail={`${Math.round(doneTotals.protein_g)}g protein`} />
        <SummaryCard label="Planned carbs" value={plannedTotals.carbs_g} suffix="g" detail={`${Math.round(plannedTotals.fat_g)}g fat`} />
        <SummaryCard label="Done carbs" value={doneTotals.carbs_g} suffix="g" detail={`${Math.round(plannedTotals.fat_g)}g fat`} />
      </div>

      {dayValidation ? <div className={`rounded-[14px] border p-3 text-sm ${dayValidation.tone === "destructive" ? "border-destructive/30 bg-destructive/10" : "border-warning/30 bg-warning/10"}`}><p className="font-semibold">{dayValidation.label}</p><p className="text-muted-foreground">{dayValidation.detail}</p></div> : null}

      {notice ? <NoticeBox notice={notice} onClose={() => setNotice(null)} onRetry={notice.title === "Saved meal plan could not load" ? () => setReloadNonce((current) => current + 1) : undefined} /> : null}
      {dialog}

      <Dialog open={addMealDialogOpen} onOpenChange={setAddMealDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add planned meal</DialogTitle>
            <DialogDescription>Plan a meal for {displayDate(selectedDate)}. It will not count in calories until marked done.</DialogDescription>
          </DialogHeader>
          <MealForm title="" draft={draft} setDraft={setDraft} onSave={addPlannedFood} onCancel={() => setAddMealDialogOpen(false)} saving={isUpdatingId === "new"} />
        </DialogContent>
      </Dialog>

      <Dialog open={addSourceDialogOpen} onOpenChange={setAddSourceDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a meal</DialogTitle>
            <DialogDescription>Choose how you want to add food to this plan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button type="button" onClick={openQuickAdd}>Quick add</Button>
            <Button asChild variant="outline" onClick={() => setAddSourceDialogOpen(false)}><Link href="/calories/food-hub">Add from Food Hub</Link></Button>
            <AiActionRequestDialog
              actions={[{ type: "build_meal_plan", label: "Import from ChatGPT", description: "Discuss, approve, and import a personalized meal plan." }]}
              sourceType="meal_plan_empty"
              context={mealPlanRequestContext}
              permissionSection="meal_plans"
              title="Import a meal plan with ChatGPT"
              className="grid"
            />
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 sm:space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="shopping">Shopping</TabsTrigger>
        </TabsList>

        <TabsContent value="day" className="space-y-3 sm:space-y-4">
          <div className="glass-card p-3 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold sm:text-lg">{longDate(selectedDate)}</h2>
                <p className="text-xs text-muted-foreground sm:text-sm">{dayStats.totalDone}/{dayStats.totalPlanned + dayStats.totalDone} meals marked done</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button variant="outline" size="sm" type="button" onClick={() => changeDate(addDays(selectedDate, -1))}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" type="button" onClick={() => changeDate(today)}>Today</Button>
                <Button variant="outline" size="sm" type="button" onClick={() => changeDate(addDays(selectedDate, 1))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 mobile-card-scroll">
              {weekDays.map((day) => {
                const dayCount = weekItems.filter((item) => item.plan_date === day).length;
                const isSelected = day === selectedDate;
                const isToday = day === today;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => changeDate(day)}
                    className={cn(
                      "min-w-[72px] rounded-[14px] border px-2 py-1.5 text-left text-xs transition-colors sm:min-w-[92px] sm:px-3 sm:py-2 sm:text-sm",
                      isSelected ? "border-primary bg-primary text-primary-foreground" : isToday ? "border-primary/40 bg-primary/5" : "border-white/50 bg-white/35 hover:border-primary/40 dark:border-white/10 dark:bg-white/5"
                    )}
                  >
                    <span className="block font-semibold">{displayDate(day)}</span>
                    <span className={isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}>{dayCount} meals</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold sm:text-lg">{displayDate(selectedDate)} meals</h2>
              <p className="text-xs text-muted-foreground sm:text-sm">{dayStats.totalPlanned} planned · {dayStats.totalDone} done</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setActiveTab("shopping")}>
                <ShoppingCart className="h-4 w-4" />
                <span className="hidden sm:inline">Shopping</span>
                <span className="sm:hidden">{shoppingCheckedCount}/{shoppingShortcutCount}</span>
              </Button>
              <Button size="sm" onClick={() => openAddMeal(activeMealType)}>
                <PlusCircle className="h-4 w-4" />
                Add food
              </Button>
            </div>
          </div>

          {isLoading ? <p className="text-sm text-muted-foreground">Loading meal plan for {displayDate(selectedDate)}...</p> : null}

          {isMobile ? (
            <div className="space-y-3">
              <div className="flex gap-1 overflow-x-auto pb-1 mobile-card-scroll">
                {mealTypes.map((type) => {
                  const count = items.filter((i) => i.meal_type === type).length;
                  const isActive = activeMealType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setActiveMealType(type)}
                      className={cn(
                        "flex min-w-[80px] shrink-0 items-center justify-center gap-1.5 rounded-[14px] border px-2 py-2 text-xs font-semibold transition-colors",
                        isActive ? "border-primary bg-primary text-primary-foreground" : "border-white/50 bg-white/35 hover:border-primary/40 dark:border-white/10 dark:bg-white/5"
                      )}
                    >
                      <Utensils className="h-3.5 w-3.5" />
                      {displayMealType(type)}
                      <Badge variant="outline" className="ml-0.5 text-[10px]">{count}</Badge>
                    </button>
                  );
                })}
              </div>
              <MealColumn
                type={activeMealType}
                items={items.filter((item) => item.meal_type === activeMealType)}
                onAdd={() => openAddMeal(activeMealType)}
                onDone={markDone}
                onDelete={removeItem}
                onAddToGrocery={addMealToGrocery}
                onStartEdit={startEditing}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditingId(null)}
                editingId={editingId}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                updatingId={isUpdatingId}
              />
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-4">
              {mealTypes.map((type) => (
                <MealColumn
                  key={type}
                  type={type}
                  items={items.filter((item) => item.meal_type === type)}
                  onAdd={() => openAddMeal(type)}
                  onDone={markDone}
                  onDelete={removeItem}
                  onAddToGrocery={addMealToGrocery}
                  onStartEdit={startEditing}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => setEditingId(null)}
                  editingId={editingId}
                  editDraft={editDraft}
                  setEditDraft={setEditDraft}
                  updatingId={isUpdatingId}
                />
              ))}
            </div>
          )}

          {!isLoading && items.length === 0 ? (
            <Card id="meal-plan-import" className="mt-5 border-dashed border-primary/30 bg-primary/5">
              <CardContent className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-semibold text-foreground">Import with ChatGPT</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Prepare a professional request using your goals, schedule, food preferences, allergies, and coaching context. You review and approve the final plan before import.</p>
                </div>
                <AiActionRequestDialog
                  actions={[{ type: "build_meal_plan", label: "Import with ChatGPT", description: "Discuss, approve, and import a personalized meal plan." }]}
                  sourceType="meal_plan_empty"
                  context={mealPlanRequestContext}
                  permissionSection="meal_plans"
                  title="Import a meal plan with ChatGPT"
                />
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="week" className="space-y-3 sm:space-y-4">
          <Card variant="glass">
            <CardHeader className="p-4 sm:p-5">
              <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-5 w-5" /> Meal calendar</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <CompactCalendar month={calendarMonth} selectedDate={selectedDate} plannedDates={plannedDates} onMonthChange={setCalendarMonth} onSelectDate={changeDate} />
            </CardContent>
          </Card>
          <WeeklyPlanner weekDays={weekDays} selectedDate={selectedDate} weekItems={weekItems} onSelectDate={changeDate} />
        </TabsContent>

        <TabsContent value="shopping" className="space-y-3 sm:space-y-4">
          <GroceryListPanel
            weekStart={selectedWeekStart}
            weekEnd={selectedWeekEnd}
            mealItems={weekItems}
            refreshKey={groceryRefreshKey}
            onStats={updateShoppingStats}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WeeklyPlanner({ weekDays, selectedDate, weekItems, onSelectDate }: { weekDays: string[]; selectedDate: string; weekItems: MealPlanItem[]; onSelectDate: (date: string) => void }) {
  return (
    <Card>
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Weekly plan</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 p-4 pt-0 sm:gap-3 sm:p-5 sm:pt-0 sm:grid-cols-2 lg:grid-cols-7">
        {weekDays.map((day) => {
          const dayItems = weekItems.filter((item) => item.plan_date === day);
          const planned = dayItems.filter((item) => item.status === "planned").reduce(addItemToTotals, emptyTotals());
          const done = dayItems.filter((item) => item.status === "done").reduce(addItemToTotals, emptyTotals());
          return (
            <button key={day} type="button" onClick={() => onSelectDate(day)} className={cn("rounded-[14px] border p-2.5 text-left transition-colors hover:border-primary/45 sm:p-3", day === selectedDate ? "border-primary bg-primary/10" : "border-white/50 bg-white/35 dark:border-white/10 dark:bg-white/5")}>
              <p className="text-sm font-semibold">{displayDate(day)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{dayItems.length} meals · {Math.round(done.calories)}/{Math.round(planned.calories + done.calories)} kcal</p>
              <p className="text-[11px] text-muted-foreground">P {Math.round(planned.protein_g + done.protein_g)}g · C {Math.round(planned.carbs_g + done.carbs_g)}g · F {Math.round(planned.fat_g + done.fat_g)}g</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {mealTypes.map((type) => {
                  const count = dayItems.filter((item) => item.meal_type === type).length;
                  if (!count) return null;
                  return (
                    <span key={type} className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {displayMealType(type)}: {count}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MealForm({ title, draft, setDraft, onSave, onCancel, saving }: { title: string; draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="space-y-3">
      {title ? <h3 className="text-base font-semibold">{title}</h3> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Input value={draft.foodName} onChange={(e) => setDraft((d) => ({ ...d, foodName: e.target.value }))} placeholder="Food name" />
        <select value={draft.mealType} onChange={(e) => setDraft((d) => ({ ...d, mealType: normalizeMealPlanType(e.target.value) }))} className="h-10 rounded-[14px] border bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">{mealTypes.map((type) => <option key={type} value={type}>{displayMealType(type)}</option>)}</select>
        <Input type="number" min="0.1" step="0.1" inputMode="decimal" enterKeyHint="done" value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))} placeholder="Quantity" />
        <Input value={draft.servingInfo} onChange={(e) => setDraft((d) => ({ ...d, servingInfo: e.target.value }))} placeholder="Serving info" />
        <Input type="number" min="0" inputMode="decimal" enterKeyHint="done" value={draft.calories} onChange={(e) => setDraft((d) => ({ ...d, calories: e.target.value }))} placeholder="Calories" />
        <Input type="number" min="0" inputMode="decimal" enterKeyHint="done" value={draft.protein} onChange={(e) => setDraft((d) => ({ ...d, protein: e.target.value }))} placeholder="Protein g" />
        <Input type="number" min="0" inputMode="decimal" enterKeyHint="done" value={draft.carbs} onChange={(e) => setDraft((d) => ({ ...d, carbs: e.target.value }))} placeholder="Carbs g" />
        <Input type="number" min="0" inputMode="decimal" enterKeyHint="done" value={draft.fat} onChange={(e) => setDraft((d) => ({ ...d, fat: e.target.value }))} placeholder="Fat g" />
        <Input className="xl:col-span-2" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Notes" />
        <div className="flex gap-2 xl:col-span-2">
          <Button type="button" onClick={onSave} disabled={saving} className="flex-1 sm:flex-none"><Save className="h-4 w-4" /> Save</Button>
          <Button type="button" variant="outline" onClick={onCancel}><X className="h-4 w-4" /> Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail, suffix = " kcal" }: { label: string; value: number; detail: string; suffix?: string }) {
  return (
    <Card variant="glass">
      <CardContent className="p-3 pt-3 sm:p-5 sm:pt-5">
        <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
        <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">{Math.round(toNumber(value))}{suffix}</p>
        <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1 sm:text-sm">{detail}</p>
      </CardContent>
    </Card>
  );
}

function MealColumn(props: { type: MealType; items: MealPlanItem[]; onAdd: () => void; onDone: (item: MealPlanItem) => void; onDelete: (item: MealPlanItem) => void; onAddToGrocery: (item: MealPlanItem) => void; onStartEdit: (item: MealPlanItem) => void; onSaveEdit: (item: MealPlanItem) => void; onCancelEdit: () => void; editingId: string | null; editDraft: Draft; setEditDraft: Dispatch<SetStateAction<Draft>>; updatingId: string | null }) {
  const { type, items, onAdd, onDone, onDelete, onAddToGrocery, onStartEdit, onSaveEdit, onCancelEdit, editingId, editDraft, setEditDraft, updatingId } = props;
  const totals = items.reduce((sum, item) => addItemToTotals(sum, item), emptyTotals());
  const plannedCount = items.filter((i) => i.status === "planned").length;
  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <Card variant="glass" className="h-full">
      <CardHeader className="p-3 sm:p-5">
        <CardTitle className="flex items-center justify-between gap-2 text-sm sm:text-base">
          <span className="flex items-center gap-2"><Utensils className="h-4 w-4" /> {displayMealType(type)}</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{plannedCount + doneCount}</Badge>
            <Button type="button" size="icon" variant="ghost" className="h-11 w-11" onClick={onAdd} aria-label={`Add ${displayMealType(type)} item`}>
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{Math.round(totals.calories)} kcal · {Math.round(totals.protein_g)}g protein</p>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 sm:space-y-3 sm:p-5 sm:pt-0">
        {!items.length ? <p className="text-sm text-muted-foreground">No food planned yet. Tap + to add.</p> : null}
        {items.map((item) => {
          const isEditing = editingId === item.id;
          const validation = validateMealItem(item);
          return (
            <div key={item.id} className="solid-row p-2.5 sm:p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5">{item.food_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.quantity}x {item.serving_size}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                    {Math.round(toNumber(item.calories))} kcal · {Math.round(toNumber(item.protein_g))}g protein · {Math.round(toNumber(item.carbs_g))}g carbs · {Math.round(toNumber(item.fat_g))}g fat
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={item.status === "done" ? "success" : "outline"} className="text-[10px]">{item.status}</Badge>
                  <Badge variant={validation.tone === "success" ? "success" : validation.tone === "destructive" ? "destructive" : "warning"} className="text-[10px]" title={validation.detail}>{validation.label}</Badge>
                </div>
              </div>
              {isEditing ? (
                <div className="mt-2 sm:mt-3">
                  <MealForm title="Edit planned food" draft={editDraft} setDraft={setEditDraft} onSave={() => onSaveEdit(item)} onCancel={onCancelEdit} saving={updatingId === item.id} />
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
                  <Button type="button" size="sm" onClick={() => onDone(item)} disabled={item.status === "done" || updatingId === item.id}>
                    <CheckCircle2 className="h-4 w-4" />
                    Done
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onStartEdit(item)} disabled={updatingId === item.id}><Edit3 className="h-4 w-4" /> Edit</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onAddToGrocery(item)} disabled={updatingId === item.id}><ShoppingCart className="h-4 w-4" /> <span className="hidden sm:inline">Grocery</span><span className="sm:hidden">Add</span></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-10 min-h-10 w-10 text-destructive hover:text-destructive" onClick={() => onDelete(item)} disabled={updatingId === item.id} aria-label={`Delete ${item.food_name}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
              {!isEditing ? <MealAiActions item={item} /> : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function NoticeBox({ notice, onClose, onRetry }: { notice: Notice; onClose: () => void; onRetry?: () => void }) {
  const styles = notice.type === "success" ? "border-success/30 bg-success/10 text-foreground" : notice.type === "error" ? "border-destructive/30 bg-destructive/10 text-foreground" : "border-primary/40 bg-primary/5 text-foreground";
  return <div className={`rounded-md border p-3 text-sm sm:p-4 ${styles}`} role={notice.type === "error" ? "alert" : "status"}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{notice.title}</p>{notice.description ? <p className="mt-1 break-words opacity-90">{notice.description}</p> : null}{onRetry ? <Button className="mt-3" size="sm" onClick={onRetry}><RefreshCw className="h-4 w-4" /> Try again</Button> : null}</div><button type="button" onClick={onClose} className="min-h-11 px-2 text-xs font-semibold underline">close</button></div></div>;
}

function emptyTotals(): MacroTotals { return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }; }
function addItemToTotals(total: MacroTotals, item: Pick<MealPlanItem, "calories" | "protein_g" | "carbs_g" | "fat_g">): MacroTotals { return { calories: total.calories + toNumber(item.calories), protein_g: total.protein_g + toNumber(item.protein_g), carbs_g: total.carbs_g + toNumber(item.carbs_g), fat_g: total.fat_g + toNumber(item.fat_g) }; }
function displayMealType(type: MealType) { return type === "Snack" ? "Snacks" : type; }
function normalizeMealPlanItem(item: MealPlanItem): MealPlanItem { const now = new Date().toISOString(); return { ...item, id: String(item.id || crypto.randomUUID()), food_name: String(item.food_name || "Unnamed food"), serving_size: String(item.serving_size || "1 serving"), quantity: toNumber(item.quantity) || 1, calories: toNumber(item.calories), protein_g: toNumber(item.protein_g), carbs_g: toNumber(item.carbs_g), fat_g: toNumber(item.fat_g), meal_type: normalizeMealPlanType(item.meal_type), status: item.status === "done" ? "done" : "planned", created_at: item.created_at || now, updated_at: item.updated_at || now }; }
function draftFromItem(item: MealPlanItem): Draft { return { foodName: item.food_name, mealType: normalizeMealPlanType(item.meal_type), quantity: String(item.quantity || 1), servingInfo: item.serving_size || "1 serving", calories: String(toNumber(item.calories)), protein: String(toNumber(item.protein_g)), carbs: String(toNumber(item.carbs_g)), fat: String(toNumber(item.fat_g)), notes: item.notes ?? "" }; }
function mergeItems(current: MealPlanItem[], nextItems: MealPlanItem[]) { const map = new Map(current.map((item) => [item.id, item])); nextItems.forEach((item) => map.set(item.id, item)); return Array.from(map.values()).sort((a, b) => a.plan_date.localeCompare(b.plan_date) || a.created_at.localeCompare(b.created_at)); }
function toNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
