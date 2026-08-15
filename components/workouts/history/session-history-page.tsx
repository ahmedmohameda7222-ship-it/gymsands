"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { ExerciseHistorySection } from "@/components/workouts/history/exercise-history-section";
import { SessionCorrectionDialog } from "@/components/workouts/history/session-correction-dialog";
import { SessionHistoryActions } from "@/components/workouts/history/session-history-actions";
import { SessionHistoryMoreActions } from "@/components/workouts/history/session-history-more-actions";
import { SessionHistoryMuscleSummary } from "@/components/workouts/history/session-history-muscle-summary";
import { SessionHistoryNotes } from "@/components/workouts/history/session-history-notes";
import { SessionHistorySummary } from "@/components/workouts/history/session-history-summary";
import { SessionHistoryTimeline } from "@/components/workouts/history/session-history-timeline";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getWorkoutHistoryDetail, WorkoutHistoryClientError } from "@/services/workouts/history/client";
import { refreshVerifiedRecordsAuthenticated } from "@/services/workouts/history/verified-records-client";
import type { WorkoutHistorySessionDetailResponse } from "@/types/workout-history";

type DetailLoadOptions = { preserveContent?: boolean; allowProjectionRepair?: boolean };

export function SessionHistoryPage({ source, id }: { source: "performed" | "scheduled_fallback"; id: string }) {
  const { user, session } = useAuth();
  const userId = user?.id;
  const accessTokenRef = useRef<string | null>(session?.access_token ?? null);
  const { dir, language, locale, tr } = useTrainTranslation();
  const [detail, setDetail] = useState<WorkoutHistorySessionDetailResponse | null>(null);
  const detailRef = useRef<WorkoutHistorySessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const [freshAuthority, setFreshAuthority] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const projectionRepairAttemptRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  useEffect(() => { accessTokenRef.current = session?.access_token ?? null; }, [session?.access_token]);
  useEffect(() => { detailRef.current = detail; }, [detail]);

  const load = useCallback(async (signal?: AbortSignal, options: DetailLoadOptions = {}) => {
    if (!userId) return;
    const generation = ++loadGenerationRef.current;
    const current = () => !signal?.aborted && loadGenerationRef.current === generation;
    setFreshAuthority(false);
    if (!options.preserveContent) setLoading(true);
    setFailed(false);
    setNotFound(false);
    try {
      let next = await getWorkoutHistoryDetail(userId, source, id, { accessToken: accessTokenRef.current, signal });
      if (!current()) return;
      const canonicalId = next.activity.canonicalSessionId;
      if (options.allowProjectionRepair !== false && source === "performed" && canonicalId && next.notices.includes("user-action-required") && projectionRepairAttemptRef.current !== canonicalId) {
        projectionRepairAttemptRef.current = canonicalId;
        try {
          if (await refreshVerifiedRecordsAuthenticated(canonicalId, { accessToken: accessTokenRef.current, signal })) {
            if (!current()) return;
            next = await getWorkoutHistoryDetail(userId, source, id, { accessToken: accessTokenRef.current, signal });
          }
          else projectionRepairAttemptRef.current = null;
        } catch { if (current()) projectionRepairAttemptRef.current = null; }
      }
      if (current()) {
        detailRef.current = next;
        setDetail(next);
        setFreshAuthority(!next.notices.includes("stale-data"));
      }
    } catch (error) {
      if (!current()) return;
      const missing = error instanceof WorkoutHistoryClientError && error.status === 404;
      if (!options.preserveContent || !detailRef.current) { detailRef.current = null; setDetail(null); }
      setNotFound(missing);
      setFailed(!missing);
      setFreshAuthority(false);
    } finally { if (current()) setLoading(false); }
  }, [id, source, userId]);

  useEffect(() => {
    projectionRepairAttemptRef.current = null;
    const controller = new AbortController();
    void load(controller.signal);
    return () => { loadGenerationRef.current += 1; controller.abort(); };
  }, [load]);

  useEffect(() => {
    if (source !== "performed") return;
    const online = () => { projectionRepairAttemptRef.current = null; void load(undefined, { preserveContent: true }); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [load, source]);

  if (loading && !detail) return (
    <TrainPageContainer className="mx-auto max-w-4xl space-y-3 pb-8" dir={dir} withGutters data-session-history-page>
      <div className="h-11 w-48 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-label={tr("historyDetailLoading")} />
      <div className="h-10 w-2/3 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse border-b border-border bg-muted/50 motion-reduce:animate-none" />)}
    </TrainPageContainer>
  );

  if (!detail) return (
    <TrainPageContainer className="mx-auto max-w-4xl space-y-4 pb-8" dir={dir} withGutters data-session-history-page>
      <Button asChild variant="ghost" className="min-h-11 w-fit px-2"><Link href="/workout-history"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />{tr("historyBackToList")}</Link></Button>
      <section className="border-y border-border/70 py-8 text-center" role={failed ? "alert" : undefined}>
        <h1 className="text-xl font-semibold text-foreground">{failed ? tr("historyDetailLoadFailed") : tr("historyDetailNotFound")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{notFound ? tr("historyDetailNotFound") : tr("historyLoadFailedDescription")}</p>
        {failed ? <Button type="button" className="mt-4 min-h-11" onClick={() => void load()}>{tr("historyRetry")}</Button> : null}
      </section>
    </TrainPageContainer>
  );

  const date = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(new Date(detail.activity.effectiveAt));
  const lifecycle = detail.activity.lifecycle === "partial" ? tr("historyPartialStatus") : detail.activity.lifecycle === "skipped" ? tr("historySkippedStatus") : detail.activity.lifecycle === "cancelled" ? tr("historyCancelledStatus") : null;
  const trustNotice = failed || detail.notices.includes("stale-data") ? tr("historyStaleDetailNotice") : detail.notices.includes("user-action-required") ? tr("historyActionRequiredNotice") : detail.notices.includes("partial-availability") ? tr("historyPartialNotice") : null;

  return (
    <TrainPageContainer className="mx-auto max-w-4xl space-y-5 pb-8" dir={dir} withGutters data-session-history-page data-source-kind={detail.activity.sourceKind} data-snapshot-version={detail.snapshot?.schemaVersion}>
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" className="min-h-11 px-2"><Link href="/workout-history"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />{tr("historyBackToList")}</Link></Button>
        <SessionHistoryMoreActions detail={detail} accessToken={session?.access_token} language={language} timezone={timezone} formattedDate={date} onCorrect={() => setCorrectionOpen(true)} freshAuthority={freshAuthority} />
      </div>

      <header className="border-b border-border/70 pb-5">
        <div className="flex flex-wrap items-baseline gap-2"><h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{detail.activity.title}</h1>{lifecycle ? <span className="text-sm font-semibold text-warning">{lifecycle}</span> : null}</div>
        <time className="mt-2 block text-sm text-muted-foreground" dateTime={detail.activity.effectiveAt}>{date}</time>
        <SessionHistorySummary detail={detail} />
      </header>

      {trustNotice ? <p className="border-y border-border/70 py-3 text-sm leading-6 text-muted-foreground" role={failed ? "alert" : "status"}>{trustNotice}</p> : null}
      {!freshAuthority ? <p className="border-b border-border/70 pb-3 text-sm leading-6 text-muted-foreground" role="status" data-stale-history-action-notice>{tr("historyStaleActionsUnavailable")}</p> : null}
      {detail.activity.sourceKind === "scheduled_fallback" ? <p className="border-y border-border/70 py-3 text-sm leading-6 text-muted-foreground" role="status">{tr("historyScheduledFallbackNotice")}</p> : null}

      <section aria-labelledby="session-history-results-title">
        <h2 id="session-history-results-title" className="text-lg font-semibold text-foreground">{tr("historyActivityResults")}</h2>
        <div className="mt-2 divide-y divide-border/70">
          {detail.exercises.map((exercise, index) => <ExerciseHistorySection key={exercise.identity} exercise={exercise} defaultOpen={index === 0 && detail.activity.sourceKind === "performed"} />)}
        </div>
      </section>

      {detail.activity.canonicalSessionId && detail.activity.capabilities.showMuscleAnalysis ? <SessionHistoryMuscleSummary sessionId={detail.activity.canonicalSessionId} accessToken={session?.access_token} /> : null}
      <SessionHistoryNotes notes={detail.activity.notes} />
      <SessionHistoryTimeline entries={detail.timeline} timezone={timezone} />
      <SessionHistoryActions capabilities={detail.activity.capabilities} sessionId={detail.activity.canonicalSessionId ?? id} title={detail.activity.title} freshAuthority={freshAuthority} />
      {freshAuthority && detail.activity.canonicalSessionId && detail.activity.capabilities.correctSession ? <SessionCorrectionDialog open={correctionOpen} onOpenChange={setCorrectionOpen} sessionId={detail.activity.canonicalSessionId} historyRevision={detail.historyRevision ?? 0} notes={detail.activity.notes} durationMinutes={detail.activity.durationMinutes} exercises={detail.exercises} onChanged={() => { projectionRepairAttemptRef.current = null; void load(); }} /> : null}
    </TrainPageContainer>
  );
}
