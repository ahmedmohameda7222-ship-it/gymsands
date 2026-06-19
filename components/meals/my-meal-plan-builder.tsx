"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, Edit3, MoreHorizontal, PackagePlus, PlusCircle, Printer, RefreshCw, Repeat, Save, ShoppingCart, Trash2, Utensils, X } from "lucide-react";
import { Component, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
import { getTodayFoodLogs } from "@/services/database/nutrition";
import {
  batchMealToTemplateItem,
  buildShoppingList,
  getBatchMeals,
  getCheckedShoppingKeys,
  getMealTemplates,
  macroDiff,
  saveBatchMeal,
  saveMealTemplate,
  setShoppingItemChecked,
  templateItemFromMealPlanItem,
  type BatchMeal,
  type MealTemplate,
  type MealTemplateItem,
  type ShoppingListItem
} from "@/services/meals/meal-plan-automation";
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
import type { FoodLog, MealPlanItem, MealType } from "@/types";

type MacroTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type Notice = { type: "success" | "error" | "info"; title: string; description?: string };
type Draft = { foodName: string; mealType: MealType; quantity: string; servingInfo: string; calories: string; protein: string; carbs: string; fat: string; notes: string };
type BatchDraft = { name: string; portions: string; servingSize: string; calories: string; protein: string; carbs: string; fat: string; notes: string; mealType: MealType };
type SwapState = { item: MealPlanItem; templateId: string } | null;
type BulkDoneConfirm = { label: string; items: MealPlanItem[] } | null;

const mealTypes: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const emptyDraft: Draft = { foodName: "", mealType: "Breakfast", quantity: "1", servingInfo: "1 serving", calories: "0", protein: "0", carbs: "0", fat: "0", notes: "" };
const emptyBatchDraft: BatchDraft = { name: "", portions: "4", servingSize: "1 portion", calories: "0", protein: "0", carbs: "0", fat: "0", notes: "", mealType: "Lunch" };

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

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : "My Meal Plan could not load." };
  }

  render() {
    if (this.state.message) {
      return (
        <Card className="border-warning/30 bg-warning/10">
          <CardContent className="space-y-3 pt-5 text-sm text-foreground">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> My Meal Plan could not load</div>
            <p>The page stayed open, but one meal-plan widget could not load. Please try again.</p>
            <p className="break-words text-xs text-muted-foreground">{this.state.message}</p>
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
  const { user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = useTodayDate();
  const isMobile = useIsMobile();
  const [selectedDate, setSelectedDate] = useState(() => safeDate(searchParams.get("date")) ?? today);
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(selectedDate));
  const [plannedDates, setPlannedDates] = useState<string[]>([]);
  const [items, setItems] = useState<MealPlanItem[]>([]);
  const [weekItems, setWeekItems] = useState<MealPlanItem[]>([]);
  const [dayLogs, setDayLogs] = useState<FoodLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [batchMeals, setBatchMeals] = useState<BatchMeal[]>([]);
  const [batchDraft, setBatchDraft] = useState<BatchDraft>(emptyBatchDraft);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [swapState, setSwapState] = useState<SwapState>(null);
  const [bulkDoneConfirm, setBulkDoneConfirm] = useState<BulkDoneConfirm>(null);
  const [checkedShoppingKeys, setCheckedShoppingKeys] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("day");
  const [activeMealType, setActiveMealType] = useState<MealType>("Breakfast");
  const [addMealDialogOpen, setAddMealDialogOpen] = useState(false);
  const shoppingListRef = useRef<HTMLDivElement>(null);
  const { dialog, ask } = useConfirm();

  const selectedWeekStart = useMemo(() => weekStart(selectedDate), [selectedDate]);
  const selectedWeekEnd = useMemo(() => addDays(selectedWeekStart, 6), [selectedWeekStart]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index)), [selectedWeekStart]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", selectedDate);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }, [pathname, searchParams, selectedDate]);

  useEffect(() => {
    let active = true;
    Promise.all([
      getMealTemplates(user?.id),
      getBatchMeals(user?.id),
      getCheckedShoppingKeys(user?.id, selectedWeekStart)
    ]).then(([templates, batches, shoppingKeys]) => {
      if (!active) return;
      setTemplates(templates);
      setBatchMeals(batches);
      setCheckedShoppingKeys(shoppingKeys);
    });
    return () => { active = false; };
  }, [selectedWeekStart, user?.id]);

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
        const [dayItems, weekPlanItems, dates, foodLogs] = await Promise.all([
          getMealPlanItemsForDate(user.id, selectedDate),
          getMealPlanItemsForRange(user.id, selectedWeekStart, selectedWeekEnd),
          getMealPlanDatesWithItems(user.id, calendarRangeStart(calendarMonth), calendarRangeEnd(calendarMonth)),
          getTodayFoodLogs(user.id, selectedDate)
        ]);
        if (!active) return;
        setItems(dayItems.map(normalizeMealPlanItem));
        setWeekItems(weekPlanItems.map(normalizeMealPlanItem));
        setPlannedDates(dates);
        setDayLogs(foodLogs);
      } catch (error) {
        if (!active) return;
        setItems([]);
        setWeekItems([]);
        setDayLogs([]);
        setNotice({ type: "error", title: "Saved meal plan could not load", description: error instanceof Error ? error.message : "Please try again." });
      } finally {
        if (active) setIsLoading(false);
      }
    }
    loadPlan();
    return () => {
      active = false;
    };
  }, [user?.id, selectedDate, selectedWeekStart, selectedWeekEnd, calendarMonth]);

  const plannedTotals = useMemo(() => items.filter((item) => item.status === "planned").reduce(addItemToTotals, emptyTotals()), [items]);
  const doneTotals = useMemo(() => items.filter((item) => item.status === "done").reduce(addItemToTotals, emptyTotals()), [items]);
  const shoppingList = useMemo(() => buildShoppingList(weekItems, checkedShoppingKeys), [checkedShoppingKeys, weekItems]);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const selectedBatch = batchMeals.find((batch) => batch.id === selectedBatchId) ?? null;
  const swapTemplate = swapState ? templates.find((template) => template.id === swapState.templateId) ?? null : null;
  const swapTarget = swapTemplate?.items[0] ?? null;
  const swapDiff = swapState && swapTarget ? macroDiff(templateItemFromMealPlanItem(swapState.item), swapTarget) : null;
  const mealInsights = useMemo(
    () => buildMealPlanInsights({
      selectedDate,
      items,
      weekItems,
      dayLogs,
      templates,
      batchMeals,
      shoppingList
    }),
    [batchMeals, dayLogs, items, selectedDate, shoppingList, templates, weekItems]
  );

  const dayStats = useMemo(() => {
    const totalPlanned = items.filter((i) => i.status === "planned").length;
    const totalDone = items.filter((i) => i.status === "done").length;
    return { totalPlanned, totalDone };
  }, [items]);

  const shoppingShortcutCount = shoppingList.length;
  const shoppingCheckedCount = shoppingList.filter((i) => i.checked).length;

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
      setShowAddForm(false);
      setAddMealDialogOpen(false);
      setNotice({ type: "success", title: "Planned food added", description: `${item.food_name} was added to ${displayDate(selectedDate)}.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not add planned food", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function createItemFromDraft(date: string, input: Draft) {
    if (!user?.id) throw new Error("Login required.");
    return normalizeMealPlanItem(await createDirectMealPlanItem({ userId: user.id, date, mealType: input.mealType, foodName: input.foodName, quantity: Number(input.quantity), servingInfo: input.servingInfo, calories: Number(input.calories), protein: Number(input.protein), carbs: Number(input.carbs), fat: Number(input.fat), notes: input.notes }));
  }

  async function createItemFromTemplateItem(date: string, item: MealTemplateItem) {
    if (!user?.id) throw new Error("Login required.");
    return normalizeMealPlanItem(await createDirectMealPlanItem({ userId: user.id, date, mealType: item.meal_type, foodName: item.food_name, quantity: item.quantity ?? undefined, servingInfo: item.serving_size ?? undefined, calories: item.calories, protein: item.protein_g, carbs: item.carbs_g, fat: item.fat_g, notes: item.notes ?? undefined }));
  }

  async function addTemplateToDate(template = selectedTemplate, date = selectedDate) {
    if (!template) return setNotice({ type: "error", title: "Choose a template first" });
    try {
      setIsUpdatingId("template");
      const created: MealPlanItem[] = [];
      for (const templateItem of template.items) created.push(await createItemFromTemplateItem(date, templateItem));
      upsertLocalItems(created);
      setNotice({ type: "success", title: "Template added", description: `${template.name} was added to ${displayDate(date)}.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not add template", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function addBatchPortionToDate() {
    if (!selectedBatch) return setNotice({ type: "error", title: "Choose a batch meal first" });
    await addTemplateToDate({ id: selectedBatch.id, user_id: user?.id || "", name: selectedBatch.name, notes: selectedBatch.notes, created_at: selectedBatch.created_at, items: [batchMealToTemplateItem(selectedBatch, batchDraft.mealType)] }, selectedDate);
  }

  async function markDone(item: MealPlanItem) {
    if (item.status === "done") return;
    try {
      setIsUpdatingId(item.id);
      const result = await markDirectMealPlanItemDone(item);
      const normalized = normalizeMealPlanItem(result.item);
      upsertLocalItems([normalized]);
      setNotice({ type: "success", title: result.already_done ? "Meal already done" : "Meal marked done", description: result.already_done ? "No duplicate calorie log was created." : `${item.food_name} was added to logged calories.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not mark meal done", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function markManyDone(targets: MealPlanItem[], label: string) {
    const plannedTargets = targets.filter((item) => item.status !== "done");
    if (!plannedTargets.length) return setNotice({ type: "info", title: `${label} already done`, description: "No duplicate food logs were created." });
    setBulkDoneConfirm({ label, items: plannedTargets });
  }

  async function confirmBulkDone() {
    if (!bulkDoneConfirm) return;
    try {
      setIsUpdatingId("bulk-done");
      const updated: MealPlanItem[] = [];
      for (const item of bulkDoneConfirm.items) {
        const result = await markDirectMealPlanItemDone(item);
        updated.push(normalizeMealPlanItem(result.item));
      }
      upsertLocalItems(updated);
      setNotice({ type: "success", title: `${bulkDoneConfirm.label} marked done`, description: `${updated.length} real planned item(s) were processed idempotently.` });
      setBulkDoneConfirm(null);
    } catch (error) {
      setNotice({ type: "error", title: `Could not mark ${bulkDoneConfirm.label} done`, description: error instanceof Error ? error.message : "Please try again." });
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
      setNotice({ title: "Could not remove meal", type: "error", description: error instanceof Error ? error.message : "Please try again." });
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
      setNotice({ title: "Could not update meal", type: "error", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function duplicateItem(item: MealPlanItem, date = item.plan_date) {
    try {
      setIsUpdatingId(`duplicate-${item.id}`);
      const created = await createItemFromTemplateItem(date, templateItemFromMealPlanItem(item));
      upsertLocalItems([created]);
      setNotice({ type: "success", title: "Meal duplicated", description: `${item.food_name} copied to ${displayDate(date)}. It will not count until marked done.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not duplicate meal", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function copyItemsToDate(sourceItems: MealPlanItem[], targetDate: string, title: string) {
    if (!sourceItems.length) return setNotice({ type: "info", title: "Nothing to copy", description: "No planned items were found." });
    try {
      setIsUpdatingId("copy");
      const created: MealPlanItem[] = [];
      for (const item of sourceItems) created.push(await createItemFromTemplateItem(targetDate, templateItemFromMealPlanItem(item)));
      upsertLocalItems(created);
      setNotice({ type: "success", title, description: `${created.length} planned item(s) copied to ${displayDate(targetDate)} without logging calories.` });
    } catch (error) {
      setNotice({ type: "error", title: "Copy failed", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function repeatMealDaily(item: MealPlanItem) {
    ask({
      title: `Repeat ${item.food_name} daily?`,
      description: `This will copy ${item.food_name} to the next 7 days without logging calories.`,
      confirmLabel: "Repeat",
      onConfirm: async () => {
        try {
          setIsUpdatingId(`repeat-${item.id}`);
          const created: MealPlanItem[] = [];
          for (let offset = 1; offset <= 7; offset += 1) created.push(await createItemFromTemplateItem(addDays(item.plan_date, offset), templateItemFromMealPlanItem(item)));
          upsertLocalItems(created);
          setNotice({ type: "success", title: "Meal repeated daily", description: `${item.food_name} was copied to the next 7 days without logging it.` });
        } catch (error) {
          setNotice({ type: "error", title: "Could not repeat meal", description: error instanceof Error ? error.message : "Please try again." });
        } finally {
          setIsUpdatingId(null);
        }
      }
    });
  }

  async function repeatMealWeekly(item: MealPlanItem) {
    await duplicateItem(item, addDays(item.plan_date, 7));
  }

  async function copyWholeWeekToNextWeek() {
    if (!weekItems.length) return setNotice({ type: "info", title: "Nothing to copy", description: "This week has no planned meals." });
    ask({
      title: "Copy whole week to next week?",
      description: `Copy all ${weekItems.length} planned item(s) to next week without logging calories.`,
      confirmLabel: "Copy week",
      onConfirm: async () => {
        try {
          setIsUpdatingId("copy-week");
          const created: MealPlanItem[] = [];
          for (const item of weekItems) created.push(await createItemFromTemplateItem(addDays(item.plan_date, 7), templateItemFromMealPlanItem(item)));
          upsertLocalItems(created);
          setNotice({ type: "success", title: "Week copied", description: `${created.length} planned item(s) copied to next week without logging calories.` });
        } catch (error) {
          setNotice({ type: "error", title: "Could not copy week", description: error instanceof Error ? error.message : "Please try again." });
        } finally {
          setIsUpdatingId(null);
        }
      }
    });
  }

  async function saveItemTemplate(item: MealPlanItem) {
    try {
      const template = await saveMealTemplate(user?.id, templateName.trim() || item.food_name, [templateItemFromMealPlanItem(item)], item.notes);
      setTemplates((current) => [template, ...current]);
      setTemplateName("");
      setNotice({ type: "success", title: "Template saved", description: `${template.name} is reusable now.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not save template", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  async function saveMealTypeTemplate(type: MealType) {
    const sourceItems = items.filter((item) => item.meal_type === type);
    try {
      const template = await saveMealTemplate(user?.id, templateName.trim() || `${displayMealType(type)} template`, sourceItems.map(templateItemFromMealPlanItem), `${displayDate(selectedDate)} ${displayMealType(type)}`);
      setTemplates((current) => [template, ...current]);
      setTemplateName("");
      setNotice({ type: "success", title: "Meal template saved", description: `${template.name} includes ${template.items.length} food item(s).` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not save template", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  async function createBatchMeal() {
    try {
      const batch = await saveBatchMeal(user?.id, { name: batchDraft.name, portions: Number(batchDraft.portions), serving_size: batchDraft.servingSize, notes: batchDraft.notes, total_calories: Number(batchDraft.calories), total_protein_g: Number(batchDraft.protein), total_carbs_g: Number(batchDraft.carbs), total_fat_g: Number(batchDraft.fat) });
      setBatchMeals((current) => [batch, ...current]);
      setSelectedBatchId(batch.id);
      setBatchDraft(emptyBatchDraft);
      setNotice({ type: "success", title: "Batch meal saved", description: `${batch.name} is saved with ${batch.portions} portions.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not save batch meal", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  async function confirmSwap() {
    if (!swapState || !swapTarget || !user?.id) return;
    try {
      setIsUpdatingId(`swap-${swapState.item.id}`);
      const updated = normalizeMealPlanItem(await updateDirectMealPlanItem(user.id, swapState.item.id, { date: swapState.item.plan_date, mealType: swapTarget.meal_type, foodName: swapTarget.food_name, quantity: swapTarget.quantity ?? undefined, servingInfo: swapTarget.serving_size ?? undefined, calories: swapTarget.calories, protein: swapTarget.protein_g, carbs: swapTarget.carbs_g, fat: swapTarget.fat_g, notes: swapTarget.notes ?? undefined }));
      upsertLocalItems([updated]);
      setSwapState(null);
      setNotice({ type: "success", title: "Meal swapped", description: `${swapState.item.food_name} was replaced with ${updated.food_name}.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not swap meal", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function toggleShoppingCheck(item: ShoppingListItem) {
    const next = await setShoppingItemChecked(user?.id, selectedWeekStart, item.key, !item.checked);
    setCheckedShoppingKeys(next);
  }

  function printShoppingList() {
    const html = `<!doctype html><html><head><title>FitLife Shopping List</title><style>body{font-family:Arial;padding:24px}li{margin:8px 0}</style></head><body><h1>Shopping list ${selectedWeekStart} to ${selectedWeekEnd}</h1><ul>${shoppingList.map((item) => `<li>${item.checked ? "✓" : "□"} ${item.food_name} — ${item.quantity === null ? "quantity not specified" : `${Math.round(item.quantity * 10) / 10}x`} ${item.serving_size ?? "serving info missing"} (${item.category})</li>`).join("")}</ul></body></html>`;
    const win = window.open("", "_blank");
    if (!win) return setNotice({ type: "error", title: "Could not open print view", description: "Allow popups for this site and try again." });
    win.document.write(html);
    win.document.close();
    win.print();
  }

  function openAddMeal(type: MealType) {
    setDraft((current) => ({ ...current, mealType: type }));
    setAddMealDialogOpen(true);
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
        <SummaryCard label="Planned" value={plannedTotals.calories} detail={`${Math.round(plannedTotals.protein_g)}g protein`} />
        <SummaryCard label="Done" value={doneTotals.calories} detail={`${Math.round(doneTotals.protein_g)}g protein`} />
        <SummaryCard label="Planned carbs" value={plannedTotals.carbs_g} suffix="g" detail={`${Math.round(plannedTotals.fat_g)}g fat`} />
        <SummaryCard label="Done carbs" value={doneTotals.carbs_g} suffix="g" detail={`${Math.round(doneTotals.fat_g)}g fat`} />
      </div>

      <Card className="hidden sm:block">
        <CardContent className="p-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <Button type="button" onClick={() => openAddMeal("Breakfast")}>
              <PlusCircle className="h-4 w-4" />
              Add planned meal
            </Button>
            <Button variant="outline" type="button" onClick={() => setActiveTab("shopping")}>
              Shopping list
            </Button>
          </div>
        </CardContent>
      </Card>

      {notice ? <NoticeBox notice={notice} onClose={() => setNotice(null)} /> : null}
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 sm:space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="shopping">Shopping</TabsTrigger>
        </TabsList>

        <TabsContent value="day" className="space-y-3 sm:space-y-4">
          <div className="rounded-lg border border-border bg-card p-3 sm:p-5 shadow-soft">
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
                      "min-w-[72px] rounded-md border px-2 py-1.5 text-left text-xs transition-colors sm:min-w-[92px] sm:px-3 sm:py-2 sm:text-sm",
                      isSelected ? "border-primary bg-primary text-primary-foreground" : isToday ? "border-primary/40 bg-primary/5" : "bg-card hover:border-primary/40"
                    )}
                  >
                    <span className="block font-semibold">{displayDate(day)}</span>
                    <span className={isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}>{dayCount} meals</span>
                  </button>
                );
              })}
            </div>
          </div>

          {swapState ? <SwapConfirmPanel item={swapState.item} templates={templates} templateId={swapState.templateId} onTemplateChange={(templateId) => setSwapState({ item: swapState.item, templateId })} diff={swapDiff} onConfirm={confirmSwap} onCancel={() => setSwapState(null)} /> : null}
          {bulkDoneConfirm ? (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div>
                  <p className="font-semibold">Mark {bulkDoneConfirm.label} done?</p>
                  <p className="text-sm text-muted-foreground">
                    This will create food logs once for {bulkDoneConfirm.items.length} planned item(s). Duplicate logs are prevented by meal-plan status.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" size="sm" onClick={confirmBulkDone} disabled={isUpdatingId === "bulk-done"}>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirm
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setBulkDoneConfirm(null)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

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
                        "flex min-w-[80px] shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition-colors",
                        isActive ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"
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
                onStartEdit={startEditing}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditingId(null)}
                onDuplicate={(item) => duplicateItem(item)}
                onCopyTomorrow={(item) => duplicateItem(item, addDays(item.plan_date, 1))}
                onRepeatDaily={repeatMealDaily}
                onRepeatWeekly={repeatMealWeekly}
                onSaveTemplate={saveItemTemplate}
                onSaveMealTemplate={() => saveMealTypeTemplate(activeMealType)}
                onStartSwap={(item) => setSwapState({ item, templateId: templates[0]?.id ?? "" })}
                editingId={editingId}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                updatingId={isUpdatingId}
                canSwap={templates.length > 0}
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
                  onStartEdit={startEditing}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => setEditingId(null)}
                  onDuplicate={(item) => duplicateItem(item)}
                  onCopyTomorrow={(item) => duplicateItem(item, addDays(item.plan_date, 1))}
                  onRepeatDaily={repeatMealDaily}
                  onRepeatWeekly={repeatMealWeekly}
                  onSaveTemplate={saveItemTemplate}
                  onSaveMealTemplate={() => saveMealTypeTemplate(type)}
                  onStartSwap={(item) => setSwapState({ item, templateId: templates[0]?.id ?? "" })}
                  editingId={editingId}
                  editDraft={editDraft}
                  setEditDraft={setEditDraft}
                  updatingId={isUpdatingId}
                  canSwap={templates.length > 0}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="week" className="space-y-3 sm:space-y-4">
          <Card>
            <CardHeader className="p-4 sm:p-5">
              <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-5 w-5" /> Meal calendar</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <CompactCalendar month={calendarMonth} selectedDate={selectedDate} plannedDates={plannedDates} onMonthChange={setCalendarMonth} onSelectDate={changeDate} />
            </CardContent>
          </Card>
          <WeeklyPlanner weekDays={weekDays} selectedDate={selectedDate} weekItems={weekItems} onSelectDate={changeDate} onCopyWeek={copyWholeWeekToNextWeek} />
          <MealPlanInsightsPanel insights={mealInsights} />
        </TabsContent>

        <TabsContent value="automation" className="space-y-3 sm:space-y-4">
          <AutomationPanel
            selectedDate={selectedDate}
            items={items}
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            setSelectedTemplateId={setSelectedTemplateId}
            templateName={templateName}
            setTemplateName={setTemplateName}
            onAddTemplate={() => addTemplateToDate()}
            onCopyDay={() => copyItemsToDate(items, addDays(selectedDate, 1), "Day copied")}
            onMarkBreakfast={() => markManyDone(items.filter((item) => item.meal_type === "Breakfast"), "breakfast")}
            onMarkDay={() => markManyDone(items, displayDate(selectedDate))}
            batches={batchMeals}
            selectedBatchId={selectedBatchId}
            setSelectedBatchId={setSelectedBatchId}
            batchDraft={batchDraft}
            setBatchDraft={setBatchDraft}
            onCreateBatch={createBatchMeal}
            onAddBatch={addBatchPortionToDate}
          />
        </TabsContent>

        <TabsContent value="shopping" className="space-y-3 sm:space-y-4">
          <div ref={shoppingListRef}>
            <ShoppingListPanel items={shoppingList} onToggle={toggleShoppingCheck} onPrint={printShoppingList} checkedCount={shoppingCheckedCount} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AutomationPanel(props: { selectedDate: string; items: MealPlanItem[]; templates: MealTemplate[]; selectedTemplateId: string; setSelectedTemplateId: (id: string) => void; templateName: string; setTemplateName: (value: string) => void; onAddTemplate: () => void; onCopyDay: () => void; onMarkBreakfast: () => void; onMarkDay: () => void; batches: BatchMeal[]; selectedBatchId: string; setSelectedBatchId: (id: string) => void; batchDraft: BatchDraft; setBatchDraft: Dispatch<SetStateAction<BatchDraft>>; onCreateBatch: () => void; onAddBatch: () => void }) {
  return (
    <div className="space-y-3 sm:grid sm:gap-4 sm:space-y-0 xl:grid-cols-3">
      <Card>
        <CardHeader className="p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-base"><Copy className="h-4 w-4" /> Copy, templates, bulk done</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" size="sm" onClick={props.onCopyDay} disabled={!props.items.length}><Copy className="h-4 w-4" /> Copy day to tomorrow</Button>
            <Button variant="outline" size="sm" onClick={props.onMarkBreakfast}><CheckCircle2 className="h-4 w-4" /> Mark breakfast done</Button>
            <Button variant="outline" size="sm" onClick={props.onMarkDay} className="sm:col-span-2"><CheckCircle2 className="h-4 w-4" /> Mark all day done</Button>
          </div>
          <Input value={props.templateName} onChange={(event) => props.setTemplateName(event.target.value)} placeholder="Template name" />
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <select value={props.selectedTemplateId} onChange={(event) => props.setSelectedTemplateId(event.target.value)} className="h-10 rounded-md border bg-card px-3 text-sm">
              <option value="">Choose template</option>
              {props.templates.map((template) => <option key={template.id} value={template.id}>{template.name} ({template.items.length})</option>)}
            </select>
            <Button size="sm" onClick={props.onAddTemplate} disabled={!props.selectedTemplateId}><PlusCircle className="h-4 w-4" /> Add</Button>
          </div>
          {!props.templates.length ? <p className="text-sm text-muted-foreground">No templates yet. Save an item or meal column as a template below.</p> : null}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader className="p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-base"><PackagePlus className="h-4 w-4" /> Batch meal / meal prep</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:p-5 sm:pt-0 md:grid-cols-4">
          <Input value={props.batchDraft.name} onChange={(e) => props.setBatchDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Batch meal name" />
          <Input type="number" inputMode="numeric" enterKeyHint="done" value={props.batchDraft.portions} onChange={(e) => props.setBatchDraft((d) => ({ ...d, portions: e.target.value }))} placeholder="Portions" />
          <Input value={props.batchDraft.servingSize} onChange={(e) => props.setBatchDraft((d) => ({ ...d, servingSize: e.target.value }))} placeholder="Serving size" />
          <select value={props.batchDraft.mealType} onChange={(e) => props.setBatchDraft((d) => ({ ...d, mealType: normalizeMealPlanType(e.target.value) }))} className="h-10 rounded-md border bg-card px-3 text-sm">{mealTypes.map((type) => <option key={type} value={type}>{displayMealType(type)}</option>)}</select>
          <Input type="number" inputMode="decimal" enterKeyHint="done" value={props.batchDraft.calories} onChange={(e) => props.setBatchDraft((d) => ({ ...d, calories: e.target.value }))} placeholder="Total calories" />
          <Input type="number" inputMode="decimal" enterKeyHint="done" value={props.batchDraft.protein} onChange={(e) => props.setBatchDraft((d) => ({ ...d, protein: e.target.value }))} placeholder="Total protein" />
          <Input type="number" inputMode="decimal" enterKeyHint="done" value={props.batchDraft.carbs} onChange={(e) => props.setBatchDraft((d) => ({ ...d, carbs: e.target.value }))} placeholder="Total carbs" />
          <Input type="number" inputMode="decimal" enterKeyHint="done" value={props.batchDraft.fat} onChange={(e) => props.setBatchDraft((d) => ({ ...d, fat: e.target.value }))} placeholder="Total fat" />
          <Input className="md:col-span-2" value={props.batchDraft.notes} onChange={(e) => props.setBatchDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Ingredients / notes" />
          <Button size="sm" onClick={props.onCreateBatch}><Save className="h-4 w-4" /> Save batch</Button>
          <div className="grid gap-2 md:col-span-4 md:grid-cols-[1fr_auto]">
            <select value={props.selectedBatchId} onChange={(event) => props.setSelectedBatchId(event.target.value)} className="h-10 rounded-md border bg-card px-3 text-sm">
              <option value="">Choose saved batch meal</option>
              {props.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name} ({batch.portions} portions)</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={props.onAddBatch} disabled={!props.selectedBatchId}>Log one portion</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WeeklyPlanner({ weekDays, selectedDate, weekItems, onSelectDate, onCopyWeek }: { weekDays: string[]; selectedDate: string; weekItems: MealPlanItem[]; onSelectDate: (date: string) => void; onCopyWeek: () => void }) {
  return (
    <Card>
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Weekly plan</span>
          <Button variant="outline" size="sm" onClick={onCopyWeek}><Repeat className="h-4 w-4" /> Copy week</Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 p-4 pt-0 sm:gap-3 sm:p-5 sm:pt-0 sm:grid-cols-2 lg:grid-cols-7">
        {weekDays.map((day) => {
          const dayItems = weekItems.filter((item) => item.plan_date === day);
          const planned = dayItems.filter((item) => item.status === "planned").reduce(addItemToTotals, emptyTotals());
          const done = dayItems.filter((item) => item.status === "done").reduce(addItemToTotals, emptyTotals());
          return (
            <button key={day} type="button" onClick={() => onSelectDate(day)} className={cn("rounded-md border p-2.5 text-left transition-colors hover:border-primary/45 sm:p-3", day === selectedDate ? "border-primary bg-primary/10" : "bg-card")}>
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

function ShoppingListPanel({ items, onToggle, onPrint, checkedCount }: { items: ShoppingListItem[]; onToggle: (item: ShoppingListItem) => void; onPrint: () => void; checkedCount: number }) {
  const categories = useMemo(() => {
    const map = new Map<string, ShoppingListItem[]>();
    items.forEach((item) => {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <Card>
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Shopping list</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{checkedCount}/{items.length} checked</span>
            <Button variant="outline" size="sm" onClick={onPrint} disabled={!items.length}><Printer className="h-4 w-4" /> Print</Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
        {!items.length ? (
          <p className="text-sm text-muted-foreground">No shopping list yet. Add planned meals with serving data first.</p>
        ) : (
          <div className="space-y-4">
            {categories.map(([category, categoryItems]) => (
              <div key={category}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{category}</p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {categoryItems.map((item) => (
                    <label
                      key={item.key}
                      className={cn(
                        "flex min-h-[48px] cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors",
                        item.checked ? "border-primary/30 bg-primary/5" : "bg-card hover:border-primary/40"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => onToggle(item)}
                        className="h-5 w-5 shrink-0 accent-primary"
                        aria-label={`Mark ${item.food_name} as ${item.checked ? "unchecked" : "checked"}`}
                      />
                      <span className="min-w-0">
                        <span className={cn("block font-semibold", item.checked && "text-muted-foreground line-through")}>{item.food_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {item.quantity === null ? "Qty not specified" : `${Math.round(item.quantity * 10) / 10}x`} {item.serving_size ?? "serving info missing"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SwapConfirmPanel({ item, templates, templateId, onTemplateChange, diff, onConfirm, onCancel }: { item: MealPlanItem; templates: MealTemplate[]; templateId: string; onTemplateChange: (id: string) => void; diff: MacroTotals | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="text-base">Confirm meal swap for {item.food_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
        <select value={templateId} onChange={(event) => onTemplateChange(event.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-sm">
          <option value="">Choose replacement template</option>
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
        {diff ? <p className="text-sm text-muted-foreground">Macro difference: {formatDiff(diff.calories)} kcal | protein {formatDiff(diff.protein_g)}g | carbs {formatDiff(diff.carbs_g)}g | fat {formatDiff(diff.fat_g)}g</p> : <p className="text-sm text-muted-foreground">Choose a template to preview macro difference.</p>}
        <div className="flex gap-2"><Button size="sm" onClick={onConfirm} disabled={!templateId || !diff}>Confirm swap</Button><Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button></div>
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
        <select value={draft.mealType} onChange={(e) => setDraft((d) => ({ ...d, mealType: normalizeMealPlanType(e.target.value) }))} className="h-10 rounded-md border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring">{mealTypes.map((type) => <option key={type} value={type}>{displayMealType(type)}</option>)}</select>
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

type MealPlanInsight = {
  title: string;
  detail: string;
  tone: "good" | "warning" | "info";
};

function MealPlanInsightsPanel({ insights }: { insights: MealPlanInsight[] }) {
  return (
    <Card>
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="text-base">Meal-plan insights</CardTitle>
        <p className="text-sm text-muted-foreground">Uses planned meals, done food logs, templates, batches, and shopping-list data only.</p>
      </CardHeader>
      <CardContent className="grid gap-2 p-4 pt-0 sm:gap-3 sm:p-5 sm:pt-0 sm:grid-cols-2 xl:grid-cols-3">
        {insights.map((insight) => (
          <div key={insight.title} className="rounded-md border p-2.5 sm:p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{insight.title}</p>
              <Badge variant={insight.tone === "good" ? "success" : insight.tone === "warning" ? "outline" : "navy"} className="text-[10px]">{insight.tone}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{insight.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function buildMealPlanInsights({
  selectedDate,
  items,
  weekItems,
  dayLogs,
  templates,
  batchMeals,
  shoppingList
}: {
  selectedDate: string;
  items: MealPlanItem[];
  weekItems: MealPlanItem[];
  dayLogs: FoodLog[];
  templates: MealTemplate[];
  batchMeals: BatchMeal[];
  shoppingList: ShoppingListItem[];
}) {
  const insights: MealPlanInsight[] = [];
  const missingMealTypes = mealTypes.filter((type) => !items.some((item) => item.meal_type === type));
  const unknownMacroItems = items.filter((item) => toNumber(item.calories) === 0 && toNumber(item.protein_g) === 0 && toNumber(item.carbs_g) === 0 && toNumber(item.fat_g) === 0);
  const similarLoggedItems = items.filter((item) => item.status !== "done" && dayLogs.some((log) => sameFoodName(log.food_name, item.food_name)));
  const selectedProtein = items.reduce((sum, item) => sum + toNumber(item.protein_g), 0);
  const successfulDays = successfulMealPlanDays(weekItems, selectedDate);
  const highProteinTemplate = templates
    .map((template) => ({ name: template.name, protein: template.items.reduce((sum, item) => sum + toNumber(item.protein_g), 0), type: "template" }))
    .concat(batchMeals.map((batch) => ({ name: batch.name, protein: Math.round((toNumber(batch.total_protein_g) / Math.max(1, batch.portions)) * 10) / 10, type: "batch meal" })))
    .filter((item) => item.protein > 0)
    .sort((a, b) => b.protein - a.protein)[0];

  if (missingMealTypes.length) {
    insights.push({
      title: "Missing planned meals",
      detail: `${missingMealTypes.map(displayMealType).join(", ")} ${missingMealTypes.length === 1 ? "is" : "are"} not planned for ${displayDate(selectedDate)}.`,
      tone: "warning"
    });
  } else {
    insights.push({ title: "Meal coverage", detail: "Breakfast, lunch, dinner, and snacks all have planned items for this date.", tone: "good" });
  }

  if (similarLoggedItems.length) {
    insights.push({
      title: "Possible done match",
      detail: `${similarLoggedItems.slice(0, 2).map((item) => item.food_name).join(", ")} appears in today's real food logs. Review and mark done only if it is the same meal.`,
      tone: "info"
    });
  }

  if (unknownMacroItems.length) {
    insights.push({
      title: "Unknown macros",
      detail: `${unknownMacroItems.length} planned item${unknownMacroItems.length === 1 ? "" : "s"} have zero calories and macros. Update values instead of letting them look verified.`,
      tone: "warning"
    });
  }

  if (successfulDays.length) {
    insights.push({
      title: "Copy successful day",
      detail: `${displayDate(successfulDays[0].date)} had all planned meals marked done with ${Math.round(successfulDays[0].protein)}g protein. Consider copying that structure.`,
      tone: "good"
    });
  }

  if (selectedProtein < 80) {
    insights.push({
      title: "High-protein option",
      detail: highProteinTemplate
        ? `${highProteinTemplate.name} is your highest-protein saved ${highProteinTemplate.type} at ${Math.round(highProteinTemplate.protein)}g protein.`
        : "No high-protein saved template or batch meal exists yet. Save one from real planned meals after macros are known.",
      tone: "info"
    });
  }

  insights.push({
    title: "Shopping list",
    detail: shoppingList.length ? `${shoppingList.length} unique planned food${shoppingList.length === 1 ? "" : "s"} are ready in this week's shopping list.` : "Add planned meals with serving info to build a shopping list.",
    tone: shoppingList.length ? "good" : "info"
  });

  return insights.slice(0, 6);
}

function SummaryCard({ label, value, detail, suffix = " kcal" }: { label: string; value: number; detail: string; suffix?: string }) {
  return (
    <Card>
      <CardContent className="p-3 pt-3 sm:p-5 sm:pt-5">
        <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
        <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">{Math.round(toNumber(value))}{suffix}</p>
        <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1 sm:text-sm">{detail}</p>
      </CardContent>
    </Card>
  );
}

function MealColumn(props: { type: MealType; items: MealPlanItem[]; onAdd: () => void; onDone: (item: MealPlanItem) => void; onDelete: (item: MealPlanItem) => void; onStartEdit: (item: MealPlanItem) => void; onSaveEdit: (item: MealPlanItem) => void; onCancelEdit: () => void; onDuplicate: (item: MealPlanItem) => void; onCopyTomorrow: (item: MealPlanItem) => void; onRepeatDaily: (item: MealPlanItem) => void; onRepeatWeekly: (item: MealPlanItem) => void; onSaveTemplate: (item: MealPlanItem) => void; onSaveMealTemplate: () => void; onStartSwap: (item: MealPlanItem) => void; editingId: string | null; editDraft: Draft; setEditDraft: Dispatch<SetStateAction<Draft>>; updatingId: string | null; canSwap: boolean }) {
  const { type, items, onAdd, onDone, onDelete, onStartEdit, onSaveEdit, onCancelEdit, onDuplicate, onCopyTomorrow, onRepeatDaily, onRepeatWeekly, onSaveTemplate, onSaveMealTemplate, onStartSwap, editingId, editDraft, setEditDraft, updatingId, canSwap } = props;
  const totals = items.reduce((sum, item) => addItemToTotals(sum, item), emptyTotals());
  const plannedCount = items.filter((i) => i.status === "planned").length;
  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <Card className="h-full">
      <CardHeader className="p-3 sm:p-5">
        <CardTitle className="flex items-center justify-between gap-2 text-sm sm:text-base">
          <span className="flex items-center gap-2"><Utensils className="h-4 w-4" /> {displayMealType(type)}</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{plannedCount + doneCount}</Badge>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onAdd} aria-label={`Add ${displayMealType(type)} item`}>
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{Math.round(totals.calories)} kcal · {Math.round(totals.protein_g)}g protein</p>
        <Button type="button" variant="outline" size="sm" className="mt-1 text-xs" onClick={onSaveMealTemplate} disabled={!items.length}>Save as template</Button>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 sm:space-y-3 sm:p-5 sm:pt-0">
        {!items.length ? <p className="text-sm text-muted-foreground">No food planned yet. Tap + to add.</p> : null}
        {items.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <div key={item.id} className="rounded-md border bg-card p-2.5 sm:p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5">{item.food_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.quantity}x {item.serving_size}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                    {Math.round(toNumber(item.calories))} kcal · {Math.round(toNumber(item.protein_g))}g protein · {Math.round(toNumber(item.carbs_g))}g carbs · {Math.round(toNumber(item.fat_g))}g fat
                  </p>
                </div>
                <Badge variant={item.status === "done" ? "success" : "outline"} className="text-[10px] shrink-0">{item.status}</Badge>
              </div>
              {isEditing ? (
                <div className="mt-2 sm:mt-3">
                  <MealForm title="Edit planned food" draft={editDraft} setDraft={setEditDraft} onSave={() => onSaveEdit(item)} onCancel={onCancelEdit} saving={updatingId === item.id} />
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 sm:mt-3">
                  <Button type="button" size="sm" className="flex-1" onClick={() => onDone(item)} disabled={item.status === "done" || updatingId === item.id}>
                    <CheckCircle2 className="h-4 w-4" />
                    {item.status === "done" ? "Done" : "Mark done"}
                  </Button>
                  <details className="relative">
                    <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary sm:h-10 sm:w-10" aria-label={`More actions for ${item.food_name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </summary>
                    <div className="absolute right-0 z-20 mt-1 grid w-48 gap-0.5 rounded-md border bg-card p-2 shadow-luxe">
                      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={() => onDuplicate(item)} disabled={updatingId === item.id}><Copy className="h-4 w-4" /> Duplicate</Button>
                      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={() => onCopyTomorrow(item)}>Tomorrow</Button>
                      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={() => onRepeatDaily(item)}><Repeat className="h-4 w-4" /> Daily</Button>
                      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={() => onRepeatWeekly(item)}>Weekly</Button>
                      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={() => onSaveTemplate(item)}>Template</Button>
                      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={() => onStartSwap(item)} disabled={!canSwap}><RefreshCw className="h-4 w-4" /> Swap</Button>
                      <Button type="button" size="sm" variant="ghost" className="justify-start" onClick={() => onStartEdit(item)} disabled={updatingId === item.id}><Edit3 className="h-4 w-4" /> Edit</Button>
                      <Button type="button" size="sm" variant="ghost" className="justify-start text-destructive hover:text-destructive" onClick={() => onDelete(item)} disabled={updatingId === item.id}><Trash2 className="h-4 w-4" /> Delete</Button>
                    </div>
                  </details>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function NoticeBox({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const styles = notice.type === "success" ? "border-success/30 bg-success/10 text-foreground" : notice.type === "error" ? "border-destructive/30 bg-destructive/10 text-foreground" : "border-primary/40 bg-primary/5 text-foreground";
  return <div className={`rounded-md border p-3 text-sm sm:p-4 ${styles}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{notice.title}</p>{notice.description ? <p className="mt-1 break-words opacity-90">{notice.description}</p> : null}</div><button type="button" onClick={onClose} className="text-xs font-semibold underline">close</button></div></div>;
}

function emptyTotals(): MacroTotals { return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }; }
function addItemToTotals(total: MacroTotals, item: Pick<MealPlanItem, "calories" | "protein_g" | "carbs_g" | "fat_g">): MacroTotals { return { calories: total.calories + toNumber(item.calories), protein_g: total.protein_g + toNumber(item.protein_g), carbs_g: total.carbs_g + toNumber(item.carbs_g), fat_g: total.fat_g + toNumber(item.fat_g) }; }
function displayMealType(type: MealType) { return type === "Snack" ? "Snacks" : type; }
function normalizeMealPlanItem(item: MealPlanItem): MealPlanItem { const now = new Date().toISOString(); return { ...item, id: String(item.id || crypto.randomUUID()), food_name: String(item.food_name || "Unnamed food"), serving_size: String(item.serving_size || "1 serving"), quantity: toNumber(item.quantity) || 1, calories: toNumber(item.calories), protein_g: toNumber(item.protein_g), carbs_g: toNumber(item.carbs_g), fat_g: toNumber(item.fat_g), meal_type: normalizeMealPlanType(item.meal_type), status: item.status === "done" ? "done" : "planned", created_at: item.created_at || now, updated_at: item.updated_at || now }; }
function draftFromItem(item: MealPlanItem): Draft { return { foodName: item.food_name, mealType: normalizeMealPlanType(item.meal_type), quantity: String(item.quantity || 1), servingInfo: item.serving_size || "1 serving", calories: String(toNumber(item.calories)), protein: String(toNumber(item.protein_g)), carbs: String(toNumber(item.carbs_g)), fat: String(toNumber(item.fat_g)), notes: item.notes ?? "" }; }
function mergeItems(current: MealPlanItem[], nextItems: MealPlanItem[]) { const map = new Map(current.map((item) => [item.id, item])); nextItems.forEach((item) => map.set(item.id, item)); return Array.from(map.values()).sort((a, b) => a.plan_date.localeCompare(b.plan_date) || a.created_at.localeCompare(b.created_at)); }
function formatDiff(value: number) { return `${value > 0 ? "+" : ""}${value}`; }
function toNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function normalizeText(value: string | null | undefined) { return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function sameFoodName(a: string, b: string) { const left = normalizeText(a); const right = normalizeText(b); return Boolean(left && right && (left === right || left.includes(right) || right.includes(left))); }
function successfulMealPlanDays(items: MealPlanItem[], selectedDate: string) {
  const byDate = new Map<string, MealPlanItem[]>();
  items.forEach((item) => byDate.set(item.plan_date, [...(byDate.get(item.plan_date) ?? []), item]));
  return Array.from(byDate.entries())
    .filter(([date, dayItems]) => date !== selectedDate && dayItems.length > 0 && dayItems.every((item) => item.status === "done"))
    .map(([date, dayItems]) => ({ date, protein: dayItems.reduce((sum, item) => sum + toNumber(item.protein_g), 0) }))
    .sort((a, b) => b.protein - a.protein);
}
