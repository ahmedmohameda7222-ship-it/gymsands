"use client";

import { CalendarDays, Play, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Weekday, Workout, WorkoutSession } from "@/types";
import { getCurrentWeekday, weekDays } from "@/services/database/repository";

export type WeeklyPlanDay = {
  id?: string;
  planId?: string;
  dayName: string;
  weekday: Weekday | null;
  notes: string;
  exercises: Workout[];
};

export function WorkoutCalendar({
  days,
  activity = [],
  activeDayIndex,
  onSelectDay,
  onStartToday,
  onSkipToday,
  isSkipping = false
}: {
  days: WeeklyPlanDay[];
  activity?: WorkoutSession[];
  activeDayIndex: number;
  onSelectDay: (index: number) => void;
  onStartToday: () => void;
  onSkipToday?: () => void;
  isSkipping?: boolean;
}) {
  const today = getCurrentWeekday();
  const currentWeekStart = startOfWeek(new Date());
  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekStart.getDate() + 7);

  function statusForDay(day: WeeklyPlanDay | null) {
    if (!day?.id) return null;
    const matches = activity
      .filter((session) => {
        const date = new Date(session.completed_at || session.skipped_at || session.started_at);
        return (
          session.plan_day_id === day.id &&
          date >= currentWeekStart &&
          date < currentWeekEnd &&
          (session.status === "completed" || session.status === "skipped")
        );
      })
      .sort((a, b) => new Date(b.completed_at || b.skipped_at || b.started_at).getTime() - new Date(a.completed_at || a.skipped_at || a.started_at).getTime());

    return matches[0]?.status ?? null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Weekly calendar
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Completed days turn green. Skipped days stay separate.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onSkipToday ? (
            <Button variant="outline" onClick={onSkipToday} disabled={isSkipping}>
              <SkipForward className="h-4 w-4" />
              {isSkipping ? "Skipping..." : "Skip today"}
            </Button>
          ) : null}
          <Button onClick={onStartToday}>
            <Play className="h-4 w-4" />
            Start today
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {weekDays.map((weekday) => {
            const planIndex = days.findIndex((day) => day.weekday === weekday);
            const planDay = planIndex >= 0 ? days[planIndex] : null;
            const isToday = weekday === today;
            const isActive = planIndex === activeDayIndex;
            const status = statusForDay(planDay);

            return (
              <button
                key={weekday}
                type="button"
                onClick={() => planIndex >= 0 && onSelectDay(planIndex)}
                className={cn(
                  "min-h-36 rounded-lg border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-primary hover:bg-blue-50 hover:shadow-sm",
                  isToday ? "border-primary ring-2 ring-blue-100" : "border-slate-200",
                  isActive ? "bg-blue-50" : "",
                  status === "completed" ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-50" : "",
                  status === "skipped" ? "border-amber-300 bg-amber-50 hover:bg-amber-50" : ""
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">{weekday}</p>
                  <div className="flex flex-wrap justify-end gap-1">
                    {isToday ? <Badge>Today</Badge> : null}
                    {status === "completed" ? <Badge variant="success">Done</Badge> : null}
                    {status === "skipped" ? <Badge className="bg-amber-100 text-amber-800">Skipped</Badge> : null}
                  </div>
                </div>
                {planDay ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-semibold text-primary">{planDay.dayName}</p>
                    <p className="text-xs text-muted-foreground">{planDay.exercises.length} exercises</p>
                    <div className="space-y-1">
                      {planDay.exercises.slice(0, 3).map((exercise) => (
                        <p key={exercise.id} className="truncate text-xs text-slate-700">- {exercise.name}</p>
                      ))}
                      {planDay.exercises.length > 3 ? <p className="text-xs text-muted-foreground">+{planDay.exercises.length - 3} more</p> : null}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Rest day</p>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}
