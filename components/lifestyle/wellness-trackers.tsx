"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, Clock, Moon, Pencil, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { todayIso } from "@/lib/utils";
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
  buildDailyChecklist,
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

const today = todayIso();
const starterTasks = ["Drink water", "Take supplements", "Walk or move", "Stretch 10 min", "Hit protein goal"];
const starterHabits = ["Water", "Sleep", "Steps", "Protein goal", "Workout done", "Calories logged"];
const recordTypes = ["1RM", "Max weight", "Max reps", "Best set"];
const ratingOptions = ["1", "2", "3", "4", "5"];

export function WellnessDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
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
  }, [toast, user?.id]);

  const checklist = buildDailyChecklist({ nutrition, habits, supplements, sleep: sleepLogs, workoutActivity: workouts });
  const readiness = calculateReadiness(sleepLogs);
  const completedCount = checklist.filter((item) => item.complete).length;

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
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Daily checklist" value={`${completedCount}/${checklist.length}`} detail="Real wellness items completed today" />
        <Metric title="Readiness" value={readiness.value === null ? "Not enough data" : `${readiness.value}%`} detail={readiness.detail} />
        <Metric title="Notifications" value={notificationState} detail="Browser-only reminders, no native push logic" />
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Consolidated daily wellness checklist</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {checklist.map((item) => <div key={item.label} className="rounded-md border p-3"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{item.label}</p><Badge variant={item.complete ? "success" : "outline"}>{item.complete ? "Done" : "Missing"}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{item.detail}</p></div>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /> Browser reminders</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {notificationState === "unsupported" ? <p className="text-sm text-muted-foreground">Browser notifications are not supported here.</p> : <Button variant="outline" onClick={askNotifications}>Ask browser permission</Button>}
          <div className="grid gap-3 md:grid-cols-3">
            {reminders.map((reminder, index) => <div key={reminder.type} className="rounded-md border p-3"><label className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{reminder.label}</span><input type="checkbox" checked={reminder.enabled} onChange={(event) => updateReminder(index, { enabled: event.target.checked })} disabled={notificationState !== "granted"} /></label><Input className="mt-2" type="time" value={reminder.time} onChange={(event) => updateReminder(index, { time: event.target.value })} disabled={notificationState !== "granted"} /><p className="mt-2 text-xs text-muted-foreground">Optional browser reminder. It will not work like native app push notifications.</p></div>)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function DailyFitTasksTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<DailyFitTask[]>([]);
  const [draft, setDraft] = useState({ id: "", title: "", notes: "" });

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setItems(await getDailyFitTasks(user.id, today));
    }
    load().catch((error) => toast({ title: "Could not load tasks", description: error instanceof Error ? error.message : "Please try again." }));
  }, [toast, user?.id]);

  async function saveTask(title = draft.title, notes = draft.notes) {
    if (!user?.id) return;
    const payload: DailyFitTaskInput = { id: draft.id || undefined, user_id: user.id, task_date: today, title, notes, completed: items.find((item) => item.id === draft.id)?.completed ?? false };
    const saved = await upsertDailyFitTask(payload);
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    setDraft({ id: "", title: "", notes: "" });
    toast({ title: "Task saved", description: saved.title });
  }

  async function toggleTask(item: DailyFitTask) { const saved = await upsertDailyFitTask({ ...item, completed: !item.completed }); setItems((current) => current.map((task) => task.id === saved.id ? saved : task)); }
  async function removeTask(item: DailyFitTask) { if (!user?.id) return; await deleteDailyFitTask(user.id, item.id); setItems((current) => current.filter((task) => task.id !== item.id)); }

  return <TrackerShell title="Daily Fit Tasks" description="Today's fitness to-do list for movement, meals, recovery, and consistency."><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Field label="Task" value={draft.title} onChange={(title) => setDraft((current) => ({ ...current, title }))} /><Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} /><Button className="self-end" onClick={() => saveTask()} disabled={!draft.title.trim()}><Save className="h-4 w-4" /> Save</Button></div>{!items.length ? <div className="flex flex-wrap gap-2">{starterTasks.map((task) => <Button key={task} variant="outline" size="sm" onClick={() => saveTask(task, "")}><Plus className="h-4 w-4" />{task}</Button>)}</div> : null}<ItemGrid>{items.map((item) => <ActionCard key={item.id} title={item.title} detail={item.notes || "Today"} done={item.completed} onToggle={() => toggleTask(item)} onEdit={() => setDraft({ id: item.id, title: item.title, notes: item.notes ?? "" })} onDelete={() => removeTask(item)} />)}</ItemGrid></TrackerShell>;
}

