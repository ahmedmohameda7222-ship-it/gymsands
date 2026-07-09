"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, MoreHorizontal, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CardSkeleton, ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { getNutritionWeek } from "@/services/database/nutrition";
import {
  deletePersonalRecord,
  getPersonalRecords,
  upsertPersonalRecord,
  type PersonalRecordInput
} from "@/services/database/progress";
import {
  deleteDailyFitTask,
  deleteFitnessHabit,
  deleteSleepRecoveryLog,
  deleteSupplementLog,
  getDailyFitTasks,
  getFitnessHabits,
  getSupplementLogs,
  upsertDailyFitTask,
  upsertFitnessHabit,
  upsertSupplementLog,
  type DailyFitTaskInput,
  type FitnessHabitInput,
  type SupplementLogInput
} from "@/services/database/wellness";
import { getWorkoutActivity } from "@/services/database/workout-sessions";
import {
  calculateReadiness,
  calculateStreakStats,
  calculateSupplementAdherence,
  getBrowserReminders,
  getFitnessHabitHistory,
  getSleepRecoveryHistory,
  getSupplementHistory,
  requestNotificationPermission,
  saveBrowserReminders,
  upsertEnhancedSleepRecoveryLog,
  type BrowserReminder,
  type EnhancedSleepRecoveryLog
} from "@/services/wellness/wellness-data";
import type { DailyFitTask, FitnessHabit, PersonalRecord, SleepRecoveryLog, SupplementLog } from "@/types";

const starterTasks = ["Drink water", "Take supplements", "Walk or move", "Stretch 10 min", "Hit protein goal"];
const starterHabits = ["Water", "Sleep", "Steps", "Protein goal", "Workout done", "Calories logged"];
const recordTypes = ["1RM", "Max weight", "Max reps", "Best set"];
const ratingOptions = ["1", "2", "3", "4", "5"];
type SaveStatus = "idle" | "saving" | "saved" | "failed";

