"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";

function key(kind: string) { return `${kind}:${crypto.randomUUID()}`; }

export function SessionCorrectionDialog({ sessionId, title, historyRevision, notes, durationMinutes, onChanged }: {
  sessionId: string; title: string; historyRevision: number; notes: string | null; durationMinutes: number | null; onChanged: () => void;
}) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(notes ?? "");
  const [duration, setDuration] = useState(durationMinutes?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  async function request(path: string, body: unknown) {
    const response = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Workout history could not be updated."); return data;
  }
  async function save() {
    setBusy(true);
    try {
      await request(`/api/workouts/history/${sessionId}/correct`, { expectedHistoryRevision: historyRevision, idempotencyKey: key("history-correct"), sessionPatch: { notes: note || null, durationMinutes: duration ? Number(duration) : null }, setOperations: [] });
      setOpen(false); toast({ title: "Workout updated", description: "The completed session summary was corrected." }); onChanged();
    } catch (error) { toast({ title: "Correction failed", description: error instanceof Error ? error.message : "Try again.", variant: "error" }); } finally { setBusy(false); }
  }
  async function restore(deleteKey: string) {
    try { await request(`/api/workouts/history/${sessionId}/restore`, { idempotencyKey: `history-restore:${deleteKey}` }); toast({ title: "Workout restored" }); onChanged(); }
    catch (error) { toast({ title: "Restore failed", description: error instanceof Error ? error.message : "Try again.", variant: "error" }); }
  }
  async function remove() {
    if (!window.confirm(`Delete ${title}?\nThis removes the session from workout history and may change statistics and personal records. You can restore it for 30 days.`)) return;
    const deleteKey = crypto.randomUUID(); setBusy(true);
    try {
      await request(`/api/workouts/history/${sessionId}/delete`, { idempotencyKey: `history-delete:${deleteKey}` });
      toast({ title: "Workout deleted", description: "You can restore it for 30 days.", actionLabel: "Undo", onAction: () => void restore(deleteKey) }); onChanged();
    } catch (error) { toast({ title: "Deletion failed", description: error instanceof Error ? error.message : "Try again.", variant: "error" }); } finally { setBusy(false); }
  }
  return <div className="flex flex-wrap gap-2">
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" className="min-h-12"><Pencil className="size-4" />Correct session</Button></DialogTrigger>
      <DialogContent><DialogHeader><DialogTitle>Correct completed workout</DialogTitle><DialogDescription>Update the saved duration or note. Planned prescription remains unchanged.</DialogDescription></DialogHeader>
        <label className="grid gap-2 text-sm font-medium">Duration in minutes<Input inputMode="numeric" min={0} value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
        <label className="mt-3 grid gap-2 text-sm font-medium">Session note<textarea className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-sm" maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <Button type="button" className="mt-4 min-h-12 w-full" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save correction"}</Button>
      </DialogContent>
    </Dialog>
    <Button type="button" variant="destructive" className="min-h-12" disabled={busy} onClick={() => void remove()}><Trash2 className="size-4" />Delete workout</Button>
  </div>;
}
