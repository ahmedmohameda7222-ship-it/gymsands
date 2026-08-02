"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyPlus, Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { useTrainTranslation } from "@/lib/i18n/train";
import type {
  RepeatWorkoutChoice,
  RepeatWorkoutPreview,
} from "@/services/workouts/history/repeat";

export function RepeatWorkoutReview({
  sessionId,
  title,
}: {
  sessionId: string;
  title: string;
}) {
  const { session } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { tr } = useTrainTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [preview, setPreview] = useState<RepeatWorkoutPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, RepeatWorkoutChoice>>(
    {},
  );

  async function loadPreview() {
    if (!session?.access_token) {
      setLoadError(true);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const locale = document.documentElement.lang || "en";
      const response = await fetch(
        `/api/workouts/history/${sessionId}/repeat-preview?locale=${encodeURIComponent(locale)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error ?? "Repeat preview could not load.");
      const next = data as RepeatWorkoutPreview;
      setPreview(next);
      setChoices(
        Object.fromEntries(
          next.items.map((item) => [
            item.sourceSnapshotItemId,
            item.currentResolution.state === "available"
              ? {
                  sourceSnapshotItemId: item.sourceSnapshotItemId,
                  action: "use",
                  identity: item.currentResolution.identity,
                }
              : {
                  sourceSnapshotItemId: item.sourceSnapshotItemId,
                  action: "omit",
                },
          ]),
        ),
      );
    } catch (error) {
      setLoadError(true);
      toast({
        title: tr("historyRepeatPreviewFailed"),
        description:
          error instanceof Error ? error.message : tr("historyRetry"),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  function chooseAlternative(itemId: string, serialized: string) {
    if (!serialized) {
      setChoices((current) => ({
        ...current,
        [itemId]: { sourceSnapshotItemId: itemId, action: "omit" },
      }));
      return;
    }
    setChoices((current) => ({
      ...current,
      [itemId]: {
        sourceSnapshotItemId: itemId,
        action: "replace",
        identity: JSON.parse(serialized),
      },
    }));
  }

  async function start() {
    if (!session?.access_token || !preview) return;
    if (!navigator.onLine) {
      toast({
        title: tr("historyRepeatNetworkRequired"),
        description: tr("historyRepeatNetworkDescription"),
        variant: "warning",
      });
      return;
    }
    const selected = preview.items
      .map((item) => choices[item.sourceSnapshotItemId])
      .filter(Boolean);
    if (!selected.some((choice) => choice.action !== "omit")) {
      toast({
        title: tr("historyRepeatChooseExercise"),
        description: tr("historyRepeatChooseExerciseDescription"),
        variant: "warning",
      });
      return;
    }
    setStarting(true);
    try {
      const candidateSessionId = crypto.randomUUID();
      const response = await fetch(
        `/api/workouts/history/${sessionId}/repeat`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            candidateSessionId,
            idempotencyKey: `history-repeat:${candidateSessionId}`,
            items: selected,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error ?? "Repeated workout could not start.");
      setOpen(false);
      router.push(
        `/workouts/session/${data.session?.id ?? candidateSessionId}`,
      );
    } catch (error) {
      toast({
        title: tr("historyRepeatStartFailed"),
        description:
          error instanceof Error ? error.message : tr("historyRetry"),
        variant: "error",
      });
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !preview) void loadPreview();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" className="min-h-12">
          <CopyPlus className="size-4" />
          {tr("historyRepeatWorkout")}
        </Button>
      </DialogTrigger>
      <DialogContent layout="responsive-drawer">
        <div className="overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-6">
          <DialogHeader>
            <DialogTitle>{tr("historyRepeatTitle", { title })}</DialogTitle>
            <DialogDescription>
              {tr("historyRepeatDescription")}
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {tr("historyRepeatCheckingAvailability")}
            </p>
          ) : null}
          {loadError ? (
            <div
              className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
              role="alert"
            >
              <p className="font-medium">{tr("historyRepeatPreviewFailed")}</p>
              <p className="mt-1 text-muted-foreground">
                {tr("historyLoadFailedDescription")}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-11"
                onClick={() => void loadPreview()}
              >
                {tr("historyRetry")}
              </Button>
            </div>
          ) : null}
          {preview?.activeSessionConflict ? (
            <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm">
              <p className="font-medium">
                {tr("historyRepeatActiveTitle", {
                  title: preview.activeSessionConflict.title,
                })}
              </p>
              <p className="mt-1 text-muted-foreground">
                {tr("historyRepeatActiveDescription")}
              </p>
              <Button asChild variant="outline" className="mt-3 min-h-11">
                <Link
                  href={`/workouts/session/${preview.activeSessionConflict.sessionId}`}
                >
                  {tr("historyRepeatReturnActive")}
                </Link>
              </Button>
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            {preview?.items.map((item) => {
              const choice = choices[item.sourceSnapshotItemId];
              return (
                <article
                  key={item.sourceSnapshotItemId}
                  className="rounded-2xl border border-border/70 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {item.order}. {item.historicalName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.currentResolution.state === "available"
                          ? tr("historyRepeatAvailableAs", {
                              name: item.currentResolution.name,
                            })
                          : tr("historyRepeatReplacementRequired")}
                      </p>
                    </div>
                    {item.currentResolution.state === "available" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9"
                        onClick={() => {
                          const resolution = item.currentResolution;
                          if (resolution.state !== "available") return;
                          setChoices((current) => ({
                            ...current,
                            [item.sourceSnapshotItemId]:
                              choice?.action === "omit"
                                ? {
                                    sourceSnapshotItemId:
                                      item.sourceSnapshotItemId,
                                    action: "use",
                                    identity: resolution.identity,
                                  }
                                : {
                                    sourceSnapshotItemId:
                                      item.sourceSnapshotItemId,
                                    action: "omit",
                                  },
                          }));
                        }}
                      >
                        {choice?.action === "omit"
                          ? tr("historyRepeatKeep")
                          : tr("historyRepeatOmit")}
                      </Button>
                    ) : null}
                  </div>
                  {item.currentResolution.state === "replacement-required" &&
                  item.currentResolution.alternatives.length > 0 ? (
                    <label className="mt-3 grid gap-1 text-xs font-medium">
                      {tr("historyRepeatReplacement")}
                      <select
                        className="min-h-11 rounded-xl border bg-background px-3 text-sm"
                        value={
                          choice?.action === "replace"
                            ? JSON.stringify(choice.identity)
                            : ""
                        }
                        onChange={(event) =>
                          chooseAlternative(
                            item.sourceSnapshotItemId,
                            event.target.value,
                          )
                        }
                      >
                        <option value="">
                          {tr("historyRepeatOmitExercise")}
                        </option>
                        {item.currentResolution.alternatives.map(
                          (alternative) => (
                            <option
                              key={`${alternative.identity.provider}:${alternative.identity.identity}`}
                              value={JSON.stringify(alternative.identity)}
                            >
                              {alternative.name}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  ) : null}
                </article>
              );
            })}
          </div>
          <Button
            type="button"
            className="mt-5 min-h-12 w-full"
            disabled={
              !preview ||
              loading ||
              starting ||
              Boolean(preview.activeSessionConflict)
            }
            onClick={() => void start()}
          >
            {starting ? tr("historyRepeatStarting") : tr("historyRepeatStart")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
