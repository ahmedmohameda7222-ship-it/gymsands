"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Camera, Edit3, ImageIcon, Trash2, Upload } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { CardGridSkeleton, ErrorState } from "@/components/ui/state-views";
import { ProgressEntryModal } from "@/components/progress/progress-entry-modal";
import { ProgressCharts } from "@/components/progress/progress-charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/auth/auth-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { getNutritionWeek } from "@/services/database/nutrition";
import { updateProfile } from "@/services/database/profile";
import { getProgressEntries } from "@/services/database/progress";
import { getWorkoutActivity } from "@/services/database/workout-sessions";
import { deleteProgressEntryWithMeasurements, updateProgressEntryWithMeasurements } from "@/services/progress/progress-measurements";
import { deleteProgressPhoto, getProgressPhotos, uploadProgressPhoto, validateProgressPhotoFile, type ProgressPhoto, type ProgressPhotoType } from "@/services/progress/progress-photos";
import type { BodyMeasurement, DailyNutritionSummary, ProgressEntry, WorkoutSession } from "@/types";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { addDays, daysBetween, startOfWeek } from "@/lib/date-utils";
import { useUserSettings } from "@/lib/settings/user-settings-context";

const GOAL_WEIGHT_STORAGE_KEY = "plaivra_goal_weight_kg";
const LEGACY_GOAL_WEIGHT_STORAGE_KEY = "fitlife_goal_weight_kg";
const photoTypes: ProgressPhotoType[] = ["front", "side", "back"];

const editableMeasurementFields: Array<[keyof BodyMeasurement, string]> = [
  ["hips_cm", "Hips cm"],
  ["chest_cm", "Chest cm"],
  ["shoulders_cm", "Shoulders cm"],
  ["left_arm_cm", "Left arm cm"],
  ["right_arm_cm", "Right arm cm"],
  ["left_thigh_cm", "Left thigh cm"],
  ["right_thigh_cm", "Right thigh cm"],
  ["glutes_cm", "Glutes / hips cm"],
  ["calves_cm", "Calves cm"],
  ["neck_cm", "Neck cm"],
  ["body_fat_percent", "Manual body fat %"]
];

type EditDraft = {
  entryDate: string;
  bodyWeightKg: string;
  waistCm: string;
  notes: string;
  measurements: Record<string, string>;
};

type MeasurementTrend = { label: string; latest: number | null; delta: number | null; unit: string };
type WeeklyInsights = ReturnType<typeof buildWeeklyInsights>;
type ProgressFeedback = { label: string; value: string; detail: string };
type GoalSaveStatus = "idle" | "saving" | "synced" | "local" | "failed";
type EntryActionError = { entryId: string; message: string } | null;

