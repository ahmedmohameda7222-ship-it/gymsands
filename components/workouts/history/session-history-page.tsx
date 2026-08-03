"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { ExerciseHistorySection } from "@/components/workouts/history/exercise-history-section";
import { SessionHistoryActions } from "@/components/workouts/history/session-history-actions";
import { SessionCorrectionDialog } from "@/components/workouts/history/session-correction-dialog";
import { SessionHistoryInsight } from "@/components/workouts/history/session-history-insight";
import { SessionHistoryMuscleSummary } from "@/components/workouts/history/session-history-muscle-summary";
import { SessionHistoryNotes } from "@/components/workouts/history/session-history-notes";
import { SessionHistorySummary } from "@/components/workouts/history/session-history-summary";
import { SessionHistoryTimeline } from "@/components/workouts/history/session-history-timeline";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { useTrainTranslation } from "@/lib/i18n/train";
import { cn } from "@/lib/utils";
import {
  getWorkoutHistoryDetail,
  WorkoutHistoryClientError,
} from "@/services/workouts/history/client";
import { refreshVerifiedRecordsAuthenticated } from "@/services/workouts/history/verified-records-client";
import type { WorkoutHistorySessionDetailResponse } from "@/types/workout-history";

type DetailLoadOptions = {
  preserveContent?: boolean;
  allowProjectionRepair?: boolean;
};

