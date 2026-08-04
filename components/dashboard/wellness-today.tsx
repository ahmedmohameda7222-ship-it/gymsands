"use client";

import Link from "next/link";
import { AlertTriangle, Moon, Pill, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  interpolateFocusedTodayCopy,
  type FocusedTodayCopy,
} from "@/lib/dashboard/focused-today-copy";
import type {
  TodayHabitProjection,
  TodayProjectionEnvelope,
  TodaySleepProjection,
  TodaySupplementProjection,
} from "@/lib/dashboard/today-projection-contract";

export function WellnessToday({
  state,
  habits,
  supplements,
  sleep,
  copy,
}: {
  state: "loading" | "loaded" | "failed";
  habits: TodayProjectionEnvelope<TodayHabitProjection> | null;
  supplements: TodayProjectionEnvelope<TodaySupplementProjection> | null;
  sleep: TodayProjectionEnvelope<TodaySleepProjection> | null;
  copy: FocusedTodayCopy;
}) {
  const habitsValue = habits?.state === "loaded" ? habits.value : null;
  const supplementsValue =
    supplements?.state === "loaded" ? supplements.value : null;
  const sleepValue = sleep?.state === "loaded" ? sleep.value : null;
  const hasData = Boolean(
    habitsValue?.plannedCount ||
      supplementsValue?.plannedCount ||
      sleepValue?.hasData,
  );
  const hasPartialError = [habits, supplements, sleep].some(
    (source) => source?.state === "failed",
  );

  return (
    <section aria-labelledby="wellness-today" aria-busy={state === "loading"}>
      <h2 id="wellness-today" className="mb-2 text-base font-semibold">
        {copy.wellnessToday}
      </h2>
      <Card>
        <CardContent className="p-4 sm:p-5">
          {state === "loading" ? (
            <p className="text-sm text-muted-foreground">{copy.loading}</p>
          ) : null}
          {state === "failed" ? (
            <div
              className="flex flex-wrap items-center justify-between gap-3"
              role="alert"
            >
              <p className="text-sm text-muted-foreground">
                {copy.sectionUnavailable}
              </p>
              <Button asChild variant="outline" className="min-h-11">
                <Link href="/wellness">{copy.openWellness}</Link>
              </Button>
            </div>
          ) : null}
          {state === "loaded" ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <WellnessGroup
                  icon={<Pill className="h-5 w-5" />}
                  title={copy.supplements}
                  unavailable={supplements?.state === "failed"}
                  unavailableCopy={copy.sectionUnavailable}
                >
                  {supplementsValue ? (
                    <>
                      <SummaryLine
                        values={[
                          [copy.planned, supplementsValue.plannedCount],
                          [copy.taken, supplementsValue.takenCount],
                          [copy.remaining, supplementsValue.remainingCount],
                        ]}
                      />
                      {supplementsValue.remainingPreviewNames.length ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {supplementsValue.remainingPreviewNames.join(" · ")}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </WellnessGroup>
                <WellnessGroup
                  icon={<Repeat className="h-5 w-5" />}
                  title={copy.habits}
                  unavailable={habits?.state === "failed"}
                  unavailableCopy={copy.sectionUnavailable}
                >
                  {habitsValue ? (
                    <>
                      <SummaryLine
                        values={[
                          [copy.planned, habitsValue.plannedCount],
                          [copy.completed, habitsValue.completedCount],
                          [copy.open, habitsValue.openCount],
                        ]}
                      />
                      {habitsValue.openPreviewNames.length ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {habitsValue.openPreviewNames.join(" · ")}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </WellnessGroup>
                <WellnessGroup
                  icon={<Moon className="h-5 w-5" />}
                  title={copy.sleepRecovery}
                  unavailable={sleep?.state === "failed"}
                  unavailableCopy={copy.sectionUnavailable}
                >
                  {sleepValue?.hasData ? (
                    <div className="space-y-1.5 text-sm">
                      <p>
                        {sleepValue.hoursSlept === null
                          ? copy.sleepUnavailable
                          : interpolateFocusedTodayCopy(copy.hoursSlept, {
                              hours: sleepValue.hoursSlept,
                            })}
                      </p>
                      {sleepValue.recoveryLevel ? (
                        <p className="text-xs text-muted-foreground">
                          {copy.recovery}: {sleepValue.recoveryLevel}
                        </p>
                      ) : null}
                      {sleepValue.fatigueLevel ? (
                        <p className="text-xs text-muted-foreground">
                          {copy.fatigue}: {sleepValue.fatigueLevel}
                        </p>
                      ) : null}
                      {sleepValue.poorRecovery ? (
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                          <AlertTriangle className="h-4 w-4" />
                          {copy.lowRecovery}
                        </p>
                      ) : null}
                    </div>
                  ) : sleep?.state === "loaded" ? (
                    <p className="text-sm text-muted-foreground">
                      {copy.sleepUnavailable}
                    </p>
                  ) : null}
                </WellnessGroup>
              </div>
              {hasPartialError ? (
                <p className="mt-3 text-xs text-warning">
                  {copy.someWellnessUnavailable}
                </p>
              ) : null}
              {!hasData && !hasPartialError ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {copy.noWellnessData}
                </p>
              ) : null}
              <Button asChild variant="outline" className="mt-4 min-h-11">
                <Link href="/wellness">{copy.openWellness}</Link>
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function WellnessGroup({
  icon,
  title,
  unavailable,
  unavailableCopy,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  unavailable: boolean;
  unavailableCopy: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-b border-border/60 pb-4 last:border-b-0 md:border-b-0 md:border-e md:pb-0 md:pe-4 md:last:border-e-0 md:last:pe-0">
      <CardHeader className="p-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      {unavailable ? (
        <p className="text-sm text-muted-foreground">{unavailableCopy}</p>
      ) : (
        children
      )}
    </div>
  );
}

function SummaryLine({ values }: { values: Array<[string, number]> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {values.map(([label, value]) => (
        <div key={label}>
          <p className="text-lg font-bold">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}