export default function ProgressPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { settings } = useUserSettings();
  const { toast } = useToast();
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [workoutActivity, setWorkoutActivity] = useState<WorkoutSession[]>([]);
  const [nutritionWeek, setNutritionWeek] = useState<DailyNutritionSummary[]>([]);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [goalWeight, setGoalWeight] = useState("");
  const [editingEntry, setEditingEntry] = useState<ProgressEntry | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sourceIssues, setSourceIssues] = useState<string[]>([]);
  const [photoLoadError, setPhotoLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [goalSaveStatus, setGoalSaveStatus] = useState<GoalSaveStatus>("idle");
  const [goalStatusMessage, setGoalStatusMessage] = useState("");
  const [savingEntryId, setSavingEntryId] = useState("");
  const [deletingEntryId, setDeletingEntryId] = useState("");
  const [entryActionError, setEntryActionError] = useState<EntryActionError>(null);
  const [recentlyUpdatedEntryId, setRecentlyUpdatedEntryId] = useState("");
  const { dialog, ask } = useConfirm();
  const today = useTodayDate();
  const currentWeekStart = useMemo(() => startOfWeek(today), [today]);
  const userId = user?.id ?? "";

  const loadProgress = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError("");
    setSourceIssues([]);
    setPhotoLoadError("");

    const [progressResult, activityResult, weekResult, photosResult] = await Promise.allSettled([
      getProgressEntries(userId, { throwOnError: true }),
      getWorkoutActivity(userId),
      getNutritionWeek(userId, currentWeekStart),
      settings.hideProgressPhotos ? Promise.resolve([] as ProgressPhoto[]) : getProgressPhotos(userId)
    ]);

    if (progressResult.status === "fulfilled") {
      setEntries(progressResult.value);
    } else {
      const message = messageFromError(progressResult.reason, "Progress entries could not load.");
      setEntries([]);
      setLoadError(message);
      setIsLoading(false);
      return;
    }

    const issues: string[] = [];
    if (activityResult.status === "fulfilled") {
      setWorkoutActivity(activityResult.value);
    } else {
      setWorkoutActivity([]);
      issues.push("Workout consistency could not load.");
    }

    if (weekResult.status === "fulfilled") {
      setNutritionWeek(weekResult.value);
    } else {
      setNutritionWeek([]);
      issues.push("Nutrition context could not load.");
    }

    if (photosResult.status === "fulfilled") {
      setPhotos(photosResult.value);
    } else {
      setPhotos([]);
      setPhotoLoadError(messageFromError(photosResult.reason, "Progress photos could not load."));
    }

    setSourceIssues(issues);
    setIsLoading(false);
  }, [currentWeekStart, settings.hideProgressPhotos, userId]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    // TODO(migration): Move goal weight to Supabase profile completely
    const storedGoal = window.localStorage.getItem(GOAL_WEIGHT_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_GOAL_WEIGHT_STORAGE_KEY);
    if (profile?.target_weight_kg) {
      setGoalWeight(String(profile.target_weight_kg));
      setGoalSaveStatus("synced");
      setGoalStatusMessage("Goal weight synced to profile.");
    } else if (storedGoal) {
      setGoalWeight(storedGoal);
      setGoalSaveStatus("local");
      setGoalStatusMessage("Goal saved on this device only.");
    } else {
      setGoalSaveStatus("idle");
      setGoalStatusMessage("Set a goal weight to track profile sync here.");
    }
  }, [profile?.target_weight_kg]);

  useEffect(() => {
    if (settings.hideProgressPhotos && activeTab === "photos") {
      setActiveTab("overview");
    }
  }, [activeTab, settings.hideProgressPhotos]);

  const sortedEntries = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const weightEntries = sortedEntries.filter(hasBodyWeight);
  const latestWeightEntry = weightEntries.at(-1) ?? null;
  const firstWeightEntry = weightEntries[0] ?? null;
  const previousWeightEntry = weightEntries.length > 1 ? weightEntries.at(-2) ?? null : null;
  const latest = sortedEntries.at(-1);
  const first = sortedEntries[0];
  const latestMeasurement = latest?.measurements ?? null;
  const latestWaist = latest?.measurements?.waist_cm ?? latest?.waist_cm ?? null;
  const firstWaist = first?.measurements?.waist_cm ?? first?.waist_cm ?? null;
  const completedCount = workoutActivity.filter((session) => session.status === "completed").length;
  const skippedCount = workoutActivity.filter((session) => session.status === "skipped").length;
  const weightDelta = latestWeightEntry && firstWeightEntry ? round(latestWeightEntry.body_weight_kg - firstWeightEntry.body_weight_kg) : null;
  const waistDelta = isFiniteNumber(latestWaist) && isFiniteNumber(firstWaist) ? round(latestWaist - firstWaist) : null;
  const sevenDayAverage = averageWeight(weightEntries, 7);
  const thirtyDayAverage = averageWeight(weightEntries, 30);
  const latestWeightChange = previousWeightEntry && latestWeightEntry ? round(latestWeightEntry.body_weight_kg - previousWeightEntry.body_weight_kg) : null;
  const numericGoalWeight = Number(goalWeight);
  const targetDateEstimate = estimateTargetDate(weightEntries, numericGoalWeight);
  const weeklyInsights = buildWeeklyInsights({ nutritionWeek, workoutActivity, entries: sortedEntries, today });
  const consistencyScore = weeklyInsights.consistencyScore ?? calculateConsistencyScore({ entries: sortedEntries, completedCount, skippedCount });
  const measurementTrends = buildMeasurementTrends(sortedEntries);
  const progressFeedback = buildProgressFeedback({
    entries: sortedEntries,
    latestWeightChange,
    weeklyInsights,
    consistencyScore,
    measurementTrends
  });
  const nextLogAction = buildNextLogAction({ entries: sortedEntries, latestWeightEntry, latestMeasurement });
  const goalStatusLabel = numericGoalWeight && latestWeightEntry
    ? `${Math.abs(round(latestWeightEntry.body_weight_kg - numericGoalWeight))} kg to goal`
    : "No synced goal trend yet";

  async function saveGoalWeight() {
    if (!numericGoalWeight || numericGoalWeight < 25 || numericGoalWeight > 300) {
      setGoalSaveStatus("failed");
      setGoalStatusMessage("Enter a realistic goal weight in kilograms.");
      toast({ title: "Check goal weight", description: "Enter a realistic goal weight in kilograms." });
      return;
    }
    try {
      setGoalSaveStatus("saving");
      setGoalStatusMessage("Syncing goal weight to your profile...");
      if (!profile?.id) throw new Error("Profile is still loading.");
      await updateProfile(profile.id, { targetWeightKg: numericGoalWeight });
      window.localStorage.removeItem(GOAL_WEIGHT_STORAGE_KEY);
      await refreshProfile();
      setGoalSaveStatus("synced");
      setGoalStatusMessage("Goal weight synced to profile.");
      toast({ title: "Goal weight saved", description: "The goal is synced to your Plaivra profile." });
    } catch (error) {
      window.localStorage.setItem(GOAL_WEIGHT_STORAGE_KEY, String(numericGoalWeight));
      window.localStorage.removeItem(LEGACY_GOAL_WEIGHT_STORAGE_KEY);
      setGoalSaveStatus("local");
      setGoalStatusMessage(messageFromError(error, "Profile sync failed, so this goal is saved on this device only."));
      toast({
        title: "Goal saved on this device",
        description: error instanceof Error ? `${error.message} The local fallback was kept.` : "Profile sync failed, so the local fallback was kept."
      });
    }
  }



  function startEdit(entry: ProgressEntry) {
    const measurement = entry.measurements;
    setEntryActionError(null);
    setRecentlyUpdatedEntryId("");
    setEditingEntry(entry);
    setEditDraft({
      entryDate: entry.entry_date,
      bodyWeightKg: stringifyNullable(entry.body_weight_kg),
      waistCm: stringifyNullable(measurement?.waist_cm ?? entry.waist_cm),
      notes: entry.notes ?? "",
      measurements: Object.fromEntries(editableMeasurementFields.map(([key]) => [key, stringifyNullable(measurement?.[key])]))
    });
  }

  async function saveEdit() {
    if (!user?.id || !editingEntry || !editDraft) return;
    try {
      setSavingEntryId(editingEntry.id);
      setEntryActionError(null);
      const updated = await updateProgressEntryWithMeasurements(user.id, editingEntry.id, {
        entryDate: editDraft.entryDate,
        bodyWeightKg: numberOrNull(editDraft.bodyWeightKg),
        waistCm: numberOrNull(editDraft.waistCm),
        notes: editDraft.notes.trim() || null,
        measurements: Object.fromEntries(Object.entries(editDraft.measurements).map(([key, value]) => [key, numberOrNull(value)])) as Partial<BodyMeasurement>
      });
      setEntries((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setRecentlyUpdatedEntryId(updated.id);
      setEditingEntry(null);
      setEditDraft(null);
      toast({ title: "Progress entry updated", description: "The entry and linked measurements were updated." });
    } catch (error) {
      const message = messageFromError(error, "Please try again.");
      setEntryActionError({ entryId: editingEntry.id, message: `Entry was not updated. ${message}` });
      toast({ title: "Could not update progress", description: message });
    } finally {
      setSavingEntryId("");
    }
  }

  async function deleteEntry(entry: ProgressEntry) {
    if (!user?.id) return;
    ask({
      title: "Delete progress entry?",
      description: `Delete progress entry from ${entry.entry_date}? Progress photos are managed separately.`,
      variant: "destructive",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          setDeletingEntryId(entry.id);
          setEntryActionError(null);
          await deleteProgressEntryWithMeasurements(user.id, entry.id);
          setEntries((current) => current.filter((item) => item.id !== entry.id));
          if (editingEntry?.id === entry.id) {
            setEditingEntry(null);
            setEditDraft(null);
          }
          toast({ title: "Progress entry deleted", description: "Measurement data linked to this entry was removed." });
        } catch (error) {
          const message = messageFromError(error, "Please try again.");
          setEntryActionError({ entryId: entry.id, message: `Entry was not deleted. Your history was restored. ${message}` });
          toast({ title: "Could not delete progress entry", description: message });
        } finally {
          setDeletingEntryId("");
        }
      }
    });
  }

  if (isLoading) {
    return (
      <>
        {dialog}
        <PageHeading title="Progress Tracker" description="Track body weight, measurements, private progress photos, workout consistency, and real trend insights." />
        <div className="mt-6">
          <CardGridSkeleton />
        </div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        {dialog}
        <PageHeading title="Progress Tracker" description="Track body weight, measurements, private progress photos, workout consistency, and real trend insights." />
        <div className="mt-6">
          <ErrorState
            title="Progress data could not load"
            description={`${loadError} Existing saved data was not changed.`}
            onRetry={loadProgress}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {dialog}
      <PageHeading title="Progress Tracker" description="Track body weight, measurements, private progress photos, workout consistency, and real trend insights." />

      <div className="mb-4 space-y-3">
        {sourceIssues.length ? (
          <ErrorState
            title="Some progress context could not load"
            description={`${sourceIssues.join(" ")} Existing saved data was not changed.`}
            onRetry={loadProgress}
            className="border-warning/30 bg-warning/10"
          />
        ) : null}
        {settings.hideProgressPhotos ? (
          <Card variant="glass" className="border-primary/20">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Photos are hidden by your Progress photo privacy setting. Your entry trends remain available here.
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="measurements">Measurements</TabsTrigger>
          {!settings.hideProgressPhotos ? <TabsTrigger value="photos">Photos</TabsTrigger> : null}
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Progress status hero */}
          <div className="glass-card-strong p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Goal and trend status</p>
              <p className="text-xs text-muted-foreground">{latestWeightEntry?.entry_date ?? "No entry yet"}</p>
            </div>
            <div className="mt-2">
              <p className="text-4xl font-bold tracking-tight text-foreground">
                {latestWeightEntry ? `${latestWeightEntry.body_weight_kg} kg` : "—"}
              </p>
              {latestWeightEntry && previousWeightEntry && latestWeightChange !== null ? (
                <p className={`mt-1 inline-flex items-center gap-1 text-sm font-medium ${latestWeightChange < 0 ? "text-success" : latestWeightChange > 0 ? "text-warning" : "text-muted-foreground"}`}>
                  {latestWeightChange < 0 ? "↓" : latestWeightChange > 0 ? "↑" : "→"} {Math.abs(latestWeightChange)} kg from previous
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Add a second entry to see trend</p>
              )}
            </div>

            <div className="mt-4 rounded-[18px] border border-border/70 bg-card/70 p-4">
              <p className="text-sm font-semibold text-foreground">Next useful log</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{nextLogAction}</p>
            </div>

            {/* Goal progress */}
            {numericGoalWeight && latestWeightEntry && firstWeightEntry ? (
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Goal: {numericGoalWeight} kg</span>
                  <span className="font-medium text-foreground">
                    {Math.abs(round(latestWeightEntry.body_weight_kg - numericGoalWeight))} kg to go
                  </span>
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(() => {
                      const total = Math.abs(firstWeightEntry.body_weight_kg - numericGoalWeight);
                      const moved = Math.abs(firstWeightEntry.body_weight_kg - latestWeightEntry.body_weight_kg);
                      if (total === 0) return "0%";
                      const direction = numericGoalWeight - firstWeightEntry.body_weight_kg;
                      const actualDirection = latestWeightEntry.body_weight_kg - firstWeightEntry.body_weight_kg;
                      return (direction * actualDirection >= 0) ? `${Math.min(100, Math.round((moved / total) * 100))}%` : "0%";
                    })()}` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{targetDateEstimate}</p>
                <p className={`mt-2 text-xs ${goalSaveStatus === "failed" ? "text-destructive" : goalSaveStatus === "local" ? "text-warning" : "text-muted-foreground"}`}>
                  {goalStatusMessage}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input id="goal-weight" type="number" className="h-12" value={goalWeight} onChange={(event) => setGoalWeight(event.target.value)} placeholder="Goal kg" disabled={goalSaveStatus === "saving"} />
                  <Button className="h-12 sm:min-w-28" onClick={saveGoalWeight} disabled={goalSaveStatus === "saving"}>
                    {goalSaveStatus === "saving" ? "Saving" : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">Set a goal weight to track progress.</p>
                <p className={`mt-1 text-xs ${goalSaveStatus === "failed" ? "text-destructive" : goalSaveStatus === "local" ? "text-warning" : "text-muted-foreground"}`}>
                  {goalStatusMessage}
                </p>
                <div className="mt-2 flex gap-2">
                  <Input type="number" className="h-12" value={goalWeight} onChange={(event) => setGoalWeight(event.target.value)} placeholder="Goal kg" disabled={goalSaveStatus === "saving"} />
                  <Button className="h-12" onClick={saveGoalWeight} disabled={goalSaveStatus === "saving"}>{goalSaveStatus === "saving" ? "Saving" : "Save"}</Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Goal weight synced to profile when possible. If sync fails, Plaivra keeps a local fallback on this device.</p>
              </div>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <ProgressEntryModal onSaved={(entry) => setEntries((current) => [...current, entry])} buttonClassName="w-full" />
              {!settings.hideProgressPhotos ? (
                <Button type="button" variant="outline" className="h-12 w-full" onClick={() => setActiveTab("photos")}>
                  <Camera className="h-4 w-4" />
                  Add private photo
                </Button>
              ) : null}
            </div>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <CompactStat label="7-day avg" value={sevenDayAverage === null ? "—" : `${sevenDayAverage} kg`} />
            <CompactStat label="30-day avg" value={thirtyDayAverage === null ? "—" : `${thirtyDayAverage} kg`} />
            <CompactStat label="Waist" value={isFiniteNumber(latestWaist) ? `${latestWaist} cm` : "—"} />
            <CompactStat label="Consistency" value={`${consistencyScore}%`} />
          </div>

          {/* Charts */}
          <ProgressCharts entries={entries} workoutActivity={workoutActivity} />

          {/* Progress Feedback */}
          <ProgressFeedbackCard feedback={progressFeedback} />

          {/* Latest measurements preview */}
          {latestMeasurement && (
            <Card variant="glassStrong">
              <CardHeader className="p-4 pb-0">
                <CardTitle className="text-sm font-medium">Latest measurements</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {measurementTrends.filter(t => t.latest !== null).slice(0, 6).map(t => (
                    <div key={t.label} className="glass-card p-3">
                      <p className="text-xs text-muted-foreground">{t.label}</p>
                      <p className="mt-1 text-lg font-semibold">{t.latest}{t.unit}</p>
                      {t.delta !== null && (
                        <p className={`mt-0.5 text-xs ${t.delta < 0 ? "text-success" : t.delta > 0 ? "text-warning" : "text-muted-foreground"}`}>
                          {formatDelta(t.delta)}{t.unit}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setActiveTab("measurements")} className="mt-3 inline-flex min-h-12 items-center rounded-[14px] border border-border/80 px-4 text-sm font-medium text-primary">
                  See all measurements →
                </button>
              </CardContent>
            </Card>
          )}

          {/* Photos shortcut */}
          {!settings.hideProgressPhotos && photos.length > 0 && (
            <Card variant="glass">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Progress photos</p>
                    <p className="text-xs text-muted-foreground">{photos.length} photo{photos.length !== 1 ? 's' : ''} saved</p>
                  </div>
                  <button onClick={() => setActiveTab("photos")} className="inline-flex min-h-12 items-center rounded-[14px] border border-border/80 px-4 text-sm font-medium text-primary">
                    View →
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent history preview */}
          {entries.length > 0 && (
            <Card>
              <CardHeader className="p-4 pb-0">
                <CardTitle className="text-sm font-medium">Recent entries</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-2">
                  {sortedEntries.slice(-3).reverse().map(entry => (
                    <div key={entry.id} className={`solid-row flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between ${recentlyUpdatedEntryId === entry.id ? "border-primary/50 bg-primary/5" : ""}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{entry.entry_date}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.body_weight_kg ? `${entry.body_weight_kg} kg` : "No weight"}
                          {(entry.measurements?.waist_cm ?? entry.waist_cm) ? ` · ${entry.measurements?.waist_cm ?? entry.waist_cm} cm waist` : ""}
                        </p>
                        {entryActionError?.entryId === entry.id ? <p className="mt-2 text-xs text-destructive">{entryActionError.message}</p> : null}
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-12 w-12" onClick={() => startEdit(entry)} disabled={savingEntryId === entry.id || deletingEntryId === entry.id} aria-label={`Edit progress entry from ${entry.entry_date}`}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-12 w-12 text-destructive" onClick={() => deleteEntry(entry)} disabled={savingEntryId === entry.id || deletingEntryId === entry.id} aria-label={`Delete progress entry from ${entry.entry_date}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setActiveTab("history")} className="mt-3 inline-flex min-h-12 items-center rounded-[14px] border border-border/80 px-4 text-sm font-medium text-primary">
                  View full history →
                </button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="measurements" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Measurement trends</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {measurementTrends.map((trend) => <TrendCard key={trend.label} trend={trend} />)}
              </CardContent>
            </Card>
        </TabsContent>

        {!settings.hideProgressPhotos ? (
          <TabsContent value="photos" className="space-y-4">
            {photoLoadError ? (
              <ErrorState
                title="Progress photos could not load"
                description={`${photoLoadError} Your saved photo data was not changed.`}
                onRetry={loadProgress}
              />
            ) : null}
            <ProgressPhotoManager userId={user?.id ?? null} photos={photos} setPhotos={setPhotos} photosUnavailable={Boolean(photoLoadError)} />
          </TabsContent>
        ) : null}

        <TabsContent value="history" className="space-y-4">
          {editingEntry && editDraft ? <EditProgressCard draft={editDraft} setDraft={setEditDraft} error={entryActionError?.entryId === editingEntry.id ? entryActionError.message : ""} isSaving={savingEntryId === editingEntry.id} onCancel={() => { setEditingEntry(null); setEditDraft(null); }} onSave={saveEdit} /> : null}
          <Card className="border-border/70 shadow-luxe">
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-sm font-medium">Progress history</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {sortedEntries.slice().reverse().map((entry) => (
                <div key={entry.id} className={`solid-row ${recentlyUpdatedEntryId === entry.id ? "border-primary/50 bg-primary/5" : ""}`}>
                  <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{entry.entry_date}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.body_weight_kg ? `${entry.body_weight_kg} kg` : "No weight"}
                        {(entry.measurements?.waist_cm ?? entry.waist_cm) ? ` · ${entry.measurements?.waist_cm ?? entry.waist_cm} cm waist` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-12 w-12" onClick={() => startEdit(entry)} disabled={savingEntryId === entry.id || deletingEntryId === entry.id} aria-label={`Edit progress entry from ${entry.entry_date}`}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-12 w-12 text-destructive" onClick={() => deleteEntry(entry)} disabled={savingEntryId === entry.id || deletingEntryId === entry.id} aria-label={`Delete progress entry from ${entry.entry_date}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="border-t border-border/70 p-3">
                    <MeasurementList entry={entry} />
                    {entry.notes ? <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p> : null}
                    {entryActionError?.entryId === entry.id ? <p className="mt-2 text-sm text-destructive">{entryActionError.message}</p> : null}
                  </div>
                </div>
              ))}
              {!entries.length ? <p className="text-sm text-muted-foreground">No progress entries yet.</p> : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function ProgressPhotoManager({ userId, photos, setPhotos, photosUnavailable }: { userId: string | null; photos: ProgressPhoto[]; setPhotos: Dispatch<SetStateAction<ProgressPhoto[]>>; photosUnavailable?: boolean }) {
  const { toast } = useToast();
  const today = useTodayDate();
  const [photoType, setPhotoType] = useState<ProgressPhotoType>("front");
  const [photoDate, setPhotoDate] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingPhotoId, setDeletingPhotoId] = useState("");
  const { dialog, ask } = useConfirm();
  const beforePhoto = photos.find((photo) => photo.id === beforeId) ?? photos.at(-1) ?? null;
  const afterPhoto = photos.find((photo) => photo.id === afterId) ?? photos[0] ?? null;

  function chooseFile(nextFile: File | null) {
    setUploadError("");
    setFile(nextFile);
    if (!nextFile) return;
    try {
      validateProgressPhotoFile(nextFile);
    } catch (error) {
      setUploadError(messageFromError(error, "Choose a JPEG, PNG, or WebP image up to 10 MB."));
    }
  }

  async function upload() {
    setUploadError("");
    if (!userId) {
      setUploadError("Please sign in before uploading progress photos.");
      return toast({ title: "Sign in required", description: "Please sign in before uploading progress photos." });
    }
    if (!file) {
      setUploadError("Select a front, side, or back photo first.");
      return toast({ title: "Choose a photo", description: "Select a front, side, or back photo first." });
    }
    try {
      validateProgressPhotoFile(file);
      setIsUploading(true);
      const saved = await uploadProgressPhoto({ userId, type: photoType, takenOn: photoDate, file });
      setPhotos((current) => [saved, ...current]);
      setFile(null);
      setUploadError("");
      toast({ title: "Progress photo uploaded", description: `${photoType} photo saved privately for ${photoDate}.` });
    } catch (error) {
      const message = messageFromError(error, "Please try again later.");
      setUploadError(message);
      toast({ title: "Could not upload progress photo", description: message });
    } finally {
      setIsUploading(false);
    }
  }

  async function remove(photo: ProgressPhoto) {
    ask({
      title: "Delete progress photo?",
      description: `Delete ${photo.photo_type} photo from ${photo.taken_on}?`,
      variant: "destructive",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          setDeletingPhotoId(photo.id);
          setDeleteError("");
          await deleteProgressPhoto(photo);
          setPhotos((current) => current.filter((item) => item.id !== photo.id));
          toast({ title: "Progress photo deleted", description: "Private photo metadata and storage object were removed." });
        } catch (error) {
          const message = messageFromError(error, "Please try again.");
          setDeleteError(`Photo was not deleted. ${message}`);
          toast({ title: "Could not delete progress photo", description: message });
        } finally {
          setDeletingPhotoId("");
        }
      }
    });
  }

  return (
    <div className="space-y-4">
      {dialog}
      <Card>
        <CardHeader className="p-4 pb-0">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Camera className="h-4 w-4 text-primary" />
            Upload progress photo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 [&_select]:min-h-12">
          <div className="rounded-[14px] border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
            Progress photos are private and only visible to you. Plaivra stores the uploaded photo and its reviewed date/type, not an AI interpretation.
          </div>
          {deleteError ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{deleteError}</p> : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_130px_auto]">
            <div className="space-y-1.5">
              <Label className="text-sm">Photo file</Label>
              <Input type="file" accept="image/jpeg,image/png,image/webp" className="h-12" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
              {file ? <p className="text-xs text-muted-foreground">Selected: {file.name}</p> : null}
              {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Type</Label>
              <select value={photoType} onChange={(event) => setPhotoType(event.target.value as ProgressPhotoType)} className="h-12 w-full rounded-[14px] border bg-card px-3 text-sm">
                {photoTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Date</Label>
              <Input type="date" className="h-12" value={photoDate} onChange={(event) => setPhotoDate(event.target.value)} />
            </div>
            <Button className="self-end h-12" onClick={upload} disabled={isUploading || Boolean(uploadError)}>
              <Upload className="h-4 w-4" />
              {isUploading ? "Uploading" : "Upload"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => <PhotoCard key={photo.id} photo={photo} onDelete={remove} isDeleting={deletingPhotoId === photo.id} />)}
            {!photos.length && !photosUnavailable ? <p className="col-span-full text-sm text-muted-foreground">No progress photos uploaded yet.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card variant="glassStrong">
        <CardHeader className="p-4 pb-0">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4 text-primary" />
            Before / after comparison
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 [&_select]:min-h-12">
          <div className="grid gap-3 sm:grid-cols-2">
            <PhotoSelect label="Before" value={beforeId} photos={photos} onChange={setBeforeId} />
            <PhotoSelect label="After" value={afterId} photos={photos} onChange={setAfterId} />
          </div>
          {beforePhoto && afterPhoto ? (
            <div className="grid grid-cols-2 gap-3">
              <ComparisonPhoto label="Before" photo={beforePhoto} />
              <ComparisonPhoto label="After" photo={afterPhoto} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Upload at least two photos or choose two dates/photos to compare.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function PhotoCard({ photo, onDelete, isDeleting }: { photo: ProgressPhoto; onDelete: (photo: ProgressPhoto) => void; isDeleting: boolean }) {
  return <div className={`glass-card p-2 ${isDeleting ? "opacity-60" : ""}`}><ProgressPhotoImage url={photo.signed_url} label={`${photo.photo_type} progress ${photo.taken_on}`} unavailableLabel="Signed URL unavailable" /><div className="mt-2 flex items-center justify-between gap-2"><div><p className="font-semibold capitalize text-sm">{photo.photo_type}</p><p className="text-xs text-muted-foreground">{photo.taken_on}</p>{isDeleting ? <p className="text-xs text-muted-foreground">Deleting...</p> : null}</div><Button size="icon" variant="ghost" className="h-12 w-12 text-destructive" onClick={() => onDelete(photo)} disabled={isDeleting} aria-label={`Delete ${photo.photo_type} progress photo from ${photo.taken_on}`}><Trash2 className="h-4 w-4" /></Button></div></div>;
}

function PhotoSelect({ label, value, photos, onChange }: { label: string; value: string; photos: ProgressPhoto[]; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label className="text-sm">{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-[14px] border bg-card px-3 text-sm"><option value="">Auto-select</option>{photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.taken_on} — {photo.photo_type}</option>)}</select></div>;
}

function ComparisonPhoto({ label, photo }: { label: string; photo: ProgressPhoto }) {
  return <div className="glass-card p-3"><p className="mb-2 font-semibold text-sm">{label}: {photo.taken_on} ({photo.photo_type})</p><ProgressPhotoImage url={photo.signed_url} label={`${label} progress ${photo.taken_on}`} unavailableLabel="Photo unavailable" /></div>;
}

function ProgressPhotoImage({ url, label, unavailableLabel }: { url: string | null; label: string; unavailableLabel: string }) {
  return url ? (
    <div
      role="img"
      aria-label={label}
      className="aspect-[3/4] rounded-md bg-muted bg-cover bg-center"
      style={{ backgroundImage: `url("${url}")` }}
    />
  ) : (
    <div className="flex aspect-[3/4] items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
      {unavailableLabel}
    </div>
  );
}

function EditProgressCard({
  draft,
  setDraft,
  error,
  isSaving,
  onSave,
  onCancel
}: {
  draft: EditDraft;
  setDraft: Dispatch<SetStateAction<EditDraft | null>>;
  error: string;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Card className="mt-4 border-primary/40 bg-primary/5">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-sm font-medium">Edit progress entry</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:col-span-2 lg:col-span-4">{error}</p> : null}
        <Field label="Date" type="date" value={draft.entryDate} onChange={(value) => setDraft((current) => current ? { ...current, entryDate: value } : current)} />
        <Field label="Body weight kg" value={draft.bodyWeightKg} onChange={(value) => setDraft((current) => current ? { ...current, bodyWeightKg: value } : current)} />
        <Field label="Waist cm" value={draft.waistCm} onChange={(value) => setDraft((current) => current ? { ...current, waistCm: value } : current)} />
        <Field label="Notes" value={draft.notes} onChange={(value) => setDraft((current) => current ? { ...current, notes: value } : current)} />
        {editableMeasurementFields.map(([key, label]) => <Field key={String(key)} label={label} value={draft.measurements[String(key)] ?? ""} onChange={(value) => setDraft((current) => current ? { ...current, measurements: { ...current.measurements, [String(key)]: value } } : current)} />)}
        <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row lg:col-span-4">
          <Button className="h-12" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving" : "Save changes"}</Button>
          <Button variant="outline" className="h-12" onClick={onCancel} disabled={isSaving}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, type = "number" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-1.5"><Label className="text-sm">{label}</Label><Input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.1" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="h-12" /></div>;
}

function TrendCard({ trend }: { trend: MeasurementTrend }) {
  return <div className="glass-card p-3"><p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{trend.label}</p><p className="mt-1 font-semibold">{trend.latest === null ? "No data" : `${trend.latest}${trend.unit}`}</p><p className="mt-1 text-xs text-muted-foreground">{trend.delta === null ? "No trend yet" : `${formatDelta(trend.delta)}${trend.unit} from first entry`}</p></div>;
}

function MeasurementList({ entry }: { entry: ProgressEntry }) {
  const measurement = entry.measurements;
  if (!measurement) return null;
  const allValues: Array<[string, number | null | undefined, string]> = [
    ["Waist", measurement.waist_cm ?? entry.waist_cm, "cm"],
    ["Hips", measurement.hips_cm, "cm"],
    ["Chest", measurement.chest_cm, "cm"],
    ["Shoulders", measurement.shoulders_cm, "cm"],
    ["Left arm", measurement.left_arm_cm, "cm"],
    ["Right arm", measurement.right_arm_cm, "cm"],
    ["Left thigh", measurement.left_thigh_cm, "cm"],
    ["Right thigh", measurement.right_thigh_cm, "cm"],
    ["Glutes", measurement.glutes_cm, "cm"],
    ["Calves", measurement.calves_cm, "cm"],
    ["Neck", measurement.neck_cm, "cm"],
    ["Body fat", measurement.body_fat_percent, "%"]
  ];
  const values = allValues.filter((item): item is [string, number, string] => isFiniteNumber(item[1]));
  if (!values.length) return null;
  return <div className="mt-2 flex flex-wrap gap-2">{values.map(([label, value, unit]) => <span key={label} className="rounded-md bg-primary/5 px-2.5 py-1 text-xs font-medium text-foreground">{label}: {value}{unit}</span>)}</div>;
}

function Insight({ text }: { text: string }) { return <div className="glass-card p-3 text-sm text-muted-foreground">{text}</div>; }
function ProgressFeedbackCard({ feedback }: { feedback: ProgressFeedback[] }) { return <Card variant="glass"><CardHeader className="p-4 pb-0"><CardTitle className="text-sm font-medium">Progress feedback</CardTitle></CardHeader><CardContent className="grid gap-3 p-4 md:grid-cols-3">{feedback.map((item) => <div key={item.label} className="glass-card p-3"><p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{item.label}</p><p className="mt-1 font-semibold text-foreground">{item.value}</p><p className="mt-1 text-sm text-muted-foreground">{item.detail}</p></div>)}</CardContent></Card>; }
function hasBodyWeight(entry: ProgressEntry): entry is ProgressEntry & { body_weight_kg: number } { return isFiniteNumber(entry.body_weight_kg); }
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function stringifyNullable(value: unknown) { return isFiniteNumber(value) ? String(value) : ""; }
function averageWeight(entries: Array<ProgressEntry & { body_weight_kg: number }>, days: number) { const latest = entries.at(-1); if (!latest) return null; const cutoff = new Date(latest.entry_date); cutoff.setDate(cutoff.getDate() - days + 1); const values = entries.filter((entry) => new Date(entry.entry_date) >= cutoff).map((entry) => entry.body_weight_kg); if (!values.length) return null; return round(values.reduce((sum, value) => sum + value, 0) / values.length); }
function estimateTargetDate(entries: Array<ProgressEntry & { body_weight_kg: number }>, goalWeight: number) { if (!goalWeight) return "No goal weight set."; if (entries.length < 2) return "Not enough data yet to estimate a target date."; const first = entries[0]; const latest = entries.at(-1)!; const elapsedDays = Math.max(1, daysBetween(first.entry_date, latest.entry_date)); const dailyChange = (latest.body_weight_kg - first.body_weight_kg) / elapsedDays; const remainingKg = goalWeight - latest.body_weight_kg; if (Math.abs(dailyChange) < 0.01) return "Weight trend is too flat to estimate a target date yet."; if ((remainingKg < 0 && dailyChange >= 0) || (remainingKg > 0 && dailyChange <= 0)) return "Current trend is moving away from the goal."; const daysToGoal = Math.ceil(Math.abs(remainingKg / dailyChange)); if (!Number.isFinite(daysToGoal) || daysToGoal > 730) return "Not enough reliable trend data for an estimated date."; const estimate = new Date(latest.entry_date); estimate.setDate(estimate.getDate() + daysToGoal); return `Estimated target date: ${estimate.toISOString().slice(0, 10)}.`; }
function calculateConsistencyScore({ entries, completedCount, skippedCount }: { entries: ProgressEntry[]; completedCount: number; skippedCount: number }) { const progressScore = Math.min(40, entries.length * 8); const totalWorkouts = completedCount + skippedCount; const workoutScore = totalWorkouts ? Math.round((completedCount / totalWorkouts) * 60) : 0; return Math.min(100, progressScore + workoutScore); }
function buildWeeklyInsights({ nutritionWeek, workoutActivity, entries, today }: { nutritionWeek: DailyNutritionSummary[]; workoutActivity: WorkoutSession[]; entries: ProgressEntry[]; today: string }) { const start = startOfWeek(today); const end = addDays(start, 6); const weekSessions = workoutActivity.filter((session) => { const date = (session.completed_at ?? session.skipped_at ?? session.started_at)?.slice(0, 10); return Boolean(date && date >= start && date <= end); }); const completedWorkouts = weekSessions.filter((session) => session.status === "completed").length; const skippedWorkouts = weekSessions.filter((session) => session.status === "skipped").length; const daysWithLogs = nutritionWeek.filter((day) => day.logs?.length); const waterDays = nutritionWeek.filter((day) => Number(day.water_ml) > 0); const currentWeekProgressEntries = entries.filter((entry) => entry.entry_date >= start && entry.entry_date <= end).length; const totalCalories = daysWithLogs.reduce((sum, day) => sum + Number(day.calories), 0); const totalProtein = daysWithLogs.reduce((sum, day) => sum + Number(day.protein_g), 0); const calories = daysWithLogs.length ? Math.round(totalCalories / daysWithLogs.length) : null; const calendarAverageCalories = Math.round(totalCalories / 7); const protein = daysWithLogs.length ? Math.round(totalProtein / daysWithLogs.length) : null; const calendarAverageProtein = Math.round(totalProtein / 7); const water = waterDays.length ? Math.round(waterDays.reduce((sum, day) => sum + Number(day.water_ml), 0) / waterDays.length) : null; const workoutTotal = completedWorkouts + skippedWorkouts; const workoutCompletionRate = workoutTotal ? Math.round((completedWorkouts / workoutTotal) * 100) : null; const consistencyScore = Math.min(100, (workoutCompletionRate ?? 0) * 0.5 + Math.min(25, daysWithLogs.length * 4) + Math.min(15, waterDays.length * 3) + Math.min(10, currentWeekProgressEntries * 5)); return { completedWorkouts: workoutTotal ? completedWorkouts : null, skippedWorkouts: workoutTotal ? skippedWorkouts : null, weekWorkoutTotal: workoutTotal, weekWorkoutCompletionRate: workoutCompletionRate, averageCalories: calories, calendarAverageCalories, averageProtein: protein, calendarAverageProtein, waterAverage: water, consistencyScore: Math.round(consistencyScore) }; }
function buildProgressFeedback({ entries, latestWeightChange, weeklyInsights, consistencyScore, measurementTrends }: { entries: ProgressEntry[]; latestWeightChange: number | null; weeklyInsights: WeeklyInsights; consistencyScore: number; measurementTrends: MeasurementTrend[] }): ProgressFeedback[] { const loggedMeasurements = measurementTrends.filter((trend) => trend.latest !== null).length; const workoutMessage = weeklyInsights.completedWorkouts === null ? "No workouts this week" : `${weeklyInsights.completedWorkouts} completed`; const weightMessage = latestWeightChange === null ? "Need two weigh-ins" : `${formatDelta(latestWeightChange)} kg last change`; return [{ label: "Consistency", value: `${consistencyScore}%`, detail: consistencyScore >= 75 ? "Strong week. Keep the same logging rhythm." : "The biggest upgrade is logging workouts, food, water, and one progress check this week." }, { label: "Weight signal", value: weightMessage, detail: entries.length < 2 ? "Add at least two entries before trusting the trend." : "Use this with waist and photos, not by itself." }, { label: "Coverage", value: `${workoutMessage} / ${loggedMeasurements} measurements`, detail: loggedMeasurements ? "Measurements are broad enough for better trend context." : "Add waist, chest, arms, or thigh measurements to make progress less weight-only." }]; }
function buildMeasurementTrends(entries: ProgressEntry[]): MeasurementTrend[] { const defs: Array<{ key: keyof BodyMeasurement; label: string; unit: string; combine?: (measurement: BodyMeasurement) => number | null }> = [ { key: "waist_cm", label: "Waist", unit: "cm" }, { key: "chest_cm", label: "Chest", unit: "cm" }, { key: "left_arm_cm", label: "Arms avg", unit: "cm", combine: (m) => averageNumbers([m.left_arm_cm, m.right_arm_cm]) }, { key: "left_thigh_cm", label: "Thighs avg", unit: "cm", combine: (m) => averageNumbers([m.left_thigh_cm, m.right_thigh_cm]) }, { key: "hips_cm", label: "Hips", unit: "cm" }, { key: "shoulders_cm", label: "Shoulders", unit: "cm" }, { key: "calves_cm", label: "Calves", unit: "cm" }, { key: "body_fat_percent", label: "Manual body fat", unit: "%" } ]; return defs.map((def) => { const values = entries.map((entry) => entry.measurements).filter((measurement): measurement is BodyMeasurement => Boolean(measurement)).map((measurement) => def.combine ? def.combine(measurement) : measurement[def.key]).filter((value): value is number => isFiniteNumber(value) && value > 0); const first = values[0] ?? null; const latest = values.at(-1) ?? null; return { label: def.label, latest: latest === null ? null : round(latest), delta: latest !== null && first !== null ? round(latest - first) : null, unit: def.unit }; }); }
function buildNextLogAction({ entries, latestWeightEntry, latestMeasurement }: { entries: ProgressEntry[]; latestWeightEntry: ProgressEntry | null; latestMeasurement: BodyMeasurement | null }) {
  if (!entries.length) return "Add your first progress entry. Trends appear only after real saved entries exist.";
  if (!latestWeightEntry) return "Add body weight when you want a weight trend; measurements and notes can still be logged without it.";
  if (entries.length < 2) return "Add one more weigh-in to unlock a trend.";
  if (!latestMeasurement?.waist_cm) return "Add waist or measurements to make body-composition trends more useful.";
  return "Keep the trend reliable with one progress check this week.";
}
function goalProgressWidth(firstWeight: number, latestWeight: number, goalWeight: number) {
  const total = Math.abs(firstWeight - goalWeight);
  const moved = Math.abs(firstWeight - latestWeight);
  if (total === 0) return "0%";
  const direction = goalWeight - firstWeight;
  const actualDirection = latestWeight - firstWeight;
  return direction * actualDirection >= 0 ? `${Math.min(100, Math.round((moved / total) * 100))}%` : "0%";
}
function messageFromError(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
function averageNumbers(values: Array<number | null | undefined>) { const filtered = values.filter(isFiniteNumber); return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : null; }
function numberOrNull(value: string) { if (!value.trim()) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function round(value: number) { return Math.round(value * 10) / 10; }
function formatDelta(value: number) { return `${value > 0 ? "+" : ""}${value}`; }