export function HabitsTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<FitnessHabit[]>([]);
  const [history, setHistory] = useState<FitnessHabit[]>([]);
  const [draft, setDraft] = useState({ id: "", name: "", notes: "" });

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      const [todayItems, historical] = await Promise.all([getFitnessHabits(user.id, today), getFitnessHabitHistory(user.id, 30)]);
      setItems(todayItems);
      setHistory(historical);
    }
    load().catch((error) => toast({ title: "Could not load habits", description: error instanceof Error ? error.message : "Please try again." }));
  }, [toast, user?.id]);

  async function saveHabit(name = draft.name, notes = draft.notes) {
    if (!user?.id) return;
    const payload: FitnessHabitInput = { id: draft.id || undefined, user_id: user.id, habit_date: today, name, notes, completed: items.find((item) => item.id === draft.id)?.completed ?? false };
    const saved = await upsertFitnessHabit(payload);
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    setHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setDraft({ id: "", name: "", notes: "" });
  }

  async function toggleHabit(item: FitnessHabit) { const saved = await upsertFitnessHabit({ ...item, completed: !item.completed }); setItems((current) => current.map((habit) => habit.id === saved.id ? saved : habit)); setHistory((current) => [saved, ...current.filter((habit) => habit.id !== saved.id)]); }
  async function removeHabit(item: FitnessHabit) { if (!user?.id) return; await deleteFitnessHabit(user.id, item.id); setItems((current) => current.filter((habit) => habit.id !== item.id)); setHistory((current) => current.filter((habit) => habit.id !== item.id)); }

  const habitNames = Array.from(new Set(history.map((habit) => habit.name)));

  return <TrackerShell title="Habits" description="Track daily behaviors that support training, nutrition, hydration, and recovery."><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Field label="Habit" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} /><Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} /><Button className="self-end" onClick={() => saveHabit()} disabled={!draft.name.trim()}><Save className="h-4 w-4" />Save</Button></div>{!items.length ? <div className="flex flex-wrap gap-2">{starterHabits.map((habit) => <Button key={habit} variant="outline" size="sm" onClick={() => saveHabit(habit, "")}><Plus className="h-4 w-4" />{habit}</Button>)}</div> : null}<ItemGrid>{items.map((item) => <ActionCard key={item.id} title={item.name} detail={item.notes || "Today"} done={item.completed} onToggle={() => toggleHabit(item)} onEdit={() => setDraft({ id: item.id, name: item.name, notes: item.notes ?? "" })} onDelete={() => removeHabit(item)} />)}</ItemGrid><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{habitNames.map((name) => <HabitStreakCard key={name} name={name} records={history.filter((habit) => habit.name === name).map((habit) => ({ date: habit.habit_date, completed: habit.completed }))} />)}{!habitNames.length ? <p className="text-sm text-muted-foreground">No habit history yet. Complete real habits to build streaks.</p> : null}</div></TrackerShell>;
}

function HabitStreakCard({ name, records }: { name: string; records: Array<{ date: string; completed: boolean }> }) {
  const stats = calculateStreakStats(records);
  return <div className="rounded-md border p-3"><p className="font-semibold">{name}</p><p className="mt-1 text-sm text-muted-foreground">Current streak {stats.currentStreak} days | Best {stats.bestStreak} days | Missed {stats.missedDays}</p><div className="mt-3 flex flex-wrap gap-1">{stats.history.slice(-14).map((day) => <span key={day.date} title={day.date} className={`h-3 w-3 rounded-sm ${day.completed ? "bg-primary" : "bg-slate-200"}`} />)}</div></div>;
}

