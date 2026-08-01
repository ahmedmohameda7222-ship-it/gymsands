"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";

type DeletedWorkout = {
  id: string;
  workout_name: string;
  started_at: string;
  days_remaining: number;
};

export function RecentlyDeletedWorkouts() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<DeletedWorkout[]>([]);
  const [loading, setLoading] = useState(true);
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
    if (
      kind === "purge" &&
      !window.confirm(
        `Delete ${item.workout_name} permanently? This cannot be undone.`,
      )
    )
      return;

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
          kind === "restore" ? "Restore failed" : "Permanent deletion failed",
        description: data.error,
        variant: "error",
      });
      return;
    }

    toast({
      title:
        kind === "restore" ? "Workout restored" : "Workout permanently deleted",
    });
    void load();
  }

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="text-base">Recently deleted workouts</CardTitle>
        <CardDescription>
          Restore workouts for 30 days, or remove them permanently.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading recently deleted workouts…
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recently deleted workouts.
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
                  {new Date(item.started_at).toLocaleDateString()} ·{" "}
                  {item.days_remaining} days remaining
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void mutate(item, "restore")}
                >
                  <RotateCcw className="size-4" />
                  Restore
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void mutate(item, "purge")}
                >
                  <Trash2 className="size-4" />
                  Delete permanently
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
