"use client";

import Link from "next/link";
import { AlertTriangle, Moon, Pill, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interpolateFocusedTodayCopy, type FocusedTodayCopy } from "@/lib/dashboard/focused-today-copy";
import type { FitnessHabit, SleepRecoveryLog, SupplementLog } from "@/types";

export type WellnessPartialErrors = {
  habits?: string;
  supplements?: string;
  sleep?: string;
};

export function WellnessToday({
  state,
  habits,
  supplements,
  sleepLogs,
  errors,
  copy
}: {
  state: "loading" | "loaded" | "failed";
  habits: FitnessHabit[];
  supplements: SupplementLog[];
  sleepLogs: SleepRecoveryLog[];
  errors: WellnessPartialErrors;
  copy: FocusedTodayCopy;
}) {
  const habitsDone = habits.filter((item) => item.completed);
  const openHabits = habits.filter((item) => !item.completed);
  const takenSupplements = supplements.filter((item) => item.taken_today);
  const remainingSupplements = supplements.filter((item) => !item.taken_today);
  const latestSleep = sleepLogs[0] ?? null;
  const poorRecovery = Boolean(latestSleep && (latestSleep.recovery_level === "low" || latestSleep.fatigue_level === "high"));
  const hasData = habits.length > 0 || supplements.length > 0 || Boolean(latestSleep);

  return (
    <section aria-labelledby="wellness-today" aria-busy={state === "loading"}>
      <h2 id="wellness-today" className="mb-2 text-base font-semibold">{copy.wellnessToday}</h2>
      <Card>
        <CardContent className="p-4 sm:p-5">
          {state === "loading" ? <p className="text-sm text-muted-foreground">{copy.loading}</p> : null}
          {state === "failed" ? (
            <div className="flex flex-wrap items-center justify-between gap-3" role="alert">
              <p className="text-sm text-muted-foreground">{copy.sectionUnavailable}</p>
              <Button asChild variant="outline" className="min-h-11"><Link href="/wellness">{copy.openWellness}</Link></Button>
            </div>
          ) : null}
          {state === "loaded" ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <WellnessGroup icon={<Pill className="h-5 w-5" />} title={copy.supplements} unavailable={Boolean(errors.supplements)} unavailableCopy={copy.sectionUnavailable}>
                  {!errors.supplements ? (
                    <>
                      <SummaryLine values={[[copy.planned, supplements.length], [copy.taken, takenSupplements.length], [copy.remaining, remainingSupplements.length]]} />
                      {remainingSupplements.length ? <p className="mt-2 text-xs text-muted-foreground">{remainingSupplements.slice(0, 2).map((item) => item.name).join(" · ")}</p> : null}
                    </>
                  ) : null}
                </WellnessGroup>
                <WellnessGroup icon={<Repeat className="h-5 w-5" />} title={copy.habits} unavailable={Boolean(errors.habits)} unavailableCopy={copy.sectionUnavailable}>
                  {!errors.habits ? (
                    <>
                      <SummaryLine values={[[copy.planned, habits.length], [copy.completed, habitsDone.length], [copy.open, openHabits.length]]} />
                      {openHabits.length ? <p className="mt-2 text-xs text-muted-foreground">{openHabits.slice(0, 2).map((item) => item.name).join(" · ")}</p> : null}
                    </>
                  ) : null}
                </WellnessGroup>
                <WellnessGroup icon={<Moon className="h-5 w-5" />} title={copy.sleepRecovery} unavailable={Boolean(errors.sleep)} unavailableCopy={copy.sectionUnavailable}>
                  {!errors.sleep ? (
                    latestSleep ? (
                      <div className="space-y-1.5 text-sm">
                        <p>{latestSleep.hours_slept === null ? copy.sleepUnavailable : interpolateFocusedTodayCopy(copy.hoursSlept, { hours: latestSleep.hours_slept })}</p>
                        {latestSleep.recovery_level ? <p className="text-xs text-muted-foreground">{copy.recovery}: {latestSleep.recovery_level}</p> : null}
                        {latestSleep.fatigue_level ? <p className="text-xs text-muted-foreground">{copy.fatigue}: {latestSleep.fatigue_level}</p> : null}
                        {poorRecovery ? <p className="flex items-center gap-1.5 text-xs font-semibold text-warning"><AlertTriangle className="h-4 w-4" />{copy.lowRecovery}</p> : null}
                      </div>
                    ) : <p className="text-sm text-muted-foreground">{copy.sleepUnavailable}</p>
                  ) : null}
                </WellnessGroup>
              </div>
              {Object.keys(errors).length ? <p className="mt-3 text-xs text-warning">{copy.someWellnessUnavailable}</p> : null}
              {!hasData && !Object.keys(errors).length ? <p className="mt-3 text-sm text-muted-foreground">{copy.noWellnessData}</p> : null}
              <Button asChild variant="outline" className="mt-4 min-h-11"><Link href="/wellness">{copy.openWellness}</Link></Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function WellnessGroup({ icon, title, unavailable, unavailableCopy, children }: { icon: React.ReactNode; title: string; unavailable: boolean; unavailableCopy: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-border/60 pb-4 last:border-b-0 md:border-b-0 md:border-e md:pb-0 md:pe-4 md:last:border-e-0 md:last:pe-0">
      <CardHeader className="p-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
      </CardHeader>
      {unavailable ? <p className="text-sm text-muted-foreground">{unavailableCopy}</p> : children}
    </div>
  );
}

function SummaryLine({ values }: { values: Array<[string, number]> }) {
  return <div className="grid grid-cols-3 gap-2">{values.map(([label, value]) => <div key={label}><p className="text-lg font-bold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>)}</div>;
}