export function SupplementsTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
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
  }, [toast, user?.id]);

  async function saveSupplement() { if (!user?.id) return; const payload: SupplementLogInput = { id: draft.id || undefined, user_id: user.id, supplement_date: today, name: draft.name, dose: draft.dose, time: draft.time, reminder: draft.reminder, taken_today: items.find((item) => item.id === draft.id)?.taken_today ?? false }; const saved = await upsertSupplementLog(payload); setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))); setHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)]); setDraft({ id: "", name: "", dose: "", time: "", reminder: "" }); }
  async function toggleSupplement(item: SupplementLog) { const saved = await upsertSupplementLog({ ...item, taken_today: !item.taken_today }); setItems((current) => current.map((supplement) => supplement.id === saved.id ? saved : supplement)); setHistory((current) => [saved, ...current.filter((supplement) => supplement.id !== saved.id)]); }
  async function removeSupplement(item: SupplementLog) { if (!user?.id) return; await deleteSupplementLog(user.id, item.id); setItems((current) => current.filter((supplement) => supplement.id !== item.id)); setHistory((current) => current.filter((supplement) => supplement.id !== item.id)); }

  const adherence = calculateSupplementAdherence(history);

  return <TrackerShell title="Supplements" description="Plan supplement dose, time, reminder, and taken status for today."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]"><Field label="Supplement name" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} /><Field label="Dose" value={draft.dose} onChange={(dose) => setDraft((current) => ({ ...current, dose }))} /><Field label="Time" type="time" value={draft.time} onChange={(time) => setDraft((current) => ({ ...current, time }))} /><Field label="Reminder note" value={draft.reminder} onChange={(reminder) => setDraft((current) => ({ ...current, reminder }))} /><Button className="self-end" onClick={saveSupplement} disabled={!draft.name.trim()}><Save className="h-4 w-4" />Save</Button></div><ItemGrid>{items.map((item) => <ActionCard key={item.id} title={item.name} detail={[item.dose, item.time, item.reminder].filter(Boolean).join(" | ") || "Today"} done={item.taken_today} onToggle={() => toggleSupplement(item)} onEdit={() => setDraft({ id: item.id, name: item.name, dose: item.dose ?? "", time: item.time ?? "", reminder: item.reminder ?? "" })} onDelete={() => removeSupplement(item)} />)}</ItemGrid><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{adherence.map((item) => <div key={item.name} className="rounded-md border p-3"><p className="font-semibold">{item.name}</p><p className="text-sm text-muted-foreground">Taken {item.taken}/{item.total} logged days | {item.adherence}% adherence</p></div>)}{!adherence.length ? <p className="text-sm text-muted-foreground">No supplement adherence history yet.</p> : null}</div></TrackerShell>;
}

