"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { CalendarCheck, Camera, Edit3, ImageIcon, Ruler, Scale, SkipForward, Target, Trash2, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { CardGridSkeleton } from "@/components/ui/state-views";
import { MetricCard } from "@/components/dashboard/metric-card";
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
import { deleteProgressPhoto, getProgressPhotos, uploadProgressPhoto, type ProgressPhoto, type ProgressPhotoType } from "@/services/progress/progress-photos";
import type { BodyMeasurement, DailyNutritionSummary, ProgressEntry, WorkoutSession } from "@/types";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { addDays, daysBetween, startOfWeek, todayIso } from "@/lib/date-utils";
import { useUserSettings } from "@/lib/settings/user-settings-context";

const GOAL_WEIGHT_STORAGE_KEY = "fitlife_goal_weight_kg";
const BODY_FAT_SETTINGS_KEY = "fitlife_body_fat_estimate_settings";
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
  const [estimateSettings, setEstimateSettings] = useState({ heightCm: "", sex: "male" as "male" | "female" });

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const { dialog, ask } = useConfirm();
  const today = useTodayDate();
  const currentWeekStart = useMemo(() => startOfWeek(today), [today]);

  useEffect(() => {
    async function loadProgress() {
      if (!user?.id) return;
      const [progressEntries, activity, weekData, progressPhotos] = await Promise.all([
        getProgressEntries(user.id),
        getWorkoutActivity(user.id),
        getNutritionWeek(user.id, currentWeekStart),
        settings.hideProgressPhotos
          ? Promise.resolve([] as ProgressPhoto[])
          : getProgressPhotos(user.id).catch((error) => {
              console.warn("Plaivra could not load private progress photos.", error instanceof Error ? error.message : error);
              return [] as ProgressPhoto[];
            })
      ]);
      setEntries(progressEntries);
      setWorkoutActivity(activity);
      setNutritionWeek(weekData);
      setPhotos(progressPhotos);
    }

    loadProgress()
      .catch((error) => toast({ title: "Could not load progress", description: error instanceof Error ? error.message : "Please refresh and try again." }))
      .finally(() => setIsLoading(false));
  }, [currentWeekStart, settings.hideProgressPhotos, toast, user?.id]);

  useEffect(() => {
    // TODO(migration): Move goal weight to Supabase profile completely
    const storedGoal = window.localStorage.getItem(GOAL_WEIGHT_STORAGE_KEY);
    if (profile?.target_weight_kg) {
      setGoalWeight(String(profile.target_weight_kg));
    } else if (storedGoal) {
      setGoalWeight(storedGoal);
    }
    // TODO(migration): Move body fat settings to Supabase
    const storedEstimate = window.localStorage.getItem(BODY_FAT_SETTINGS_KEY);
    if (storedEstimate) {
      try {
        const parsed = JSON.parse(storedEstimate) as { heightCm?: string; sex?: "male" | "female" };
        setEstimateSettings({ heightCm: parsed.heightCm ?? "", sex: parsed.sex === "female" ? "female" : "male" });
      } catch {
        // Ignore invalid browser-local settings.
      }
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
  const bodyFatEstimate = buildBodyFatEstimate({ latestMeasurement, latestWaist, heightCm: Number(estimateSettings.heightCm), sex: estimateSettings.sex });
  const measurementTrends = buildMeasurementTrends(sortedEntries);
  const progressFeedback = buildProgressFeedback({
    entries: sortedEntries,
    latestWeightChange,
    weeklyInsights,
    consistencyScore,
    measurementTrends
  });

  async function saveGoalWeight() {
    if (!numericGoalWeight || numericGoalWeight < 25 || numericGoalWeight > 300) {
      toast({ title: "Check goal weight", description: "Enter a realistic goal weight in kilograms." });
      return;
    }
    try {
      if (!profile?.id) throw new Error("Profile is still loading.");
      await updateProfile(profile.id, { targetWeightKg: numericGoalWeight });
      window.localStorage.removeItem(GOAL_WEIGHT_STORAGE_KEY);
      await refreshProfile();
      toast({ title: "Goal weight saved", description: "The goal is synced to your Plaivra profile." });
    } catch (error) {
      window.localStorage.setItem(GOAL_WEIGHT_STORAGE_KEY, String(numericGoalWeight));
      toast({
        title: "Goal saved on this device",
        description: error instanceof Error ? `${error.message} The local fallback was kept.` : "Profile sync failed, so the local fallback was kept."
      });
    }
  }

  function saveEstimateSettings() {
    window.localStorage.setItem(BODY_FAT_SETTINGS_KEY, JSON.stringify(estimateSettings));
    toast({ title: "Estimate settings saved", description: "Used only for the clearly labeled body-fat estimate." });
  }

  function startEdit(entry: ProgressEntry) {
    const measurement = entry.measurements;
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
      const updated = await updateProgressEntryWithMeasurements(user.id, editingEntry.id, {
        entryDate: editDraft.entryDate,
        bodyWeightKg: numberOrNull(editDraft.bodyWeightKg),
        waistCm: numberOrNull(editDraft.waistCm),
        notes: editDraft.notes.trim() || null,
        measurements: Object.fromEntries(Object.entries(editDraft.measurements).map(([key, value]) => [key, numberOrNull(value)])) as Partial<BodyMeasurement>
      });
      setEntries((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setEditingEntry(null);
      setEditDraft(null);
      toast({ title: "Progress entry updated", description: "The entry and linked measurements were updated." });
    } catch (error) {
      toast({ title: "Could not update progress", description: error instanceof Error ? error.message : "Please try again." });
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
          await deleteProgressEntryWithMeasurements(user.id, entry.id);
          setEntries((current) => current.filter((item) => item.id !== entry.id));
          toast({ title: "Progress entry deleted", description: "Measurement data linked to this entry was removed." });
        } catch (error) {
          toast({ title: "Could not delete progress entry", description: error instanceof Error ? error.message : "Please try again." });
        }
      }
    });
  }

  if (isLoading) {
    return (
      <>
        {dialog}
        <PageHeading title="Progress Tracker" description="Track body weight, measurements, private progress photos, workout consistency, and real trend insights." action={<ProgressEntryModal onSaved={(entry) => setEntries((current) => [...current, entry])} />} />
        <div className="mt-6">
          <CardGridSkeleton />
        </div>
      </>
    );
  }

  return (
    <>
      {dialog}
      <PageHeading title="Progress Tracker" description="Track body weight, measurements, private progress photos, workout consistency, and real trend insights." action={<ProgressEntryModal onSaved={(entry) => setEntries((current) => [...current, entry])} />} />

      {!entries.length ? (
        <Card className="mb-4 border-dashed">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold">Add your first progress entry</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with body weight, waist, or a progress photo. Trends appear only after real saved entries exist.
              </p>
            </div>
            <ProgressEntryModal onSaved={(entry) => setEntries((current) => [...current, entry])} />
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="measurements">Measurements</TabsTrigger>
          {!settings.hideProgressPhotos ? <TabsTrigger value="photos">Photos</TabsTrigger> : null}
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Hero Summary */}
          <div className="glass-card-strong p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Current weight</p>
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
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">Set a goal weight to track progress.</p>
                <div className="mt-2 flex gap-2">
                  <Input type="number" className="h-11" value={goalWeight} onChange={(event) => setGoalWeight(event.target.value)} placeholder="Goal kg" />
                  <Button className="h-11" onClick={saveGoalWeight}>Save</Button>
                </div>
              </div>
            )}

            <div className="mt-4">
              <ProgressEntryModal onSaved={(entry) => setEntries((current) => [...current, entry])} buttonClassName="w-full" />
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
                <button onClick={() => setActiveTab("measurements")} className="mt-3 text-sm font-medium text-primary">
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
                  <button onClick={() => setActiveTab("photos")} className="text-sm font-medium text-primary">
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
                    <div key={entry.id} className="solid-row flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium">{entry.entry_date}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.body_weight_kg ? `${entry.body_weight_kg} kg` : "No weight"}
                          {(entry.measurements?.waist_cm ?? entry.waist_cm) ? ` · ${entry.measurements?.waist_cm ?? entry.waist_cm} cm waist` : ""}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => startEdit(entry)}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-10 w-10 text-destructive" onClick={() => deleteEntry(entry)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setActiveTab("history")} className="mt-3 text-sm font-medium text-primary">
                  View full history →
                </button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="measurements" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Card variant="glassStrong">
              <CardHeader><CardTitle>Body-fat estimate</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Body-fat estimate is calculated from saved measurements and should be treated as a rough fitness estimate, not medical data.</p>
                <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
                  <div className="space-y-2"><Label>Height cm for estimate</Label><Input type="number" value={estimateSettings.heightCm} onChange={(event) => setEstimateSettings((current) => ({ ...current, heightCm: event.target.value }))} placeholder="Example: 175" /></div>
                  <div className="space-y-2"><Label>Sex for formula</Label><select value={estimateSettings.sex} onChange={(event) => setEstimateSettings((current) => ({ ...current, sex: event.target.value as "male" | "female" }))} className="h-10 w-full rounded-[14px] border bg-card px-3 text-sm"><option value="male">male</option><option value="female">female</option></select></div>
                  <Button className="self-end" variant="outline" onClick={saveEstimateSettings}>Save settings</Button>
                </div>
                <div className="rounded-md border bg-muted/40 p-3"><p className="font-semibold">{bodyFatEstimate.value}</p><p className="mt-1 text-sm text-muted-foreground">{bodyFatEstimate.detail}</p></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Measurement trends</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {measurementTrends.map((trend) => <TrendCard key={trend.label} trend={trend} />)}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {!settings.hideProgressPhotos ? (
          <TabsContent value="photos" className="space-y-4">
            <ProgressPhotoManager userId={user?.id ?? null} photos={photos} setPhotos={setPhotos} />
          </TabsContent>
        ) : null}

        <TabsContent value="history" className="space-y-4">
          {editingEntry && editDraft ? <EditProgressCard draft={editDraft} setDraft={setEditDraft} onCancel={() => { setEditingEntry(null); setEditDraft(null); }} onSave={saveEdit} /> : null}
          <Card className="border-border/70 shadow-luxe">
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-sm font-medium">Progress history</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {sortedEntries.slice().reverse().map((entry) => (
                <details key={entry.id} className="solid-row group">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 p-3 list-none">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{entry.entry_date}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.body_weight_kg ? `${entry.body_weight_kg} kg` : "No weight"}
                        {(entry.measurements?.waist_cm ?? entry.waist_cm) ? ` · ${entry.measurements?.waist_cm ?? entry.waist_cm} cm waist` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-10 w-10" onClick={(e) => { e.preventDefault(); startEdit(entry); }}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-10 w-10 text-destructive" onClick={(e) => { e.preventDefault(); deleteEntry(entry); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </summary>
                  <div className="border-t border-border/70 p-3">
                    <MeasurementList entry={entry} />
                    {entry.notes ? <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p> : null}
                  </div>
                </details>
              ))}
              {!entries.length ? <p className="text-sm text-muted-foreground">No progress entries yet.</p> : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function ProgressPhotoManager({ userId, photos, setPhotos }: { userId: string | null; photos: ProgressPhoto[]; setPhotos: Dispatch<SetStateAction<ProgressPhoto[]>> }) {
  const { toast } = useToast();
  const today = useTodayDate();
  const [photoType, setPhotoType] = useState<ProgressPhotoType>("front");
  const [photoDate, setPhotoDate] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const { dialog, ask } = useConfirm();
  const beforePhoto = photos.find((photo) => photo.id === beforeId) ?? photos.at(-1) ?? null;
  const afterPhoto = photos.find((photo) => photo.id === afterId) ?? photos[0] ?? null;

  async function upload() {
    if (!userId) return toast({ title: "Sign in required", description: "Please sign in before uploading progress photos." });
    if (!file) return toast({ title: "Choose a photo", description: "Select a front, side, or back photo first." });
    try {
      setIsUploading(true);
      const saved = await uploadProgressPhoto({ userId, type: photoType, takenOn: photoDate, file });
      setPhotos((current) => [saved, ...current]);
      setFile(null);
      toast({ title: "Progress photo uploaded", description: `${photoType} photo saved privately for ${photoDate}.` });
    } catch (error) {
      toast({ title: "Could not upload progress photo", description: error instanceof Error ? error.message : "Please try again later." });
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
          await deleteProgressPhoto(photo);
          setPhotos((current) => current.filter((item) => item.id !== photo.id));
          toast({ title: "Progress photo deleted", description: "Private photo metadata and storage object were removed." });
        } catch (error) {
          toast({ title: "Could not delete progress photo", description: error instanceof Error ? error.message : "Please try again." });
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
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_130px_auto]">
            <div className="space-y-1.5">
              <Label className="text-sm">Photo file</Label>
              <Input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Type</Label>
              <select value={photoType} onChange={(event) => setPhotoType(event.target.value as ProgressPhotoType)} className="h-11 w-full rounded-[14px] border bg-card px-3 text-sm">
                {photoTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Date</Label>
              <Input type="date" value={photoDate} onChange={(event) => setPhotoDate(event.target.value)} />
            </div>
            <Button className="self-end h-11" onClick={upload} disabled={isUploading}>
              <Upload className="h-4 w-4" />
              {isUploading ? "Uploading" : "Upload"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => <PhotoCard key={photo.id} photo={photo} onDelete={remove} />)}
            {!photos.length ? <p className="col-span-full text-sm text-muted-foreground">No progress photos uploaded yet.</p> : null}
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
        <CardContent className="p-4 space-y-3">
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

function PhotoCard({ photo, onDelete }: { photo: ProgressPhoto; onDelete: (photo: ProgressPhoto) => void }) {
  return <div className="glass-card p-2"><ProgressPhotoImage url={photo.signed_url} label={`${photo.photo_type} progress ${photo.taken_on}`} unavailableLabel="Signed URL unavailable" /><div className="mt-2 flex items-center justify-between gap-2"><div><p className="font-semibold capitalize text-sm">{photo.photo_type}</p><p className="text-xs text-muted-foreground">{photo.taken_on}</p></div><Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => onDelete(photo)}><Trash2 className="h-4 w-4" /></Button></div></div>;
}

function PhotoSelect({ label, value, photos, onChange }: { label: string; value: string; photos: ProgressPhoto[]; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label className="text-sm">{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-[14px] border bg-card px-3 text-sm"><option value="">Auto-select</option>{photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.taken_on} — {photo.photo_type}</option>)}</select></div>;
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

function EditProgressCard({ draft, setDraft, onSave, onCancel }: { draft: EditDraft; setDraft: Dispatch<SetStateAction<EditDraft | null>>; onSave: () => void; onCancel: () => void }) {
  return <Card className="mt-4 border-primary/40 bg-primary/5"><CardHeader className="p-4 pb-0"><CardTitle className="text-sm font-medium">Edit progress entry</CardTitle></CardHeader><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Date" type="date" value={draft.entryDate} onChange={(value) => setDraft((current) => current ? { ...current, entryDate: value } : current)} /><Field label="Body weight kg" value={draft.bodyWeightKg} onChange={(value) => setDraft((current) => current ? { ...current, bodyWeightKg: value } : current)} /><Field label="Waist cm" value={draft.waistCm} onChange={(value) => setDraft((current) => current ? { ...current, waistCm: value } : current)} /><Field label="Notes" value={draft.notes} onChange={(value) => setDraft((current) => current ? { ...current, notes: value } : current)} />{editableMeasurementFields.map(([key, label]) => <Field key={String(key)} label={label} value={draft.measurements[String(key)] ?? ""} onChange={(value) => setDraft((current) => current ? { ...current, measurements: { ...current.measurements, [String(key)]: value } } : current)} />)}<div className="flex gap-2 sm:col-span-2 lg:col-span-4"><Button className="h-11" onClick={onSave}>Save changes</Button><Button variant="outline" className="h-11" onClick={onCancel}>Cancel</Button></div></CardContent></Card>;
}

function Field({ label, value, onChange, type = "number" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-1.5"><Label className="text-sm">{label}</Label><Input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.1" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="h-11" /></div>;
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
function buildBodyFatEstimate({ latestMeasurement, latestWaist, heightCm, sex }: { latestMeasurement: BodyMeasurement | null; latestWaist: number | null; heightCm: number; sex: "male" | "female" }) { if (isFiniteNumber(latestMeasurement?.body_fat_percent)) return { value: `${latestMeasurement.body_fat_percent}% manual`, detail: "Manual body-fat entry from your latest saved measurement. Not a medical measurement." }; if (!isFiniteNumber(latestWaist) || !isFiniteNumber(heightCm) || heightCm <= 0) return { value: "Not enough measurement data", detail: "Needs latest waist measurement and height to calculate a simple Relative Fat Mass estimate." }; const estimate = sex === "female" ? 76 - 20 * (heightCm / latestWaist) : 64 - 20 * (heightCm / latestWaist); if (!Number.isFinite(estimate) || estimate < 3 || estimate > 70) return { value: "Not enough measurement data", detail: "The inputs do not produce a usable estimate. Check waist and height values." }; return { value: `${round(estimate)}% estimated`, detail: `Relative Fat Mass estimate using height ${heightCm} cm, waist ${latestWaist} cm, and sex ${sex}. Not medically accurate.` }; }
function averageNumbers(values: Array<number | null | undefined>) { const filtered = values.filter(isFiniteNumber); return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : null; }
function numberOrNull(value: string) { if (!value.trim()) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function round(value: number) { return Math.round(value * 10) / 10; }
function formatDelta(value: number) { return `${value > 0 ? "+" : ""}${value}`; }
