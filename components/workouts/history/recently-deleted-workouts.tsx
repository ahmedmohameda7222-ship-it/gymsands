"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import { useTrainTranslation } from "@/lib/i18n/train";

type DeletedWorkout = {
  id: string;
  workout_name: string;
  started_at: string;
  days_remaining: number;
};

export function RecentlyDeletedWorkouts() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { locale, tr } = useTrainTranslation();
  const [items, setItems] = useState<DeletedWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const confirm = useConfirm();
  const accessToken = session?.access_token;

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const response = await fetch("/api/workouts/history/recently-deleted", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setItems(data.items ?? []);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(item: DeletedWorkout, kind: "restore" | "purge") {
    if (!accessToken) return;
    const response = await fetch(`/api/workouts/history/${item.id}/${kind}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        kind === "restore"
          ? { idempotencyKey: `history-restore:${crypto.randomUUID()}` }
          : { confirmPermanent: true },
      ),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast({
        title:
          kind === "restore"
            ? tr("historyRestoreFailed")
            : tr("historyPermanentDeleteFailed"),
        description: data.error,
        variant: "error",
      });
      return;
    }
    toast({
      title:
        kind === "restore"
          ? tr("historyWorkoutRestored")
          : tr("historyWorkoutPermanentlyDeleted"),
    });
    void load();
  }

  function requestPurge(item: DeletedWorkout) {
    confirm.ask({
      title: tr("historyDeletePermanently"),
      description: tr("historyPermanentDeleteConfirmation", { title: item.workout_name }),
      confirmLabel: tr("historyDeletePermanently"),
      cancelLabel: tr("historyKeepWorkout"),
      variant: "destructive",
      onConfirm: () => void mutate(item, "purge"),
    });
  }

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="text-base">
          {tr("historyRecentlyDeletedTitle")}
        </CardTitle>
        <CardDescription>
          {tr("historyRecentlyDeletedDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">
            {tr("historyRecentlyDeletedLoading")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tr("historyRecentlyDeletedEmpty")}
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{item.workout_name}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(item.started_at).toLocaleDateString(locale)} ·{" "}
                  {tr("historyDaysRemaining", {
                    count: item.days_remaining,
                  })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void mutate(item, "restore")}
                >
                  <RotateCcw className="size-4" />
                  {tr("historyRestore")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => requestPurge(item)}
                >
                  <Trash2 className="size-4" />
                  {tr("historyDeletePermanently")}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
      {confirm.dialog}
    </Card>
  );
}
