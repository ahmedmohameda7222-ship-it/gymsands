"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Plus, ShoppingCart, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { isIsoDate } from "@/lib/date-utils";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import {
  deserializeMealPlanQueue,
  enqueueMealPlanMutation,
  markMealPlanMutationFailed,
  reconcileMealPlanQueue,
  serializeMealPlanQueue,
  type MealPlanMutationTarget,
  type MealPlanOfflineMutation,
} from "@/lib/nutrition-v1/meal-plan-offline";
import type { EffectiveNutritionTarget } from "@/lib/nutrition-v1/targets";
import {
  deriveShoppingNeeds,
  type MealPlanOccurrenceMutation,
  type MealPlanWeekMutation,
  type MealPlanWeekProjection,
  type PlannedOccurrenceRow,
  type ShoppingNeed,
} from "@/services/nutrition-v1/server/meal-plan";
import { AddToPlanWorkspace } from "./add-to-plan-workspace";
import { mealPlanApi } from "./meal-plan-api";
import { MealSlotSection } from "./meal-slot-section";
import { PendingChangeReview } from "./pending-change-review";
import { PlannedNutritionSummary } from "./planned-nutrition-summary";
import { WeekStrip } from "./week-strip";

type JsonObject = Record<string, unknown>;
type PendingRequest = { id: string; base_revision: number; proposal_json: Record<string, unknown>; state: string };
type WeekResponse = MealPlanWeekProjection & { target: EffectiveNutritionTarget; pendingChangeRequests: PendingRequest[]; shoppingNeeds: ShoppingNeed[] };
type QueuePayload = { weekStartDate: string; mutation: MealPlanWeekMutation; baseSnapshot: unknown };
type EditDraft = { item: PlannedOccurrenceRow; name: string; note: string; plannedTime: string };
type MoveDraft = { item: PlannedOccurrenceRow; date: string; slot: string };
type CopyDraft = { item: PlannedOccurrenceRow; dates: string[] };

const coreSlots = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const markEatenLabel = "Mark eaten";
const logWithChangesLabel = "Log with changes";
const CACHE_PREFIX = "plaivra:nutrition-v1:meal-plan:cache";
const QUEUE_PREFIX = "plaivra:nutrition-v1:meal-plan:queue";

function shift(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function monday(date: string) { const value = new Date(`${date}T12:00:00Z`); const day = value.getUTCDay(); value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1)); return value.toISOString().slice(0, 10); }
function weekDates(weekStart: string) { return Array.from({ length: 7 }, (_, index) => shift(weekStart, index)); }
function label(date: string, options: Intl.DateTimeFormatOptions) { return new Intl.DateTimeFormat(undefined, options).format(new Date(`${date}T12:00:00`)); }
function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function cacheKey(userId: string, weekStart: string) { return `${CACHE_PREFIX}:${userId}:${weekStart}`; }
function queueKey(userId: string, weekStart: string) { return `${QUEUE_PREFIX}:${userId}:${weekStart}`; }
function localWeekId(weekStart: string) { return `local:${weekStart}`; }
function isLocalWeekId(value: string | null | undefined) { return Boolean(value?.startsWith("local:")); }

function readCachedWeek(userId: string, weekStart: string): WeekResponse | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(userId, weekStart));
    return raw ? JSON.parse(raw) as WeekResponse : null;
  } catch {
    return null;
  }
}

function writeCachedWeek(userId: string, weekStart: string, value: WeekResponse) {
  try { window.localStorage.setItem(cacheKey(userId, weekStart), JSON.stringify(value)); } catch { /* cache is opportunistic */ }
}

function readQueue(userId: string, weekStart: string) {
  try { return deserializeMealPlanQueue(window.localStorage.getItem(queueKey(userId, weekStart)) ?? "[]"); }
  catch { return []; }
}

function writeQueue(userId: string, weekStart: string, queue: MealPlanOfflineMutation[]) {
  try { window.localStorage.setItem(queueKey(userId, weekStart), serializeMealPlanQueue(queue)); } catch { /* keep visible in current session */ }
}

function queueState(queue: MealPlanOfflineMutation[]) {
  if (queue.some((item) => item.status === "conflict" || item.status === "needs_attention")) return "Needs attention";
  if (queue.some((item) => item.status === "queued")) return "Waiting to sync";
  return "";
}