export function SessionHistoryPage({
  source,
  id,
}: {
  source: "performed" | "scheduled_fallback";
  id: string;
}) {
  const { user, session } = useAuth();
  const userId = user?.id;
  const accessTokenRef = useRef<string | null>(
    session?.access_token ?? null,
  );
  const { dir, locale, tr } = useTrainTranslation();
  const [detail, setDetail] =
    useState<WorkoutHistorySessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const projectionRepairAttemptRef = useRef<string | null>(null);
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  useEffect(() => {
    accessTokenRef.current = session?.access_token ?? null;
  }, [session?.access_token]);

  const load = useCallback(
    async (
      signal?: AbortSignal,
      options: DetailLoadOptions = {},
    ) => {
      if (!userId) return;
      if (!options.preserveContent) setLoading(true);
      setFailed(false);
      setNotFound(false);
      try {
        let next = await getWorkoutHistoryDetail(
          userId,
          source,
          id,
          {
            accessToken: accessTokenRef.current,
            signal,
          },
        );
        const canonicalSessionId = next.activity.canonicalSessionId;
        const shouldRepairProjection =
          options.allowProjectionRepair !== false &&
          source === "performed" &&
          Boolean(canonicalSessionId) &&
          next.notices.includes("user-action-required") &&
          projectionRepairAttemptRef.current !== canonicalSessionId;
        if (shouldRepairProjection && canonicalSessionId) {
          projectionRepairAttemptRef.current = canonicalSessionId;
          try {
            const repaired =
              await refreshVerifiedRecordsAuthenticated(
                canonicalSessionId,
              );
            if (repaired && !signal?.aborted) {
              next = await getWorkoutHistoryDetail(
                userId,
                source,
                id,
                {
                  accessToken: accessTokenRef.current,
                  signal,
                },
              );
            }
          } catch {
            // Canonical workout detail remains readable. The explicit notice stays
            // visible and reconnect or a later page visit can retry the projection.
          }
        }
        if (!signal?.aborted) setDetail(next);
      } catch (error) {
        if (signal?.aborted) return;
        setDetail(null);
        setNotFound(
          error instanceof WorkoutHistoryClientError &&
            error.status === 404,
        );
        setFailed(
          !(
            error instanceof WorkoutHistoryClientError &&
            error.status === 404
          ),
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id, source, userId],
  );

  useEffect(() => {
    projectionRepairAttemptRef.current = null;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (source !== "performed") return;
    const handleOnline = () => {
      projectionRepairAttemptRef.current = null;
      void load(undefined, { preserveContent: true });
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [load, source]);

  if (loading) {
    return (
      <TrainPageContainer
        className="space-y-4 pb-8"
        dir={dir}
        withGutters
        data-session-history-page
      >
        <div
          className="h-11 w-48 animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
          aria-label={tr("historyDetailLoading")}
        />
        <div className="h-28 animate-pulse rounded-[20px] bg-muted motion-reduce:animate-none" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-20 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      </TrainPageContainer>
    );
  }

  if (!detail) {
    return (
      <TrainPageContainer
        className="space-y-4 pb-8"
        dir={dir}
        withGutters
        data-session-history-page
      >
        <Button
          asChild
          variant="ghost"
          className="min-h-11 w-fit px-2"
        >
          <Link href="/workout-history">
            <ArrowLeft
              className="size-4 rtl:rotate-180"
              aria-hidden="true"
            />
            {tr("historyBackToList")}
          </Link>
        </Button>
        <section className="rounded-[20px] border border-border/70 bg-card p-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">
            {failed
              ? tr("historyDetailLoadFailed")
              : tr("historyDetailNotFound")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {notFound
              ? tr("historyDetailNotFound")
              : tr("historyLoadFailedDescription")}
          </p>
          {failed ? (
            <Button
              type="button"
              className="mt-4 min-h-11"
              onClick={() => void load()}
            >
              {tr("historyRetry")}
            </Button>
          ) : null}
        </section>
      </TrainPageContainer>
    );
  }

  const lifecycleKey =
    detail.activity.lifecycle === "completed"
      ? "historyCompletedStatus"
      : detail.activity.lifecycle === "partial"
        ? "historyPartialStatus"
        : detail.activity.lifecycle === "skipped"
          ? "historySkippedStatus"
          : "historyCancelledStatus";
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(detail.activity.effectiveAt));
  const projectionNotice = detail.notices.includes(
    "user-action-required",
  )
    ? tr("historyActionRequiredNotice")
    : detail.notices.includes("partial-availability")
      ? tr("historyPartialNotice")
      : null;

  return (
    <TrainPageContainer
      className="space-y-4 pb-8"
      dir={dir}
      withGutters
      data-session-history-page
      data-source-kind={detail.activity.sourceKind}
      data-snapshot-version={detail.snapshot?.schemaVersion}
    >
      <Button
        asChild
        variant="ghost"
        className="min-h-11 w-fit px-2"
      >
        <Link href="/workout-history">
          <ArrowLeft
            className="size-4 rtl:rotate-180"
            aria-hidden="true"
          />
          {tr("historyBackToList")}
        </Link>
      </Button>
      <header className="rounded-[20px] border border-border/70 bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {detail.activity.title}
            </h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays
                className="size-4"
                aria-hidden="true"
              />
              <time dateTime={detail.activity.effectiveAt}>
                {date}
              </time>
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium",
              detail.activity.lifecycle === "completed"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {tr(lifecycleKey)}
          </span>
        </div>
      </header>

      <SessionHistorySummary detail={detail} />
      <SessionHistoryInsight detail={detail} />
      {projectionNotice ? (
        <p
          className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm leading-6 text-muted-foreground"
          role="status"
        >
          {projectionNotice}
        </p>
      ) : null}
      {detail.activity.sourceKind === "scheduled_fallback" ? (
        <p
          className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm leading-6 text-muted-foreground"
          role="status"
        >
          {tr("historyScheduledFallbackNotice")}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] lg:items-start lg:gap-6">
        {detail.activity.canonicalSessionId &&
        detail.activity.capabilities.showMuscleAnalysis ? (
          <div className="lg:col-start-2 lg:row-start-1">
            <SessionHistoryMuscleSummary
              sessionId={detail.activity.canonicalSessionId}
            />
          </div>
        ) : null}
        <div className="space-y-4 lg:col-start-1 lg:row-start-1">
          <section aria-labelledby="session-history-exercises-title">
            <h2
              id="session-history-exercises-title"
              className="mb-3 text-lg font-semibold text-foreground"
            >
              {tr("historyExercisesTitle")}
            </h2>
            <div className="space-y-3">
              {detail.exercises.map((exercise, index) => (
                <ExerciseHistorySection
                  key={exercise.identity}
                  exercise={exercise}
                  defaultOpen={
                    index === 0 &&
                    detail.activity.sourceKind === "performed"
                  }
                />
              ))}
            </div>
          </section>
          <SessionHistoryNotes notes={detail.activity.notes} />
          <SessionHistoryTimeline
            entries={detail.timeline}
            timezone={timezone}
          />
        </div>
      </div>
      <SessionHistoryActions
        capabilities={detail.activity.capabilities}
        sessionId={detail.activity.canonicalSessionId ?? id}
        title={detail.activity.title}
      />
      {detail.activity.canonicalSessionId &&
      detail.activity.capabilities.correctSession ? (
        <SessionCorrectionDialog
          sessionId={detail.activity.canonicalSessionId}
          title={detail.activity.title}
          historyRevision={detail.historyRevision ?? 0}
          notes={detail.activity.notes}
          durationMinutes={detail.activity.durationMinutes}
          exercises={detail.exercises}
          onChanged={() => {
            projectionRepairAttemptRef.current = null;
            void load();
          }}
        />
      ) : null}
    </TrainPageContainer>
  );
}
