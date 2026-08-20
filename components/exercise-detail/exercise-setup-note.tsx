"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CanonicalExerciseIdentity } from "@/lib/exercise-detail/identity";
import { drainLatestSetupNoteValue } from "@/lib/exercise-detail/setup-note-save-queue";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { cn } from "@/lib/utils";
import { EXERCISE_SETUP_NOTE_MAX_LENGTH, getExerciseSetupNote, persistExerciseSetupNote } from "@/services/exercise-detail/setup-note";

type SaveState = "idle" | "saving" | "saved" | "failed";

export function ExerciseSetupNoteEditor({ userId, identity }: { userId: string; identity: CanonicalExerciseIdentity }) {
  const { ed } = useExerciseDetailTranslation();
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const desiredRef = useRef("");
  const persistedRef = useRef("");
  const workerRef = useRef<Promise<boolean> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    setLoaded(false); setSaveState("idle"); setDraft(""); desiredRef.current = ""; persistedRef.current = "";
    void getExerciseSetupNote(userId, identity.canonical, controller.signal).then((note) => {
      if (controller.signal.aborted) return;
      const value = note?.note_body ?? "";
      persistedRef.current = value;
      desiredRef.current = value;
      setDraft(value);
      setLoaded(true);
    }).catch(() => {
      if (!controller.signal.aborted) { setLoaded(true); setSaveState("failed"); }
    });
    return () => { mountedRef.current = false; controller.abort(); };
  }, [identity.canonical, userId]);

  const drain = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    workerRef.current = drainLatestSetupNoteValue({
      getDesired: () => desiredRef.current,
      getPersisted: () => persistedRef.current,
      setPersisted: (value) => { persistedRef.current = value; },
      save: async (value) => (await persistExerciseSetupNote(userId, identity.canonical, value))?.note_body ?? "",
      onState: (next) => { if (mountedRef.current) setSaveState(next); }
    }).finally(() => { workerRef.current = null; });
    return workerRef.current;
  }, [identity.canonical, userId]);

  useEffect(() => {
    if (!loaded || desiredRef.current === persistedRef.current) return;
    const timeout = window.setTimeout(() => { void drain(); }, 650);
    return () => window.clearTimeout(timeout);
  }, [draft, drain, loaded]);

  function change(value: string) {
    if (value.length > EXERCISE_SETUP_NOTE_MAX_LENGTH) return;
    desiredRef.current = value;
    setDraft(value);
    setSaveState("idle");
  }

  return <div className="space-y-3">
    <textarea
      value={draft}
      onChange={(event) => change(event.target.value)}
      placeholder={ed("setupNotePlaceholder")}
      disabled={!loaded}
      maxLength={EXERCISE_SETUP_NOTE_MAX_LENGTH}
      className={cn("min-h-28 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50")}
      aria-describedby="exercise-setup-note-status exercise-setup-note-hint"
    />
    <div className="flex min-h-6 items-center justify-between gap-3 text-sm">
      <p id="exercise-setup-note-hint" className="text-muted-foreground">{ed("setupNoteHint")}</p>
      <div id="exercise-setup-note-status" aria-live="polite" className="shrink-0">
        {saveState === "saving" ? <span>{ed("saving")}</span> : null}
        {saveState === "saved" ? <span>{ed("saved")}</span> : null}
        {saveState === "failed" ? <span className="inline-flex items-center gap-2 text-destructive">{ed("saveFailed")}<Button type="button" variant="ghost" size="sm" onClick={() => void drain()}>{ed("retry")}</Button></span> : null}
      </div>
    </div>
  </div>;
}