function customSlotMap(weekOverride: JsonObject | null | undefined) {
  const root = object(weekOverride);
  const raw = object(root.customSlots);
  const result: Record<string, string[]> = {};
  for (const [date, slots] of Object.entries(raw)) {
    if (!Array.isArray(slots)) continue;
    result[date] = slots.filter((slot): slot is string => typeof slot === "string" && slot.trim().length > 0).map((slot) => slot.trim());
  }
  return result;
}

function occurrenceToMutation(item: PlannedOccurrenceRow, patch: Partial<MealPlanOccurrenceMutation> = {}): MealPlanOccurrenceMutation {
  return {
    id: item.id,
    planDate: item.plan_date,
    mealSlotKey: item.meal_slot_key,
    position: item.position,
    sourceType: item.source_type,
    sourceId: item.source_id,
    sourceVersionId: item.source_version_id,
    resolvedQuantity: item.resolved_quantity,
    resolvedServingLabel: item.resolved_serving_label,
    frozenName: item.frozen_name,
    frozenSnapshot: { ...item.frozen_snapshot },
    status: item.status === "skipped" ? "skipped" : "planned",
    ...patch,
  };
}

function prepareMutation(mutation: MealPlanWeekMutation): MealPlanWeekMutation {
  return {
    ...(mutation.weekOverride !== undefined ? { weekOverride: mutation.weekOverride } : {}),
    ...(mutation.deleteOccurrenceIds !== undefined ? { deleteOccurrenceIds: [...mutation.deleteOccurrenceIds] } : {}),
    ...(mutation.upsertOccurrences !== undefined ? {
      upsertOccurrences: mutation.upsertOccurrences.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() })),
    } : {}),
  };
}

function targetSnapshot(data: WeekResponse, target: MealPlanMutationTarget) {
  if (target.kind === "occurrence") {
    const item = data.occurrences.find((occurrence) => occurrence.id === target.id) ?? null;
    if (!item || !target.field) return item;
    return (item as unknown as Record<string, unknown>)[target.field] ?? null;
  }
  if (target.kind === "meal_slot") {
    return data.occurrences.filter((item) => `${item.plan_date}:${item.meal_slot_key}` === target.id);
  }
  if (target.kind === "shopping_item") {
    return object(object(data.week?.week_override_json).shopping)[target.id] ?? null;
  }
  const override = data.week?.week_override_json ?? {};
  return target.field ? object(override)[target.field] ?? null : override;
}

function sameSnapshot(left: unknown, right: unknown) {
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
}

function queuePayload(item: MealPlanOfflineMutation): QueuePayload | null {
  const weekStartDate = typeof item.payload.weekStartDate === "string" ? item.payload.weekStartDate : "";
  const mutation = item.payload.mutation;
  if (!weekStartDate || !mutation || typeof mutation !== "object" || Array.isArray(mutation)) return null;
  return { weekStartDate, mutation: mutation as MealPlanWeekMutation, baseSnapshot: item.payload.baseSnapshot };
}

function localRow(item: MealPlanOccurrenceMutation, current: PlannedOccurrenceRow | undefined, weekId: string, userId: string): PlannedOccurrenceRow {
  return {
    id: item.id!,
    week_id: weekId,
    user_id: userId,
    plan_date: item.planDate,
    meal_slot_key: item.mealSlotKey,
    position: item.position ?? 0,
    source_type: item.sourceType,
    source_id: item.sourceId ?? null,
    source_version_id: item.sourceVersionId ?? null,
    resolved_quantity: item.resolvedQuantity ?? null,
    resolved_serving_label: item.resolvedServingLabel ?? null,
    frozen_name: item.frozenName,
    frozen_snapshot: { ...item.frozenSnapshot },
    status: item.status ?? "planned",
    completed_at: current?.completed_at ?? null,
    actual_log_group_id: current?.actual_log_group_id ?? null,
  };
}

