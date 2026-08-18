"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toCatalogLocale } from "@/lib/activity-catalog/catalog-locale";
import { MANUAL_RECORD_DEFINITIONS, type CanonicalPersonalRecordEvent, type ManualPersonalRecordInput, type ManualRecordDefinitionTemplate } from "@/lib/personal-records/contracts";
import { usePersonalRecordsTranslation } from "@/lib/i18n/personal-records";
import { buildCatalogAuthoritySnapshot } from "@/lib/activity-catalog/snapshot";
import type { LibraryActivity, LibraryActivityDetail } from "@/lib/activity-catalog/library-types";
import { getLibraryDomainActivity, searchLibraryDomainActivities } from "@/services/activity-catalog/client";
import { recordDefinitionLabel } from "./record-presentation";

const sports = ["strength", "running", "cycling", "swimming", "yoga", "mobility", "pilates", "other"] as const;
type Sport = typeof sports[number];

function localDate(value: string) { return value.slice(0, 10); }
function emptyContext(definition: ManualRecordDefinitionTemplate | null) {
  return Object.fromEntries((definition?.contextFields ?? []).map((field) => [field.key, ""]));
}

export function ManualRecordDialog({ open, event, onOpenChange, onSave }: {
  open: boolean;
  event?: CanonicalPersonalRecordEvent | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: ManualPersonalRecordInput) => Promise<void>;
}) {
  const { language, dir, pr } = usePersonalRecordsTranslation();
  const catalogLocale = toCatalogLocale(language);
  const [sport, setSport] = useState<Sport>("strength");
  const [subjectMode, setSubjectMode] = useState<"catalog_activity" | "custom_subject">("catalog_activity");
  const [subjectId, setSubjectId] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [catalogActivity, setCatalogActivity] = useState<LibraryActivityDetail | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<LibraryActivity[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"idle" | "loading" | "empty" | "failed">("idle");
  const [definitionKey, setDefinitionKey] = useState("");
  const [value, setValue] = useState("");
  const [context, setContext] = useState<Record<string, string>>({});
  const [date, setDate] = useState(localDate(new Date().toISOString()));
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "failed">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const nextSport = (event?.subject.sportDomain && sports.includes(event.subject.sportDomain as Sport) ? event.subject.sportDomain : "strength") as Sport;
    const mode = event?.subject.identityKind === "catalog_activity" ? "catalog_activity" : "custom_subject";
    setSport(nextSport); setSubjectMode(mode); setSubjectId(event?.subject.identity ?? crypto.randomUUID()); setSubjectName(event?.subject.name ?? "");
    setDefinitionKey(event?.definition.key ?? ""); setValue(event ? String(event.value) : "");
    setContext(Object.fromEntries((event?.context ?? []).map((item) => [item.key, String(item.value)])));
    setDate(event ? localDate(event.achievedAt) : localDate(new Date().toISOString())); setNotes(event?.notes ?? "");
    setCatalogActivity(null); setCatalogQuery(""); setCatalogResults([]); setCatalogStatus("idle"); setStatus("idle"); setMessage("");
  }, [event, open]);

  const eligible = useMemo(() => {
    const safe = MANUAL_RECORD_DEFINITIONS.filter((definition) => definition.sports.includes(sport));
    if (subjectMode !== "catalog_activity" || !catalogActivity) return safe;
    const authority = catalogActivity.recordDefinitions ?? [];
    return safe.filter((template) => authority.some((raw) => {
      const definition = raw as Record<string, unknown>;
      return definition.recordKey === template.key && definition.comparisonDirection === template.comparisonDirection && definition.canonicalUnit === template.canonicalUnit;
    }));
  }, [catalogActivity, sport, subjectMode]);
  const definition = eligible.find((item) => item.key === definitionKey) ?? null;

  useEffect(() => {
    if (eligible.length === 1 && definitionKey !== eligible[0].key) {
      setDefinitionKey(eligible[0].key); setContext(emptyContext(eligible[0]));
    } else if (eligible.length && !eligible.some((item) => item.key === definitionKey)) {
      setDefinitionKey(""); setContext({});
    }
  }, [definitionKey, eligible]);

  async function searchCatalog() {
    if (!catalogQuery.trim()) return;
    setCatalogStatus("loading");
    try {
      const result = await searchLibraryDomainActivities({ domain: "strength", query: catalogQuery.trim(), limit: 10, locale: catalogLocale });
      setCatalogResults(result.data); setCatalogStatus(result.data.length ? "idle" : "empty");
    } catch { setCatalogStatus("failed"); }
  }

  async function chooseActivity(activity: LibraryActivity) {
    setCatalogStatus("loading");
    try {
      const detail = await getLibraryDomainActivity("strength", activity.id, catalogLocale);
      setCatalogActivity(detail.data); setSubjectId(`global:${detail.data.id}`); setSubjectName(detail.data.name); setCatalogResults([]); setCatalogStatus("idle");
    } catch { setCatalogStatus("failed"); }
  }

  async function submit(eventObject: React.FormEvent) {
    eventObject.preventDefault();
    const numericValue = Number(value);
    if (!subjectName.trim() || !definition || !Number.isFinite(numericValue) || numericValue <= 0 || !date) {
      setStatus("failed"); setMessage(!numericValue || numericValue <= 0 ? pr("valueInvalid") : pr("required")); return;
    }
    for (const field of definition.contextFields) if (field.required && !context[field.key]) { setStatus("failed"); setMessage(pr("required")); return; }
    if (!navigator.onLine) { setStatus("failed"); setMessage(pr("connectionRequired")); return; }
    let authoritySnapshot: Record<string, unknown> = event?.editAuthority?.authoritySnapshot ?? {};
    let definitionId = definition.id;
    let definitionVersion = definition.version;
    if (subjectMode === "catalog_activity") {
      if (!catalogActivity && !event) { setStatus("failed"); setMessage(pr("required")); return; }
      if (catalogActivity) {
        authoritySnapshot = buildCatalogAuthoritySnapshot(catalogActivity) as unknown as Record<string, unknown>;
        const catalogDefinition = (catalogActivity.recordDefinitions ?? []).find((raw) => (raw as Record<string, unknown>).recordKey === definition.key) as Record<string, unknown> | undefined;
        definitionId = String(catalogDefinition?.id ?? definition.id); definitionVersion = String(catalogDefinition?.version ?? definition.version);
      }
    }
    setStatus("saving"); setMessage("");
    try {
      await onSave({ eventId: event?.eventId, subject: { identityKind: subjectMode, identity: subjectId, name: subjectName.trim(), sportDomain: sport, sportName: pr(sport), catalogRevisionId: catalogActivity?.revisionId ?? event?.editAuthority?.catalogRevisionId ?? null, authoritySnapshot }, definition: { ...definition, id: definitionId, version: definitionVersion }, value: numericValue, context: Object.fromEntries(Object.entries(context).map(([key, item]) => [key, Number.isFinite(Number(item)) ? Number(item) : item])), achievedAt: `${date}T12:00:00.000Z`, notes: notes.trim() || null });
      onOpenChange(false);
    } catch (error) { setStatus("failed"); setMessage(error instanceof Error ? error.message : pr("required")); }
  }

  const lockedCatalogEdit = Boolean(event && subjectMode === "catalog_activity" && !catalogActivity);
  return (
    <Dialog open={open} onOpenChange={(next) => status !== "saving" && onOpenChange(next)}>
      <DialogContent dir={dir} closeLabel={pr("close")} className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{event ? pr("editTitle") : pr("addTitle")}</DialogTitle><DialogDescription>{pr("description")}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="pr-sport">{pr("sport")}</Label><Select value={sport} onValueChange={(next) => { setSport(next as Sport); setDefinitionKey(""); setContext({}); if (next !== "strength") setSubjectMode("custom_subject"); }} disabled={Boolean(event)}><SelectTrigger id="pr-sport" className="mt-1 min-h-12"><SelectValue /></SelectTrigger><SelectContent>{sports.map((item) => <SelectItem key={item} value={item}>{pr(item)}</SelectItem>)}</SelectContent></Select></div>
            {sport === "strength" && !event ? <div><Label htmlFor="pr-subject-kind">{pr("activity")}</Label><Select value={subjectMode} onValueChange={(next) => { setSubjectMode(next as typeof subjectMode); setSubjectId(crypto.randomUUID()); setSubjectName(""); setCatalogActivity(null); setDefinitionKey(""); }}><SelectTrigger id="pr-subject-kind" className="mt-1 min-h-12"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="catalog_activity">{pr("chooseActivity")}</SelectItem><SelectItem value="custom_subject">{pr("customSubject")}</SelectItem></SelectContent></Select></div> : null}
          </div>
          {subjectMode === "catalog_activity" && !lockedCatalogEdit ? <div className="space-y-2"><Label htmlFor="pr-catalog-query">{pr("searchCatalog")}</Label><div className="flex gap-2"><Input id="pr-catalog-query" className="h-12" value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)} placeholder={pr("searchPlaceholder")} /><Button type="button" variant="outline" className="min-h-12" onClick={searchCatalog} disabled={catalogStatus === "loading"}><Search className="h-4 w-4" />{pr("search")}</Button></div>{catalogResults.length ? <div className="max-h-48 divide-y overflow-y-auto rounded-2xl border">{catalogResults.map((item) => <button key={item.id} type="button" className="flex min-h-12 w-full items-center px-3 text-start hover:bg-muted" onClick={() => chooseActivity(item)}>{item.name}</button>)}</div> : null}{catalogStatus === "empty" ? <p className="text-sm text-muted-foreground">{pr("noCatalogMatches")}</p> : null}{catalogStatus === "failed" ? <p className="text-sm text-destructive">{pr("loadFailed")}</p> : null}{catalogActivity ? <p className="rounded-xl bg-muted px-3 py-2 text-sm font-medium">{catalogActivity.name}</p> : null}</div> : <div><Label htmlFor="pr-subject">{pr("activity")}</Label><Input id="pr-subject" className="mt-1 h-12" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder={pr("subjectPlaceholder")} disabled={lockedCatalogEdit} required /></div>}
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="pr-definition">{pr("metric")}</Label><Select value={definitionKey} onValueChange={(next) => { setDefinitionKey(next); setContext(emptyContext(eligible.find((item) => item.key === next) ?? null)); }} disabled={lockedCatalogEdit}><SelectTrigger id="pr-definition" className="mt-1 min-h-12"><SelectValue placeholder={pr("selectMetric")} /></SelectTrigger><SelectContent>{eligible.map((item) => <SelectItem key={item.key} value={item.key}>{recordDefinitionLabel(item.key, item.label, language)}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="pr-value">{pr("value")} {definition ? `(${definition.canonicalUnit})` : ""}</Label><Input id="pr-value" className="mt-1 h-12" inputMode="decimal" type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} required /></div></div>
          {definition?.contextFields.map((field) => <div key={field.key}><Label htmlFor={`pr-context-${field.key}`}>{field.label}{field.unit ? ` (${field.unit})` : ""}</Label><Input id={`pr-context-${field.key}`} className="mt-1 h-12" type="number" min={field.minimum} max={field.maximum} step="any" value={context[field.key] ?? ""} onChange={(e) => setContext((current) => ({ ...current, [field.key]: e.target.value }))} required={field.required} /></div>)}
          <div><Label htmlFor="pr-date">{pr("date")}</Label><Input id="pr-date" className="mt-1 h-12" type="date" max={localDate(new Date().toISOString())} value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          <div><Label htmlFor="pr-notes">{pr("notes")}</Label><textarea id="pr-notes" className="mt-1 min-h-24 w-full rounded-[14px] border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></div>
          {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" className="min-h-12" onClick={() => onOpenChange(false)} disabled={status === "saving"}>{pr("cancel")}</Button><Button type="submit" className="min-h-12" disabled={status === "saving" || (subjectMode === "catalog_activity" && !catalogActivity && !event)}>{status === "saving" ? pr("saving") : pr("save")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}