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
  localeWeekStartDay,
  parseMealPlanWeekStartOverride,
  startOfMealPlanWeek,
  weekContainsDate,
  weekStartOverrideKey,
  type MealPlanWeekStartOverride,
} from "@/lib/nutrition-v1/week-start";
import {
  copyPlannedOccurrences,
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
type EditDraft = { item: PlannedOccurrenceRow; name: string; note: string; plannedTime: string; reminderEnabled: boolean };
type MoveDraft = { item: PlannedOccurrenceRow; date: string; slot: string };
type CopyDraft = { item: PlannedOccurrenceRow; dates: string[] };
type BulkCopyDraft = { scope: "day" | "week"; targetDate: string };

const coreSlots = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const markEatenLabel = "Mark eaten";
const logWithChangesLabel = "Log with changes";
const CACHE_PREFIX = "plaivra:nutrition-v1:meal-plan:cache";
const QUEUE_PREFIX = "plaivra:nutrition-v1:meal-plan:queue";
const MAX_BROWSER_TIMEOUT_MS = 2_000_000_000;
const weekdayOptions = [
  { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" }, { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" }, { value: 5, label: "Friday" }, { value: 6, label: "Saturday" }, { value: 7, label: "Sunday" },
] as const;

function shift(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function weekDates(weekStart: string) { return Array.from({ length: 7 }, (_, index) => shift(weekStart, index)); }
function dayOffset(weekStart: string, date: string) { return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${weekStart}T12:00:00Z`)) / 86_400_000); }
function label(date: string, options: Intl.DateTimeFormatOptions) { return new Intl.DateTimeFormat(undefined, options).format(new Date(`${date}T12:00:00`)); }
function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function cacheKey(userId: string, weekStart: string) { return `${CACHE_PREFIX}:${userId}:${weekStart}`; }
function queueKey(userId: string, weekStart: string) { return `${QUEUE_PREFIX}:${userId}:${weekStart}`; }
function localWeekId(weekStart: string) { return `local:${weekStart}`; }
function isLocalWeekId(value: string | null | undefined) { return Boolean(value?.startsWith("local:")); }

function readCachedWeek(userId: string, weekStart: string): WeekResponse | null {
  try { const raw = window.localStorage.getItem(cacheKey(userId, weekStart)); return raw ? JSON.parse(raw) as WeekResponse : null; }
  catch { return null; }
}
function writeCachedWeek(userId: string, weekStart: string, value: WeekResponse) {
  try { window.localStorage.setItem(cacheKey(userId, weekStart), JSON.stringify(value)); } catch { /* opportunistic cache */ }
}
function readQueue(userId: string, weekStart: string) {
  try { return deserializeMealPlanQueue(window.localStorage.getItem(queueKey(userId, weekStart)) ?? "[]"); }
  catch { return []; }
}
function writeQueue(userId: string, weekStart: string, queue: MealPlanOfflineMutation[]) {
  try { window.localStorage.setItem(queueKey(userId, weekStart), serializeMealPlanQueue(queue)); } catch { /* keep current session state */ }
}
function queueState(queue: MealPlanOfflineMutation[]) {
  if (queue.some((item) => item.status === "conflict" || item.status === "needs_attention")) return "Needs attention";
  if (queue.some((item) => item.status === "queued")) return "Waiting to sync";
  return "";
}
function customSlotMap(weekOverride: JsonObject | null | undefined) {
  const raw = object(object(weekOverride).customSlots);
  const result: Record<string, string[]> = {};
  for (const [date, slots] of Object.entries(raw)) {
    if (!Array.isArray(slots)) continue;
    result[date] = slots.filter((slot): slot is string => typeof slot === "string" && slot.trim().length > 0).map((slot) => slot.trim());
  }
  return result;
}
function shoppingExcludedOccurrenceIds(weekOverride: JsonObject | null | undefined) {
  const raw = object(weekOverride).shoppingExcludedOccurrenceIds;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
}
function occurrenceToMutation(item: PlannedOccurrenceRow, patch: Partial<MealPlanOccurrenceMutation> = {}): MealPlanOccurrenceMutation {
  return {
    id: item.id, planDate: item.plan_date, mealSlotKey: item.meal_slot_key, position: item.position,
    sourceType: item.source_type, sourceId: item.source_id, sourceVersionId: item.source_version_id,
    resolvedQuantity: item.resolved_quantity, resolvedServingLabel: item.resolved_serving_label,
    frozenName: item.frozen_name, frozenSnapshot: { ...item.frozen_snapshot },
    status: item.status === "skipped" ? "skipped" : "planned", ...patch,
  };
}
function copySource(item: PlannedOccurrenceRow) {
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
    frozenSnapshot: { ...item.frozen_snapshot, reminderEnabled: false },
    status: item.status,
  };
}
function prepareMutation(mutation: MealPlanWeekMutation): MealPlanWeekMutation {
  return {
    ...(mutation.weekOverride !== undefined ? { weekOverride: mutation.weekOverride } : {}),
    ...(mutation.deleteOccurrenceIds !== undefined ? { deleteOccurrenceIds: [...mutation.deleteOccurrenceIds] } : {}),
    ...(mutation.upsertOccurrences !== undefined ? { upsertOccurrences: mutation.upsertOccurrences.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() })) } : {}),
  };
}
function targetSnapshot(data: WeekResponse, target: MealPlanMutationTarget) {
  if (target.kind === "occurrence") {
    const item = data.occurrences.find((occurrence) => occurrence.id === target.id) ?? null;
    if (!item || !target.field) return item;
    return (item as unknown as Record<string, unknown>)[target.field] ?? null;
  }
  if (target.kind === "meal_slot") return data.occurrences.filter((item) => `${item.plan_date}:${item.meal_slot_key}` === target.id);
  if (target.kind === "shopping_item") return object(object(data.week?.week_override_json).shopping)[target.id] ?? null;
  const override = data.week?.week_override_json ?? {};
  return target.field ? object(override)[target.field] ?? null : override;
}
function sameSnapshot(left: unknown, right: unknown) { try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; } }
function queuePayload(item: MealPlanOfflineMutation): QueuePayload | null {
  const weekStartDate = typeof item.payload.weekStartDate === "string" ? item.payload.weekStartDate : "";
  const mutation = item.payload.mutation;
  if (!weekStartDate || !mutation || typeof mutation !== "object" || Array.isArray(mutation)) return null;
  return { weekStartDate, mutation: mutation as MealPlanWeekMutation, baseSnapshot: item.payload.baseSnapshot };
}
function localRow(item: MealPlanOccurrenceMutation, current: PlannedOccurrenceRow | undefined, weekId: string, userId: string): PlannedOccurrenceRow {
  return {
    id: item.id!, week_id: weekId, user_id: userId, plan_date: item.planDate, meal_slot_key: item.mealSlotKey,
    position: item.position ?? 0, source_type: item.sourceType, source_id: item.sourceId ?? null,
    source_version_id: item.sourceVersionId ?? null, resolved_quantity: item.resolvedQuantity ?? null,
    resolved_serving_label: item.resolvedServingLabel ?? null, frozen_name: item.frozenName,
    frozen_snapshot: { ...item.frozenSnapshot }, status: item.status ?? "planned",
    completed_at: current?.completed_at ?? null, actual_log_group_id: current?.actual_log_group_id ?? null,
  };
}
function applyMutationLocally(base: WeekResponse, mutation: MealPlanWeekMutation, context: { weekId: string; revision: number; userId: string; weekStart: string }): WeekResponse {
  let occurrences = [...base.occurrences];
  if (mutation.deleteOccurrenceIds?.length) { const deleted = new Set(mutation.deleteOccurrenceIds); occurrences = occurrences.filter((item) => !deleted.has(item.id)); }
  for (const item of mutation.upsertOccurrences ?? []) {
    if (!item.id) continue;
    const current = occurrences.find((candidate) => candidate.id === item.id);
    const next = localRow(item, current, context.weekId, context.userId);
    occurrences = current ? occurrences.map((candidate) => candidate.id === item.id ? next : candidate) : [...occurrences, next];
  }
  const weekOverride = mutation.weekOverride ?? base.week?.week_override_json ?? {};
  const week = {
    id: context.weekId, user_id: context.userId, week_start_date: context.weekStart, revision: context.revision,
    week_override_json: weekOverride, created_at: base.week?.created_at, updated_at: base.week?.updated_at,
  };
  return { ...base, week, occurrences, shoppingNeeds: deriveShoppingNeeds(occurrences.map((item) => ({ id: item.id, sourceType: item.source_type, frozenSnapshot: item.frozen_snapshot }))) };
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
  const [locale, setLocale] = useState("en-GB");
  const [weekStartOverride, setWeekStartOverride] = useState<MealPlanWeekStartOverride>("locale");
  const localeFirstDay = localeWeekStartDay(locale);
  const effectiveFirstDay = weekStartOverride === "locale" ? localeFirstDay : weekStartOverride;
  const requestedWeek = params.get("week");
  const explicitWeekStart = requestedWeek && isIsoDate(requestedWeek) && weekContainsDate(requestedWeek, selectedDate) ? requestedWeek : null;
  const weekStart = explicitWeekStart ?? startOfMealPlanWeek(selectedDate, effectiveFirstDay);
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
  const [bulkCopyDraft, setBulkCopyDraft] = useState<BulkCopyDraft | null>(null);
  const [skippedReview, setSkippedReview] = useState<PlannedOccurrenceRow | null>(null);
  const syncingRef = useRef(false);
  const reminderTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!ownerId) return;
    setLocale(navigator.language || "en-GB");
    setWeekStartOverride(parseMealPlanWeekStartOverride(window.localStorage.getItem(weekStartOverrideKey(ownerId))));
  }, [ownerId]);

  const fetchWeek = useCallback(() => mealPlanApi<WeekResponse>(`/api/nutrition/v1/meal-plan/week?weekStart=${encodeURIComponent(weekStart)}&date=${encodeURIComponent(selectedDate)}`), [selectedDate, weekStart]);

  const cancelMealReminder = useCallback((occurrenceId: string) => {
    const timer = reminderTimersRef.current.get(occurrenceId);
    if (timer !== undefined) window.clearTimeout(timer);
    reminderTimersRef.current.delete(occurrenceId);
  }, []);

  const scheduleMealReminder = useCallback((item: PlannedOccurrenceRow, plannedTime: string) => {
    cancelMealReminder(item.id);
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || item.status !== "planned" || !plannedTime) return;
    const target = new Date(`${item.plan_date}T${plannedTime}:00`);
    if (!Number.isFinite(target.getTime()) || target.getTime() <= Date.now()) return;
    const scheduleNext = () => {
      const remaining = target.getTime() - Date.now();
      if (remaining <= 0) {
        reminderTimersRef.current.delete(item.id);
        try { new Notification(item.frozen_name, { body: `${item.meal_slot_key} is planned now.`, tag: `plaivra-meal-${item.id}` }); } catch { /* reminder delivery never blocks planning */ }
        return;
      }
      const timer = window.setTimeout(scheduleNext, Math.min(remaining, MAX_BROWSER_TIMEOUT_MS));
      reminderTimersRef.current.set(item.id, timer);
    };
    scheduleNext();
  }, [cancelMealReminder]);

  useEffect(() => {
    if (!data) return;
    for (const item of data.occurrences) {
      const snapshot = object(item.frozen_snapshot);
      const plannedTime = typeof snapshot.plannedTime === "string" ? snapshot.plannedTime : "";
      const reminderEnabled = snapshot.reminderEnabled === true;
      if (item.status !== "planned" || !reminderEnabled || !plannedTime) cancelMealReminder(item.id);
      else scheduleMealReminder(item, plannedTime);
    }
  }, [cancelMealReminder, data, scheduleMealReminder]);
  useEffect(() => () => { for (const id of reminderTimersRef.current.keys()) cancelMealReminder(id); }, [cancelMealReminder]);

  const flushQueue = useCallback(async (serverData: WeekResponse) => {
    if (!ownerId || syncingRef.current) return;
    const stored = readQueue(ownerId, weekStart);
    if (!stored.some((item) => item.status === "queued")) { setSyncState(queueState(stored)); return; }
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
        if (!payload || payload.weekStartDate !== weekStart) { remaining.push(markMealPlanMutationFailed(storedItem, "Queued Meal Plan mutation is no longer readable.")); continue; }
        let candidate = storedItem;
        if (candidate.baseRevision !== workingRevision) {
          const changed = !sameSnapshot(targetSnapshot(working, candidate.target), payload.baseSnapshot);
          candidate = reconcileMealPlanQueue([candidate], { serverRevision: workingRevision, changedTargets: changed ? [candidate.target] : [] })[0]!;
          if (candidate.status === "conflict") { remaining.push(candidate); continue; }
        }
        try {
          const result = await mealPlanApi<{ weekId: string; revision: number }>("/api/nutrition/v1/meal-plan/week", {
            method: "POST",
            body: JSON.stringify({ kind: "mutate", weekId: workingWeekId, weekStartDate: weekStart, baseRevision: candidate.baseRevision, operationId: candidate.operationId, mutation: payload.mutation }),
          });
          workingWeekId = result.weekId;
          workingRevision = result.revision;
          working = applyMutationLocally(working, payload.mutation, { weekId: result.weekId, revision: result.revision, userId: ownerId, weekStart });
          applied += 1;
        } catch (cause) {
          remaining.push(markMealPlanMutationFailed(candidate, cause instanceof Error ? cause.message : "Meal Plan mutation could not be synchronized."), ...stored.slice(index + 1));
          break;
        }
      }
      writeQueue(ownerId, weekStart, remaining);
      setSyncState(queueState(remaining));
      if (applied > 0) {
        const refreshed = await fetchWeek();
        setData(refreshed);
        writeCachedWeek(ownerId, weekStart, refreshed);
        if (!remaining.length) setSyncState("Saved");
      }
    } finally { syncingRef.current = false; }
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
        setData(cached); setError("");
        const queued = readQueue(ownerId, weekStart);
        setSyncState(queueState(queued) || "Saved on device");
      } else setError(cause instanceof Error ? cause.message : "Meal Plan could not be loaded.");
    } finally { setLoading(false); }
  }, [fetchWeek, flushQueue, ownerId, weekStart]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (requestedDate !== selectedDate) router.replace(`/my-meal-plan?date=${encodeURIComponent(selectedDate)}`, { scroll: false }); }, [requestedDate, router, selectedDate]);
  useEffect(() => { const onOnline = () => { void load(); }; window.addEventListener("online", onOnline); return () => window.removeEventListener("online", onOnline); }, [load]);

  const selectedOccurrences = useMemo(() => (data?.occurrences ?? []).filter((item) => item.plan_date === selectedDate), [data, selectedDate]);
  const customSlots = useMemo(() => customSlotMap(data?.week?.week_override_json)[selectedDate] ?? [], [data, selectedDate]);
  const slots = useMemo(() => {
    const occurrenceSlots = selectedOccurrences.map((item) => item.meal_slot_key).filter((slot) => !coreSlots.includes(slot));
    return [...coreSlots, ...Array.from(new Set([...customSlots, ...occurrenceSlots]))];
  }, [customSlots, selectedOccurrences]);
  const target = data?.target?.available ? data.target.values : null;
  const allowExecution = selectedDate <= today;

  function selectDate(date: string) {
    const weekPart = weekContainsDate(weekStart, date) ? `&week=${encodeURIComponent(weekStart)}` : "";
    router.push(`/my-meal-plan?date=${encodeURIComponent(date)}${weekPart}`, { scroll: false });
  }
  function shiftWeek(days: number) {
    const nextWeek = shift(weekStart, days);
    const nextDate = shift(selectedDate, days);
    router.push(`/my-meal-plan?date=${encodeURIComponent(nextDate)}&week=${encodeURIComponent(nextWeek)}`, { scroll: false });
  }
  function changeWeekStart(value: string) {
    if (!ownerId) return;
    const next = parseMealPlanWeekStartOverride(value);
    setWeekStartOverride(next);
    window.localStorage.setItem(weekStartOverrideKey(ownerId), String(next));
    const firstDay = next === "locale" ? localeWeekStartDay(locale) : next;
    const nextWeek = startOfMealPlanWeek(selectedDate, firstDay);
    router.replace(`/my-meal-plan?date=${encodeURIComponent(selectedDate)}&week=${encodeURIComponent(nextWeek)}`, { scroll: false });
  }

  async function mutateWeek(rawMutation: MealPlanWeekMutation, explicitTarget?: MealPlanMutationTarget) {
    if (!data || !ownerId) throw new Error("Meal Plan must be loaded before it can be changed.");
    const mutation = prepareMutation(rawMutation);
    const mutationAuthority = explicitTarget ?? mutationTarget(mutation, weekStart);
    const operationId = crypto.randomUUID();
    const currentWeekId = data.week?.id ?? null;
    const baseRevision = data.week?.revision ?? 0;
    setSyncState("Saving");
    try {
      const result = await mealPlanApi<{ weekId: string; revision: number }>("/api/nutrition/v1/meal-plan/week", {
        method: "POST",
        body: JSON.stringify({ kind: "mutate", weekId: isLocalWeekId(currentWeekId) ? null : currentWeekId, weekStartDate: weekStart, baseRevision, operationId, mutation }),
      });
      if (!result.weekId) throw new Error("Meal Plan mutation was not confirmed.");
      await load();
      setSyncState("Saved");
      return;
    } catch (cause) {
      const baseSnapshot = targetSnapshot(data, mutationAuthority);
      const queuedBase: MealPlanOfflineMutation = {
        operationId, weekId: currentWeekId ?? localWeekId(weekStart), baseRevision, target: mutationAuthority,
        payload: { weekStartDate: weekStart, mutation, baseSnapshot }, status: "queued",
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
    if (item.source_type === "placeholder") { setNotice("Confirm or replace this Placeholder in the logging flow before Plaivra records actual intake."); logWithChanges(item); return; }
    try {
      await mealPlanApi("/api/nutrition/v1/meal-plan/week", { method: "POST", body: JSON.stringify({ kind: "complete", occurrenceId: item.id, operationId: crypto.randomUUID(), executionSnapshot: null }) });
      cancelMealReminder(item.id);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Planned meal could not be completed."); }
  }
  function logWithChanges(item: PlannedOccurrenceRow) { router.push(`/calories?date=${encodeURIComponent(item.plan_date)}&plannedOccurrence=${encodeURIComponent(item.id)}`); }

  async function skip(item: PlannedOccurrenceRow) {
    await mutateWeek({ upsertOccurrences: [occurrenceToMutation(item, { status: "skipped" })] }, { kind: "occurrence", id: item.id, field: "status" });
    cancelMealReminder(item.id);
    const hasShoppingContribution = deriveShoppingNeeds([{ id: item.id, sourceType: item.source_type, frozenSnapshot: item.frozen_snapshot }]).length > 0;
    setSkippedReview(hasShoppingContribution ? item : null);
    setNotice("Meal marked Skipped. Diary was not changed; Shopping remains unchanged until you explicitly review it.");
  }
  async function removeSkippedFromShopping(item: PlannedOccurrenceRow) {
    const currentOverride = data?.week?.week_override_json ?? {};
    const excluded = shoppingExcludedOccurrenceIds(currentOverride);
    if (excluded.includes(item.id)) { setSkippedReview(null); return; }
    await mutateWeek({ weekOverride: { ...currentOverride, shoppingExcludedOccurrenceIds: [...excluded, item.id] } }, { kind: "week_override", id: weekStart, field: "shoppingExcludedOccurrenceIds" });
    setSkippedReview(null);
    setNotice("Skipped meal contribution removed from Shopping. Manual Shopping edits and states were preserved.");
  }

  function beginEdit(item: PlannedOccurrenceRow) {
    const snapshot = object(item.frozen_snapshot);
    setEditDraft({ item, name: item.frozen_name, note: typeof snapshot.note === "string" ? snapshot.note : "", plannedTime: typeof snapshot.plannedTime === "string" ? snapshot.plannedTime : "", reminderEnabled: snapshot.reminderEnabled === true });
  }
  async function enableMealReminder() {
    if (!editDraft?.plannedTime) { setNotice("Add a planned time before enabling a reminder."); return; }
    const targetTime = new Date(`${editDraft.item.plan_date}T${editDraft.plannedTime}:00`).getTime();
    if (!Number.isFinite(targetTime) || targetTime <= Date.now()) { setNotice("Choose a future planned time before enabling a reminder."); return; }
    if (typeof Notification === "undefined") { setNotice("Notifications are not supported in this browser. Planning was not changed."); return; }
    try {
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (permission !== "granted") { setNotice("Notification permission was not granted. Planning remains available without reminders."); return; }
      setEditDraft({ ...editDraft, reminderEnabled: true });
      setNotice("Reminder enabled. Save this planned item to persist it.");
    } catch { setNotice("Reminder could not be enabled. Planning was not blocked."); }
  }
  function disableMealReminder() {
    if (!editDraft) return;
    cancelMealReminder(editDraft.item.id);
    setEditDraft({ ...editDraft, reminderEnabled: false });
  }
  async function saveEdit() {
    if (!editDraft) return;
    const plannedTime = editDraft.plannedTime || null;
    const snapshot = { ...editDraft.item.frozen_snapshot, note: editDraft.note.trim() || null, plannedTime, reminderEnabled: Boolean(plannedTime && editDraft.reminderEnabled) };
    const name = editDraft.item.source_type === "placeholder" ? editDraft.name.trim() : editDraft.item.frozen_name;
    if (!name) { setError("Placeholder name is required."); return; }
    await mutateWeek({ upsertOccurrences: [occurrenceToMutation(editDraft.item, { frozenName: name, frozenSnapshot: snapshot })] }, { kind: "occurrence", id: editDraft.item.id });
    if (!plannedTime || !editDraft.reminderEnabled) cancelMealReminder(editDraft.item.id);
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
    const copies = copyPlannedOccurrences([copySource(copyDraft.item)], copyDraft.dates, () => crypto.randomUUID());
    await mutateWeek({ upsertOccurrences: copies }, { kind: "meal_slot", id: `${copyDraft.item.plan_date}:${copyDraft.item.meal_slot_key}` });
    setCopyDraft(null);
  }

  async function writeCopiesToWeek(targetWeekStart: string, copies: MealPlanOccurrenceMutation[]) {
    if (!ownerId || !data) return;
    if (targetWeekStart === weekStart) { await mutateWeek({ upsertOccurrences: copies }); return; }
    let targetData: WeekResponse | null = null;
    try { targetData = await mealPlanApi<WeekResponse>(`/api/nutrition/v1/meal-plan/week?weekStart=${encodeURIComponent(targetWeekStart)}&date=${encodeURIComponent(targetWeekStart)}`); }
    catch { targetData = readCachedWeek(ownerId, targetWeekStart); }
    if (!targetData) targetData = { week: null, occurrences: [], target: data.target, pendingChangeRequests: [], shoppingNeeds: [] };
    const groups = new Map<string, MealPlanOccurrenceMutation[]>();
    for (const copy of copies) {
      const key = `${copy.planDate}:${copy.mealSlotKey}`;
      groups.set(key, [...(groups.get(key) ?? []), copy]);
    }
    let working = targetData;
    let workingWeekId = targetData.week?.id ?? null;
    let workingRevision = targetData.week?.revision ?? 0;
    for (const [targetId, group] of groups) {
      const mutation = prepareMutation({ upsertOccurrences: group });
      const targetAuthority: MealPlanMutationTarget = { kind: "meal_slot", id: targetId };
      const operationId = crypto.randomUUID();
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
        const result = await mealPlanApi<{ weekId: string; revision: number }>("/api/nutrition/v1/meal-plan/week", {
          method: "POST",
          body: JSON.stringify({ kind: "mutate", weekId: isLocalWeekId(workingWeekId) ? null : workingWeekId, weekStartDate: targetWeekStart, baseRevision: workingRevision, operationId, mutation }),
        });
        workingWeekId = result.weekId; workingRevision = result.revision;
        working = applyMutationLocally(working, mutation, { weekId: result.weekId, revision: result.revision, userId: ownerId, weekStart: targetWeekStart });
      } catch (cause) {
        const queued: MealPlanOfflineMutation = {
          operationId, weekId: workingWeekId ?? localWeekId(targetWeekStart), baseRevision: workingRevision, target: targetAuthority,
          payload: { weekStartDate: targetWeekStart, mutation, baseSnapshot: targetSnapshot(working, targetAuthority) },
          status: typeof navigator !== "undefined" && navigator.onLine ? "needs_attention" : "queued",
          ...(typeof navigator !== "undefined" && navigator.onLine ? { error: cause instanceof Error ? cause.message : "Copy needs attention." } : {}),
        };
        writeQueue(ownerId, targetWeekStart, enqueueMealPlanMutation(readQueue(ownerId, targetWeekStart), queued));
        const optimisticWeekId = workingWeekId ?? localWeekId(targetWeekStart);
        workingRevision += 1;
        workingWeekId = optimisticWeekId;
        working = applyMutationLocally(working, mutation, { weekId: optimisticWeekId, revision: workingRevision, userId: ownerId, weekStart: targetWeekStart });
      }
    }
    writeCachedWeek(ownerId, targetWeekStart, working);
  }

  async function saveBulkCopy() {
    if (!bulkCopyDraft || !data) return;
    const sourceRows = bulkCopyDraft.scope === "day" ? selectedOccurrences : data.occurrences;
    if (!sourceRows.length) { setNotice(`There is nothing to copy from this ${bulkCopyDraft.scope}.`); setBulkCopyDraft(null); return; }
    const targetWeekStart = bulkCopyDraft.scope === "week" ? startOfMealPlanWeek(bulkCopyDraft.targetDate, effectiveFirstDay) : startOfMealPlanWeek(bulkCopyDraft.targetDate, effectiveFirstDay);
    const copies = sourceRows.flatMap((item) => {
      const targetDate = bulkCopyDraft.scope === "day" ? bulkCopyDraft.targetDate : shift(targetWeekStart, dayOffset(weekStart, item.plan_date));
      return copyPlannedOccurrences([copySource(item)], [targetDate], () => crypto.randomUUID());
    });
    await writeCopiesToWeek(targetWeekStart, copies);
    setNotice(`${bulkCopyDraft.scope === "day" ? "Day" : "Week"} copied with fresh planned-item identities. Execution, reminder, and Shopping state were not copied.`);
    setBulkCopyDraft(null);
  }

  async function addCustomSlot() {
    const name = customSlotName.trim();
    if (!name || coreSlots.includes(name) || customSlots.includes(name)) return;
    const currentOverride = data?.week?.week_override_json ?? {};
    const map = customSlotMap(currentOverride);
    await mutateWeek({ weekOverride: { ...currentOverride, customSlots: { ...map, [selectedDate]: [...customSlots, name] } } }, { kind: "week_override", id: weekStart, field: "customSlots" });
    setCustomSlotName(""); setAddingCustomSlot(false);
  }

  async function approve(id: string) {
    try { const result = await mealPlanApi<{ state: "applied" | "stale" }>("/api/nutrition/v1/meal-plan/week", { method: "POST", body: JSON.stringify({ kind: "apply_change_request", changeRequestId: id }) }); setStaleProposal(result.state === "stale"); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Proposed changes could not be applied."); }
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><label className="flex min-h-11 items-center gap-2 text-sm font-medium">Week starts<select value={String(weekStartOverride)} onChange={(event) => changeWeekStart(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="locale">Locale default · {weekdayOptions.find((item) => item.value === localeFirstDay)?.label}</option>{weekdayOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><button type="button" onClick={() => setBulkCopyDraft({ scope: "week", targetDate: shift(weekStart, 7) })} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">Copy week</button></div>
        <div className="mt-4"><WeekStrip dates={dates} selectedDate={selectedDate} today={today} onSelect={selectDate} /></div>
      </header>
      {syncState ? <p role="status" className="mt-4 rounded-xl border border-border px-3 py-2 text-sm">{syncState}{syncState === "Needs attention" ? " — your local changes are preserved for review." : ""}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-xl bg-muted p-3 text-sm">{notice}</p> : null}
      {skippedReview ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"><p className="text-sm"><span className="font-semibold">Shopping review:</span> {skippedReview.frozen_name} was skipped, but its frozen Shopping contribution is still included.</p><button type="button" onClick={() => void removeSkippedFromShopping(skippedReview)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold">Review & Remove</button></div> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
      {loading && !data ? <div className="mt-5 space-y-3"><div className="h-24 animate-pulse rounded-2xl bg-muted" /><div className="h-36 animate-pulse rounded-2xl bg-muted" /></div> : null}
      {data ? <>
        <div className="py-5"><div className="flex flex-wrap items-baseline justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected day</p><h2 className="mt-1 text-xl font-semibold">{label(selectedDate, { weekday: "long", month: "long", day: "numeric" })}</h2></div><div className="flex flex-wrap gap-2">{selectedDate !== today ? <button type="button" onClick={() => selectDate(today)} className="min-h-11 rounded-xl px-3 text-sm font-medium hover:bg-muted">Today</button> : null}<button type="button" onClick={() => setBulkCopyDraft({ scope: "day", targetDate: shift(selectedDate, 1) })} className="min-h-11 rounded-xl px-3 text-sm font-medium hover:bg-muted">Copy day</button><button type="button" onClick={() => setAddingCustomSlot(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />Add meal slot</button></div></div></div>
        <PlannedNutritionSummary occurrences={selectedOccurrences} target={target} />
        <PendingChangeReview requests={data.pendingChangeRequests} stale={staleProposal} onApprove={(id) => void approve(id)} onCancel={(id) => void cancel(id)} />
        <div aria-label="Selected day meals">{slots.map((slot) => <MealSlotSection key={slot} label={slot} items={selectedOccurrences.filter((item) => item.meal_slot_key === slot)} allowExecution={allowExecution} markEatenLabel={markEatenLabel} logWithChangesLabel={logWithChangesLabel} onAdd={() => setAddSlot(slot)} onMarkEaten={(item) => void markEaten(item)} onLogWithChanges={logWithChanges} onSkip={(item) => void skip(item)} onEdit={beginEdit} onMove={beginMove} onCopy={beginCopy} />)}</div>
        {!selectedOccurrences.length ? <div className="py-6 text-center"><p className="font-medium">Nothing planned for this day.</p><p className="mt-1 text-sm text-muted-foreground">Add manually or use ChatGPT as an external planning accelerator.</p><button type="button" onClick={() => setAddSlot("Breakfast")} className="mt-3 min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Add to plan</button></div> : null}
      </> : null}

      {addingCustomSlot ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="custom-slot-title"><div className="w-full max-w-md rounded-t-3xl bg-background p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><h2 id="custom-slot-title" className="text-lg font-semibold">Add meal slot</h2><button type="button" className="min-h-11 min-w-11 rounded-xl" aria-label="Close" onClick={() => setAddingCustomSlot(false)}><X className="mx-auto h-5 w-5" /></button></div><label className="mt-4 block text-sm font-medium" htmlFor="custom-meal-slot">Slot name</label><input id="custom-meal-slot" value={customSlotName} onChange={(event) => setCustomSlotName(event.target.value)} placeholder="Post-workout" className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setAddingCustomSlot(false)} className="min-h-11 rounded-xl px-4 text-sm font-medium">Cancel</button><button type="button" onClick={() => void addCustomSlot()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Add</button></div></div></div> : null}

      {editDraft ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="edit-plan-title"><div className="w-full max-w-md rounded-t-3xl bg-background p-5 sm:rounded-3xl"><h2 id="edit-plan-title" className="text-lg font-semibold">Edit planned item</h2>{editDraft.item.source_type === "placeholder" ? <><label className="mt-4 block text-sm font-medium" htmlFor="edit-plan-name">Name</label><input id="edit-plan-name" value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></> : <p className="mt-2 text-sm text-muted-foreground">Source identity and frozen nutrition stay unchanged. Edit occurrence-only planning details here.</p>}<label className="mt-4 block text-sm font-medium" htmlFor="edit-plan-time">Planned time</label><input id="edit-plan-time" type="time" value={editDraft.plannedTime} onChange={(event) => setEditDraft({ ...editDraft, plannedTime: event.target.value, reminderEnabled: event.target.value ? editDraft.reminderEnabled : false })} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /><div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border p-3"><div><p className="text-sm font-medium">{editDraft.reminderEnabled ? "Reminder on" : "Reminder off"}</p><p className="text-xs text-muted-foreground">Optional. Permission is requested only when you explicitly enable it.</p></div>{editDraft.reminderEnabled ? <button type="button" onClick={disableMealReminder} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">Disable reminder</button> : <button type="button" disabled={!editDraft.plannedTime} onClick={() => void enableMealReminder()} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium disabled:opacity-50">Enable reminder</button>}</div><label className="mt-4 block text-sm font-medium" htmlFor="edit-plan-note">Note</label><textarea id="edit-plan-note" value={editDraft.note} onChange={(event) => setEditDraft({ ...editDraft, note: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setEditDraft(null)} className="min-h-11 rounded-xl px-4 text-sm font-medium">Cancel</button><button type="button" onClick={() => void saveEdit()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Save</button></div></div></div> : null}

      {moveDraft ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="move-plan-title"><div className="w-full max-w-md rounded-t-3xl bg-background p-5 sm:rounded-3xl"><h2 id="move-plan-title" className="text-lg font-semibold">Move planned item</h2><label className="mt-4 block text-sm font-medium" htmlFor="move-plan-date">Day</label><select id="move-plan-date" value={moveDraft.date} onChange={(event) => setMoveDraft({ ...moveDraft, date: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{dates.map((date) => <option key={date} value={date}>{label(date, { weekday: "long", month: "short", day: "numeric" })}</option>)}</select><label className="mt-4 block text-sm font-medium" htmlFor="move-plan-slot">Meal slot</label><select id="move-plan-slot" value={moveDraft.slot} onChange={(event) => setMoveDraft({ ...moveDraft, slot: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{slots.map((slot) => <option key={slot}>{slot}</option>)}</select><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setMoveDraft(null)} className="min-h-11 rounded-xl px-4 text-sm font-medium">Cancel</button><button type="button" onClick={() => void saveMove()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Move</button></div></div></div> : null}

      {copyDraft ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="copy-plan-title"><div className="w-full max-w-md rounded-t-3xl bg-background p-5 sm:rounded-3xl"><h2 id="copy-plan-title" className="text-lg font-semibold">Copy / repeat to selected days</h2><p className="mt-1 text-sm text-muted-foreground">Copies receive fresh identities and start as Planned. Execution, reminder, and Shopping state are not copied.</p><div className="mt-3 divide-y divide-border">{dates.map((date) => <label key={date} className="flex min-h-11 items-center gap-3 py-2"><input type="checkbox" checked={copyDraft.dates.includes(date)} onChange={(event) => setCopyDraft({ ...copyDraft, dates: event.target.checked ? [...copyDraft.dates, date] : copyDraft.dates.filter((value) => value !== date) })} /><span className="text-sm">{label(date, { weekday: "long", month: "short", day: "numeric" })}</span></label>)}</div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setCopyDraft(null)} className="min-h-11 rounded-xl px-4 text-sm font-medium">Cancel</button><button type="button" disabled={!copyDraft.dates.length} onClick={() => void saveCopy()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50">Copy</button></div></div></div> : null}

      {bulkCopyDraft ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="bulk-copy-title"><div className="w-full max-w-md rounded-t-3xl bg-background p-5 sm:rounded-3xl"><h2 id="bulk-copy-title" className="text-lg font-semibold">{bulkCopyDraft.scope === "day" ? "Copy day" : "Copy week"}</h2><p className="mt-1 text-sm text-muted-foreground">This is a bounded copy, not a recurrence rule. New occurrences receive fresh identities and start Planned.</p><label className="mt-4 block text-sm font-medium" htmlFor="bulk-copy-date">{bulkCopyDraft.scope === "day" ? "Target day" : "A date in the target week"}</label><input id="bulk-copy-date" type="date" value={bulkCopyDraft.targetDate} onChange={(event) => setBulkCopyDraft({ ...bulkCopyDraft, targetDate: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setBulkCopyDraft(null)} className="min-h-11 rounded-xl px-4 text-sm font-medium">Cancel</button><button type="button" disabled={!isIsoDate(bulkCopyDraft.targetDate)} onClick={() => void saveBulkCopy()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50">Copy</button></div></div></div> : null}

      {addSlot ? <AddToPlanWorkspace date={selectedDate} mealSlotKey={addSlot} onClose={() => setAddSlot(null)} onCommit={mutate} /> : null}
    </main>
  );
}
