"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CardSkeleton, ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import {
  deleteDailyFitTask,
  getDailyFitTasks,
  upsertDailyFitTask,
  type DailyFitTaskInput
} from "@/services/database/wellness";
import type { DailyFitTask } from "@/types";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";

const starterTasks = ["Drink water", "Take supplements", "Walk or move", "Stretch 10 min", "Hit protein goal"];
const emptyDraft = { id: "", title: "", notes: "" };
type SaveStatus = "idle" | "saving" | "saved" | "failed";

export function DailyFitTasksPageClient() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { toast } = useToast();
  const { dialog, ask } = useConfirm();
  const { celebrate } = useSuccessFeedback();
  const today = useTodayDate();
  const [items, setItems] = useState<DailyFitTask[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingToggleId, setPendingToggleId] = useState("");
  const [pendingStarterTitle, setPendingStarterTitle] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

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
      const tasks = await getDailyFitTasks(userId, today, { throwOnError: true });
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
    if (!cleanTitle) {
      setSaveStatus("failed");
      setSaveError("Enter a task title before saving.");
      return toast({ title: "Task required", description: "Enter a task title before saving." });
    }
    const duplicate = items.find((item) => item.title.trim().toLowerCase() === cleanTitle.toLowerCase() && item.id !== draft.id);
    if (duplicate) {
      setSaveStatus("failed");
      setSaveError(`${cleanTitle} already exists for today. Use the existing row instead.`);
      return;
    }

    const existing = items.find((item) => item.id === draft.id);
    const payload: DailyFitTaskInput = {
      id: draft.id || undefined,
      user_id: user.id,
      task_date: today,
      title: cleanTitle,
      notes: notes.trim(),
      completed: existing?.completed ?? false
    };

    setSaveStatus("saving");
    setSaveError("");
    setSavedMessage("");
    if (!draft.id) setPendingStarterTitle(cleanTitle);
    try {
      const saved = await upsertDailyFitTask(payload);
      setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      setDraft(emptyDraft);
      setLoadError(null);
      setSaveStatus("saved");
      setSavedMessage(draft.id ? "Task saved." : "Task saved.");
    } catch (error) {
      const message = messageFromError(error, "Please try again.");
      setSaveStatus("failed");
      setSaveError(`Could not save. Your draft is still here. ${message}`);
      toast({ title: "Could not save task", description: message });
    } finally {
      setPendingStarterTitle("");
    }
  }

  async function toggleTask(item: DailyFitTask) {
    if (pendingToggleId || removingId) return;
    const previousItems = items;
    const optimistic = { ...item, completed: !item.completed, updated_at: new Date().toISOString() };
    setPendingToggleId(item.id);
    setRowError(null);
    setItems((current) => current.map((task) => task.id === item.id ? optimistic : task));
    try {
      const saved = await upsertDailyFitTask({ ...item, completed: !item.completed });
      setItems((current) => current.map((task) => task.id === saved.id ? saved : task));
      if (!item.completed) celebrate("Task complete");
    } catch (error) {
      const message = messageFromError(error, "Please try again.");
      setItems(previousItems);
      setRowError({ id: item.id, message: `Could not update task. Restored previous state. ${message}` });
      toast({ title: "Could not update task", description: message });
    } finally {
      setPendingToggleId("");
    }
  }

  async function removeTask(item: DailyFitTask) {
    if (!user?.id) return;
    ask({
      title: "Remove this task from today?",
      description: `${item.title} will be removed from today's checklist.`,
      variant: "destructive",
      confirmLabel: "Remove task",
      onConfirm: async () => {
        const previousItems = items;
        try {
          setRemovingId(item.id);
          setRowError(null);
          setItems((current) => current.filter((task) => task.id !== item.id));
          await deleteDailyFitTask(user.id, item.id);
          if (draft.id === item.id) setDraft(emptyDraft);
          toast({ title: "Task removed", description: "Today's checklist was updated." });
        } catch (error) {
          const message = messageFromError(error, "Please try again.");
          setItems(previousItems);
          setRowError({ id: item.id, message: `Task was not removed. ${message}` });
          toast({ title: "Could not remove task", description: message });
        } finally {
          setRemovingId("");
        }
      }
    });
  }

  const doneCount = items.filter((i) => i.completed).length;
  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const nextOpenTask = items.find((item) => !item.completed);

  return (
    <Card className="shadow-luxe">
      {dialog}
      <CardHeader className="p-4 pb-0 sm:p-5 sm:pb-0">
        <CardTitle>Daily Fit Tasks</CardTitle>
        <p className="text-sm text-muted-foreground">Today's fitness to-do list for movement, meals, recovery, and consistency.</p>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {items.length > 0 && (
          <div className="glass-card p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Today</p>
                <p className="text-sm text-muted-foreground">{doneCount}/{items.length} completed{nextOpenTask ? ` - Next: ${nextOpenTask.title}` : ""}</p>
              </div>
              <span className="text-sm font-semibold text-foreground">{progress}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {isLoading ? <CardSkeleton rows={4} /> : null}

        {loadError ? (
          <ErrorState title="Daily Fit Tasks could not load" description={`${loadError} Your saved tasks were not changed.`} onRetry={loadTasks} className="[&_button]:h-12" />
        ) : null}

        {draft.id ? (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-foreground">Editing task: {draft.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">Save changes when ready, or cancel to keep the current task unchanged.</p>
            <Button type="button" variant="outline" className="mt-3 h-12" onClick={() => { setDraft(emptyDraft); setSaveError(""); setSaveStatus("idle"); }}>
              Cancel edit
            </Button>
          </div>
        ) : null}

        {saveError ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{saveError}</p> : null}
        {savedMessage && saveStatus === "saved" ? <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{savedMessage}</p> : null}

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Task" value={draft.title} onChange={(title) => setDraft((current) => ({ ...current, title }))} />
          <Field label="Notes" value={draft.notes} onChange={(notes) => setDraft((current) => ({ ...current, notes }))} />
          <Button className="self-end h-12" onClick={() => saveTask()} disabled={!draft.title.trim() || saveStatus === "saving"}>
            <Save className="h-4 w-4" />
            {saveStatus === "saving" ? "Saving task" : draft.id ? "Save changes" : "Save"}
          </Button>
        </div>

        {!isLoading && !loadError && !items.length ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Start with one small task for today.</p>
            <div className="flex flex-wrap gap-2">
              {starterTasks.map((task) => (
                <Button key={task} variant="outline" className="h-12" onClick={() => saveTask(task, "")} disabled={saveStatus === "saving" || pendingStarterTitle === task || items.some((item) => item.title.trim().toLowerCase() === task.toLowerCase())}>
                  <Plus className="h-4 w-4" /> {pendingStarterTitle === task ? "Saving" : task}
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
                {rowError?.id === item.id ? <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">{rowError.message}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" className="h-12" variant={item.completed ? "outline" : "default"} onClick={() => toggleTask(item)} disabled={pendingToggleId === item.id || removingId === item.id}>
                    <CheckCircle2 className="h-4 w-4" /> {pendingToggleId === item.id ? "Saving" : item.completed ? "Reopen" : "Mark done"}
                  </Button>
                  <Button type="button" className="h-12" variant="outline" onClick={() => { setDraft({ id: item.id, title: item.title, notes: item.notes ?? "" }); setSaveError(""); setSaveStatus("idle"); }} disabled={pendingToggleId === item.id || removingId === item.id}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button type="button" className="h-12" variant="outline" onClick={() => removeTask(item)} disabled={pendingToggleId === item.id || removingId === item.id}>
                    <Trash2 className="h-4 w-4" /> {removingId === item.id ? "Removing" : "Remove"}
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
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="h-12" />
    </label>
  );
}

function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
