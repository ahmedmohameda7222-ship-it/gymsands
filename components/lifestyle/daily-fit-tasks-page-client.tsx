"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import {
  deleteDailyFitTask,
  getDailyFitTasks,
  upsertDailyFitTask,
  type DailyFitTaskInput
} from "@/services/database/wellness";
import type { DailyFitTask } from "@/types";

const starterTasks = ["Drink water", "Take supplements", "Walk or move", "Stretch 10 min", "Hit protein goal"];
const emptyDraft = { id: "", title: "", notes: "" };

export function DailyFitTasksPageClient() {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const today = useTodayDate();
  const [items, setItems] = useState<DailyFitTask[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoadError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const tasks = await getDailyFitTasks(userId, today);
      setItems(tasks);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load daily fit tasks.";
      setLoadError(message);
      toast({ title: "Could not load daily fit tasks", description: message });
    } finally {
      setIsLoading(false);
    }
  }, [toast, today, userId]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  async function saveTask(title = draft.title, notes = draft.notes) {
    if (!user?.id) return toast({ title: "Sign in required", description: "Please sign in before saving daily tasks." });
    const cleanTitle = title.trim();
    if (!cleanTitle) return toast({ title: "Task required", description: "Enter a task title before saving." });

    const existing = items.find((item) => item.id === draft.id);
    const payload: DailyFitTaskInput = {
      id: draft.id || undefined,
      user_id: user.id,
      task_date: today,
      title: cleanTitle,
      notes: notes.trim(),
      completed: existing?.completed ?? false
    };

    setIsSaving(true);
    try {
      const saved = await upsertDailyFitTask(payload);
      setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      setDraft(emptyDraft);
      setLoadError(null);
    } catch (error) {
      toast({ title: "Could not save task", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleTask(item: DailyFitTask) {
    try {
      const saved = await upsertDailyFitTask({ ...item, completed: !item.completed });
      setItems((current) => current.map((task) => task.id === saved.id ? saved : task));
    } catch (error) {
      toast({ title: "Could not update task", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  async function removeTask(item: DailyFitTask) {
    if (!user?.id) return;
    try {
      await deleteDailyFitTask(user.id, item.id);
      setItems((current) => current.filter((task) => task.id !== item.id));
    } catch (error) {
      toast({ title: "Could not delete task", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  const doneCount = items.filter((i) => i.completed).length;
  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <Card className="solid-tracking-card shadow-luxe">
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <CardTitle>Daily Fit Tasks</CardTitle>
        <p className="text-sm text-muted-foreground">Today's fitness to-do list for movement, meals, recovery, and consistency.</p>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Task" value={draft.title} onChange={(title) => setDraft((current) => ({ ...current, title }))} />
          <Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} />
          <Button className="self-end h-12" onClick={() => saveTask()} disabled={!draft.title.trim() || isSaving}>
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : draft.id ? "Update" : "Save"}
          </Button>
        </div>

        {items.length > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{doneCount}/{items.length} completed</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {isLoading ? <p className="text-sm text-muted-foreground">Loading today's tasks...</p> : null}

        {loadError ? (
          <div className="solid-row border-destructive bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">Daily Fit Tasks could not load</p>
            <p className="mt-1">{loadError}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3 h-10" onClick={loadTasks}>
              <RefreshCcw className="h-4 w-4" /> Retry
            </Button>
          </div>
        ) : null}

        {!isLoading && !loadError && !items.length ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">No tasks saved for today. Start with one simple action.</p>
            <div className="flex flex-wrap gap-2">
              {starterTasks.map((task) => (
                <Button key={task} variant="outline" size="sm" onClick={() => saveTask(task, "")}>
                  <Plus className="h-4 w-4" /> {task}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {!loadError ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="solid-row p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm sm:text-base">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.notes || "Today"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${item.completed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {item.completed ? "Done" : "Open"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" className="h-11" variant={item.completed ? "outline" : "default"} onClick={() => toggleTask(item)}>
                    <CheckCircle2 className="h-4 w-4" /> {item.completed ? "Reopen" : "Mark done"}
                  </Button>
                  <Button type="button" size="sm" className="h-11" variant="outline" onClick={() => setDraft({ id: item.id, title: item.title, notes: item.notes ?? "" })}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button type="button" size="sm" className="h-11" variant="outline" onClick={() => removeTask(item)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="h-11" />
    </label>
  );
}
