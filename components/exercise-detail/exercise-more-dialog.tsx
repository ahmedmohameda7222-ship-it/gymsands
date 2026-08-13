"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import {
  resetUserExerciseVideo,
  upsertUserExerciseVideo,
} from "@/services/database/workout-library";
import { updateCustomExerciseVideo } from "@/services/workouts/exercise-library-store";

export function ExerciseMoreDialog({
  open,
  onOpenChange,
  userId,
  exerciseId,
  exerciseName,
  customExercise,
  currentUrl,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  exerciseId: string;
  exerciseName: string;
  customExercise: boolean;
  currentUrl: string | null;
  onSaved: (url: string | null) => void;
}) {
  const { dir, ed } = useExerciseDetailTranslation();
  const [draft, setDraft] = useState(currentUrl ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const invalid = Boolean(
    draft.trim() && !/^https?:\/\/[^\s]+$/i.test(draft.trim()),
  );
  useEffect(() => {
    if (open) {
      setDraft(currentUrl ?? "");
      setMessage("");
      setError("");
    }
  }, [currentUrl, open]);

  async function save() {
    if (pending || invalid || !draft.trim()) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const url = customExercise
        ? await updateCustomExerciseVideo(userId, exerciseId, draft)
        : (await upsertUserExerciseVideo(userId, exerciseId, draft))
            .custom_video_url;
      onSaved(url);
      setMessage(ed("videoSaved"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ed("invalidUrl"));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      if (customExercise)
        await updateCustomExerciseVideo(userId, exerciseId, null);
      else await resetUserExerciseVideo(userId, exerciseId);
      setDraft("");
      onSaved(null);
      setMessage(ed("videoRemoved"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ed("invalidUrl"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent dir={dir} closeLabel={ed("close")} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {currentUrl ? ed("changeVideo") : ed("addVideo")}
          </DialogTitle>
          <DialogDescription>{exerciseName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="exercise-custom-video">{ed("videoUrl")}</Label>
            <Input
              id="exercise-custom-video"
              dir="ltr"
              className="min-h-12"
              type="url"
              inputMode="url"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setError("");
                setMessage("");
              }}
              aria-invalid={invalid}
            />
          </div>
          {invalid ? (
            <p className="text-sm text-destructive" role="alert">
              {ed("invalidUrl")}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-success" role="status">
              {message}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {currentUrl ? (
              <Button
                type="button"
                variant="destructive"
                className="min-h-12"
                onClick={remove}
                disabled={pending}
              >
                {ed("removeVideo")}
              </Button>
            ) : null}
            <Button
              type="button"
              className="min-h-12"
              onClick={save}
              disabled={pending || invalid || !draft.trim()}
            >
              {ed("saveVideo")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
