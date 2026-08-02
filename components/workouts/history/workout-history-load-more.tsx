"use client";

import { LoaderCircle, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTrainTranslation } from "@/lib/i18n/train";

export function WorkoutHistoryLoadMore({ loading, error, onLoadMore }: { loading: boolean; error: boolean; onLoadMore: () => void }) {
  const { tr } = useTrainTranslation();
  return (
    <div className="flex flex-col items-center gap-2 py-2" aria-live="polite">
      {error ? <p className="text-sm text-muted-foreground">{tr("historyLoadMoreFailed")}</p> : null}
      <Button type="button" variant="outline" className="min-h-12 min-w-40 rounded-2xl" disabled={loading} onClick={onLoadMore}>
        {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : error ? <RefreshCcw className="size-4" aria-hidden="true" /> : null}
        {loading ? tr("historyLoadingMore") : error ? tr("historyRetry") : tr("historyLoadMore")}
      </Button>
    </div>
  );
}
