"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Droplets, FlaskConical, ListChecks, Moon, RefreshCcw, Repeat } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CardGridSkeleton } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { userSafeError } from "@/lib/error-formatting";
import { getCalorieTargets, getWaterLogs } from "@/services/database/nutrition";
import { getDailyFitTasks, getFitnessHabits, getSupplementLogs } from "@/services/database/wellness";
import { getSleepRecoveryHistory } from "@/services/wellness/wellness-data";
import type { DailyFitTask, FitnessHabit, SupplementLog } from "@/types";

interface LauncherCardProps {
  href: string;
  icon: React.ElementType;
  label: string;
  status: string;
  detail: string;
  progress?: number;
  accent?: "default" | "success" | "warning";
  highlighted?: boolean;
}

function LauncherCard({ href, icon: Icon, label, status, detail, progress, accent = "default", highlighted = false }: LauncherCardProps) {
  const accentBorder = highlighted ? "border-primary/60" : accent === "success" ? "border-primary/40" : accent === "warning" ? "border-warning/40" : "border-white/50 dark:border-white/10";
  const accentBg = highlighted ? "bg-primary/10" : accent === "success" ? "bg-primary/5" : accent === "warning" ? "bg-warning/10" : "bg-white/35 dark:bg-white/5";
  const statusColor = accent === "success" ? "text-primary" : accent === "warning" || highlighted ? "text-warning" : "text-muted-foreground";
  return (
    <Link href={href} className={`group flex min-h-[76px] items-center gap-3 rounded-[var(--radius-lg)] border ${accentBorder} ${accentBg} p-3 shadow-soft backdrop-blur-md transition-colors hover:border-primary/50 sm:p-4`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/50 bg-white/40 shadow-soft backdrop-blur-md dark:border-white/10 dark:bg-white/10"><Icon className="h-5 w-5 text-primary" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><p className="font-semibold text-foreground">{label}</p><p className={`shrink-0 text-xs font-semibold ${statusColor}`}>{highlighted ? "Next" : status}</p></div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{detail}</p>
        {typeof progress === "number" ? <Progress value={progress} className="mt-2 h-1.5" /> : null}
      </div>
    </Link>
  );
}

export default function WellnessPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const today = useTodayDate();
  const [waterTotal, setWaterTotal] = useState(0);
  const [waterTarget, setWaterTarget] = useState(0);
  const [habits, setHabits] = useState<FitnessHabit[]>([]);
  const [supplements, setSupplements] = useState<SupplementLog[]>([]);
  const [tasks, setTasks] = useState<DailyFitTask[]>([]);
  const [sleepExists, setSleepExists] = useState(false);
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const waterProgress = useMemo(() => waterTarget ? Math.min(100, Math.round((waterTotal / waterTarget) * 100)) : 0, [waterTotal, waterTarget]);
  const habitsDone = useMemo(() => habits.filter((item) => item.completed).length, [habits]);
  const habitsProgress = useMemo(() => habits.length ? Math.round((habitsDone / habits.length) * 100) : 0, [habits.length, habitsDone]);
  const supplementsTaken = useMemo(() => supplements.filter((item) => item.taken_today).length, [supplements]);
  const supplementsProgress = useMemo(() => supplements.length ? Math.round((supplementsTaken / supplements.length) * 100) : 0, [supplements.length, supplementsTaken]);
  const tasksDone = useMemo(() => tasks.filter((item) => item.completed).length, [tasks]);
  const tasksProgress = useMemo(() => tasks.length ? Math.round((tasksDone / tasks.length) * 100) : 0, [tasks.length, tasksDone]);

  useEffect(() => {
    if (!userId) { setIsLoading(false); return; }
    const authenticatedUserId = userId;
    let active = true;
    async function load() {
      setIsLoading(true);
      setLoadError("");
      const results = await Promise.allSettled([
        getWaterLogs(authenticatedUserId, today),
        getCalorieTargets(authenticatedUserId),
        getFitnessHabits(authenticatedUserId, today),
        getSupplementLogs(authenticatedUserId, today),
        getDailyFitTasks(authenticatedUserId, today),
        getSleepRecoveryHistory(authenticatedUserId, 7)
      ]);
      if (!active) return;
      const [waterLogs, targets, todayHabits, todaySupplements, todayTasks, sleepHistory] = results;
      if (waterLogs.status === "fulfilled") setWaterTotal(waterLogs.value.reduce((sum, log) => sum + Number(log.amount_ml), 0));
      if (targets.status === "fulfilled") setWaterTarget(targets.value?.water_ml ?? 0);
      if (todayHabits.status === "fulfilled") setHabits(todayHabits.value);
      if (todaySupplements.status === "fulfilled") setSupplements(todaySupplements.value);
      if (todayTasks.status === "fulfilled") setTasks(todayTasks.value);
      if (sleepHistory.status === "fulfilled") {
        const latestSleep = sleepHistory.value.find((item) => item.log_date === today);
        setSleepExists(Boolean(latestSleep));
        setSleepHours(typeof latestSleep?.hours_slept === "number" ? latestSleep.hours_slept : null);
      }
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") {
        const message = userSafeError(failed.reason, "Some wellness data could not load. Existing trackers are unchanged.");
        setLoadError(message);
        toast({ title: "Wellness summary incomplete", description: message });
      }
      setIsLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [reloadKey, today, toast, userId]);

  const waterStatus = waterTarget ? waterTotal >= waterTarget ? "Hit" : `${waterProgress}%` : "No target";
  const waterDetail = waterTarget ? `${Math.round(waterTotal / 10) / 100} L / ${Math.round(waterTarget / 10) / 100} L` : "Set a water target in Calories";
  const waterAccent = waterTarget && waterTotal >= waterTarget ? "success" : "default";
  const habitsStatus = habits.length ? `${habitsDone}/${habits.length}` : "None";
  const habitsDetail = habits.length ? habitsDone === habits.length ? "All done" : `${habits.length - habitsDone} remaining` : "No habits set today";
  const habitsAccent = habits.length && habitsDone === habits.length ? "success" : "default";
  const supplementsStatus = supplements.length ? `${supplementsTaken}/${supplements.length}` : "None";
  const supplementsDetail = supplements.length ? supplementsTaken === supplements.length ? "All taken" : `${supplements.length - supplementsTaken} remaining` : "No supplements today";
  const supplementsAccent = supplements.length && supplementsTaken === supplements.length ? "success" : "default";
  const tasksStatus = tasks.length ? `${tasksDone}/${tasks.length}` : "None";
  const tasksDetail = tasks.length ? tasksDone === tasks.length ? "All done" : `${tasks.length - tasksDone} remaining` : "No tasks today";
  const tasksAccent = tasks.length && tasksDone === tasks.length ? "success" : "default";
  const sleepStatus = sleepExists ? sleepHours !== null ? `${sleepHours}h` : "Logged" : "None";
  const sleepDetail = sleepExists ? sleepHours !== null ? `Sleep logged for ${today}` : "Recovery log saved" : "No sleep log today";
  const sleepAccent = sleepExists ? "success" : "default";

  const nextAction = waterTarget && waterTotal < waterTarget
    ? { label: "Log water", detail: `${waterTarget - waterTotal} ml remaining today.`, href: "/hydration", kind: "hydration" }
    : habits.length && habitsDone < habits.length
      ? { label: "Finish habits", detail: `${habits.length - habitsDone} habit${habits.length - habitsDone === 1 ? "" : "s"} remaining.`, href: "/habits", kind: "habits" }
      : supplements.length && supplementsTaken < supplements.length
        ? { label: "Update supplements", detail: `${supplements.length - supplementsTaken} item${supplements.length - supplementsTaken === 1 ? "" : "s"} remaining.`, href: "/supplements", kind: "supplements" }
        : !sleepExists
          ? { label: "Add recovery log", detail: "Save sleep or recovery context for today.", href: "/sleep-recovery", kind: "sleep" }
          : tasks.length && tasksDone < tasks.length
            ? { label: "Finish daily tasks", detail: `${tasks.length - tasksDone} task${tasks.length - tasksDone === 1 ? "" : "s"} remaining.`, href: "/daily-fit-tasks", kind: "tasks" }
            : { label: "Nothing urgent", detail: "Keep your routine or open any tracker below.", href: "/wellness", kind: "none" };

  return (
    <>
      <PageHeading title="Wellness" description="Daily status and calm entry points for habits, water, supplements, sleep, recovery, and tasks." />
      {isLoading ? <CardGridSkeleton count={3} rows={3} /> : (
        <div className="space-y-4">
          <Card variant="glassStrong" className="border-primary/20">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="text-sm font-semibold text-muted-foreground">Today status</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{nextAction.label}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{nextAction.detail}</p></div>
                {nextAction.kind !== "none" ? <Button asChild className="min-h-12 w-full sm:w-auto"><Link href={nextAction.href}>Open next action</Link></Button> : <div className="flex min-h-12 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium text-primary"><CheckCircle2 className="h-4 w-4" /> Routine clear</div>}
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-4"><StatusPill label="Hydration" value={waterStatus} /><StatusPill label="Habits" value={habitsStatus} /><StatusPill label="Supplements" value={supplementsStatus} /><StatusPill label="Sleep" value={sleepStatus} /></div>
              {loadError ? <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><div><p className="font-semibold text-foreground">Some wellness data could not load.</p><p>{loadError}</p><Button type="button" variant="outline" onClick={() => setReloadKey((current) => current + 1)} className="mt-3 min-h-12 w-full sm:w-auto"><RefreshCcw className="h-4 w-4" /> Retry summary</Button></div></div> : null}
            </CardContent>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <LauncherCard href="/hydration" icon={Droplets} label="Hydration" status={waterStatus} detail={waterDetail} progress={waterTarget ? waterProgress : undefined} accent={waterAccent} highlighted={nextAction.kind === "hydration"} />
            <LauncherCard href="/habits" icon={Repeat} label="Habits" status={habitsStatus} detail={habitsDetail} progress={habits.length ? habitsProgress : undefined} accent={habitsAccent} highlighted={nextAction.kind === "habits"} />
            <LauncherCard href="/sleep-recovery" icon={Moon} label="Sleep & Recovery" status={sleepStatus} detail={sleepDetail} accent={sleepAccent} highlighted={nextAction.kind === "sleep"} />
            <LauncherCard href="/supplements" icon={FlaskConical} label="Supplements" status={supplementsStatus} detail={supplementsDetail} progress={supplements.length ? supplementsProgress : undefined} accent={supplementsAccent} highlighted={nextAction.kind === "supplements"} />
            <LauncherCard href="/daily-fit-tasks" icon={ListChecks} label="Daily Fit Tasks" status={tasksStatus} detail={tasksDetail} progress={tasks.length ? tasksProgress : undefined} accent={tasksAccent} highlighted={nextAction.kind === "tasks"} />
          </div>
        </div>
      )}
    </>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-card p-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-semibold text-foreground">{value}</p></div>;
}
