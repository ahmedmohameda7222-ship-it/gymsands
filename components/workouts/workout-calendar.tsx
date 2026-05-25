"use client";

import { CalendarDays, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Weekday, Workout } from "@/types";
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
  activeDayIndex,
  onSelectDay,
  onStartToday
}: {
  days: WeeklyPlanDay[];
  activeDayIndex: number;
  onSelectDay: (index: number) => void;
  onStartToday: () => void;
}) {
  const today = getCurrentWeekday();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Weekly calendar
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Your saved workout days appear by weekday.</p>
        </div>
        <Button onClick={onStartToday}>
          <Play className="h-4 w-4" />
          Start today's workout
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {weekDays.map((weekday) => {
            const planIndex = days.findIndex((day) => day.weekday === weekday);
            const planDay = planIndex >= 0 ? days[planIndex] : null;
            const isToday = weekday === today;
            const isActive = planIndex === activeDayIndex;

            return (
              <button
                key={weekday}
                type="button"
                onClick={() => planIndex >= 0 && onSelectDay(planIndex)}
                className={cn(
                  "min-h-36 rounded-lg border bg-white p-3 text-left transition hover:border-primary hover:bg-blue-50",
                  isToday ? "border-primary ring-2 ring-blue-100" : "border-slate-200",
                  isActive ? "bg-blue-50" : ""
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">{weekday}</p>
                  {isToday ? <Badge>Today</Badge> : null}
                </div>
                {planDay ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-semibold text-primary">{planDay.dayName}</p>
                    <p className="text-xs text-muted-foreground">{planDay.exercises.length} exercises</p>
                    <div className="space-y-1">
                      {planDay.exercises.slice(0, 3).map((exercise) => (
                        <p key={exercise.id} className="truncate text-xs text-slate-700">• {exercise.name}</p>
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