export function WellnessDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = useTodayDate();
  const [habits, setHabits] = useState<FitnessHabit[]>([]);
  const [supplements, setSupplements] = useState<SupplementLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<EnhancedSleepRecoveryLog[]>([]);
  const [nutrition, setNutrition] = useState<Awaited<ReturnType<typeof getNutritionWeek>>[number] | null>(null);
  const [workouts, setWorkouts] = useState<Awaited<ReturnType<typeof getWorkoutActivity>>>([]);
  const [reminders, setReminders] = useState<BrowserReminder[]>([]);
  const [notificationState, setNotificationState] = useState("unchecked");

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      const weekStart = startOfWeek(today);
      const [todayHabits, todaySupplements, sleepHistory, weekNutrition, workoutActivity] = await Promise.all([
        getFitnessHabits(user.id, today),
        getSupplementLogs(user.id, today),
        getSleepRecoveryHistory(user.id, 14),
        getNutritionWeek(user.id, weekStart),
        getWorkoutActivity(user.id)
      ]);
      setHabits(todayHabits);
      setSupplements(todaySupplements);
      setSleepLogs(sleepHistory);
      setNutrition(weekNutrition.find((day) => day.date === today) ?? null);
      setWorkouts(workoutActivity);
      setReminders(getBrowserReminders(user.id));
      if (typeof window !== "undefined" && "Notification" in window) setNotificationState(Notification.permission);
      else setNotificationState("unsupported");
    }
    load().catch((error) => toast({ title: "Could not load wellness dashboard", description: error instanceof Error ? error.message : "Please try again." }));
  }, [toast, today, user?.id]);

  const readiness = calculateReadiness(sleepLogs);
  const recoverySuggestions = buildRecoverySuggestions(readiness, sleepLogs);
  const habitRescue = buildHabitRescue(habits);

  async function askNotifications() {
    const result = await requestNotificationPermission();
    setNotificationState(result);
    if (result === "granted") toast({ title: "Browser reminders enabled", description: "Reminders are optional and controlled in this browser." });
  }

  function updateReminder(index: number, patch: Partial<BrowserReminder>) {
    const next = reminders.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    setReminders(saveBrowserReminders(user?.id, next));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric title="Readiness" value={readiness.value === null ? "Not enough data" : `${readiness.value}%`} detail={readiness.detail} />
        <Metric title="Notifications" value={notificationState} detail="Browser-only reminders, no native push logic" />
      </div>
      <Card variant="glass" className="shadow-luxe">
        <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
          <CardTitle className="text-sm font-medium">Recovery-aware suggestions</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {recoverySuggestions.map((item) => (
              <div key={item.title} className="solid-row p-3">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card variant="glass" className="shadow-luxe">
        <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
          <CardTitle className="text-sm font-medium">Habit streak rescue</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <div className="solid-row p-3">
            <p className="text-sm font-semibold">{habitRescue.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{habitRescue.detail}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="shadow-luxe">
        <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Bell className="h-4 w-4 text-primary" />
            Browser reminders
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {notificationState === "unsupported" ? (
            <p className="text-sm text-muted-foreground">Browser notifications are not supported here.</p>
          ) : (
            <Button variant="outline" size="sm" onClick={askNotifications}>Ask browser permission</Button>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {reminders.map((reminder, index) => (
              <div key={reminder.type} className="solid-row p-3">
                <label className="flex items-center justify-between gap-2 text-sm font-semibold">
                  <span>{reminder.label}</span>
                  <input
                    type="checkbox"
                    checked={reminder.enabled}
                    onChange={(event) => updateReminder(index, { enabled: event.target.checked })}
                    disabled={notificationState !== "granted"}
                  />
                </label>
                <Input className="mt-2 h-10" type="time" value={reminder.time} onChange={(event) => updateReminder(index, { time: event.target.value })} disabled={notificationState !== "granted"} />
                <p className="mt-2 text-xs text-muted-foreground">Optional browser reminder. It will not work like native app push notifications.</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function buildRecoverySuggestions(readiness: ReturnType<typeof calculateReadiness>, logs: EnhancedSleepRecoveryLog[]) {
  const latest = logs[0];
  if (!latest || readiness.value === null) {
    return [
      { title: "Data insufficient", detail: "Save sleep plus at least one fatigue, soreness, stress, or recovery rating to unlock cautious training guidance." },
      { title: "Keep it simple", detail: "Use a normal warmup and avoid training through sharp pain. This is general fitness guidance, not medical advice." }
    ];
  }

  const fatigue = Number(latest.fatigue_level);
  const soreness = Number(latest.soreness_level);
  const lowSleep = typeof latest.hours_slept === "number" && latest.hours_slept < 6;
  const highFatigue = Number.isFinite(fatigue) && fatigue >= 4;
  const highSoreness = Number.isFinite(soreness) && soreness >= 4;

  if (readiness.value < 45 || lowSleep || highFatigue || highSoreness) {
    return [
      { title: "Ease intensity", detail: "Consider lighter loads, fewer hard sets, or a recovery day because saved recovery data is low today." },
      { title: "Warm up longer", detail: "Add extra ramp-up sets and mobility before heavy work. Stop if discomfort becomes sharp or unusual." },
      { title: "Hydration and protein focus", detail: "Prioritize water and a protein-forward meal to support recovery from normal training stress." }
    ];
  }

  if (readiness.value < 70) {
    return [
      { title: "Moderate day", detail: "Train normally but leave a little room in reserve. Saved recovery data is okay, not excellent." },
      { title: "Watch form", detail: "Use controlled reps and avoid adding weight if reps feel slower than usual." }
    ];
  }

  return [
    { title: "Ready for normal training", detail: "Saved recovery data looks solid. Progress only if warmups and first working sets feel controlled." },
    { title: "Still log notes", detail: "Add quick notes after training so future suggestions can compare performance against recovery." }
  ];
}

function buildHabitRescue(habits: FitnessHabit[]) {
  if (!habits.length) return { title: "No habits set today", detail: "Create one small habit first, such as water, protein, sleep, or a short walk." };
  const missing = habits.filter((habit) => !habit.completed);
  if (!missing.length) return { title: "All habits done", detail: "Today's saved habits are complete. Keep tomorrow simple and repeatable." };
  const currentHour = new Date().getHours();
  const urgency = currentHour >= 20 ? "before the day ends" : "as your next small action";
  return {
    title: `${missing.length} habit${missing.length === 1 ? "" : "s"} can still be rescued`,
    detail: `${missing.slice(0, 3).map((habit) => habit.name).join(", ")} ${missing.length === 1 ? "is" : "are"} still open. Pick the easiest one ${urgency}; no native notification is assumed.`
  };
}

export function DailyFitTasksTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = useTodayDate();
  const [items, setItems] = useState<DailyFitTask[]>([]);
  const [draft, setDraft] = useState({ id: "", title: "", notes: "" });

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setItems(await getDailyFitTasks(user.id, today));
    }
    load().catch((error) => toast({ title: "Could not load daily fit tasks", description: error instanceof Error ? error.message : "Please try again." }));
  }, [toast, user?.id, today]);

  async function saveTask(title = draft.title, notes = draft.notes) {
    if (!user?.id) return;
    const payload: DailyFitTaskInput = { id: draft.id || undefined, user_id: user.id, task_date: today, title, notes, completed: items.find((item) => item.id === draft.id)?.completed ?? false };
    const saved = await upsertDailyFitTask(payload);
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    setDraft({ id: "", title: "", notes: "" });
  }

  async function toggleTask(item: DailyFitTask) {
    const saved = await upsertDailyFitTask({ ...item, completed: !item.completed });
    setItems((current) => current.map((task) => task.id === saved.id ? saved : task));
  }

  async function removeTask(item: DailyFitTask) {
    if (!user?.id) return;
    await deleteDailyFitTask(user.id, item.id);
    setItems((current) => current.filter((task) => task.id !== item.id));
  }

  const doneCount = items.filter((i) => i.completed).length;
  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <TrackerShell title="Daily Fit Tasks" description="Today's fitness to-do list for movement, meals, recovery, and consistency.">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Task" value={draft.title} onChange={(title) => setDraft((current) => ({ ...current, title }))} />
        <Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} />
        <Button className="self-end h-12" onClick={() => saveTask()} disabled={!draft.title.trim()}>
          <Save className="h-4 w-4" />
          Save
        </Button>
      </div>

      {items.length > 0 && (
        <div className="mt-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{doneCount}/{items.length} completed</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {!items.length ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No tasks saved for today. Start with one simple action.</p>
          <div className="flex flex-wrap gap-2">
            {starterTasks.map((task) => (
              <Button key={task} variant="outline" size="sm" onClick={() => saveTask(task, "")}>
                <Plus className="h-4 w-4" />
                {task}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <ItemGrid>
        {items.map((item) => (
          <ActionCard
            key={item.id}
            title={item.title}
            detail={item.notes || "Today"}
            done={item.completed}
            onToggle={() => toggleTask(item)}
            onEdit={() => setDraft({ id: item.id, title: item.title, notes: item.notes ?? "" })}
            onDelete={() => removeTask(item)}
          />
        ))}
      </ItemGrid>
    </TrackerShell>
  );
}

export function HabitsTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { dialog, ask } = useConfirm();
  const today = useTodayDate();
  const userId = user?.id ?? "";
  const [items, setItems] = useState<FitnessHabit[]>([]);
  const [history, setHistory] = useState<FitnessHabit[]>([]);
  const [draft, setDraft] = useState({ id: "", name: "", notes: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [pendingToggleId, setPendingToggleId] = useState("");
  const [pendingStarterName, setPendingStarterName] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const loadHabits = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError("");
    setHistoryError("");

    const [todayResult, historyResult] = await Promise.allSettled([
      getFitnessHabits(userId, today, { throwOnError: true }),
      getFitnessHabitHistory(userId, 30, { throwOnError: true })
    ]);

    if (todayResult.status === "fulfilled") {
      setItems(todayResult.value);
    } else {
      setItems([]);
      setLoadError(messageFromError(todayResult.reason, "Today's habits could not load."));
      setIsLoading(false);
      return;
    }

    if (historyResult.status === "fulfilled") {
      setHistory(historyResult.value);
    } else {
      setHistory(todayResult.value);
      setHistoryError(messageFromError(historyResult.reason, "Habit history could not load."));
    }

    setIsLoading(false);
  }, [today, userId]);

  useEffect(() => {
    void loadHabits();
  }, [loadHabits]);

  async function saveHabit(name = draft.name, notes = draft.notes) {
    if (!userId || saveStatus === "saving") return;
    const trimmedName = name.trim();
    const trimmedNotes = notes.trim();
    if (!trimmedName) {
      setSaveStatus("failed");
      setSaveError("Habit name is required.");
      return;
    }
    const duplicate = items.find((item) => item.name.trim().toLowerCase() === trimmedName.toLowerCase() && item.id !== draft.id);
    if (duplicate) {
      setSaveStatus("failed");
      setSaveError(`${trimmedName} already exists for today. Use the existing row instead.`);
      return;
    }

    try {
      setSaveStatus("saving");
      setSaveError("");
      setSavedMessage("");
      if (!draft.id) setPendingStarterName(trimmedName);
      const payload: FitnessHabitInput = { id: draft.id || undefined, user_id: userId, habit_date: today, name: trimmedName, notes: trimmedNotes, completed: items.find((item) => item.id === draft.id)?.completed ?? false };
      const saved = await upsertFitnessHabit(payload);
      setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      setHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft({ id: "", name: "", notes: "" });
      setSaveStatus("saved");
      setSavedMessage(draft.id ? "Habit updated." : "Habit saved.");
    } catch (error) {
      const message = messageFromError(error, "Please try again.");
      setSaveStatus("failed");
      setSaveError(`Habit was not saved. ${message}`);
      toast({ title: "Could not save habit", description: message });
    } finally {
      setPendingStarterName("");
    }
  }

  async function toggleHabit(item: FitnessHabit) {
    if (pendingToggleId || deletingId) return;
    const previousItems = items;
    const previousHistory = history;
    const optimistic = { ...item, completed: !item.completed, updated_at: new Date().toISOString() };
    setPendingToggleId(item.id);
    setRowError(null);
    setItems((current) => current.map((habit) => habit.id === item.id ? optimistic : habit));
    setHistory((current) => [optimistic, ...current.filter((habit) => habit.id !== item.id)]);
    try {
      const saved = await upsertFitnessHabit({ ...item, completed: !item.completed });
      setItems((current) => current.map((habit) => habit.id === saved.id ? saved : habit));
      setHistory((current) => [saved, ...current.filter((habit) => habit.id !== saved.id)]);
    } catch (error) {
      const message = messageFromError(error, "Restored previous status.");
      setItems(previousItems);
      setHistory(previousHistory);
      setRowError({ id: item.id, message: `Could not update habit. Restored previous status. ${message}` });
      toast({ title: "Could not update habit", description: message });
    } finally {
      setPendingToggleId("");
    }
  }

  async function removeHabit(item: FitnessHabit) {
    if (!userId) return;
    ask({
      title: "Delete this habit for today?",
      description: `${item.name} will be removed from today's habit list and habit history used for reports.`,
      variant: "destructive",
      confirmLabel: "Delete habit",
      onConfirm: async () => {
        const previousItems = items;
        const previousHistory = history;
        try {
          setDeletingId(item.id);
          setRowError(null);
          setItems((current) => current.filter((habit) => habit.id !== item.id));
          setHistory((current) => current.filter((habit) => habit.id !== item.id));
          await deleteFitnessHabit(userId, item.id);
          if (draft.id === item.id) setDraft({ id: "", name: "", notes: "" });
          toast({ title: "Habit deleted", description: "Saved habit history was updated." });
        } catch (error) {
          const message = messageFromError(error, "Please try again.");
          setItems(previousItems);
          setHistory(previousHistory);
          setRowError({ id: item.id, message: `Habit was not deleted. ${message}` });
          toast({ title: "Could not delete habit", description: message });
        } finally {
          setDeletingId("");
        }
      }
    });
  }

  const habitStreaks = useMemo(() => {
    const grouped = new Map<string, Array<{ date: string; completed: boolean }>>();
    history.forEach((habit) => {
      const name = habit.name.trim();
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(habit.habit_date)) return;
      const records = grouped.get(name) ?? [];
      if (records.length < 90) records.push({ date: habit.habit_date, completed: habit.completed });
      grouped.set(name, records);
    });
    return Array.from(grouped.entries())
      .slice(0, 24)
      .map(([name, records]) => ({ name, records }));
  }, [history]);

  const doneCount = items.filter((i) => i.completed).length;
  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const nextOpenHabit = items.find((item) => !item.completed);

  if (isLoading) {
    return (
      <TrackerShell title="Habits" description="Track daily behaviors that support training, nutrition, hydration, and recovery.">
        <CardSkeleton rows={4} />
      </TrackerShell>
    );
  }

  if (loadError) {
    return (
      <TrackerShell title="Habits" description="Track daily behaviors that support training, nutrition, hydration, and recovery.">
        <ErrorState title="Habits could not load" description={`${loadError} Your saved habits were not changed.`} onRetry={loadHabits} />
      </TrackerShell>
    );
  }

  return (
    <TrackerShell title="Habits" description="Track daily behaviors that support training, nutrition, hydration, and recovery.">
      {dialog}
      <div className="rounded-md border border-border/70 bg-card p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Today</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length ? `${doneCount}/${items.length} habits complete` : "No habits set today. Start with one small habit."}
            </p>
          </div>
          {nextOpenHabit ? <Badge variant="outline">Next: {nextOpenHabit.name}</Badge> : items.length ? <Badge variant="success">All done</Badge> : null}
        </div>
      </div>

      {draft.id ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">Editing habit: {draft.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">Changes are saved only when you press Save. Completion status is preserved.</p>
          <Button type="button" variant="outline" className="mt-3 h-12" onClick={() => { setDraft({ id: "", name: "", notes: "" }); setSaveError(""); setSaveStatus("idle"); }}>
            Cancel edit
          </Button>
        </div>
      ) : null}

      {saveError ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{saveError}</p> : null}
      {savedMessage && saveStatus === "saved" ? <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{savedMessage}</p> : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Habit" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
        <Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} />
        <Button className="self-end h-12" onClick={() => saveHabit()} disabled={!draft.name.trim() || saveStatus === "saving"}>
          <Save className="h-4 w-4" />
          {saveStatus === "saving" ? "Saving" : draft.id ? "Save changes" : "Save"}
        </Button>
      </div>

      {items.length > 0 && (
        <div className="mt-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{doneCount}/{items.length} completed</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {!items.length ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No habits set today. Create one small habit to start.</p>
          <div className="flex flex-wrap gap-2">
            {starterHabits.map((habit) => (
              <Button key={habit} variant="outline" className="h-12" onClick={() => saveHabit(habit, "")} disabled={saveStatus === "saving" || pendingStarterName === habit || items.some((item) => item.name.trim().toLowerCase() === habit.toLowerCase())}>
                <Plus className="h-4 w-4" />
                {pendingStarterName === habit ? "Saving" : habit}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <ItemGrid>
        {items.map((item) => (
          <ActionCard
            key={item.id}
            title={item.name}
            detail={item.notes || "Today"}
            done={item.completed}
            pending={pendingToggleId === item.id || deletingId === item.id}
            error={rowError?.id === item.id ? rowError.message : ""}
            onToggle={() => toggleHabit(item)}
            onEdit={() => { setDraft({ id: item.id, name: item.name, notes: item.notes ?? "" }); setSaveError(""); setSaveStatus("idle"); }}
            onDelete={() => removeHabit(item)}
          />
        ))}
      </ItemGrid>

      <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {historyError ? <ErrorState title="Habit history could not load" description={`${historyError} Today's habits are still shown.`} onRetry={loadHabits} className="sm:col-span-2 xl:col-span-3" /> : null}
        <p className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">Streaks are based on saved habit history.</p>
        {habitStreaks.map((habit) => (
          <HabitStreakCard key={habit.name} name={habit.name} records={habit.records} />
        ))}
        {!habitStreaks.length ? (
          <p className="text-sm text-muted-foreground">No habit history yet. Complete real habits to build streaks.</p>
        ) : null}
      </div>
    </TrackerShell>
  );
}

function HabitStreakCard({ name, records }: { name: string; records: Array<{ date: string; completed: boolean }> }) {
  const stats = calculateStreakStats(records);
  return (
    <div className="rounded-md border border-border/70 bg-card p-3">
      <p className="text-sm font-semibold">{name}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Current streak {stats.currentStreak} days | Best {stats.bestStreak} days | Missed {stats.missedDays}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {stats.history.slice(-14).map((day, index) => (
          <span
            key={`${name}-${day.date}-${index}`}
            role="img"
            aria-label={`${name} ${day.completed ? "completed" : "not completed"} on ${day.date}`}
            title={`${day.date}: ${day.completed ? "completed" : "not completed"}`}
            className={`h-2.5 w-2.5 rounded-sm ${day.completed ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
    </div>
  );
}

export function SupplementsTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = useTodayDate();
  const [items, setItems] = useState<SupplementLog[]>([]);
  const [history, setHistory] = useState<SupplementLog[]>([]);
  const [draft, setDraft] = useState({ id: "", name: "", dose: "", time: "", reminder: "" });

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      const [todayItems, historical] = await Promise.all([getSupplementLogs(user.id, today), getSupplementHistory(user.id, 30)]);
      setItems(todayItems);
      setHistory(historical);
    }
    load().catch((error) => toast({ title: "Could not load supplements", description: error instanceof Error ? error.message : "Please try again." }));
  }, [toast, user?.id, today]);

  async function saveSupplement() {
    if (!user?.id) return;
    const payload: SupplementLogInput = { id: draft.id || undefined, user_id: user.id, supplement_date: today, name: draft.name, dose: draft.dose, time: draft.time, reminder: draft.reminder, taken_today: items.find((item) => item.id === draft.id)?.taken_today ?? false };
    const saved = await upsertSupplementLog(payload);
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")));
    setHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setDraft({ id: "", name: "", dose: "", time: "", reminder: "" });
  }

  async function toggleSupplement(item: SupplementLog) {
    const saved = await upsertSupplementLog({ ...item, taken_today: !item.taken_today });
    setItems((current) => current.map((supplement) => supplement.id === saved.id ? saved : supplement));
    setHistory((current) => [saved, ...current.filter((supplement) => supplement.id !== saved.id)]);
  }

  async function removeSupplement(item: SupplementLog) {
    if (!user?.id) return;
    await deleteSupplementLog(user.id, item.id);
    setItems((current) => current.filter((supplement) => supplement.id !== item.id));
    setHistory((current) => current.filter((supplement) => supplement.id !== item.id));
  }

  const adherence = calculateSupplementAdherence(history);
  const takenCount = items.filter((i) => i.taken_today).length;
  const progress = items.length ? Math.round((takenCount / items.length) * 100) : 0;

  return (
    <TrackerShell title="Supplements" description="Plan supplement dose, time, reminder, and taken status for today.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <Field label="Supplement name" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
        <Field label="Dose" value={draft.dose} onChange={(dose) => setDraft((current) => ({ ...current, dose }))} />
        <Field label="Time" type="time" value={draft.time} onChange={(time) => setDraft((current) => ({ ...current, time }))} />
        <Field label="Reminder note" value={draft.reminder} onChange={(reminder) => setDraft((current) => ({ ...current, reminder }))} />
        <Button className="self-end h-12" onClick={saveSupplement} disabled={!draft.name.trim()}>
          <Save className="h-4 w-4" />
          Save
        </Button>
      </div>

      {items.length > 0 && (
        <div className="mt-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{takenCount}/{items.length} taken</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {!items.length ? (
        <p className="text-sm text-muted-foreground">No supplements today. Add your first supplement above.</p>
      ) : null}

      <ItemGrid>
        {items.map((item) => (
          <ActionCard
            key={item.id}
            title={item.name}
            detail={[item.dose, item.time, item.reminder].filter(Boolean).join(" | ") || "Today"}
            done={item.taken_today}
            onToggle={() => toggleSupplement(item)}
            onEdit={() => setDraft({ id: item.id, name: item.name, dose: item.dose ?? "", time: item.time ?? "", reminder: item.reminder ?? "" })}
            onDelete={() => removeSupplement(item)}
          />
        ))}
      </ItemGrid>

      <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {adherence.map((item) => (
          <div key={item.name} className="solid-row p-3">
            <p className="text-sm font-semibold">{item.name}</p>
            <p className="text-sm text-muted-foreground">
              Taken {item.taken}/{item.total} logged days | {item.adherence}% adherence
            </p>
          </div>
        ))}
        {!adherence.length ? (
          <p className="text-sm text-muted-foreground">No supplement adherence history yet.</p>
        ) : null}
      </div>
    </TrackerShell>
  );
}

export function SleepRecoveryTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { dialog, ask } = useConfirm();
  const today = useTodayDate();
  const userId = user?.id ?? "";
  const [items, setItems] = useState<EnhancedSleepRecoveryLog[]>([]);
  const [draft, setDraft] = useState(emptyRecoveryDraft(today));
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const loadRecovery = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError("");
    try {
      setItems(await getSleepRecoveryHistory(userId, 30, { throwOnError: true }));
    } catch (error) {
      setItems([]);
      setLoadError(messageFromError(error, "Recovery logs could not load."));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadRecovery();
  }, [loadRecovery]);

  async function saveLog() {
    if (!userId || saveStatus === "saving") return;
    const validation = validateRecoveryDraft(draft);
    if (validation) {
      setSaveStatus("failed");
      setSaveError(validation);
      return;
    }
    try {
      setSaveStatus("saving");
      setSaveError("");
      setSavedMessage("");
      const existingForDate = !draft.id ? items.find((item) => item.log_date === draft.log_date) : null;
      const saved = await upsertEnhancedSleepRecoveryLog({
        id: draft.id || existingForDate?.id || undefined,
        user_id: userId,
        log_date: draft.log_date || today,
        hours_slept: draft.hours_slept ? Number(draft.hours_slept) : null,
        sleep_quality: draft.sleep_quality,
        bedtime: draft.bedtime,
        wake_time: draft.wake_time,
        recovery_level: draft.recovery_level,
        fatigue_level: draft.fatigue_level,
        soreness_level: draft.soreness_level,
        stress_level: draft.stress_level,
        notes: draft.notes
      });
      setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => b.log_date.localeCompare(a.log_date)));
      setDraft(emptyRecoveryDraft(today));
      setSaveStatus("saved");
      setSavedMessage("Recovery log saved.");
    } catch (error) {
      const message = messageFromError(error, "Please try again.");
      setSaveStatus("failed");
      setSaveError(`Save failed. Your recovery draft is still here. ${message}`);
      toast({ title: "Could not save recovery log", description: message });
    }
  }

  async function removeLog(item: SleepRecoveryLog) {
    if (!userId) return;
    ask({
      title: "Delete this recovery log?",
      description: `Delete the recovery log from ${item.log_date}? This affects recovery history and reports.`,
      variant: "destructive",
      confirmLabel: "Delete log",
      onConfirm: async () => {
        const previousItems = items;
        try {
          setDeletingId(item.id);
          setRowError(null);
          setItems((current) => current.filter((log) => log.id !== item.id));
          await deleteSleepRecoveryLog(userId, item.id);
          if (draft.id === item.id) setDraft(emptyRecoveryDraft(today));
          toast({ title: "Recovery log deleted", description: "Saved recovery history was updated." });
        } catch (error) {
          const message = messageFromError(error, "Please try again.");
          setItems(previousItems);
          setRowError({ id: item.id, message: `Recovery log was not deleted. ${message}` });
          toast({ title: "Could not delete recovery log", description: message });
        } finally {
          setDeletingId("");
        }
      }
    });
  }

  const readiness = calculateReadiness(items);
  const averageSleep = items.filter((item) => typeof item.hours_slept === "number").length >= 2
    ? Math.round(items.filter((item) => typeof item.hours_slept === "number").reduce((sum, item) => sum + Number(item.hours_slept), 0) / items.filter((item) => typeof item.hours_slept === "number").length * 10) / 10
    : null;

  const latest = items[0];

  if (isLoading) {
    return (
      <TrackerShell title="Sleep & Recovery" description="Log sleep duration, quality, soreness, fatigue, stress, and recovery notes.">
        <CardSkeleton rows={4} />
      </TrackerShell>
    );
  }

  if (loadError) {
    return (
      <TrackerShell title="Sleep & Recovery" description="Log sleep duration, quality, soreness, fatigue, stress, and recovery notes.">
        <ErrorState title="Recovery logs could not load" description={`${loadError} Your saved recovery data was not changed.`} onRetry={loadRecovery} />
      </TrackerShell>
    );
  }

  return (
    <TrackerShell title="Sleep & Recovery" description="Log sleep duration, quality, soreness, fatigue, stress, and recovery notes.">
      {dialog}
      {/* Status at top */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric title="Average sleep" value={averageSleep === null ? "Not enough data" : `${averageSleep}h`} detail="Recent real sleep logs only" />
        <Metric title="Readiness" value={readiness.value === null ? "Not enough data" : `${readiness.value}%`} detail={readiness.detail} />
      </div>
      <p className="text-sm text-muted-foreground">Readiness is a simple non-medical estimate from saved sleep and recovery ratings. It is not diagnosis or treatment advice.</p>

      {latest ? (
        <div className="solid-row p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Latest log</p>
            <p className="text-xs text-muted-foreground">{latest.log_date}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {typeof latest.hours_slept === "number" && <span>{latest.hours_slept}h slept</span>}
            {latest.sleep_quality && <span>Quality: {latest.sleep_quality}</span>}
            {latest.bedtime && <span>Bed: {latest.bedtime}</span>}
            {latest.wake_time && <span>Wake: {latest.wake_time}</span>}
            {latest.recovery_level && <span>Recovery: {latest.recovery_level}</span>}
            {latest.fatigue_level && <span>Fatigue: {latest.fatigue_level}</span>}
            {latest.soreness_level && <span>Soreness: {latest.soreness_level}</span>}
            {latest.stress_level && <span>Stress: {latest.stress_level}</span>}
          </div>
          {latest.notes && <p className="mt-2 text-sm text-muted-foreground">{latest.notes}</p>}
        </div>
      ) : (
        <div className="rounded-md border border-border/70 bg-card p-4 text-sm text-muted-foreground">
          No recovery logs yet. Save one check-in to start average sleep and readiness context.
        </div>
      )}

      {draft.id ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">Editing recovery log from {draft.log_date}</p>
          <p className="mt-1 text-sm text-muted-foreground">The original log date is preserved unless you change the date field.</p>
          <Button type="button" variant="outline" className="mt-3 h-12" onClick={() => { setDraft(emptyRecoveryDraft(today)); setSaveError(""); setSaveStatus("idle"); }}>
            Cancel edit
          </Button>
        </div>
      ) : null}

      {saveError ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{saveError}</p> : null}
      {savedMessage && saveStatus === "saved" ? <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{savedMessage}</p> : null}

      {/* Form */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Log date" type="date" value={draft.log_date} onChange={(log_date) => setDraft((current) => ({ ...current, log_date }))} />
        <Field label="Hours slept" type="number" inputMode="decimal" enterKeyHint="done" value={draft.hours_slept} onChange={(hours_slept) => setDraft((current) => ({ ...current, hours_slept }))} />
        <Field label="Sleep quality" value={draft.sleep_quality} onChange={(sleep_quality) => setDraft((current) => ({ ...current, sleep_quality }))} placeholder="good, fair, poor, or 1-5" />
        <Field label="Bedtime" type="time" value={draft.bedtime} onChange={(bedtime) => setDraft((current) => ({ ...current, bedtime }))} />
        <Field label="Wake time" type="time" value={draft.wake_time} onChange={(wake_time) => setDraft((current) => ({ ...current, wake_time }))} />
        <SelectField label="Recovery 1-5" value={draft.recovery_level} values={ratingOptions} onChange={(recovery_level) => setDraft((current) => ({ ...current, recovery_level }))} />
        <SelectField label="Fatigue 1-5" value={draft.fatigue_level} values={ratingOptions} onChange={(fatigue_level) => setDraft((current) => ({ ...current, fatigue_level }))} />
        <SelectField label="Soreness 1-5" value={draft.soreness_level} values={ratingOptions} onChange={(soreness_level) => setDraft((current) => ({ ...current, soreness_level }))} />
        <SelectField label="Stress 1-5" value={draft.stress_level} values={ratingOptions} onChange={(stress_level) => setDraft((current) => ({ ...current, stress_level }))} />
        <Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} />
      </div>
      <p className="text-sm text-muted-foreground">Recovery: 1 = poor, 5 = strong. Fatigue, soreness, and stress: 1 = low, 5 = high.</p>
      <Button className="h-12" onClick={saveLog} disabled={saveStatus === "saving"}>
        <Save className="h-4 w-4" />
        {saveStatus === "saving" ? "Saving recovery log" : "Save Recovery Log"}
      </Button>

      <ItemGrid>
        {items.map((item) => (
          <ActionCard
            key={item.id}
            title={`${item.log_date} | ${typeof item.hours_slept === "number" ? `${item.hours_slept}h sleep` : "Sleep not logged"}`}
            detail={[
              item.bedtime ? `Bed ${item.bedtime}` : null,
              item.wake_time ? `Wake ${item.wake_time}` : null,
              item.sleep_quality,
              item.recovery_level ? `Recovery ${item.recovery_level}` : null,
              item.fatigue_level ? `Fatigue ${item.fatigue_level}` : null,
              item.soreness_level ? `Soreness ${item.soreness_level}` : null,
              item.stress_level ? `Stress ${item.stress_level}` : null,
              item.notes
            ].filter(Boolean).join(" | ") || "Recovery log"}
            pending={deletingId === item.id}
            error={rowError?.id === item.id ? rowError.message : ""}
            onEdit={() => setDraft({
              id: item.id,
              log_date: item.log_date,
              hours_slept: item.hours_slept === null ? "" : String(item.hours_slept),
              sleep_quality: item.sleep_quality ?? "",
              bedtime: item.bedtime ?? "",
              wake_time: item.wake_time ?? "",
              recovery_level: item.recovery_level ?? "",
              fatigue_level: item.fatigue_level ?? "",
              soreness_level: item.soreness_level ?? "",
              stress_level: item.stress_level ?? "",
              notes: item.notes ?? ""
            })}
            onDelete={() => removeLog(item)}
          />
        ))}
      </ItemGrid>
    </TrackerShell>
  );
}

export function PersonalRecordsTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = useTodayDate();
  const [items, setItems] = useState<PersonalRecord[]>([]);
  const [draft, setDraft] = useState({ id: "", exercise_name: "", record_type: "Max weight", weight_kg: "", reps: "", record_date: today, notes: "" });

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setItems(await getPersonalRecords(user.id));
    }
    load().catch((error) => toast({ title: "Could not load records", description: error instanceof Error ? error.message : "Please try again." }));
  }, [toast, user?.id]);

  async function saveRecord() {
    if (!user?.id) return;
    const payload: PersonalRecordInput = {
      id: draft.id || undefined,
      user_id: user.id,
      exercise_name: draft.exercise_name,
      record_type: draft.record_type,
      weight_kg: draft.weight_kg ? Number(draft.weight_kg) : null,
      reps: draft.reps ? Number(draft.reps) : null,
      record_date: draft.record_date || today,
      notes: draft.notes
    };
    const saved = await upsertPersonalRecord(payload);
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => a.exercise_name.localeCompare(b.exercise_name) || b.record_date.localeCompare(a.record_date)));
    setDraft({ id: "", exercise_name: "", record_type: "Max weight", weight_kg: "", reps: "", record_date: today, notes: "" });
  }

  async function removeRecord(item: PersonalRecord) {
    if (!user?.id) return;
    await deletePersonalRecord(user.id, item.id);
    setItems((current) => current.filter((record) => record.id !== item.id));
  }

  const groupedRecords = useMemo(() => {
    const groups = new Map<string, PersonalRecord[]>();
    items.forEach((item) => {
      const name = item.exercise_name.trim();
      if (!name) return;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(item);
    });
    return Array.from(groups.entries())
      .map(([name, records]) => ({
        name,
        records: records.sort((a, b) => b.record_date.localeCompare(a.record_date))
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  return (
    <TrackerShell title="Personal Records" description="Track best lifts, reps, and custom exercise milestones.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <Field label="Exercise" value={draft.exercise_name} onChange={(exercise_name) => setDraft((current) => ({ ...current, exercise_name }))} />
        <SelectField label="Type" value={draft.record_type} values={recordTypes} onChange={(record_type) => setDraft((current) => ({ ...current, record_type }))} />
        <Field label="Weight kg" type="number" inputMode="decimal" enterKeyHint="done" value={draft.weight_kg} onChange={(weight_kg) => setDraft((current) => ({ ...current, weight_kg }))} />
        <Field label="Reps" type="number" inputMode="numeric" enterKeyHint="done" value={draft.reps} onChange={(reps) => setDraft((current) => ({ ...current, reps }))} />
        <Field label="Date" type="date" value={draft.record_date} onChange={(record_date) => setDraft((current) => ({ ...current, record_date }))} />
        <Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} />
      </div>
      <Button className="h-12 w-full sm:w-auto" onClick={saveRecord} disabled={!draft.exercise_name.trim()}>
        <Save className="h-4 w-4" />
        {draft.id ? "Update Record" : "Save Record"}
      </Button>

      <div className="space-y-4">
        {groupedRecords.map((group) => (
          <div key={group.name} className="solid-tracking-card p-4 shadow-soft">
            <p className="text-sm font-semibold text-foreground">{group.name}</p>
            <div className="mt-2 space-y-2">
              {group.records.map((item) => (
                <div key={item.id} className="solid-row flex items-center justify-between p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{item.record_type}</span>
                      <span className="text-xs text-muted-foreground">{item.record_date}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.weight_kg ? `${item.weight_kg} kg` : null}
                      {item.reps ? ` · ${item.reps} reps` : null}
                      {item.notes ? ` · ${item.notes}` : null}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setDraft({
                      id: item.id,
                      exercise_name: item.exercise_name,
                      record_type: item.record_type,
                      weight_kg: item.weight_kg === null ? "" : String(item.weight_kg),
                      reps: item.reps === null ? "" : String(item.reps),
                      record_date: item.record_date,
                      notes: item.notes ?? ""
                    })} aria-label={`Edit ${item.exercise_name} record`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-10 w-10 text-destructive" onClick={() => removeRecord(item)} aria-label={`Delete ${item.exercise_name} record`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!groupedRecords.length && (
          <p className="text-sm text-muted-foreground">No personal records yet. Add your first record above.</p>
        )}
      </div>
    </TrackerShell>
  );
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Card variant="glass" className="shadow-luxe">
      <CardContent className="p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-bold">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function TrackerShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-luxe">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">{children}</CardContent>
    </Card>
  );
}

function ItemGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function ActionCard({
  title,
  detail,
  done,
  pending = false,
  error = "",
  onToggle,
  onEdit,
  onDelete
}: {
  title: string;
  detail: string;
  done?: boolean;
  pending?: boolean;
  error?: string;
  onToggle?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="solid-row p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground text-sm sm:text-base">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
        {typeof done === "boolean" ? (
          <Badge variant={done ? "success" : "outline"} className="shrink-0 text-xs">{done ? "Done" : "Open"}</Badge>
        ) : null}
      </div>
      {error ? <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">{error}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        {onToggle ? (
          <Button className="h-12 flex-1" variant={done ? "secondary" : "default"} onClick={onToggle} disabled={pending}>
            <CheckCircle2 className="h-4 w-4" />
            {pending ? "Saving" : done ? "Reopen" : "Mark done"}
          </Button>
        ) : null}
        <details className="relative ml-auto">
          <summary className="flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-xl border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary motion-reduce:transition-none" aria-label={`More actions for ${title}`}>
            <MoreHorizontal className="h-4 w-4" />
          </summary>
          <div className="solid-tracking-card absolute right-0 z-20 mt-2 grid w-36 gap-1 p-2">
            <Button variant="ghost" className="h-12 justify-start" onClick={onEdit} disabled={pending}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="ghost" className="h-12 justify-start text-destructive hover:text-destructive" onClick={onDelete} disabled={pending}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </details>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, inputMode, enterKeyHint }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode']; enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>['enterKeyHint'] }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <Input type={type} inputMode={inputMode} enterKeyHint={enterKeyHint} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder ?? label} className="h-12" />
    </div>
  );
}

function SelectField({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-12 w-full rounded-[14px] border bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Choose</option>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </div>
  );
}

function emptyRecoveryDraft(today: string) {
  return { id: "", log_date: today, hours_slept: "", sleep_quality: "", bedtime: "", wake_time: "", recovery_level: "", fatigue_level: "", soreness_level: "", stress_level: "", notes: "" };
}

function validateRecoveryDraft(draft: ReturnType<typeof emptyRecoveryDraft>) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.log_date)) return "Choose a valid recovery log date.";
  if (draft.hours_slept.trim()) {
    const hours = Number(draft.hours_slept);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) return "Hours slept must be between 0 and 24.";
  }
  const ratingFields = [
    ["Recovery", draft.recovery_level],
    ["Fatigue", draft.fatigue_level],
    ["Soreness", draft.soreness_level],
    ["Stress", draft.stress_level]
  ];
  const invalid = ratingFields.find(([, value]) => value && (!Number.isFinite(Number(value)) || Number(value) < 1 || Number(value) > 5));
  return invalid ? `${invalid[0]} must be rated from 1 to 5.` : "";
}

function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function startOfWeek(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}