function applyMutationLocally(
  base: WeekResponse,
  mutation: MealPlanWeekMutation,
  context: { weekId: string; revision: number; userId: string; weekStart: string },
): WeekResponse {
  let occurrences = [...base.occurrences];
  if (mutation.deleteOccurrenceIds?.length) {
    const deleted = new Set(mutation.deleteOccurrenceIds);
    occurrences = occurrences.filter((item) => !deleted.has(item.id));
  }
  for (const item of mutation.upsertOccurrences ?? []) {
    if (!item.id) continue;
    const current = occurrences.find((candidate) => candidate.id === item.id);
    const next = localRow(item, current, context.weekId, context.userId);
    occurrences = current ? occurrences.map((candidate) => candidate.id === item.id ? next : candidate) : [...occurrences, next];
  }
  const previousOverride = base.week?.week_override_json ?? {};
  const weekOverride = mutation.weekOverride ?? previousOverride;
  const week = {
    id: context.weekId,
    user_id: context.userId,
    week_start_date: context.weekStart,
    revision: context.revision,
    week_override_json: weekOverride,
    created_at: base.week?.created_at,
    updated_at: base.week?.updated_at,
  };
  return {
    ...base,
    week,
    occurrences,
    shoppingNeeds: deriveShoppingNeeds(occurrences.map((item) => ({ id: item.id, sourceType: item.source_type, frozenSnapshot: item.frozen_snapshot }))),
  };
}

function mutationTarget(mutation: MealPlanWeekMutation, fallbackId: string): MealPlanMutationTarget {
  const first = mutation.upsertOccurrences?.[0];
  if (first?.id) return { kind: "occurrence", id: first.id };
  const deleted = mutation.deleteOccurrenceIds?.[0];
  if (deleted) return { kind: "occurrence", id: deleted };
  return { kind: "week_override", id: fallbackId };
}

