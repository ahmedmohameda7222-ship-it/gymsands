"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CanonicalPersonalRecordEvent, ManualPersonalRecordInput, PersonalRecordLineageDetail } from "@/lib/personal-records/contracts";
import { usePersonalRecordsTranslation } from "@/lib/i18n/personal-records";
import { editManualPersonalRecord, getPersonalRecordLineage, removeManualPersonalRecord } from "@/services/personal-records/client";
import { ManualRecordDialog } from "./manual-record-dialog";
import { contextLabel, formatRecordDate, formatRecordValue, recordDefinitionLabel } from "./record-presentation";

export function PersonalRecordDetailPage({ lineageId, selectedEventId }: { lineageId: string; selectedEventId?: string | null }) {
  const router = useRouter();
  const { language, dir, locale, pr } = usePersonalRecordsTranslation();
  const [data, setData] = useState<PersonalRecordLineageDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "gone">("loading");
  const [message, setMessage] = useState("");
  const [editEvent, setEditEvent] = useState<CanonicalPersonalRecordEvent | null>(null);
  const [deleteEvent, setDeleteEvent] = useState<CanonicalPersonalRecordEvent | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [moreStatus, setMoreStatus] = useState<"idle" | "loading" | "failed">("idle");

  const load = useCallback(async () => {
    setStatus("loading"); setMessage("");
    try { setData(await getPersonalRecordLineage(lineageId, { event: selectedEventId, limit: 20 })); setStatus("ready"); }
    catch (error) { const text = error instanceof Error ? error.message : pr("loadFailedDescription"); setMessage(text); setStatus(text.includes("no longer") ? "gone" : "failed"); }
  }, [lineageId, pr, selectedEventId]);
  useEffect(() => { void load(); }, [load]);

  async function save(input: ManualPersonalRecordInput) {
    if (!input.eventId) throw new Error(pr("required"));
    await editManualPersonalRecord({ ...input, eventId: input.eventId });
    setEditEvent(null); await load();
  }
  async function confirmDelete() {
    if (!deleteEvent) return;
    setDeletePending(true);
    try {
      await removeManualPersonalRecord(deleteEvent.eventId); setDeleteEvent(null);
      const refreshed = await getPersonalRecordLineage(lineageId, { limit: 20 }).catch(() => null);
      if (!refreshed) router.push("/personal-records"); else { setData(refreshed); setStatus("ready"); }
    } catch { setMessage(pr("deleteFailed")); }
    finally { setDeletePending(false); }
  }
  async function loadEarlier() {
    if (!data?.nextCursor) return;
    setMoreStatus("loading");
    try { const next = await getPersonalRecordLineage(lineageId, { cursor: data.nextCursor, limit: 20 }); setData({ ...data, history: [...data.history, ...next.history], nextCursor: next.nextCursor }); setMoreStatus("idle"); }
    catch { setMoreStatus("failed"); }
  }

  if (status === "loading") return <main dir={dir} className="mx-auto max-w-3xl animate-pulse space-y-5"><div className="h-12 w-48 rounded-xl bg-muted" /><div className="h-52 rounded-2xl bg-muted" /><div className="h-72 rounded-2xl bg-muted" /></main>;
  if (status === "gone") return <main dir={dir} className="mx-auto max-w-3xl"><div className="rounded-2xl border p-8"><h1 className="text-2xl font-semibold">{pr("noLongerAvailable")}</h1><Button asChild className="mt-5 min-h-12"><Link href="/personal-records">{pr("back")}</Link></Button></div></main>;
  if (status === "failed" || !data) return <main dir={dir} className="mx-auto max-w-3xl"><div className="rounded-2xl border p-8"><h1 className="text-2xl font-semibold">{pr("loadFailed")}</h1><p className="mt-2 text-muted-foreground">{message}</p><Button className="mt-5 min-h-12" onClick={load}>{pr("retry")}</Button></div></main>;

  const { lineage } = data;
  return <main dir={dir} className="mx-auto max-w-3xl space-y-8 pb-12">
    <Link href="/personal-records" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{pr("back")}</Link>
    <header className="border-b pb-6"><p className="text-sm font-semibold text-primary">{lineage.subject.sportName ?? pr("uncategorized")}</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{lineage.subject.name}</h1><p className="mt-2 text-muted-foreground">{recordDefinitionLabel(lineage.definition.key, lineage.definition.label, language)}</p></header>
    <section aria-labelledby="current-best" className="space-y-4"><h2 id="current-best" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{pr("currentBest")}</h2><p className="text-4xl font-bold tracking-tight sm:text-5xl"><bdi>{formatRecordValue(lineage.currentBest, locale, pr)}</bdi></p>{lineage.currentBest.context.length ? <dl className="flex flex-wrap gap-x-6 gap-y-2">{lineage.currentBest.context.map((item) => <div key={item.key}><dt className="sr-only">{pr("context")}</dt><dd className="text-sm text-muted-foreground">{contextLabel(item, locale, pr)}</dd></div>)}</dl> : null}<p className="text-sm text-muted-foreground">{formatRecordDate(lineage.currentBest.achievedAt, locale)} · {pr(lineage.currentBest.source)}</p>{lineage.previousBest ? <div className="rounded-xl bg-muted p-4"><p className="text-sm text-muted-foreground">{pr("previousBest")}</p><p className="mt-1 text-lg font-semibold"><bdi>{formatRecordValue(lineage.previousBest, locale, pr)}</bdi></p></div> : null}{lineage.currentBest.sourceWorkoutId ? <Button asChild variant="outline" className="min-h-12"><Link href={`/workout-history/${lineage.currentBest.sourceWorkoutId}`}><ExternalLink className="h-4 w-4" />{pr("sourceWorkout")}</Link></Button> : null}</section>
    <section aria-labelledby="record-history"><h2 id="record-history" className="text-xl font-semibold">{pr("history")}</h2><div className="mt-3 divide-y rounded-2xl border bg-card px-4 sm:px-5">{data.history.map((event) => <article key={event.eventId} className={event.eventId === data.selectedEventId ? "-mx-4 bg-primary/5 px-4 py-4 sm:-mx-5 sm:px-5" : "py-4"}><div className="flex items-start justify-between gap-4"><div><p className="text-xl font-semibold"><bdi>{formatRecordValue(event, locale, pr)}</bdi></p><p className="mt-1 text-sm text-muted-foreground">{formatRecordDate(event.achievedAt, locale)} · {pr(event.source)}</p>{event.eventId === data.selectedEventId ? <p className="mt-1 text-xs font-medium text-primary">{pr("focusEvent")}</p> : null}</div>{event.editable ? <div className="flex gap-1"><Button size="icon" variant="ghost" className="min-h-11 min-w-11" aria-label={`${pr("edit")} ${event.subject.name}`} onClick={() => setEditEvent(event)}><MoreHorizontal className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="min-h-11 min-w-11 text-destructive" aria-label={`${pr("delete")} ${event.subject.name}`} onClick={() => setDeleteEvent(event)}><span aria-hidden>×</span></Button></div> : null}</div>{event.notes ? <p className="mt-3 text-sm">{event.notes}</p> : null}</article>)}</div>{data.nextCursor ? <div className="mt-4 text-center"><Button variant="outline" className="min-h-12" onClick={loadEarlier} disabled={moreStatus === "loading"}>{moreStatus === "loading" ? pr("loading") : pr("loadEarlier")}</Button>{moreStatus === "failed" ? <p role="alert" className="mt-2 text-sm text-destructive">{pr("paginationFailed")}</p> : null}</div> : null}</section>
    {message ? <p role="status" className="text-sm text-destructive">{message}</p> : null}
    <ManualRecordDialog open={Boolean(editEvent)} event={editEvent} onOpenChange={(open) => !open && setEditEvent(null)} onSave={save} />
    <Dialog open={Boolean(deleteEvent)} onOpenChange={(open) => !deletePending && !open && setDeleteEvent(null)}><DialogContent dir={dir} closeLabel={pr("close")} className="sm:max-w-md"><DialogHeader><DialogTitle>{pr("deleteTitle")}</DialogTitle><DialogDescription>{pr("deleteDescription")}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="ghost" className="min-h-12" onClick={() => setDeleteEvent(null)} disabled={deletePending}>{pr("cancel")}</Button><Button variant="destructive" className="min-h-12" onClick={confirmDelete} disabled={deletePending}>{pr("confirmDelete")}</Button></div></DialogContent></Dialog>
  </main>;
}
