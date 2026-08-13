"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CanonicalPersonalRecordEvent, ManualPersonalRecordInput, PersonalRecordLineageSummary, PersonalRecordSportGroup, PersonalRecordsMainResult } from "@/lib/personal-records/contracts";
import { usePersonalRecordsTranslation } from "@/lib/i18n/personal-records";
import { addManualPersonalRecord, getPersonalRecordsMain } from "@/services/personal-records/client";
import { ManualRecordDialog } from "./manual-record-dialog";
import { contextLabel, formatRecordDate, formatRecordValue, recordDefinitionLabel } from "./record-presentation";

function LoadingProfile({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="mx-auto max-w-5xl animate-pulse space-y-8"><div className="h-24 rounded-2xl bg-muted" /><div className="h-40 rounded-2xl bg-muted" /><div className="space-y-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 rounded-xl bg-muted" />)}</div></div>;
}

function RecordValue({ event }: { event: CanonicalPersonalRecordEvent }) {
  const { locale, pr } = usePersonalRecordsTranslation();
  return <bdi className="font-semibold tabular-nums">{formatRecordValue(event, locale, pr)}</bdi>;
}

function RecordRow({ record }: { record: PersonalRecordLineageSummary }) {
  const { language, dir, locale, pr } = usePersonalRecordsTranslation();
  const context = record.currentBest.context.map((item) => contextLabel(item, locale, pr));
  return <Link href={`/personal-records/${record.lineageId}`} aria-label={`${pr("openRecord")}: ${record.subject.name}`} className="group grid min-h-24 gap-2 border-b py-4 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
    <div className="min-w-0"><p className="font-semibold leading-6">{record.subject.name}</p><p className="text-sm text-muted-foreground">{recordDefinitionLabel(record.definition.key, record.definition.label, language)}{context.length ? ` · ${context.join(" · ")}` : ""}</p></div>
    <div className="sm:text-end"><p className="text-lg"><RecordValue event={record.currentBest} /></p><p className="text-xs text-muted-foreground">{formatRecordDate(record.currentBest.achievedAt, locale)} · {pr(record.currentBest.source)}</p></div>
    <ChevronRight aria-hidden className={cn("h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5", dir === "rtl" && "rotate-180 group-hover:-translate-x-0.5")} />
  </Link>;
}

function mergeGroups(current: PersonalRecordSportGroup[], next: PersonalRecordSportGroup[]) {
  const groups = new Map(current.map((group) => [group.sportDomain ?? "__uncategorized__", { ...group, records: [...group.records] }]));
  for (const group of next) {
    const key = group.sportDomain ?? "__uncategorized__";
    const existing = groups.get(key);
    if (!existing) groups.set(key, group);
    else existing.records.push(...group.records.filter((record) => !existing.records.some((item) => item.lineageId === record.lineageId)));
  }
  return [...groups.values()];
}

