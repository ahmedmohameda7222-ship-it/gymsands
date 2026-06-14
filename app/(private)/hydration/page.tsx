"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Droplets, RefreshCcw, Trash2 } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState, ErrorState } from "@/components/ui/state-views";
import { useToast } from "@/components/ui/toaster";
import { logRecoverableError, technicalErrorDetails, userSafeError } from "@/lib/error-formatting";
import { todayIso } from "@/lib/utils";
import { addWaterLog, deleteWaterLog, getCalorieTargets, getWaterLogs } from "@/services/database/nutrition";
import type { WaterLog } from "@/types";

export default function HydrationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<WaterLog[]>([]);
  const [targetMl, setTargetMl] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | undefined>(undefined);
  const date = todayIso();
  const totalMl = useMemo(() => logs.reduce((sum, log) => sum + Number(log.amount_ml), 0), [logs]);
  const target = targetMl ?? 0;
  const progress = target ? Math.min(100, Math.round((totalMl / target) * 100)) : 0;
  const remainingMl = target ? Math.max(0, target - totalMl) : 0;

  async function loadHydration() {
    if (!user?.id) return;
    setIsLoading(true);
    setLoadError(null);
    setLoadErrorDetails(undefined);
    try {
      const [water, targets] = await Promise.all([getWaterLogs(user.id, date), getCalorieTargets(user.id)]);
      setLogs(water);
      setTargetMl(targets?.water_ml ?? null);
    } catch (error) {
      logRecoverableError("hydration.load", error);
      const message = userSafeError(error, "Something went wrong while loading hydration. Please try again.");
      setLoadError(message);
      setLoadErrorDetails(technicalErrorDetails(error));
      toast({ title: "Could not load hydration", description: message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadHydration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function quickAdd(amountMl: number) {
    if (!user?.id || isSaving) return;
    setIsSaving(true);
    try {
      const log = await addWaterLog(user.id, date, amountMl);
      setLogs((current) => [log, ...current]);
      toast({ title: "Water logged", description: `${amountMl} ml added to today.` });
    } catch (error) {
      logRecoverableError("hydration.add", error);
      toast({ title: "Could not add water", description: userSafeError(error, "Water was not logged. Please try again.") });
    } finally {
      setIsSaving(false);
    }
  }

  async function removeLog(log: WaterLog) {
    if (!user?.id || isSaving) return;
    setIsSaving(true);
    try {
      await deleteWaterLog(user.id, log.id);
      setLogs((current) => current.filter((item) => item.id !== log.id));
      toast({ title: "Water entry removed", description: "Today total was updated." });
    } catch (error) {
      logRecoverableError("hydration.delete", error);
      toast({ title: "Could not remove entry", description: userSafeError(error, "Please try again.") });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Hydration"
        description="Track today's water from the same account-backed logs used by the dashboard and calorie tracker."
        action={
          <Button asChild variant="outline">
            <Link href="/calories">Edit Targets</Link>
          </Button>
        }
      />

      {loadError ? (
        <ErrorState
          title="Hydration could not load"
          description={loadError}
          onRetry={loadHydration}
          fallbackLabel="Open calories"
          fallbackHref="/calories"
          details={loadErrorDetails}
        />
      ) : null}

      {!loadError ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="h-5 w-5 text-primary" />
                Today
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-4xl font-bold">{Math.round(totalMl / 10) / 100} L</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {target ? `${remainingMl} ml remaining from ${Math.round(target / 10) / 100} L target` : "Set a water target in Calories/Macros."}
                </p>
              </div>
              {target ? <Progress value={progress} /> : null}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {[250, 500, 750, 1000].map((amount) => (
                  <Button key={amount} type="button" className="min-h-12" variant="outline" onClick={() => quickAdd(amount)} disabled={isSaving || isLoading}>
                    <Droplets className="h-4 w-4" />
                    +{amount === 1000 ? "1 L" : `${amount} ml`}
                  </Button>
                ))}
              </div>
              <Button type="button" variant="ghost" onClick={loadHydration} disabled={isLoading}>
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent water entries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? <p className="text-sm text-muted-foreground">Loading real water logs...</p> : null}
              {!isLoading && !logs.length ? (
                <EmptyState
                  title="No water logged today"
                  description="Use quick add when you finish a glass or bottle. No placeholder hydration data is shown."
                  actionLabel="Add 500 ml"
                  onAction={() => quickAdd(500)}
                />
              ) : null}
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="font-semibold">{log.amount_ml} ml</p>
                    <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove water entry" onClick={() => removeLog(log)} disabled={isSaving}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
