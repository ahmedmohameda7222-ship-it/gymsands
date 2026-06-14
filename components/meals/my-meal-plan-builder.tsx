"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Copy, Edit3, PackagePlus, PlusCircle, Printer, RefreshCw, Repeat, Save, ShoppingCart, Trash2, Utensils, X } from "lucide-react";
import { Component, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";
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
import type { MealPlanItem, MealType } from "@/types";

type MacroTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type Notice = { type: "success" | "error" | "info"; title: string; description?: string };
type Draft = { foodName: string; mealType: MealType; quantity: string; servingInfo: string; calories: string; protein: string; carbs: string; fat: string; notes: string };
type BatchDraft = { name: string; portions: string; servingSize: string; calories: string; protein: string; carbs: string; fat: string; notes: string; mealType: MealType };
type SwapState = { item: MealPlanItem; templateId: string } | null;

const mealTypes: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const emptyDraft: Draft = { foodName: "", mealType: "Breakfast", quantity: "1", servingInfo: "1 serving", calories: "0", protein: "0", carbs: "0", fat: "0", notes: "" };
const emptyBatchDraft: BatchDraft = { name: "", portions: "4", servingSize: "1 portion", calories: "0", protein: "0", carbs: "0", fat: "0", notes: "", mealType: "Lunch" };

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
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-3 pt-5 text-sm text-amber-950">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> My Meal Plan could not load</div>
            <p>The page stayed open, but one meal-plan widget crashed. Try again after redeploying the fixed files.</p>
            <p className="break-words text-xs text-amber-800">{this.state.message}</p>
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
  const [selectedDate, setSelectedDate] = useState(() => safeDate(searchParams.get("date")) ?? todayIso());
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(selectedDate));
  const [plannedDates, setPlannedDates] = useState<string[]>([]);
  const [items, setItems] = useState<MealPlanItem[]>([]);
  const [weekItems, setWeekItems] = useState<MealPlanItem[]>([]);
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
  const [checkedShoppingKeys, setCheckedShoppingKeys] = useState<string[]>([]);

  const selectedWeekStart = useMemo(() => weekStart(selectedDate), [selectedDate]);
  const selectedWeekEnd = useMemo(() => addDays(selectedWeekStart, 6), [selectedWeekStart]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index)), [selectedWeekStart]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", selectedDate);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }, [pathname, searchParams, selectedDate]);

  useEffect(() => {
    setTemplates(getMealTemplates(user?.id));
    setBatchMeals(getBatchMeals(user?.id));
    setCheckedShoppingKeys(getCheckedShoppingKeys(user?.id, selectedWeekStart));
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
        const [dayItems, weekPlanItems, dates] = await Promise.all([
          getMealPlanItemsForDate(user.id, selectedDate),
          getMealPlanItemsForRange(user.id, selectedWeekStart, selectedWeekEnd),
          getMealPlanDatesWithItems(user.id, calendarRangeStart(calendarMonth), calendarRangeEnd(calendarMonth))
        ]);
        if (!active) return;
        setItems(dayItems.map(normalizeMealPlanItem));
        setWeekItems(weekPlanItems.map(normalizeMealPlanItem));
        setPlannedDates(dates);
      } catch (error) {
        if (!active) return;
        setItems([]);
        setWeekItems([]);
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
    return normalizeMealPlanItem(await createDirectMealPlanItem({ userId: user.id, date, mealType: item.meal_type, foodName: item.food_name, quantity: item.quantity, servingInfo: item.serving_size, calories: item.calories, protein: item.protein_g, carbs: item.carbs_g, fat: item.fat_g, notes: item.notes }));
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
    if (!window.confirm(`Mark ${plannedTargets.length} planned item(s) done for ${label}? This will add them to food logs once.`)) return;
    try {
      setIsUpdatingId("bulk-done");
      const updated: MealPlanItem[] = [];
      for (const item of plannedTargets) {
        const result = await markDirectMealPlanItemDone(item);
        updated.push(normalizeMealPlanItem(result.item));
      }
      upsertLocalItems(updated);
      setNotice({ type: "success", title: `${label} marked done`, description: `${updated.length} real planned item(s) were processed idempotently.` });
    } catch (error) {
      setNotice({ type: "error", title: `Could not mark ${label} done`, description: error instanceof Error ? error.message : "Please try again." });
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
    if (!window.confirm(`Repeat ${item.food_name} daily for the next 7 days?`)) return;
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

  async function repeatMealWeekly(item: MealPlanItem) {
    await duplicateItem(item, addDays(item.plan_date, 7));
  }

  async function copyWholeWeekToNextWeek() {
    if (!weekItems.length) return setNotice({ type: "info", title: "Nothing to copy", description: "This week has no planned meals." });
    if (!window.confirm(`Copy all ${weekItems.length} planned item(s) to next week?`)) return;
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

  function saveItemTemplate(item: MealPlanItem) {
    try {
      const template = saveMealTemplate(user?.id, templateName.trim() || item.food_name, [templateItemFromMealPlanItem(item)], item.notes);
      setTemplates((current) => [template, ...current]);
      setTemplateName("");
      setNotice({ type: "success", title: "Template saved", description: `${template.name} is reusable now.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not save template", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  function saveMealTypeTemplate(type: MealType) {
    const sourceItems = items.filter((item) => item.meal_type === type);
    try {
      const template = saveMealTemplate(user?.id, templateName.trim() || `${displayMealType(type)} template`, sourceItems.map(templateItemFromMealPlanItem), `${displayDate(selectedDate)} ${displayMealType(type)}`);
      setTemplates((current) => [template, ...current]);
      setTemplateName("");
      setNotice({ type: "success", title: "Meal template saved", description: `${template.name} includes ${template.items.length} food item(s).` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not save template", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  function createBatchMeal() {
    try {
      const batch = saveBatchMeal(user?.id, { name: batchDraft.name, portions: Number(batchDraft.portions), serving_size: batchDraft.servingSize, notes: batchDraft.notes, total_calories: Number(batchDraft.calories), total_protein_g: Number(batchDraft.protein), total_carbs_g: Number(batchDraft.carbs), total_fat_g: Number(batchDraft.fat) });
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
      const updated = normalizeMealPlanItem(await updateDirectMealPlanItem(user.id, swapState.item.id, { date: swapState.item.plan_date, mealType: swapTarget.meal_type, foodName: swapTarget.food_name, quantity: swapTarget.quantity, servingInfo: swapTarget.serving_size, calories: swapTarget.calories, protein: swapTarget.protein_g, carbs: swapTarget.carbs_g, fat: swapTarget.fat_g, notes: swapTarget.notes }));
      upsertLocalItems([updated]);
      setSwapState(null);
      setNotice({ type: "success", title: "Meal swapped", description: `${swapState.item.food_name} was replaced with ${updated.food_name}.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not swap meal", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  function toggleShoppingCheck(item: ShoppingListItem) {
    const next = setShoppingItemChecked(user?.id, selectedWeekStart, item.key, !item.checked);
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

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Planned" value={plannedTotals.calories} detail={`${Math.round(plannedTotals.protein_g)}g protein planned`} />
        <SummaryCard label="Done" value={doneTotals.calories} detail={`${Math.round(doneTotals.protein_g)}g protein logged`} />
        <SummaryCard label="Planned carbs" value={plannedTotals.carbs_g} suffix="g" detail={`${Math.round(plannedTotals.fat_g)}g fat planned`} />
        <SummaryCard label="Done carbs" value={doneTotals.carbs_g} suffix="g" detail={`${Math.round(doneTotals.fat_g)}g fat logged`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-5 w-5" /> Meal calendar</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Meal Plan for {longDate(selectedDate)}</h2><p className="text-sm text-muted-foreground">Planned food counts only after you press Mark done.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" type="button" onClick={() => changeDate(addDays(selectedDate, -1))}><ChevronLeft className="h-4 w-4" /> Previous Day</Button>
              <Button variant="outline" type="button" onClick={() => changeDate(todayIso())}>Today</Button>
              <Button variant="outline" type="button" onClick={() => changeDate(addDays(selectedDate, 1))}>Next Day <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
          <CompactCalendar month={calendarMonth} selectedDate={selectedDate} plannedDates={plannedDates} onMonthChange={setCalendarMonth} onSelectDate={changeDate} />
        </CardContent>
      </Card>

      {notice ? <NoticeBox notice={notice} onClose={() => setNotice(null)} /> : null}

      <WeeklyPlanner weekDays={weekDays} selectedDate={selectedDate} weekItems={weekItems} onSelectDate={changeDate} onCopyWeek={copyWholeWeekToNextWeek} />

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

      <ShoppingListPanel items={shoppingList} onToggle={toggleShoppingCheck} onPrint={printShoppingList} />

      {swapState ? <SwapConfirmPanel item={swapState.item} templates={templates} templateId={swapState.templateId} onTemplateChange={(templateId) => setSwapState({ item: swapState.item, templateId })} diff={swapDiff} onConfirm={confirmSwap} onCancel={() => setSwapState(null)} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{displayDate(selectedDate)} meals</h2><p className="text-sm text-muted-foreground">Breakfast, lunch, dinner, and snacks for the selected date.</p></div>
        <Button type="button" onClick={() => setShowAddForm((current) => !current)}><PlusCircle className="h-4 w-4" /> {showAddForm ? "Hide add food" : "Add food"}</Button>
      </div>

      {showAddForm ? <MealForm title="Add planned food" draft={draft} setDraft={setDraft} onSave={addPlannedFood} onCancel={() => setShowAddForm(false)} saving={isUpdatingId === "new"} /> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading meal plan for {displayDate(selectedDate)}...</p> : null}

      <div className="grid gap-4 xl:grid-cols-4">
        {mealTypes.map((type) => (
          <MealColumn
            key={type}
            type={type}
            items={items.filter((item) => item.meal_type === type)}
            onAdd={() => { setDraft((current) => ({ ...current, mealType: type })); setShowAddForm(true); }}
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
    </div>
  );
}

function AutomationPanel(props: { selectedDate: string; items: MealPlanItem[]; templates: MealTemplate[]; selectedTemplateId: string; setSelectedTemplateId: (id: string) => void; templateName: string; setTemplateName: (value: string) => void; onAddTemplate: () => void; onCopyDay: () => void; onMarkBreakfast: () => void; onMarkDay: () => void; batches: BatchMeal[]; selectedBatchId: string; setSelectedBatchId: (id: string) => void; batchDraft: BatchDraft; setBatchDraft: Dispatch<SetStateAction<BatchDraft>>; onCreateBatch: () => void; onAddBatch: () => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Copy className="h-4 w-4" /> Copy, templates, bulk done</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={props.onCopyDay} disabled={!props.items.length}><Copy className="h-4 w-4" /> Copy day to tomorrow</Button><Button variant="outline" onClick={props.onMarkBreakfast}><CheckCircle2 className="h-4 w-4" /> Mark breakfast done</Button><Button variant="outline" onClick={props.onMarkDay} className="sm:col-span-2"><CheckCircle2 className="h-4 w-4" /> Mark all day done</Button></div>
          <Input value={props.templateName} onChange={(event) => props.setTemplateName(event.target.value)} placeholder="Template name for Save as template" />
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><select value={props.selectedTemplateId} onChange={(event) => props.setSelectedTemplateId(event.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="">Choose template</option>{props.templates.map((template) => <option key={template.id} value={template.id}>{template.name} ({template.items.length})</option>)}</select><Button onClick={props.onAddTemplate} disabled={!props.selectedTemplateId}><PlusCircle className="h-4 w-4" /> Add template</Button></div>
          {!props.templates.length ? <p className="text-sm text-muted-foreground">No templates yet. Save an item or meal column as a template below.</p> : null}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><PackagePlus className="h-4 w-4" /> Batch meal / meal prep</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input value={props.batchDraft.name} onChange={(e) => props.setBatchDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Batch meal name" />
          <Input type="number" value={props.batchDraft.portions} onChange={(e) => props.setBatchDraft((d) => ({ ...d, portions: e.target.value }))} placeholder="Portions" />
          <Input value={props.batchDraft.servingSize} onChange={(e) => props.setBatchDraft((d) => ({ ...d, servingSize: e.target.value }))} placeholder="Serving size" />
          <select value={props.batchDraft.mealType} onChange={(e) => props.setBatchDraft((d) => ({ ...d, mealType: normalizeMealPlanType(e.target.value) }))} className="h-10 rounded-md border bg-white px-3 text-sm">{mealTypes.map((type) => <option key={type} value={type}>{displayMealType(type)}</option>)}</select>
          <Input type="number" value={props.batchDraft.calories} onChange={(e) => props.setBatchDraft((d) => ({ ...d, calories: e.target.value }))} placeholder="Total calories" />
          <Input type="number" value={props.batchDraft.protein} onChange={(e) => props.setBatchDraft((d) => ({ ...d, protein: e.target.value }))} placeholder="Total protein" />
          <Input type="number" value={props.batchDraft.carbs} onChange={(e) => props.setBatchDraft((d) => ({ ...d, carbs: e.target.value }))} placeholder="Total carbs" />
          <Input type="number" value={props.batchDraft.fat} onChange={(e) => props.setBatchDraft((d) => ({ ...d, fat: e.target.value }))} placeholder="Total fat" />
          <Input className="md:col-span-2" value={props.batchDraft.notes} onChange={(e) => props.setBatchDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Ingredients / notes" />
          <Button onClick={props.onCreateBatch}><Save className="h-4 w-4" /> Save batch</Button>
          <div className="grid gap-2 md:col-span-4 md:grid-cols-[1fr_auto]"><select value={props.selectedBatchId} onChange={(event) => props.setSelectedBatchId(event.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="">Choose saved batch meal</option>{props.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name} ({batch.portions} portions)</option>)}</select><Button variant="outline" onClick={props.onAddBatch} disabled={!props.selectedBatchId}>Log one portion to plan</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}

function WeeklyPlanner({ weekDays, selectedDate, weekItems, onSelectDate, onCopyWeek }: { weekDays: string[]; selectedDate: string; weekItems: MealPlanItem[]; onSelectDate: (date: string) => void; onCopyWeek: () => void }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base"><span className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Weekly meal plan view</span><Button variant="outline" size="sm" onClick={onCopyWeek}><Repeat className="h-4 w-4" /> Copy full week to next week</Button></CardTitle></CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-7">
        {weekDays.map((day) => {
          const dayItems = weekItems.filter((item) => item.plan_date === day);
          const planned = dayItems.filter((item) => item.status === "planned").reduce(addItemToTotals, emptyTotals());
          const done = dayItems.filter((item) => item.status === "done").reduce(addItemToTotals, emptyTotals());
          return (
            <button key={day} type="button" onClick={() => onSelectDate(day)} className={`rounded-md border p-3 text-left transition hover:border-primary ${day === selectedDate ? "border-primary bg-primary/10" : "bg-white"}`}>
              <p className="font-semibold">{displayDate(day)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Planned {Math.round(planned.calories)} kcal | Done {Math.round(done.calories)} kcal</p>
              <p className="text-xs text-muted-foreground">P {Math.round(planned.protein_g)}/{Math.round(done.protein_g)}g C {Math.round(planned.carbs_g)}/{Math.round(done.carbs_g)}g F {Math.round(planned.fat_g)}/{Math.round(done.fat_g)}g</p>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">{mealTypes.map((type) => <p key={type}>{displayMealType(type)}: {dayItems.filter((item) => item.meal_type === type).length}</p>)}</div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ShoppingListPanel({ items, onToggle, onPrint }: { items: ShoppingListItem[]; onToggle: (item: ShoppingListItem) => void; onPrint: () => void }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base"><span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Shopping list</span><Button variant="outline" size="sm" onClick={onPrint} disabled={!items.length}><Printer className="h-4 w-4" /> Print/export page</Button></CardTitle></CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {!items.length ? <p className="text-sm text-muted-foreground">No shopping list yet. Add planned meals with serving data first.</p> : null}
        {items.map((item) => <label key={item.key} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm"><input type="checkbox" checked={item.checked} onChange={() => onToggle(item)} className="mt-1 h-4 w-4" /><span><span className="font-semibold">{item.food_name}</span><br /><span className="text-muted-foreground">{item.quantity === null ? "Quantity not specified" : `${Math.round(item.quantity * 10) / 10}x`} {item.serving_size ?? "serving info missing"} | {item.category}</span></span></label>)}
      </CardContent>
    </Card>
  );
}

function SwapConfirmPanel({ item, templates, templateId, onTemplateChange, diff, onConfirm, onCancel }: { item: MealPlanItem; templates: MealTemplate[]; templateId: string; onTemplateChange: (id: string) => void; diff: MacroTotals | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Card className="border-primary/40 bg-blue-50">
      <CardHeader><CardTitle className="text-base">Confirm meal swap for {item.food_name}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <select value={templateId} onChange={(event) => onTemplateChange(event.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Choose replacement template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>
        {diff ? <p className="text-sm text-muted-foreground">Macro difference: {formatDiff(diff.calories)} kcal | protein {formatDiff(diff.protein_g)}g | carbs {formatDiff(diff.carbs_g)}g | fat {formatDiff(diff.fat_g)}g</p> : <p className="text-sm text-muted-foreground">Choose a template to preview macro difference.</p>}
        <div className="flex gap-2"><Button onClick={onConfirm} disabled={!templateId || !diff}>Confirm swap</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div>
      </CardContent>
    </Card>
  );
}

function MealForm({ title, draft, setDraft, onSave, onCancel, saving }: { title: string; draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Input value={draft.foodName} onChange={(e) => setDraft((d) => ({ ...d, foodName: e.target.value }))} placeholder="Food name" />
      <select value={draft.mealType} onChange={(e) => setDraft((d) => ({ ...d, mealType: normalizeMealPlanType(e.target.value) }))} className="h-10 rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring">{mealTypes.map((type) => <option key={type} value={type}>{displayMealType(type)}</option>)}</select>
      <Input type="number" min="0.1" step="0.1" value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))} placeholder="Quantity" />
      <Input value={draft.servingInfo} onChange={(e) => setDraft((d) => ({ ...d, servingInfo: e.target.value }))} placeholder="Serving info" />
      <Input type="number" min="0" value={draft.calories} onChange={(e) => setDraft((d) => ({ ...d, calories: e.target.value }))} placeholder="Calories" />
      <Input type="number" min="0" value={draft.protein} onChange={(e) => setDraft((d) => ({ ...d, protein: e.target.value }))} placeholder="Protein g" />
      <Input type="number" min="0" value={draft.carbs} onChange={(e) => setDraft((d) => ({ ...d, carbs: e.target.value }))} placeholder="Carbs g" />
      <Input type="number" min="0" value={draft.fat} onChange={(e) => setDraft((d) => ({ ...d, fat: e.target.value }))} placeholder="Fat g" />
      <Input className="xl:col-span-2" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Notes" />
      <div className="flex gap-2 xl:col-span-2"><Button type="button" onClick={onSave} disabled={saving}><Save className="h-4 w-4" /> Save</Button><Button type="button" variant="outline" onClick={onCancel}><X className="h-4 w-4" /> Cancel</Button></div>
    </CardContent></Card>
  );
}

function SummaryCard({ label, value, detail, suffix = " kcal" }: { label: string; value: number; detail: string; suffix?: string }) {
  return <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{Math.round(toNumber(value))}{suffix}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></CardContent></Card>;
}

function MealColumn(props: { type: MealType; items: MealPlanItem[]; onAdd: () => void; onDone: (item: MealPlanItem) => void; onDelete: (item: MealPlanItem) => void; onStartEdit: (item: MealPlanItem) => void; onSaveEdit: (item: MealPlanItem) => void; onCancelEdit: () => void; onDuplicate: (item: MealPlanItem) => void; onCopyTomorrow: (item: MealPlanItem) => void; onRepeatDaily: (item: MealPlanItem) => void; onRepeatWeekly: (item: MealPlanItem) => void; onSaveTemplate: (item: MealPlanItem) => void; onSaveMealTemplate: () => void; onStartSwap: (item: MealPlanItem) => void; editingId: string | null; editDraft: Draft; setEditDraft: Dispatch<SetStateAction<Draft>>; updatingId: string | null; canSwap: boolean }) {
  const { type, items, onAdd, onDone, onDelete, onStartEdit, onSaveEdit, onCancelEdit, onDuplicate, onCopyTomorrow, onRepeatDaily, onRepeatWeekly, onSaveTemplate, onSaveMealTemplate, onStartSwap, editingId, editDraft, setEditDraft, updatingId, canSwap } = props;
  const totals = items.reduce((sum, item) => addItemToTotals(sum, item), emptyTotals());
  return (
    <Card className="h-full"><CardHeader><CardTitle className="flex items-center justify-between gap-2 text-base"><span className="flex items-center gap-2"><Utensils className="h-4 w-4" /> {displayMealType(type)}</span><div className="flex items-center gap-2"><Badge variant="outline">{items.length}</Badge><Button type="button" size="icon" variant="ghost" onClick={onAdd}><PlusCircle className="h-4 w-4" /></Button></div></CardTitle><p className="text-xs text-muted-foreground">{Math.round(totals.calories)} kcal | {Math.round(totals.protein_g)}g protein</p><Button type="button" variant="outline" size="sm" onClick={onSaveMealTemplate} disabled={!items.length}>Save meal as template</Button></CardHeader>
      <CardContent className="space-y-3">{!items.length ? <p className="text-sm text-muted-foreground">No food planned yet.</p> : null}{items.map((item) => {
        const isEditing = editingId === item.id;
        return <div key={item.id} className="rounded-md border bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-sm"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold leading-5">{item.food_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.quantity}x {item.serving_size}</p><p className="mt-1 text-xs text-muted-foreground">{Math.round(toNumber(item.calories))} kcal | {Math.round(toNumber(item.protein_g))}g protein | {Math.round(toNumber(item.carbs_g))}g carbs | {Math.round(toNumber(item.fat_g))}g fat</p></div><Badge variant={item.status === "done" ? "success" : "outline"}>{item.status}</Badge></div>{isEditing ? <MealForm title="Edit planned food" draft={editDraft} setDraft={setEditDraft} onSave={() => onSaveEdit(item)} onCancel={onCancelEdit} saving={updatingId === item.id} /> : <div className="mt-3 grid grid-cols-2 gap-2"><Button type="button" size="sm" onClick={() => onDone(item)} disabled={item.status === "done" || updatingId === item.id}><CheckCircle2 className="h-4 w-4" />{item.status === "done" ? "Done" : "Mark done"}</Button><Button type="button" size="sm" variant="outline" onClick={() => onDuplicate(item)} disabled={updatingId === item.id}><Copy className="h-4 w-4" /> Duplicate</Button><Button type="button" size="sm" variant="outline" onClick={() => onCopyTomorrow(item)}>Tomorrow</Button><Button type="button" size="sm" variant="outline" onClick={() => onRepeatDaily(item)}><Repeat className="h-4 w-4" /> Daily</Button><Button type="button" size="sm" variant="outline" onClick={() => onRepeatWeekly(item)}>Weekly</Button><Button type="button" size="sm" variant="outline" onClick={() => onSaveTemplate(item)}>Template</Button><Button type="button" size="sm" variant="outline" onClick={() => onStartSwap(item)} disabled={!canSwap}><RefreshCw className="h-4 w-4" /> Swap</Button><div className="grid grid-cols-2 gap-1"><Button type="button" size="icon" variant="ghost" onClick={() => onStartEdit(item)} disabled={updatingId === item.id}><Edit3 className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" onClick={() => onDelete(item)} disabled={updatingId === item.id}><Trash2 className="h-4 w-4" /></Button></div></div>}</div>;
      })}</CardContent></Card>
  );
}

function NoticeBox({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const styles = notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : notice.type === "error" ? "border-red-200 bg-red-50 text-red-950" : "border-primary/40 bg-blue-50 text-foreground";
  return <div className={`rounded-md border p-4 text-sm ${styles}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{notice.title}</p>{notice.description ? <p className="mt-1 break-words opacity-90">{notice.description}</p> : null}</div><button type="button" onClick={onClose} className="text-xs font-semibold underline">close</button></div></div>;
}

function emptyTotals(): MacroTotals { return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }; }
function addItemToTotals(total: MacroTotals, item: Pick<MealPlanItem, "calories" | "protein_g" | "carbs_g" | "fat_g">): MacroTotals { return { calories: total.calories + toNumber(item.calories), protein_g: total.protein_g + toNumber(item.protein_g), carbs_g: total.carbs_g + toNumber(item.carbs_g), fat_g: total.fat_g + toNumber(item.fat_g) }; }
function displayMealType(type: MealType) { return type === "Snack" ? "Snacks" : type; }
function normalizeMealPlanItem(item: MealPlanItem): MealPlanItem { const now = new Date().toISOString(); return { ...item, id: String(item.id || crypto.randomUUID()), food_name: String(item.food_name || "Unnamed food"), serving_size: String(item.serving_size || "1 serving"), quantity: toNumber(item.quantity) || 1, calories: toNumber(item.calories), protein_g: toNumber(item.protein_g), carbs_g: toNumber(item.carbs_g), fat_g: toNumber(item.fat_g), meal_type: normalizeMealPlanType(item.meal_type), status: item.status === "done" ? "done" : "planned", created_at: item.created_at || now, updated_at: item.updated_at || now }; }
function draftFromItem(item: MealPlanItem): Draft { return { foodName: item.food_name, mealType: normalizeMealPlanType(item.meal_type), quantity: String(item.quantity || 1), servingInfo: item.serving_size || "1 serving", calories: String(toNumber(item.calories)), protein: String(toNumber(item.protein_g)), carbs: String(toNumber(item.carbs_g)), fat: String(toNumber(item.fat_g)), notes: item.notes ?? "" }; }
function mergeItems(current: MealPlanItem[], nextItems: MealPlanItem[]) { const map = new Map(current.map((item) => [item.id, item])); nextItems.forEach((item) => map.set(item.id, item)); return Array.from(map.values()).sort((a, b) => a.plan_date.localeCompare(b.plan_date) || a.created_at.localeCompare(b.created_at)); }
function formatDiff(value: number) { return `${value > 0 ? "+" : ""}${value}`; }
function toNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function todayIso() { return localDateToIso(new Date()); }
function safeDate(value: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; }
function monthStart(date: string) { return `${date.slice(0, 7)}-01`; }
function pad(value: number) { return String(value).padStart(2, "0"); }
function localDateToIso(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function parseIsoDate(date: string) { const [year, month, day] = date.split("-").map(Number); return { year, month, day }; }
function isoFromUtcDate(date: Date) { return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`; }
function utcDate(date: string) { const { year, month, day } = parseIsoDate(date); return new Date(Date.UTC(year, month - 1, day)); }
function addDays(date: string, days: number) { const { year, month, day } = parseIsoDate(date); return isoFromUtcDate(new Date(Date.UTC(year, month - 1, day + days))); }
function addMonths(date: string, months: number) { const { year, month } = parseIsoDate(monthStart(date)); return isoFromUtcDate(new Date(Date.UTC(year, month - 1 + months, 1))); }
function weekStart(date: string) { const first = utcDate(date); first.setUTCDate(first.getUTCDate() - first.getUTCDay()); return isoFromUtcDate(first); }
function calendarRangeStart(month: string) { const first = utcDate(monthStart(month)); first.setUTCDate(first.getUTCDate() - first.getUTCDay()); return isoFromUtcDate(first); }
function calendarRangeEnd(month: string) { return addDays(calendarRangeStart(month), 41); }
function calendarDays(month: string) { const start = calendarRangeStart(month); return Array.from({ length: 42 }, (_, index) => addDays(start, index)); }
function monthLabel(month: string) { return utcDate(monthStart(month)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }); }
function longDate(date: string) { return utcDate(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }); }
function displayDate(date: string) { return utcDate(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); }

function CompactCalendar({ month, selectedDate, plannedDates, onMonthChange, onSelectDate }: { month: string; selectedDate: string; plannedDates: string[]; onMonthChange: (date: string) => void; onSelectDate: (date: string) => void }) {
  const days = calendarDays(month);
  const planned = new Set(plannedDates);
  return <div className="rounded-md border bg-white p-3"><div className="mb-3 flex items-center justify-between"><Button size="icon" variant="ghost" type="button" onClick={() => onMonthChange(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></Button><p className="font-semibold">{monthLabel(month)}</p><Button size="icon" variant="ghost" type="button" onClick={() => onMonthChange(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button></div><div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div><div className="mt-2 grid grid-cols-7 gap-1">{days.map((day) => { const isCurrentMonth = day.slice(0, 7) === month.slice(0, 7); const isSelected = day === selectedDate; const isToday = day === todayIso(); const hasPlan = planned.has(day); return <button key={day} type="button" onClick={() => onSelectDate(day)} className={`relative rounded-md border px-1 py-2 text-sm transition ${isSelected ? "border-primary bg-primary text-primary-foreground" : isToday ? "border-primary/60 bg-primary/10" : "border-transparent hover:bg-muted"} ${isCurrentMonth ? "" : "opacity-40"}`}>{Number(day.slice(-2))}{hasPlan ? <span className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-primary"}`} /> : null}</button>; })}</div></div>;
}
