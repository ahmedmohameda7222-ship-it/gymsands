"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { todayIso } from "@/lib/utils";
import {
  deleteDailyFitTask,
  deleteFitnessHabit,
  deletePersonalRecord,
  deleteSleepRecoveryLog,
  deleteSupplementLog,
  getDailyFitTasks,
  getFitnessHabits,
  getPersonalRecords,
  getSleepRecoveryLogs,
  getSupplementLogs,
  upsertDailyFitTask,
  upsertFitnessHabit,
  upsertPersonalRecord,
  upsertSleepRecoveryLog,
  upsertSupplementLog,
  type DailyFitTaskInput,
  type FitnessHabitInput,
  type PersonalRecordInput,
  type SleepRecoveryInput,
  type SupplementLogInput
} from "@/services/database/repository";
import type { DailyFitTask, FitnessHabit, PersonalRecord, SleepRecoveryLog, SupplementLog } from "@/types";

const today = todayIso();

const starterTasks = ["Drink 2L water", "Take supplements", "Walk 8000 steps", "Stretch 10 min", "Hit protein goal"];
const starterHabits = ["Water", "Sleep", "Steps", "Protein goal", "Workout done", "Calories logged"];
const recordTypes = ["1RM", "Max weight", "Max reps", "Best set"];

