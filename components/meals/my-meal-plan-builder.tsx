"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Edit3, PlusCircle, Save, Trash2, Utensils, X } from "lucide-react";
import { Component, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  markDirectMealPlanItemDone,
  normalizeMealPlanType,
  updateDirectMealPlanItem
} from "@/services/database/meal-plan";
import type { MealPlanItem, MealType } from "@/types";

type MacroTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type Notice = { type: "success" | "error" | "info"; title: string; description?: string };
type Draft = { foodName: string; mealType: MealType; quantity: string; servingInfo: string; calories: string; protein: string; carbs: string; fat: string; notes: string };

const mealTypes: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const emptyDraft: Draft = { foodName: "", mealType: "Breakfast", quantity: "1", servingInfo: "1 serving", calories: "0", protein: "0", carbs: "0", fat: "0", notes: "" };

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
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              My Meal Plan could not load
            </div>
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
  return (
    <MealPlanBoundary>
      <MyMealPlanBuilderInner />
    </MealPlanBoundary>
  );
}

function MyMealPlanBuilderInner() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => safeDate(searchParams.get("date")) ?? todayIso());
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(selectedDate));
  const [plannedDates, setPlannedDates] = useState<string[]>([]);
  const [items, setItems] = useState<MealPlanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const dateParam = safeDate(searchParams.get("date"));
    if (dateParam && dateParam !== selectedDate) {
      setSelectedDate(dateParam);
      setCalendarMonth(monthStart(dateParam));
    }
  }, [searchParams, selectedDate]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", selectedDate);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const [dayItems, dates] = await Promise.all([
          getMealPlanItemsForDate(user.id, selectedDate),
          getMealPlanDatesWithItems(user.id, calendarRangeStart(calendarMonth), calendarRangeEnd(calendarMonth))
        ]);
        if (!active) return;
        setItems(dayItems.map(normalizeMealPlanItem));
        setPlannedDates(dates);
      } catch (error) {
        if (!active) return;
        setItems([]);
        setNotice({ type: "error", title: "Saved meal plan could not load", description: error instanceof Error ? error.message : "Please try again." });
      } finally {
        if (active) setIsLoading(false);
      }
    }
    loadPlan();
    return () => {
      active = false;
    };
  }, [user?.id, selectedDate, calendarMonth]);

  const plannedTotals = useMemo(() => items.filter((item) => item.status === "planned").reduce(addItemToTotals, emptyTotals()), [items]);
  const doneTotals = useMemo(() => items.filter((item) => item.status === "done").reduce(addItemToTotals, emptyTotals()), [items]);

  function changeDate(nextDate: string) {
    setSelectedDate(nextDate);
    setCalendarMonth(monthStart(nextDate));
  }

  async function addPlannedFood() {
    if (!user?.id) return setNotice({ type: "error", title: "Login required", description: "Please log in again before saving your meal plan." });
    try {
      setIsUpdatingId("new");
      const item = await createDirectMealPlanItem({
        userId: user.id,
        date: selectedDate,
        mealType: draft.mealType,
        foodName: draft.foodName,
        quantity: Number(draft.quantity),
        servingInfo: draft.servingInfo,
        calories: Number(draft.calories),
        protein: Number(draft.protein),
        carbs: Number(draft.carbs),
        fat: Number(draft.fat),
        notes: draft.notes
      });
      setItems((current) => [...current, normalizeMealPlanItem(item)]);
      setDraft(emptyDraft);
      setShowAddForm(false);
      setPlannedDates((current) => (current.includes(selectedDate) ? current : [...current, selectedDate]));
      setNotice({ type: "success", title: "Planned food added", description: `${item.food_name} was added to ${displayDate(selectedDate)}.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not add planned food", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function markDone(item: MealPlanItem) {
    if (item.status === "done") return;
    try {
      setIsUpdatingId(item.id);
      const result = await markDirectMealPlanItemDone(item);
      setItems((current) => current.map((currentItem) => (currentItem.id === result.item.id ? normalizeMealPlanItem(result.item) : currentItem)));
      setNotice({ type: "success", title: result.already_done ? "Meal already done" : "Meal marked done", description: result.already_done ? "No duplicate calorie log was created." : `${item.food_name} was added to logged calories.` });
    } catch (error) {
      setNotice({ type: "error", title: "Could not mark meal done", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  async function removeItem(item: MealPlanItem) {
    try {
      setIsUpdatingId(item.id);
      await deleteDirectMealPlanItem(item);
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setNotice({ title: "Meal removed", type: "success", description: item.status === "done" ? "Linked food log was kept to avoid hiding eaten calories." : "Planned meal was removed." });
    } catch (error) {
      setNotice({ title: "Could not remove meal", type: "error", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
  }

  function startEditing(item: MealPlanItem) {
    setEditingId(item.id);
    setEditDraft({
      foodName: item.food_name,
      mealType: normalizeMealPlanType(item.meal_type),
      quantity: String(item.quantity || 1),
      servingInfo: item.serving_size || "1 serving",
      calories: String(toNumber(item.calories)),
      protein: String(toNumber(item.protein_g)),
      carbs: String(toNumber(item.carbs_g)),
      fat: String(toNumber(item.fat_g)),
      notes: item.notes ?? ""
    });
  }

  async function saveEdit(item: MealPlanItem) {
    if (!user?.id) return;
    try {
      setIsUpdatingId(item.id);
      const updated = await updateDirectMealPlanItem(user.id, item.id, {
        date: selectedDate,
        mealType: editDraft.mealType,
        foodName: editDraft.foodName,
        quantity: Number(editDraft.quantity),
        servingInfo: editDraft.servingInfo,
        calories: Number(editDraft.calories),
        protein: Number(editDraft.protein),
        carbs: Number(editDraft.carbs),
        fat: Number(editDraft.fat),
        notes: editDraft.notes.trim() || null
      });
      setItems((current) => current.map((currentItem) => (currentItem.id === item.id ? normalizeMealPlanItem(updated) : currentItem)));
      setEditingId(null);
      setNotice({ title: "Meal updated", type: "success", description: `${updated.food_name} is now in ${displayMealType(updated.meal_type)}.` });
    } catch (error) {
      setNotice({ title: "Could not update meal", type: "error", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsUpdatingId(null);
    }
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-5 w-5" /> Meal calendar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Meal Plan for {longDate(selectedDate)}</h2>
              <p className="text-sm text-muted-foreground">Planned food counts only after you press Mark done.</p>
            </div>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{displayDate(selectedDate)} meals</h2>
          <p className="text-sm text-muted-foreground">Breakfast, lunch, dinner, and snacks for the selected date.</p>
        </div>
        <Button type="button" onClick={() => setShowAddForm((current) => !current)}>
          <PlusCircle className="h-4 w-4" /> {showAddForm ? "Hide add food" : "Add food"}
        </Button>
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
            editingId={editingId}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            updatingId={isUpdatingId}
          />
        ))}
      </div>
    </div>
  );
}

function CompactCalendar({ month, selectedDate, plannedDates, onMonthChange, onSelectDate }: { month: string; selectedDate: string; plannedDates: string[]; onMonthChange: (date: string) => void; onSelectDate: (date: string) => void }) {
  const days = calendarDays(month);
  const planned = new Set(plannedDates);
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <Button size="icon" variant="ghost" type="button" onClick={() => onMonthChange(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <p className="font-semibold">{new Date(`${month}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
        <Button size="icon" variant="ghost" type="button" onClick={() => onMonthChange(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isCurrentMonth = day.slice(0, 7) === month.slice(0, 7);
          const isSelected = day === selectedDate;
          const isToday = day === todayIso();
          const hasPlan = planned.has(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDate(day)}
              className={`relative rounded-md border px-1 py-2 text-sm transition ${isSelected ? "border-primary bg-primary text-primary-foreground" : isToday ? "border-primary/60 bg-primary/10" : "border-transparent hover:bg-muted"} ${isCurrentMonth ? "" : "opacity-40"}`}
            >
              {Number(day.slice(-2))}
              {hasPlan ? <span className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-primary"}`} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MealForm({ title, draft, setDraft, onSave, onCancel, saving }: { title: string; draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Input value={draft.foodName} onChange={(e) => setDraft((d) => ({ ...d, foodName: e.target.value }))} placeholder="Food name" />
        <select value={draft.mealType} onChange={(e) => setDraft((d) => ({ ...d, mealType: normalizeMealPlanType(e.target.value) }))} className="h-10 rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
          {mealTypes.map((type) => <option key={type} value={type}>{displayMealType(type)}</option>)}
        </select>
        <Input type="number" min="0.1" step="0.1" value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))} placeholder="Quantity" />
        <Input value={draft.servingInfo} onChange={(e) => setDraft((d) => ({ ...d, servingInfo: e.target.value }))} placeholder="Serving info" />
        <Input type="number" min="0" value={draft.calories} onChange={(e) => setDraft((d) => ({ ...d, calories: e.target.value }))} placeholder="Calories" />
        <Input type="number" min="0" value={draft.protein} onChange={(e) => setDraft((d) => ({ ...d, protein: e.target.value }))} placeholder="Protein g" />
        <Input type="number" min="0" value={draft.carbs} onChange={(e) => setDraft((d) => ({ ...d, carbs: e.target.value }))} placeholder="Carbs g" />
        <Input type="number" min="0" value={draft.fat} onChange={(e) => setDraft((d) => ({ ...d, fat: e.target.value }))} placeholder="Fat g" />
        <Input className="xl:col-span-2" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Notes" />
        <div className="flex gap-2 xl:col-span-2">
          <Button type="button" onClick={onSave} disabled={saving}><Save className="h-4 w-4" /> Save</Button>
          <Button type="button" variant="outline" onClick={onCancel}><X className="h-4 w-4" /> Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, detail, suffix = " kcal" }: { label: string; value: number; detail: string; suffix?: string }) {
  return <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{Math.round(toNumber(value))}{suffix}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></CardContent></Card>;
}

function MealColumn(props: { type: MealType; items: MealPlanItem[]; onAdd: () => void; onDone: (item: MealPlanItem) => void; onDelete: (item: MealPlanItem) => void; onStartEdit: (item: MealPlanItem) => void; onSaveEdit: (item: MealPlanItem) => void; onCancelEdit: () => void; editingId: string | null; editDraft: Draft; setEditDraft: Dispatch<SetStateAction<Draft>>; updatingId: string | null }) {
  const { type, items, onAdd, onDone, onDelete, onStartEdit, onSaveEdit, onCancelEdit, editingId, editDraft, setEditDraft, updatingId } = props;
  const totals = items.reduce((sum, item) => ({ calories: sum.calories + toNumber(item.calories), protein_g: sum.protein_g + toNumber(item.protein_g) }), { calories: 0, protein_g: 0 });
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base"><span className="flex items-center gap-2"><Utensils className="h-4 w-4" /> {displayMealType(type)}</span><div className="flex items-center gap-2"><Badge variant="outline">{items.length}</Badge><Button type="button" size="icon" variant="ghost" onClick={onAdd}><PlusCircle className="h-4 w-4" /></Button></div></CardTitle>
        <p className="text-xs text-muted-foreground">{Math.round(totals.calories)} kcal | {Math.round(totals.protein_g)}g protein</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!items.length ? <p className="text-sm text-muted-foreground">No food planned yet.</p> : null}
        {items.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <div key={item.id} className="rounded-md border bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-sm">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold leading-5">{item.food_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.quantity}x {item.serving_size}</p><p className="mt-1 text-xs text-muted-foreground">{Math.round(toNumber(item.calories))} kcal | {Math.round(toNumber(item.protein_g))}g protein</p></div><Badge variant={item.status === "done" ? "success" : "outline"}>{item.status}</Badge></div>
              {isEditing ? (
                <MealForm title="Edit planned food" draft={editDraft} setDraft={setEditDraft} onSave={() => onSaveEdit(item)} onCancel={onCancelEdit} saving={updatingId === item.id} />
              ) : (
                <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2"><Button type="button" size="sm" onClick={() => onDone(item)} disabled={item.status === "done" || updatingId === item.id}><CheckCircle2 className="h-4 w-4" />{item.status === "done" ? "Done" : "Mark done"}</Button><Button type="button" size="icon" variant="ghost" onClick={() => onStartEdit(item)} disabled={updatingId === item.id}><Edit3 className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" onClick={() => onDelete(item)} disabled={updatingId === item.id}><Trash2 className="h-4 w-4" /></Button></div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
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
function toNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function safeDate(value: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; }
function monthStart(date: string) { return `${date.slice(0, 7)}-01`; }
function addDays(date: string, days: number) { const next = new Date(`${date}T00:00:00`); next.setDate(next.getDate() + days); return next.toISOString().slice(0, 10); }
function addMonths(date: string, months: number) { const next = new Date(`${monthStart(date)}T00:00:00`); next.setMonth(next.getMonth() + months); return next.toISOString().slice(0, 10); }
function calendarRangeStart(month: string) { const first = new Date(`${monthStart(month)}T00:00:00`); first.setDate(first.getDate() - first.getDay()); return first.toISOString().slice(0, 10); }
function calendarRangeEnd(month: string) { return addDays(calendarRangeStart(month), 41); }
function calendarDays(month: string) { const start = calendarRangeStart(month); return Array.from({ length: 42 }, (_, index) => addDays(start, index)); }
function longDate(date: string) { return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); }
function displayDate(date: string) { return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