export function SleepRecoveryTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<EnhancedSleepRecoveryLog[]>([]);
  const [draft, setDraft] = useState({ id: "", hours_slept: "", sleep_quality: "", bedtime: "", wake_time: "", recovery_level: "", fatigue_level: "", soreness_level: "", stress_level: "", notes: "" });

  useEffect(() => {
    async function load() { if (!user?.id) return; setItems(await getSleepRecoveryHistory(user.id, 30)); }
    load().catch((error) => toast({ title: "Could not load recovery logs", description: error instanceof Error ? error.message : "Please try again." }));
  }, [toast, user?.id]);

  async function saveLog() {
    if (!user?.id) return;
    const saved = await upsertEnhancedSleepRecoveryLog({ id: draft.id || undefined, user_id: user.id, log_date: today, hours_slept: draft.hours_slept ? Number(draft.hours_slept) : null, sleep_quality: draft.sleep_quality, bedtime: draft.bedtime, wake_time: draft.wake_time, recovery_level: draft.recovery_level, fatigue_level: draft.fatigue_level, soreness_level: draft.soreness_level, stress_level: draft.stress_level, notes: draft.notes });
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setDraft({ id: "", hours_slept: "", sleep_quality: "", bedtime: "", wake_time: "", recovery_level: "", fatigue_level: "", soreness_level: "", stress_level: "", notes: "" });
  }

  async function removeLog(item: SleepRecoveryLog) { if (!user?.id) return; await deleteSleepRecoveryLog(user.id, item.id); setItems((current) => current.filter((log) => log.id !== item.id)); }
  const readiness = calculateReadiness(items);
  const averageSleep = items.filter((item) => typeof item.hours_slept === "number").length >= 2 ? Math.round(items.filter((item) => typeof item.hours_slept === "number").reduce((sum, item) => sum + Number(item.hours_slept), 0) / items.filter((item) => typeof item.hours_slept === "number").length * 10) / 10 : null;

  return <TrackerShell title="Sleep & Recovery" description="Log sleep duration, quality, soreness, fatigue, stress, and recovery notes. Ratings use 1-5 simple mobile-friendly inputs."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric title="Average sleep" value={averageSleep === null ? "Not enough data" : `${averageSleep}h`} detail="Recent real sleep logs only" /><Metric title="Readiness" value={readiness.value === null ? "Not enough data" : `${readiness.value}%`} detail={readiness.detail} /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Hours slept" type="number" value={draft.hours_slept} onChange={(hours_slept) => setDraft((current) => ({ ...current, hours_slept }))} /><Field label="Sleep quality" value={draft.sleep_quality} onChange={(sleep_quality) => setDraft((current) => ({ ...current, sleep_quality }))} placeholder="good, fair, poor, or 1-5" /><Field label="Bedtime" type="time" value={draft.bedtime} onChange={(bedtime) => setDraft((current) => ({ ...current, bedtime }))} /><Field label="Wake time" type="time" value={draft.wake_time} onChange={(wake_time) => setDraft((current) => ({ ...current, wake_time }))} /><SelectField label="Recovery 1-5" value={draft.recovery_level} values={ratingOptions} onChange={(recovery_level) => setDraft((current) => ({ ...current, recovery_level }))} /><SelectField label="Fatigue 1-5" value={draft.fatigue_level} values={ratingOptions} onChange={(fatigue_level) => setDraft((current) => ({ ...current, fatigue_level }))} /><SelectField label="Soreness 1-5" value={draft.soreness_level} values={ratingOptions} onChange={(soreness_level) => setDraft((current) => ({ ...current, soreness_level }))} /><SelectField label="Stress 1-5" value={draft.stress_level} values={ratingOptions} onChange={(stress_level) => setDraft((current) => ({ ...current, stress_level }))} /><Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} /></div><Button onClick={saveLog}><Save className="h-4 w-4" />Save Recovery Log</Button><ItemGrid>{items.map((item) => <ActionCard key={item.id} title={`${item.log_date} | ${item.hours_slept ?? "No"} hours`} detail={[item.bedtime ? `Bed ${item.bedtime}` : null, item.wake_time ? `Wake ${item.wake_time}` : null, item.sleep_quality, item.recovery_level ? `Recovery ${item.recovery_level}` : null, item.fatigue_level ? `Fatigue ${item.fatigue_level}` : null, item.soreness_level ? `Soreness ${item.soreness_level}` : null, item.stress_level ? `Stress ${item.stress_level}` : null, item.notes].filter(Boolean).join(" | ") || "Recovery log"} onEdit={() => setDraft({ id: item.id, hours_slept: item.hours_slept === null ? "" : String(item.hours_slept), sleep_quality: item.sleep_quality ?? "", bedtime: item.bedtime ?? "", wake_time: item.wake_time ?? "", recovery_level: item.recovery_level ?? "", fatigue_level: item.fatigue_level ?? "", soreness_level: item.soreness_level ?? "", stress_level: item.stress_level ?? "", notes: item.notes ?? "" })} onDelete={() => removeLog(item)} />)}</ItemGrid></TrackerShell>;
}

