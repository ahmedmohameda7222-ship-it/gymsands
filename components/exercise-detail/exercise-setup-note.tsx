"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CanonicalExerciseIdentity } from "@/lib/exercise-detail/identity";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { EXERCISE_SETUP_NOTE_MAX_LENGTH, getExerciseSetupNote, persistExerciseSetupNote } from "@/services/exercise-detail/setup-note";

type SaveState = "idle" | "saving" | "saved" | "failed";

export function ExerciseSetupNoteEditor({ userId, identity }: { userId: string; identity: CanonicalExerciseIdentity }) {
  const { ed } = useExerciseDetailTranslation();
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const desiredRef = useRef("");
  const persistedRef = useRef("");
  const workerRef = useRef<Promise<void> | null>(null);
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
    workerRef.current = (async () => {
      while (persistedRef.current !== desiredRef.current) {
        const value = desiredRef.current;
        if (mountedRef.current) setSaveState("saving");
        try {
          const saved = await persistExerciseSetupNote(userId, identity.canonical, value);
          persistedRef.current = saved?.note_body ?? "";
          if (persistedRef.current === desiredRef.current && mountedRef.current) setSaveState("saved");
        } catch {
          if (mountedRef.current) setSaveState("failed");
          break;
        }
      }
    })().finally(() => { workerRef.current = null; });
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
    <Textarea
      value={draft}
      onChange={(event) => change(event.target.value)}
      placeholder={ed("setupNotePlaceholder")}
      disabled={!loaded}
      maxLength={EXERCISE_SETUP_NOTE_MAX_LENGTH}
      className="min-h-28 resize-y"
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