export function MealPlanPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const today = useTodayDate();
  const requestedDate = params.get("date");
  const selectedDate = requestedDate && isIsoDate(requestedDate) ? requestedDate : today;
  const weekStart = monday(selectedDate);
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const [data, setData] = useState<WeekResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [addSlot, setAddSlot] = useState<string | null>(null);
  const [staleProposal, setStaleProposal] = useState(false);
  const [notice, setNotice] = useState("");
  const [syncState, setSyncState] = useState("");
  const [customSlotName, setCustomSlotName] = useState("");
  const [addingCustomSlot, setAddingCustomSlot] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [moveDraft, setMoveDraft] = useState<MoveDraft | null>(null);
  const [copyDraft, setCopyDraft] = useState<CopyDraft | null>(null);
  const syncingRef = useRef(false);

  const fetchWeek = useCallback(() => mealPlanApi<WeekResponse>(`/api/nutrition/v1/meal-plan/week?weekStart=${encodeURIComponent(weekStart)}&date=${encodeURIComponent(selectedDate)}`), [selectedDate, weekStart]);

  const flushQueue = useCallback(async (serverData: WeekResponse) => {
    if (!ownerId || syncingRef.current) return;
    const stored = readQueue(ownerId, weekStart);
    if (!stored.some((item) => item.status === "queued")) {
      setSyncState(queueState(stored));
      return;
    }
    syncingRef.current = true;
    let working = serverData;
    let workingWeekId = serverData.week?.id ?? null;
    let workingRevision = serverData.week?.revision ?? 0;
    const remaining: MealPlanOfflineMutation[] = [];
    let applied = 0;
    try {
      for (let index = 0; index < stored.length; index += 1) {
        const storedItem = stored[index]!;
        if (storedItem.status !== "queued") { remaining.push(storedItem); continue; }
        const payload = queuePayload(storedItem);
        if (!payload || payload.weekStartDate !== weekStart) {
          remaining.push(markMealPlanMutationFailed(storedItem, "Queued Meal Plan mutation is no longer readable."));
          continue;
        }

        let candidate = storedItem;
        if (candidate.baseRevision !== workingRevision) {
          const changed = !sameSnapshot(targetSnapshot(working, candidate.target), payload.baseSnapshot);
          candidate = reconcileMealPlanQueue([candidate], {
            serverRevision: workingRevision,
            changedTargets: changed ? [candidate.target] : [],
          })[0]!;
          if (candidate.status === "conflict") { remaining.push(candidate); continue; }
        }

        try {
          const result = await mealPlanApi<{ weekId: string; revision: number }>("/api/nutrition/v1/meal-plan/week", {
            method: "POST",
            body: JSON.stringify({
              kind: "mutate",
              weekId: workingWeekId,
              weekStartDate: weekStart,
              baseRevision: candidate.baseRevision,
              operationId: candidate.operationId,
              mutation: payload.mutation,
            }),
          });
          workingWeekId = result.weekId;
          workingRevision = result.revision;
          working = applyMutationLocally(working, payload.mutation, { weekId: result.weekId, revision: result.revision, userId: ownerId, weekStart });
          applied += 1;
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Meal Plan mutation could not be synchronized.";
          remaining.push(markMealPlanMutationFailed(candidate, message), ...stored.slice(index + 1));
          break;
        }
      }
      writeQueue(ownerId, weekStart, remaining);
      setSyncState(queueState(remaining));
      if (applied > 0) {
        const refreshed = await fetchWeek();
        setData(refreshed);
        writeCachedWeek(ownerId, weekStart, refreshed);
      }
    } finally {
      syncingRef.current = false;
    }
  }, [fetchWeek, ownerId, weekStart]);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const result = await fetchWeek();
      setData(result);
      writeCachedWeek(ownerId, weekStart, result);
      setError("");
      setSyncState(queueState(readQueue(ownerId, weekStart)));
      await flushQueue(result);
    } catch (cause) {
      const cached = readCachedWeek(ownerId, weekStart);
      if (cached) {
        setData(cached);
        setError("");
        const queued = readQueue(ownerId, weekStart);
        setSyncState(queueState(queued) || "Saved on device");
      } else {
        setError(cause instanceof Error ? cause.message : "Meal Plan could not be loaded.");
      }
    } finally {
      setLoading(false);
    }
  }, [fetchWeek, flushQueue, ownerId, weekStart]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (requestedDate !== selectedDate) router.replace(`/my-meal-plan?date=${encodeURIComponent(selectedDate)}`, { scroll: false }); }, [requestedDate, router, selectedDate]);
  useEffect(() => {
    const onOnline = () => { void load(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  const selectedOccurrences = useMemo(() => (data?.occurrences ?? []).filter((item) => item.plan_date === selectedDate), [data, selectedDate]);
  const customSlots = useMemo(() => customSlotMap(data?.week?.week_override_json)[selectedDate] ?? [], [data, selectedDate]);
  const slots = useMemo(() => {
    const occurrenceSlots = selectedOccurrences.map((item) => item.meal_slot_key).filter((slot) => !coreSlots.includes(slot));
    return [...coreSlots, ...Array.from(new Set([...customSlots, ...occurrenceSlots]))];
  }, [customSlots, selectedOccurrences]);
  const target = data?.target?.available ? data.target.values : null;
  const allowExecution = selectedDate <= today;

  function selectDate(date: string) { router.push(`/my-meal-plan?date=${encodeURIComponent(date)}`, { scroll: false }); }
  function shiftWeek(days: number) { selectDate(shift(selectedDate, days)); }

  async function mutateWeek(rawMutation: MealPlanWeekMutation, explicitTarget?: MealPlanMutationTarget) {
    if (!data || !ownerId) throw new Error("Meal Plan must be loaded before it can be changed.");
    const mutation = prepareMutation(rawMutation);
    const target = explicitTarget ?? mutationTarget(mutation, weekStart);
    const operationId = crypto.randomUUID();
    const currentWeekId = data.week?.id ?? null;
    const baseRevision = data.week?.revision ?? 0;
    try {
      const result = await mealPlanApi<{ weekId: string; revision: number }>("/api/nutrition/v1/meal-plan/week", {
        method: "POST",
        body: JSON.stringify({
          kind: "mutate",
          weekId: isLocalWeekId(currentWeekId) ? null : currentWeekId,
          weekStartDate: weekStart,
          baseRevision,
          operationId,
          mutation,
        }),
      });
      if (!result.weekId) throw new Error("Meal Plan mutation was not confirmed.");
      await load();
      return;
    } catch (cause) {
      const baseSnapshot = targetSnapshot(data, target);
      const queuedBase: MealPlanOfflineMutation = {
        operationId,
        weekId: currentWeekId ?? localWeekId(weekStart),
        baseRevision,
        target,
        payload: { weekStartDate: weekStart, mutation, baseSnapshot },
        status: "queued",
      };
      const durable = typeof navigator !== "undefined" && navigator.onLine
        ? markMealPlanMutationFailed(queuedBase, cause instanceof Error ? cause.message : "Meal Plan mutation needs attention.")
        : queuedBase;
      const nextQueue = enqueueMealPlanMutation(readQueue(ownerId, weekStart), durable);
      writeQueue(ownerId, weekStart, nextQueue);
      const nextWeekId = currentWeekId ?? localWeekId(weekStart);
      const optimistic = applyMutationLocally(data, mutation, { weekId: nextWeekId, revision: baseRevision + 1, userId: ownerId, weekStart });
      setData(optimistic);
      writeCachedWeek(ownerId, weekStart, optimistic);
      setSyncState(queueState(nextQueue));
      setError("");
    }
  }

  async function mutate(items: MealPlanOccurrenceMutation[]) {
    await mutateWeek({ upsertOccurrences: items }, { kind: "meal_slot", id: `${selectedDate}:${items[0]?.mealSlotKey ?? "unknown"}` });
  }

  async function markEaten(item: PlannedOccurrenceRow) {
    if (item.source_type === "placeholder") {
      setNotice("Confirm or replace this Placeholder in the logging flow before Plaivra records actual intake.");
      logWithChanges(item);
      return;
    }
    try {
      await mealPlanApi("/api/nutrition/v1/meal-plan/week", { method: "POST", body: JSON.stringify({ kind: "complete", occurrenceId: item.id, operationId: crypto.randomUUID(), executionSnapshot: null }) });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Planned meal could not be completed."); }
  }

  function logWithChanges(item: PlannedOccurrenceRow) { router.push(`/calories?date=${encodeURIComponent(item.plan_date)}&plannedOccurrence=${encodeURIComponent(item.id)}`); }

  async function skip(item: PlannedOccurrenceRow) {
    await mutateWeek({ upsertOccurrences: [occurrenceToMutation(item, { status: "skipped" })] }, { kind: "occurrence", id: item.id, field: "status" });
    setNotice("Meal marked Skipped. Diary was not changed; Shopping remains unchanged until you explicitly review it.");
  }

  function beginEdit(item: PlannedOccurrenceRow) {
    const snapshot = object(item.frozen_snapshot);
    setEditDraft({
      item,
      name: item.frozen_name,
      note: typeof snapshot.note === "string" ? snapshot.note : "",
      plannedTime: typeof snapshot.plannedTime === "string" ? snapshot.plannedTime : "",
    });
  }

  async function saveEdit() {
    if (!editDraft) return;
    const snapshot = { ...editDraft.item.frozen_snapshot, note: editDraft.note.trim() || null, plannedTime: editDraft.plannedTime || null };
    const name = editDraft.item.source_type === "placeholder" ? editDraft.name.trim() : editDraft.item.frozen_name;
    if (!name) { setError("Placeholder name is required."); return; }
    await mutateWeek({ upsertOccurrences: [occurrenceToMutation(editDraft.item, { frozenName: name, frozenSnapshot: snapshot })] }, { kind: "occurrence", id: editDraft.item.id });
    setEditDraft(null);
  }

  function beginMove(item: PlannedOccurrenceRow) { setMoveDraft({ item, date: item.plan_date, slot: item.meal_slot_key }); }
  async function saveMove() {
    if (!moveDraft) return;
    await mutateWeek({ upsertOccurrences: [occurrenceToMutation(moveDraft.item, { planDate: moveDraft.date, mealSlotKey: moveDraft.slot })] }, { kind: "occurrence", id: moveDraft.item.id });
    setMoveDraft(null);
  }

  function beginCopy(item: PlannedOccurrenceRow) { setCopyDraft({ item, dates: [] }); }
  async function saveCopy() {
    if (!copyDraft?.dates.length) return;
    const copies = copyDraft.dates.map((date) => {
      const { id: _id, ...copy } = occurrenceToMutation(copyDraft.item, { planDate: date, status: "planned" });
      return copy;
    });
    await mutateWeek({ upsertOccurrences: copies }, { kind: "meal_slot", id: `${copyDraft.item.plan_date}:${copyDraft.item.meal_slot_key}` });
    setCopyDraft(null);
  }

  async function addCustomSlot() {
    const name = customSlotName.trim();
    if (!name || coreSlots.includes(name) || customSlots.includes(name)) return;
    const currentOverride = data?.week?.week_override_json ?? {};
    const map = customSlotMap(currentOverride);
    await mutateWeek({ weekOverride: { ...currentOverride, customSlots: { ...map, [selectedDate]: [...customSlots, name] } } }, { kind: "week_override", id: weekStart, field: "customSlots" });
    setCustomSlotName("");
    setAddingCustomSlot(false);
  }

  async function approve(id: string) {
    try {
      const result = await mealPlanApi<{ state: "applied" | "stale" }>("/api/nutrition/v1/meal-plan/week", { method: "POST", body: JSON.stringify({ kind: "apply_change_request", changeRequestId: id }) });
      setStaleProposal(result.state === "stale"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Proposed changes could not be applied."); }
  }
  async function cancel(id: string) {
    try { await mealPlanApi("/api/nutrition/v1/meal-plan/week", { method: "POST", body: JSON.stringify({ kind: "cancel_change_request", changeRequestId: id }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Proposed changes could not be cancelled."); }
  }
  async function planWithChatGPT() {
    const prompt = `Help me propose changes for my Plaivra Meal Plan week starting ${weekStart}. Treat the plan as intention only. Return structured ADD, CHANGE, and REMOVE proposals for explicit review; do not log anything as eaten.`;
    try { await navigator.clipboard.writeText(prompt); setNotice("ChatGPT planning prompt copied. Review any returned proposal before Plaivra applies it."); }
    catch { setNotice("Open ChatGPT externally and ask for structured Meal Plan changes. Review every proposal before applying it in Plaivra."); }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Meal Plan</h1><p className="mt-1 text-sm text-muted-foreground">Weekly nutrition intention. Diary remains actual truth.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void planWithChatGPT()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium">Plan with ChatGPT <ExternalLink className="h-4 w-4" /></button><Link href={`/my-meal-plan/shopping?week=${encodeURIComponent(weekStart)}&date=${encodeURIComponent(selectedDate)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-3 text-sm font-semibold text-background"><ShoppingCart className="h-4 w-4" />Shopping</Link></div></div>
        <div className="mt-5 flex items-center justify-between gap-3"><button type="button" onClick={() => shiftWeek(-7)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button><div className="text-center"><p className="text-sm font-semibold">{label(weekStart, { month: "short", day: "numeric" })} – {label(shift(weekStart, 6), { month: "short", day: "numeric", year: "numeric" })}</p><p className="text-xs text-muted-foreground">Week revision {data?.week?.revision ?? 0}</p></div><button type="button" onClick={() => shiftWeek(7)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border" aria-label="Next week"><ChevronRight className="h-4 w-4" /></button></div>
        <div className="mt-4"><WeekStrip dates={dates} selectedDate={selectedDate} today={today} onSelect={selectDate} /></div>
      </header>
      {syncState ? <p role="status" className="mt-4 rounded-xl border border-border px-3 py-2 text-sm">{syncState}{syncState === "Needs attention" ? " — your local changes are preserved for review." : ""}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-xl bg-muted p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
      {loading && !data ? <div className="mt-5 space-y-3"><div className="h-24 animate-pulse rounded-2xl bg-muted" /><div className="h-36 animate-pulse rounded-2xl bg-muted" /></div> : null}
      {data ? <>
        <div className="py-5"><div className="flex flex-wrap items-baseline justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected day</p><h2 className="mt-1 text-xl font-semibold">{label(selectedDate, { weekday: "long", month: "long", day: "numeric" })}</h2></div><div className="flex gap-2">{selectedDate !== today ? <button type="button" onClick={() => selectDate(today)} className="min-h-11 rounded-xl px-3 text-sm font-medium hover:bg-muted">Today</button> : null}<button type="button" onClick={() => setAddingCustomSlot(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />Add meal slot</button></div></div></div>
        <PlannedNutritionSummary occurrences={selectedOccurrences} target={target} />
        <PendingChangeReview requests={data.pendingChangeRequests} stale={staleProposal} onApprove={(id) => void approve(id)} onCancel={(id) => void cancel(id)} />
        <div aria-label="Selected day meals">{slots.map((slot) => <MealSlotSection key={slot} label={slot} items={selectedOccurrences.filter((item) => item.meal_slot_key === slot)} allowExecution={allowExecution} markEatenLabel={markEatenLabel} logWithChangesLabel={logWithChangesLabel} onAdd={() => setAddSlot(slot)} onMarkEaten={(item) => void markEaten(item)} onLogWithChanges={logWithChanges} onSkip={(item) => void skip(item)} onEdit={beginEdit} onMove={beginMove} onCopy={beginCopy} />)}</div>
        {!selectedOccurrences.length ? <div className="py-6 text-center"><p className="font-medium">Nothing planned for this day.</p><p className="mt-1 text-sm text-muted-foreground">Add manually or use ChatGPT as an external planning accelerator.</p><button type="button" onClick={() => setAddSlot("Breakfast")} className="mt-3 min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Add to plan</button></div> : null}
      </> : null}

      {addingCustomSlot ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="custom-slot-title"><div className="w-full max-w-md rounded-t-3xl bg-background p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><h2 id="custom-slot-title" className="text-lg font-semibold">Add meal slot</h2><button type="button" className="min-h-11 min-w-11 rounded-xl" aria-label="Close" onClick={() => setAddingCustomSlot(false)}><X className="mx-auto h-5 w-5" /></button></div><label className="mt-4 block text-sm font-medium" htmlFor="custom-meal-slot">Slot name</label><input id="custom-meal-slot" value={customSlotName} onChange={(event) => setCustomSlotName(event.target.value)} placeholder="Post-workout" className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setAddingCustomSlot(false)} className="min-h-11 rounded-xl px-4 text-sm font-medium">Cancel</button><button type="button" onClick={() => void addCustomSlot()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Add</button></div></div></div> : null}

      {editDraft ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="edit-plan-title"><div className="w-full max-w-md rounded-t-3xl bg-background p-5 sm:rounded-3xl"><h2 id="edit-plan-title" className="text-lg font-semibold">Edit planned item</h2>{editDraft.item.source_type === "placeholder" ? <><label className="mt-4 block text-sm font-medium" htmlFor="edit-plan-name">Name</label><input id="edit-plan-name" value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></> : <p className="mt-2 text-sm text-muted-foreground">Source identity and frozen nutrition stay unchanged. Edit occurrence-only planning details here.</p>}<label className="mt-4 block text-sm font-medium" htmlFor="edit-plan-time">Planned time</label><input id="edit-plan-time" type="time" value={editDraft.plannedTime} onChange={(event) => setEditDraft({ ...editDraft, plannedTime: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /><label className="mt-4 block text-sm font-medium" htmlFor="edit-plan-note">Note</label><textarea id="edit-plan-note" value={editDraft.note} onChange={(event) => setEditDraft({ ...editDraft, note: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setEditDraft(null)} className="min-h-11 rounded-xl px-4 text-sm font-medium">Cancel</button><button type="button" onClick={() => void saveEdit()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Save</button></div></div></div> : null}

      {moveDraft ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="move-plan-title"><div className="w-full max-w-md rounded-t-3xl bg-background p-5 sm:rounded-3xl"><h2 id="move-plan-title" className="text-lg font-semibold">Move planned item</h2><label className="mt-4 block text-sm font-medium" htmlFor="move-plan-date">Day</label><select id="move-plan-date" value={moveDraft.date} onChange={(event) => setMoveDraft({ ...moveDraft, date: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{dates.map((date) => <option key={date} value={date}>{label(date, { weekday: "long", month: "short", day: "numeric" })}</option>)}</select><label className="mt-4 block text-sm font-medium" htmlFor="move-plan-slot">Meal slot</label><select id="move-plan-slot" value={moveDraft.slot} onChange={(event) => setMoveDraft({ ...moveDraft, slot: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{slots.map((slot) => <option key={slot}>{slot}</option>)}</select><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setMoveDraft(null)} className="min-h-11 rounded-xl px-4 text-sm font-medium">Cancel</button><button type="button" onClick={() => void saveMove()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Move</button></div></div></div> : null}

      {copyDraft ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="copy-plan-title"><div className="w-full max-w-md rounded-t-3xl bg-background p-5 sm:rounded-3xl"><h2 id="copy-plan-title" className="text-lg font-semibold">Copy / repeat to selected days</h2><p className="mt-1 text-sm text-muted-foreground">Copies receive fresh identities and start as Planned. Execution and Shopping state are not copied.</p><div className="mt-3 divide-y divide-border">{dates.map((date) => <label key={date} className="flex min-h-11 items-center gap-3 py-2"><input type="checkbox" checked={copyDraft.dates.includes(date)} onChange={(event) => setCopyDraft({ ...copyDraft, dates: event.target.checked ? [...copyDraft.dates, date] : copyDraft.dates.filter((value) => value !== date) })} /><span className="text-sm">{label(date, { weekday: "long", month: "short", day: "numeric" })}</span></label>)}</div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setCopyDraft(null)} className="min-h-11 rounded-xl px-4 text-sm font-medium">Cancel</button><button type="button" disabled={!copyDraft.dates.length} onClick={() => void saveCopy()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50">Copy</button></div></div></div> : null}

      {addSlot ? <AddToPlanWorkspace date={selectedDate} mealSlotKey={addSlot} onClose={() => setAddSlot(null)} onCommit={mutate} /> : null}
    </main>
  );
}