export function PersonalRecordsTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<PersonalRecord[]>([]);
  const [draft, setDraft] = useState({ id: "", exercise_name: "", record_type: "Max weight", weight_kg: "", reps: "", record_date: today, notes: "" });

  useEffect(() => {
    async function load() { if (!user?.id) return; setItems(await getPersonalRecords(user.id)); }
    load().catch((error) => toast({ title: "Could not load records", description: error instanceof Error ? error.message : "Please try again." }));
  }, [toast, user?.id]);
  async function saveRecord() { if (!user?.id) return; const payload: PersonalRecordInput = { id: draft.id || undefined, user_id: user.id, exercise_name: draft.exercise_name, record_type: draft.record_type, weight_kg: draft.weight_kg ? Number(draft.weight_kg) : null, reps: draft.reps ? Number(draft.reps) : null, record_date: draft.record_date || today, notes: draft.notes }; const saved = await upsertPersonalRecord(payload); setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => a.exercise_name.localeCompare(b.exercise_name) || b.record_date.localeCompare(a.record_date))); setDraft({ id: "", exercise_name: "", record_type: "Max weight", weight_kg: "", reps: "", record_date: today, notes: "" }); }
  async function removeRecord(item: PersonalRecord) { if (!user?.id) return; await deletePersonalRecord(user.id, item.id); setItems((current) => current.filter((record) => record.id !== item.id)); }
  return <TrackerShell title="Personal Records" description="Track best lifts, reps, and custom exercise milestones."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Exercise name" value={draft.exercise_name} onChange={(exercise_name) => setDraft((current) => ({ ...current, exercise_name }))} /><SelectField label="Record type" value={draft.record_type} values={recordTypes} onChange={(record_type) => setDraft((current) => ({ ...current, record_type }))} /><Field label="Weight kg" type="number" value={draft.weight_kg} onChange={(weight_kg) => setDraft((current) => ({ ...current, weight_kg }))} /><Field label="Reps" type="number" value={draft.reps} onChange={(reps) => setDraft((current) => ({ ...current, reps }))} /><Field label="Date" type="date" value={draft.record_date} onChange={(record_date) => setDraft((current) => ({ ...current, record_date }))} /><Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} /><Button className="self-end" onClick={saveRecord} disabled={!draft.exercise_name.trim()}><Save className="h-4 w-4" />Save Record</Button></div><ItemGrid>{items.map((item) => <ActionCard key={item.id} title={`${item.exercise_name} | ${item.record_type}`} detail={[item.weight_kg ? `${item.weight_kg} kg` : null, item.reps ? `${item.reps} reps` : null, item.record_date, item.notes].filter(Boolean).join(" | ")} onEdit={() => setDraft({ id: item.id, exercise_name: item.exercise_name, record_type: item.record_type, weight_kg: item.weight_kg === null ? "" : String(item.weight_kg), reps: item.reps === null ? "" : String(item.reps), record_date: item.record_date, notes: item.notes ?? "" })} onDelete={() => removeRecord(item)} />)}</ItemGrid></TrackerShell>;
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) { return <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></CardContent></Card>; }
function TrackerShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <Card><CardHeader><CardTitle>{title}</CardTitle><p className="text-sm text-muted-foreground">{description}</p></CardHeader><CardContent className="space-y-4">{children}</CardContent></Card>; }
function ItemGrid({ children }: { children: React.ReactNode }) { return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>; }
function ActionCard({ title, detail, done, onToggle, onEdit, onDelete }: { title: string; detail: string; done?: boolean; onToggle?: () => void; onEdit: () => void; onDelete: () => void }) { return <div className="rounded-md border bg-card p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-foreground">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div>{typeof done === "boolean" ? <Badge variant={done ? "success" : "outline"}>{done ? "Done" : "Open"}</Badge> : null}</div><div className="mt-3 flex flex-wrap gap-2">{onToggle ? <Button size="sm" variant={done ? "secondary" : "outline"} onClick={onToggle}><CheckCircle2 className="h-4 w-4" />{done ? "Reopen" : "Mark Done"}</Button> : null}<Button size="sm" variant="outline" onClick={onEdit}><Pencil className="h-4 w-4" />Edit</Button><Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" />Delete</Button></div></div>; }
function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) { return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder ?? label} /></div>; }
function SelectField({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) { return <div className="space-y-2"><Label>{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className="flex h-11 w-full rounded-md border bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Choose</option>{values.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>; }
function startOfWeek(value: string) { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() - date.getDay()); return date.toISOString().slice(0, 10); }