export function DailyFitTasksTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<DailyFitTask[]>([]);
  const [draft, setDraft] = useState({ id: "", title: "", notes: "" });

  async function load() {
    if (!user?.id) return;
    setItems(await getDailyFitTasks(user.id, today));
  }

  useEffect(() => {
    load().catch((error) => toast({ title: "Could not load tasks", description: error instanceof Error ? error.message : "Please try again." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function saveTask(title = draft.title, notes = draft.notes) {
    if (!user?.id) return;
    const payload: DailyFitTaskInput = {
      id: draft.id || undefined,
      user_id: user.id,
      task_date: today,
      title,
      notes,
      completed: items.find((item) => item.id === draft.id)?.completed ?? false
    };
    const saved = await upsertDailyFitTask(payload);
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    setDraft({ id: "", title: "", notes: "" });
    toast({ title: "Task saved", description: saved.title });
  }

  async function toggleTask(item: DailyFitTask) {
    const saved = await upsertDailyFitTask({ ...item, completed: !item.completed });
    setItems((current) => current.map((task) => (task.id === saved.id ? saved : task)));
  }

  async function removeTask(item: DailyFitTask) {
    if (!user?.id) return;
    await deleteDailyFitTask(user.id, item.id);
    setItems((current) => current.filter((task) => task.id !== item.id));
  }

  return (
    <TrackerShell title="Daily Fit Tasks" description="Today's fitness to-do list for movement, meals, recovery, and consistency.">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Field label="Task" value={draft.title} onChange={(title) => setDraft((current) => ({ ...current, title }))} />
        <Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} />
        <Button className="self-end" onClick={() => saveTask()} disabled={!draft.title.trim()}>
          <Save className="h-4 w-4" />
          Save
        </Button>
      </div>
      {!items.length ? (
        <div className="flex flex-wrap gap-2">
          {starterTasks.map((task) => (
            <Button key={task} variant="outline" size="sm" onClick={() => saveTask(task, "")}>
              <Plus className="h-4 w-4" />
              {task}
            </Button>
          ))}
        </div>
      ) : null}
      <ItemGrid>
        {items.map((item) => (
          <ActionCard key={item.id} title={item.title} detail={item.notes || "Today"} done={item.completed} onToggle={() => toggleTask(item)} onEdit={() => setDraft({ id: item.id, title: item.title, notes: item.notes ?? "" })} onDelete={() => removeTask(item)} />
        ))}
      </ItemGrid>
    </TrackerShell>
  );
}

export function HabitsTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<FitnessHabit[]>([]);
  const [draft, setDraft] = useState({ id: "", name: "", notes: "" });

  async function load() {
    if (!user?.id) return;
    setItems(await getFitnessHabits(user.id, today));
  }

  useEffect(() => {
    load().catch((error) => toast({ title: "Could not load habits", description: error instanceof Error ? error.message : "Please try again." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function saveHabit(name = draft.name, notes = draft.notes) {
    if (!user?.id) return;
    const payload: FitnessHabitInput = {
      id: draft.id || undefined,
      user_id: user.id,
      habit_date: today,
      name,
      notes,
      completed: items.find((item) => item.id === draft.id)?.completed ?? false
    };
    const saved = await upsertFitnessHabit(payload);
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    setDraft({ id: "", name: "", notes: "" });
  }

  async function toggleHabit(item: FitnessHabit) {
    const saved = await upsertFitnessHabit({ ...item, completed: !item.completed });
    setItems((current) => current.map((habit) => (habit.id === saved.id ? saved : habit)));
  }

  async function removeHabit(item: FitnessHabit) {
    if (!user?.id) return;
    await deleteFitnessHabit(user.id, item.id);
    setItems((current) => current.filter((habit) => habit.id !== item.id));
  }

  return (
    <TrackerShell title="Habits" description="Track daily behaviors that support training, nutrition, hydration, and recovery.">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Field label="Habit" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
        <Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} />
        <Button className="self-end" onClick={() => saveHabit()} disabled={!draft.name.trim()}>
          <Save className="h-4 w-4" />
          Save
        </Button>
      </div>
      {!items.length ? (
        <div className="flex flex-wrap gap-2">
          {starterHabits.map((habit) => (
            <Button key={habit} variant="outline" size="sm" onClick={() => saveHabit(habit, "")}>
              <Plus className="h-4 w-4" />
              {habit}
            </Button>
          ))}
        </div>
      ) : null}
      <ItemGrid>
        {items.map((item) => (
          <ActionCard key={item.id} title={item.name} detail={item.notes || "Today"} done={item.completed} onToggle={() => toggleHabit(item)} onEdit={() => setDraft({ id: item.id, name: item.name, notes: item.notes ?? "" })} onDelete={() => removeHabit(item)} />
        ))}
      </ItemGrid>
    </TrackerShell>
  );
}

export function SupplementsTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<SupplementLog[]>([]);
  const [draft, setDraft] = useState({ id: "", name: "", dose: "", time: "", reminder: "" });

  async function load() {
    if (!user?.id) return;
    setItems(await getSupplementLogs(user.id, today));
  }

  useEffect(() => {
    load().catch((error) => toast({ title: "Could not load supplements", description: error instanceof Error ? error.message : "Please try again." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function saveSupplement() {
    if (!user?.id) return;
    const payload: SupplementLogInput = {
      id: draft.id || undefined,
      user_id: user.id,
      supplement_date: today,
      name: draft.name,
      dose: draft.dose,
      time: draft.time,
      reminder: draft.reminder,
      taken_today: items.find((item) => item.id === draft.id)?.taken_today ?? false
    };
    const saved = await upsertSupplementLog(payload);
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")));
    setDraft({ id: "", name: "", dose: "", time: "", reminder: "" });
  }

  async function toggleSupplement(item: SupplementLog) {
    const saved = await upsertSupplementLog({ ...item, taken_today: !item.taken_today });
    setItems((current) => current.map((supplement) => (supplement.id === saved.id ? saved : supplement)));
  }

  async function removeSupplement(item: SupplementLog) {
    if (!user?.id) return;
    await deleteSupplementLog(user.id, item.id);
    setItems((current) => current.filter((supplement) => supplement.id !== item.id));
  }

  return (
    <TrackerShell title="Supplements" description="Plan supplement dose, time, reminder, and taken status for today.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <Field label="Supplement name" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
        <Field label="Dose" value={draft.dose} onChange={(dose) => setDraft((current) => ({ ...current, dose }))} />
        <Field label="Time" value={draft.time} onChange={(time) => setDraft((current) => ({ ...current, time }))} />
        <Field label="Reminder" value={draft.reminder} onChange={(reminder) => setDraft((current) => ({ ...current, reminder }))} />
        <Button className="self-end" onClick={saveSupplement} disabled={!draft.name.trim()}>
          <Save className="h-4 w-4" />
          Save
        </Button>
      </div>
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
    </TrackerShell>
  );
}

export function SleepRecoveryTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<SleepRecoveryLog[]>([]);
  const [draft, setDraft] = useState({ id: "", hours_slept: "", sleep_quality: "", recovery_level: "", fatigue_level: "", soreness_level: "", notes: "" });

  async function load() {
    if (!user?.id) return;
    setItems(await getSleepRecoveryLogs(user.id));
  }

  useEffect(() => {
    load().catch((error) => toast({ title: "Could not load recovery logs", description: error instanceof Error ? error.message : "Please try again." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function saveLog() {
    if (!user?.id) return;
    const payload: SleepRecoveryInput = {
      id: draft.id || undefined,
      user_id: user.id,
      log_date: today,
      hours_slept: draft.hours_slept ? Number(draft.hours_slept) : null,
      sleep_quality: draft.sleep_quality,
      recovery_level: draft.recovery_level,
      fatigue_level: draft.fatigue_level,
      soreness_level: draft.soreness_level,
      notes: draft.notes
    };
    const saved = await upsertSleepRecoveryLog(payload);
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setDraft({ id: "", hours_slept: "", sleep_quality: "", recovery_level: "", fatigue_level: "", soreness_level: "", notes: "" });
  }

  async function removeLog(item: SleepRecoveryLog) {
    if (!user?.id) return;
    await deleteSleepRecoveryLog(user.id, item.id);
    setItems((current) => current.filter((log) => log.id !== item.id));
  }

  return (
    <TrackerShell title="Sleep & Recovery" description="Log sleep, soreness, fatigue, mobility readiness, and recovery notes.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Hours slept" type="number" value={draft.hours_slept} onChange={(hours_slept) => setDraft((current) => ({ ...current, hours_slept }))} />
        <Field label="Sleep quality" value={draft.sleep_quality} onChange={(sleep_quality) => setDraft((current) => ({ ...current, sleep_quality }))} placeholder="Poor, fair, good, excellent" />
        <Field label="Recovery level" value={draft.recovery_level} onChange={(recovery_level) => setDraft((current) => ({ ...current, recovery_level }))} />
        <Field label="Fatigue level" value={draft.fatigue_level} onChange={(fatigue_level) => setDraft((current) => ({ ...current, fatigue_level }))} />
        <Field label="Soreness level" value={draft.soreness_level} onChange={(soreness_level) => setDraft((current) => ({ ...current, soreness_level }))} />
        <Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} />
      </div>
      <Button onClick={saveLog}>
        <Save className="h-4 w-4" />
        Save Recovery Log
      </Button>
      <ItemGrid>
        {items.map((item) => (
          <ActionCard
            key={item.id}
            title={`${item.log_date} | ${item.hours_slept ?? "No"} hours`}
            detail={[item.sleep_quality, item.recovery_level, item.fatigue_level, item.soreness_level, item.notes].filter(Boolean).join(" | ") || "Recovery log"}
            onEdit={() => setDraft({
              id: item.id,
              hours_slept: item.hours_slept === null ? "" : String(item.hours_slept),
              sleep_quality: item.sleep_quality ?? "",
              recovery_level: item.recovery_level ?? "",
              fatigue_level: item.fatigue_level ?? "",
              soreness_level: item.soreness_level ?? "",
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
  const [items, setItems] = useState<PersonalRecord[]>([]);
  const [draft, setDraft] = useState({ id: "", exercise_name: "", record_type: "Max weight", weight_kg: "", reps: "", record_date: today, notes: "" });

  async function load() {
    if (!user?.id) return;
    setItems(await getPersonalRecords(user.id));
  }

  useEffect(() => {
    load().catch((error) => toast({ title: "Could not load records", description: error instanceof Error ? error.message : "Please try again." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

  return (
    <TrackerShell title="Personal Records" description="Track best lifts, reps, and custom exercise milestones.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Exercise name" value={draft.exercise_name} onChange={(exercise_name) => setDraft((current) => ({ ...current, exercise_name }))} />
        <SelectField label="Record type" value={draft.record_type} values={recordTypes} onChange={(record_type) => setDraft((current) => ({ ...current, record_type }))} />
        <Field label="Weight kg" type="number" value={draft.weight_kg} onChange={(weight_kg) => setDraft((current) => ({ ...current, weight_kg }))} />
        <Field label="Reps" type="number" value={draft.reps} onChange={(reps) => setDraft((current) => ({ ...current, reps }))} />
        <Field label="Date" type="date" value={draft.record_date} onChange={(record_date) => setDraft((current) => ({ ...current, record_date }))} />
        <Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} />
        <Button className="self-end" onClick={saveRecord} disabled={!draft.exercise_name.trim()}>
          <Save className="h-4 w-4" />
          Save Record
        </Button>
      </div>
      <ItemGrid>
        {items.map((item) => (
          <ActionCard
            key={item.id}
            title={`${item.exercise_name} | ${item.record_type}`}
            detail={[item.weight_kg ? `${item.weight_kg} kg` : null, item.reps ? `${item.reps} reps` : null, item.record_date, item.notes].filter(Boolean).join(" | ")}
            onEdit={() => setDraft({
              id: item.id,
              exercise_name: item.exercise_name,
              record_type: item.record_type,
              weight_kg: item.weight_kg === null ? "" : String(item.weight_kg),
              reps: item.reps === null ? "" : String(item.reps),
              record_date: item.record_date,
              notes: item.notes ?? ""
            })}
            onDelete={() => removeRecord(item)}
          />
        ))}
      </ItemGrid>
    </TrackerShell>
  );
}

function TrackerShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function ItemGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function ActionCard({
  title,
  detail,
  done,
  onToggle,
  onEdit,
  onDelete
}: {
  title: string;
  detail: string;
  done?: boolean;
  onToggle?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
        {typeof done === "boolean" ? <Badge variant={done ? "success" : "outline"}>{done ? "Done" : "Open"}</Badge> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {onToggle ? (
          <Button size="sm" variant={done ? "secondary" : "outline"} onClick={onToggle}>
            <CheckCircle2 className="h-4 w-4" />
            {done ? "Reopen" : "Mark Done"}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder ?? label} />
    </div>
  );
}

function SelectField({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-11 w-full rounded-md border bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {values.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
    </div>
  );
}