export function PersonalRecordsPage() {
  const { language, dir, locale, pr } = usePersonalRecordsTranslation();
  const [data, setData] = useState<PersonalRecordsMainResult | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [message, setMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [moreStatus, setMoreStatus] = useState<"idle" | "loading" | "failed">("idle");

  const load = useCallback(async (nextSport: string | null = sport) => {
    setStatus("loading"); setMessage("");
    try { setData(await getPersonalRecordsMain({ sport: nextSport, limit: 20 })); setStatus("ready"); }
    catch (error) { setData(null); setMessage(error instanceof Error ? error.message : pr("loadFailedDescription")); setStatus("failed"); }
  }, [pr, sport]);
  useEffect(() => { void load(sport); }, [load, sport]);

  const records = useMemo(() => data?.groups.flatMap((group) => group.records) ?? [], [data]);
  async function save(input: ManualPersonalRecordInput) {
    await addManualPersonalRecord(input); await load(sport); setMessage(pr("saved"));
  }
  async function loadMore() {
    if (!data?.nextCursor || moreStatus === "loading") return;
    setMoreStatus("loading");
    try {
      const next = await getPersonalRecordsMain({ sport, cursor: data.nextCursor, limit: 20 });
      setData({ ...data, groups: mergeGroups(data.groups, next.groups), nextCursor: next.nextCursor }); setMoreStatus("idle");
    } catch { setMoreStatus("failed"); }
  }

  if (status === "loading") return <LoadingProfile label={pr("loading")} />;
  if (status === "failed") return <main dir={dir} className="mx-auto max-w-5xl py-8"><div className="rounded-2xl border p-6"><h1 className="text-xl font-semibold">{pr("loadFailed")}</h1><p className="mt-2 text-muted-foreground">{message || pr("loadFailedDescription")}</p><Button className="mt-4 min-h-12" onClick={() => load(sport)}>{pr("retry")}</Button></div></main>;

  return <main dir={dir} className="mx-auto w-full max-w-5xl space-y-8 pb-12">
    <header className="flex items-start justify-between gap-4 border-b pb-6"><div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{pr("title")}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{pr("description")}</p></div><Button className="min-h-12 shrink-0" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /><span className="sm:hidden">{pr("addShort")}</span><span className="hidden sm:inline">{pr("add")}</span></Button></header>
    {data && data.representedSports.length > 1 ? <div role="radiogroup" aria-label={pr("sport")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"><button role="radio" aria-checked={!sport} className={cn("min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium", !sport && "border-primary bg-primary text-primary-foreground")} onClick={() => setSport(null)}>{pr("all")}</button>{data.representedSports.map((item) => <button key={item.domain} role="radio" aria-checked={sport === item.domain} className={cn("min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium", sport === item.domain && "border-primary bg-primary text-primary-foreground")} onClick={() => setSport(item.domain)}>{item.name}</button>)}</div> : null}
    {data?.notices.map((notice) => <div key={notice.kind} role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">{notice.message || pr(notice.kind)}</div>)}
    {data?.latestAchievement ? <section aria-labelledby="latest-achievement" className="rounded-2xl border bg-card p-5 sm:p-6"><div className="flex items-center gap-2 text-sm font-semibold text-primary"><Trophy className="h-5 w-5" /><h2 id="latest-achievement">{pr("latest")}</h2></div><Link href={`/personal-records/${data.latestAchievement.lineageId}?event=${data.latestAchievement.eventId}`} className="mt-4 grid gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[1fr_auto] sm:items-end"><div><p className="text-lg font-semibold">{data.latestAchievement.subject.name}</p><p className="text-sm text-muted-foreground">{recordDefinitionLabel(data.latestAchievement.definition.key, data.latestAchievement.definition.label, language)}{data.latestAchievement.context.length ? ` · ${data.latestAchievement.context.map((item) => contextLabel(item, locale, pr)).join(" · ")}` : ""}</p></div><div className="sm:text-end"><p className="text-3xl font-bold tracking-tight"><RecordValue event={data.latestAchievement} /></p><p className="mt-1 text-sm text-muted-foreground">{formatRecordDate(data.latestAchievement.achievedAt, locale)} · {pr(data.latestAchievement.source)}</p></div></Link></section> : null}
    <section aria-labelledby="your-records"><h2 id="your-records" className="text-xl font-semibold">{pr("records")}</h2>{records.length ? <div className="mt-3 rounded-2xl border bg-card px-4 sm:px-5">{data?.groups.map((group) => <div key={group.sportDomain ?? "uncategorized"} className="border-b last:border-0"><h3 className="pt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.sportDomain && ["strength", "running", "cycling", "swimming", "yoga", "mobility", "pilates", "other"].includes(group.sportDomain) ? pr(group.sportDomain as "strength") : group.sportDomain ? group.sportName : pr("uncategorized")}</h3>{group.records.map((record) => <RecordRow key={record.lineageId} record={record} />)}</div>)}</div> : <div className="mt-3 rounded-2xl border border-dashed p-8 text-center"><Trophy className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">{sport ? pr("sportEmpty") : pr("emptyTitle")}</h3>{!sport ? <p className="mt-2 text-sm text-muted-foreground">{pr("emptyDescription")}</p> : null}</div>}</section>
    {data?.nextCursor ? <div className="text-center"><Button variant="outline" className="min-h-12" onClick={loadMore} disabled={moreStatus === "loading"}>{moreStatus === "loading" ? pr("loading") : pr("loadMore")}</Button>{moreStatus === "failed" ? <p role="alert" className="mt-2 text-sm text-destructive">{pr("paginationFailed")} <button className="underline" onClick={loadMore}>{pr("retry")}</button></p> : null}</div> : null}
    {message && status === "ready" ? <p role="status" className="sr-only">{message}</p> : null}
    <ManualRecordDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={save} />
  </main>;
}
