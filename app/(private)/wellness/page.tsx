"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Droplets,
  FlaskConical,
  ListChecks,
  Moon,
  Repeat,
  ShieldCheck
} from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { useAuth } from "@/components/auth/auth-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toaster";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { userSafeError } from "@/lib/error-formatting";
import { getCalorieTargets, getWaterLogs } from "@/services/database/nutrition";
import {
  getDailyFitTasks,
  getFitnessHabits,
  getSupplementLogs
} from "@/services/database/wellness";
import { getSleepRecoveryHistory } from "@/services/wellness/wellness-data";
import type { DailyFitTask, FitnessHabit, SupplementLog } from "@/types";
import { DailyCheckins } from "@/components/wellness/daily-checkins";

interface LauncherCardProps {
  href: string;
  icon: React.ElementType;
  label: string;
  status: string;
  detail: string;
  progress?: number;
  accent?: "default" | "success" | "warning";
}

function LauncherCard({ href, icon: Icon, label, status, detail, progress, accent = "default" }: LauncherCardProps) {
  const accentBorder = accent === "success" ? "border-primary/40" : accent === "warning" ? "border-warning/40" : "border-white/50 dark:border-white/10";
  const accentBg = accent === "success" ? "bg-primary/5" : accent === "warning" ? "bg-warning/10" : "bg-white/35 dark:bg-white/5";
  const statusColor = accent === "success" ? "text-primary" : accent === "warning" ? "text-warning" : "text-muted-foreground";

  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-[var(--radius-lg)] border ${accentBorder} ${accentBg} p-3 shadow-soft backdrop-blur-md transition hover:border-primary/50 hover:shadow-luxe sm:p-4`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/50 bg-white/40 shadow-soft backdrop-blur-md dark:border-white/10 dark:bg-white/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-foreground">{label}</p>
          <p className={`shrink-0 text-xs font-semibold ${statusColor}`}>{status}</p>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground truncate">{detail}</p>
        {typeof progress === "number" ? (
          <Progress value={progress} className="mt-2 h-1.5" />
        ) : null}
      </div>
    </Link>
  );
}

export default function WellnessPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = useTodayDate();
  const [waterTotal, setWaterTotal] = useState(0);
  const [waterTarget, setWaterTarget] = useState(0);
  const [habits, setHabits] = useState<FitnessHabit[]>([]);
  const [supplements, setSupplements] = useState<SupplementLog[]>([]);
  const [tasks, setTasks] = useState<DailyFitTask[]>([]);
  const [sleepExists, setSleepExists] = useState(false);
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const waterProgress = useMemo(() => {
    if (!waterTarget) return 0;
    return Math.min(100, Math.round((waterTotal / waterTarget) * 100));
  }, [waterTotal, waterTarget]);

  const habitsDone = useMemo(() => habits.filter((h) => h.completed).length, [habits]);
  const habitsProgress = useMemo(() => (habits.length ? Math.round((habitsDone / habits.length) * 100) : 0), [habitsDone, habits.length]);

  const supplementsTaken = useMemo(() => supplements.filter((s) => s.taken_today).length, [supplements]);
  const supplementsProgress = useMemo(() => (supplements.length ? Math.round((supplementsTaken / supplements.length) * 100) : 0), [supplementsTaken, supplements.length]);

  const tasksDone = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);
  const tasksProgress = useMemo(() => (tasks.length ? Math.round((tasksDone / tasks.length) * 100) : 0), [tasksDone, tasks.length]);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      try {
        const [waterLogs, targets, todayHabits, todaySupplements, todayTasks, sleepHistory] = await Promise.all([
          getWaterLogs(user.id, today),
          getCalorieTargets(user.id),
          getFitnessHabits(user.id, today),
          getSupplementLogs(user.id, today),
          getDailyFitTasks(user.id, today),
          getSleepRecoveryHistory(user.id, 7)
        ]);
        setWaterTotal(waterLogs.reduce((sum, log) => sum + Number(log.amount_ml), 0));
        setWaterTarget(targets?.water_ml ?? 0);
        setHabits(todayHabits);
        setSupplements(todaySupplements);
        setTasks(todayTasks);
        const latestSleep = sleepHistory.find((s) => s.log_date === today);
        setSleepExists(!!latestSleep);
        setSleepHours(typeof latestSleep?.hours_slept === "number" ? latestSleep.hours_slept : null);
      } catch (error) {
        toast({ title: "Could not load wellness summary", description: userSafeError(error, "Please refresh and try again.") });
      } finally {
        // Individual launchers keep their last known state if a refresh fails.
      }
    }
    load();
  }, [user?.id, today, toast]);

  const waterStatus = waterTarget
    ? waterTotal >= waterTarget
      ? "Hit"
      : `${waterProgress}%`
    : "No target";
  const waterDetail = waterTarget
    ? `${Math.round(waterTotal / 10) / 100} L / ${Math.round(waterTarget / 10) / 100} L`
    : "Set a water target in Calories";
  const waterAccent = waterTarget && waterTotal >= waterTarget ? "success" : "default";

  const habitsStatus = habits.length ? `${habitsDone}/${habits.length}` : "None";
  const habitsDetail = habits.length
    ? `${habitsDone === habits.length ? "All done" : `${habits.length - habitsDone} remaining`}`
    : "No habits set today";
  const habitsAccent = habits.length && habitsDone === habits.length ? "success" : "default";

  const supplementsStatus = supplements.length ? `${supplementsTaken}/${supplements.length}` : "None";
  const supplementsDetail = supplements.length
    ? `${supplementsTaken === supplements.length ? "All taken" : `${supplements.length - supplementsTaken} remaining`}`
    : "No supplements today";
  const supplementsAccent = supplements.length && supplementsTaken === supplements.length ? "success" : "default";

  const tasksStatus = tasks.length ? `${tasksDone}/${tasks.length}` : "None";
  const tasksDetail = tasks.length
    ? `${tasksDone === tasks.length ? "All done" : `${tasks.length - tasksDone} remaining`}`
    : "No tasks today";
  const tasksAccent = tasks.length && tasksDone === tasks.length ? "success" : "default";

  const sleepStatus = sleepExists ? (sleepHours !== null ? `${sleepHours}h` : "Logged") : "None";
  const sleepDetail = sleepExists
    ? sleepHours !== null
      ? `Sleep logged for ${today}`
      : "Recovery log saved"
    : "No sleep log today";
  const sleepAccent = sleepExists ? "success" : "default";

  return (
    <>
      <PageHeading
        title="Wellness"
        description="Daily launcher for habits, water, supplements, sleep, recovery, and tasks."
      />

      <div className="space-y-4">
        <DailyCheckins />
        {/* Launcher cards — compact, mobile-first */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <LauncherCard
            href="/hydration"
            icon={Droplets}
            label="Hydration"
            status={waterStatus}
            detail={waterDetail}
            progress={waterTarget ? waterProgress : undefined}
            accent={waterAccent}
          />
          <LauncherCard
            href="/habits"
            icon={Repeat}
            label="Habits"
            status={habitsStatus}
            detail={habitsDetail}
            progress={habits.length ? habitsProgress : undefined}
            accent={habitsAccent}
          />
          <LauncherCard
            href="/sleep-recovery"
            icon={Moon}
            label="Sleep & Recovery"
            status={sleepStatus}
            detail={sleepDetail}
            accent={sleepAccent}
          />
          <LauncherCard
            href="/supplements"
            icon={FlaskConical}
            label="Supplements"
            status={supplementsStatus}
            detail={supplementsDetail}
            progress={supplements.length ? supplementsProgress : undefined}
            accent={supplementsAccent}
          />
          <LauncherCard
            href="/daily-fit-tasks"
            icon={ListChecks}
            label="Daily Fit Tasks"
            status={tasksStatus}
            detail={tasksDetail}
            progress={tasks.length ? tasksProgress : undefined}
            accent={tasksAccent}
          />
        </div>

        {/* Collapsible: detailed wellness checklist */}
        <Card variant="glass">
          <button
            type="button"
            onClick={() => setShowDetails((s) => !s)}
            className="flex w-full items-center justify-between p-4 text-left sm:p-5"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Daily wellness checklist</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${showDetails ? "rotate-180" : ""}`} />
          </button>
          {showDetails ? (
            <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckItem done={waterTarget > 0 && waterTotal >= waterTarget} label="Hydration target" detail={waterDetail} />
                <CheckItem done={habits.length > 0 && habitsDone === habits.length} label="Habits" detail={habitsDetail} />
                <CheckItem done={sleepExists} label="Sleep logged" detail={sleepDetail} />
                <CheckItem done={supplements.length > 0 && supplementsTaken === supplements.length} label="Supplements" detail={supplementsDetail} />
                <CheckItem done={tasks.length > 0 && tasksDone === tasks.length} label="Daily Fit Tasks" detail={tasksDetail} />
              </div>
            </CardContent>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function CheckItem({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="solid-row flex items-start gap-2.5 p-2.5">
      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 text-muted-foreground"}`}>
        <CheckCircle2 className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
