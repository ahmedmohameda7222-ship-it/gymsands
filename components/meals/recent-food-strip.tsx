"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Heart, CheckCircle2, Utensils } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getRecentFoodLogs,
  favoriteKeyForLog,
  getFavoriteFoodKeysAsync,
  logFoodFromPreviousLog,
  setFavoriteFoodAsync,
} from "@/services/meals/food-logging-speed";
import { useToast } from "@/components/ui/toaster";
import { InlineFeedback } from "@/components/motion";
import { userSafeError } from "@/lib/error-formatting";
import type { FoodLog, MealType } from "@/types";

type RecentFoodStripProps = {
  onFoodLogged?: (log: FoodLog) => void;
  defaultMealType?: MealType;
  logDate?: string;
};

export function RecentFoodStrip({ onFoodLogged, defaultMealType = "Breakfast", logDate }: RecentFoodStripProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [recentLogs, setRecentLogs] = useState<FoodLog[]>([]);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [activePanel, setActivePanel] = useState<"recent" | "frequent" | null>(null);
  const [pendingLogKey, setPendingLogKey] = useState<string | null>(null);
  const [pendingFavoriteKey, setPendingFavoriteKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);

  useEffect(() => {
    setMealType(defaultMealType);
  }, [defaultMealType]);

  async function load() {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const [recent, favorites] = await Promise.all([
        getRecentFoodLogs(user.id, 100),
        getFavoriteFoodKeysAsync(user.id),
      ]);
      setRecentLogs(recent);
      setFavoriteKeys(favorites);
      setFeedback(null);
    } catch (error) {
      setFeedback({ type: "error", message: userSafeError(error, "Recent foods could not load. Manual add is still available.") });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const uniqueRecents = useMemo(() => uniqueLogs(recentLogs).slice(0, 8), [recentLogs]);
  const frequent = useMemo(() => frequentLogs(recentLogs).slice(0, 8), [recentLogs]);

  const hasAny = uniqueRecents.length > 0 || frequent.length > 0;
  if (isLoading) return null;
  if (!hasAny && feedback?.type === "error") {
    return (
      <Card variant="glass" className="border-dashed">
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold text-foreground">Quick repeats unavailable</p>
          <InlineFeedback message={feedback.message} variant="error" onClose={() => setFeedback(null)} />
          <p className="text-xs leading-5 text-muted-foreground">Use ChatGPT review or manual add while Plaivra reloads recent foods.</p>
        </CardContent>
      </Card>
    );
  }
  if (!hasAny) return null;

  async function logAgain(log: FoodLog) {
    if (!user?.id) return;
    const key = favoriteKeyForLog(log);
    if (pendingLogKey) return;
    setPendingLogKey(key);
    setFeedback({ type: "info", message: `Logging ${log.food_name} to ${displayMealType(mealType)}...` });
    try {
      const added = await logFoodFromPreviousLog(user.id, log, logDate, mealType);
      toast({ title: "Logged again", description: `${log.food_name} added to ${displayMealType(mealType)}.` });
      onFoodLogged?.(added);
      setRecentLogs((current) => [added, ...current]);
      setFeedback({ type: "info", message: `${log.food_name} was logged. Manual add remains available for corrections.` });
    } catch (error) {
      setFeedback({ type: "error", message: `Could not log ${log.food_name}. No duplicate was created. ${userSafeError(error)}` });
      toast({ title: "Could not log", description: userSafeError(error) });
    } finally {
      setPendingLogKey(null);
    }
  }

  async function toggleFavorite(key: string, label: string) {
    if (!user?.id) return;
    if (pendingFavoriteKey) return;
    const previous = favoriteKeys;
    const shouldFavorite = !favoriteKeys.includes(key);
    setPendingFavoriteKey(key);
    setFavoriteKeys((current) => shouldFavorite ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key));
    try {
      const next = await setFavoriteFoodAsync(user.id, key, shouldFavorite, label);
      setFavoriteKeys(next);
    } catch (error) {
      setFavoriteKeys(previous);
      setFeedback({ type: "error", message: userSafeError(error, "Favorite update failed. We restored the previous state.") });
    } finally {
      setPendingFavoriteKey(null);
    }
  }

  function togglePanel(panel: "recent" | "frequent") {
    setActivePanel((current) => (current === panel ? null : panel));
  }

  return (
    <Card variant="glass" className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Quick log
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-5 text-muted-foreground">Recent and frequent foods are fast fallbacks for repeats after the ChatGPT review path.</p>
        <InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} onClose={() => setFeedback(null)} />
        <div className="flex gap-2">
          <Button
            variant={activePanel === "recent" ? "default" : "outline"}
            onClick={() => togglePanel("recent")}
            className="min-h-12 flex-1"
            disabled={uniqueRecents.length === 0}
          >
            <Clock className="mr-1 h-3.5 w-3.5" />
            Recent Foods
          </Button>
          <Button
            variant={activePanel === "frequent" ? "default" : "outline"}
            onClick={() => togglePanel("frequent")}
            className="min-h-12 flex-1"
            disabled={frequent.length === 0}
          >
            <Utensils className="mr-1 h-3.5 w-3.5" />
            Frequent Foods
          </Button>
        </div>

        {activePanel === "recent" && uniqueRecents.length > 0 && (
          <div className="grid gap-2">
            {uniqueRecents.map((log) => (
              <FoodChip
                key={`recent-${favoriteKeyForLog(log)}`}
                log={log}
                isFavorite={favoriteKeys.includes(favoriteKeyForLog(log))}
                isLogging={pendingLogKey === favoriteKeyForLog(log)}
                isFavoritePending={pendingFavoriteKey === favoriteKeyForLog(log)}
                onLog={() => logAgain(log)}
                onFavorite={() => toggleFavorite(favoriteKeyForLog(log), log.food_name)}
              />
            ))}
          </div>
        )}

        {activePanel === "frequent" && frequent.length > 0 && (
          <div className="grid gap-2">
            {frequent.map((log) => (
              <FoodChip
                key={`freq-${favoriteKeyForLog(log)}`}
                log={log}
                isFavorite={favoriteKeys.includes(favoriteKeyForLog(log))}
                isLogging={pendingLogKey === favoriteKeyForLog(log)}
                isFavoritePending={pendingFavoriteKey === favoriteKeyForLog(log)}
                onLog={() => logAgain(log)}
                onFavorite={() => toggleFavorite(favoriteKeyForLog(log), log.food_name)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FoodChip({
  log,
  isFavorite,
  isLogging,
  isFavoritePending,
  onLog,
  onFavorite,
}: {
  log: FoodLog;
  isFavorite?: boolean;
  isLogging?: boolean;
  isFavoritePending?: boolean;
  onLog: () => void;
  onFavorite: () => void;
}) {
  return (
    <div className="solid-row flex w-full flex-col gap-2 p-2 shadow-soft transition hover:border-primary/40">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold">{log.food_name}</p>
        <button
          type="button"
          onClick={onFavorite}
          disabled={isFavoritePending}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted/60 hover:text-primary disabled:opacity-50"
          aria-label={isFavorite ? "Unfavorite" : "Favorite"}
        >
          <Heart className={`h-3.5 w-3.5 ${isFavorite ? "fill-primary text-primary" : ""}`} />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {Math.round(log.calories)} kcal · {Math.round(log.protein_g)}g P
      </p>
      <Button className="min-h-12 w-full text-xs" onClick={onLog} disabled={isLogging}>
        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
        {isLogging ? "Logging..." : "Log"}
      </Button>
    </div>
  );
}

function displayMealType(type: MealType) {
  return type === "Snack" ? "Snacks" : type;
}

function uniqueLogs(logs: FoodLog[]) {
  const map = new Map<string, FoodLog>();
  logs.forEach((log) => {
    const key = favoriteKeyForLog(log);
    if (!map.has(key)) map.set(key, log);
  });
  return Array.from(map.values());
}

function frequentLogs(logs: FoodLog[]) {
  const map = new Map<string, FoodLog & { usageCount: number }>();
  logs.forEach((log) => {
    const key = favoriteKeyForLog(log);
    const current = map.get(key);
    if (current) current.usageCount += 1;
    else map.set(key, { ...log, usageCount: 1 });
  });
  return Array.from(map.values()).sort((a, b) => b.usageCount - a.usageCount || a.food_name.localeCompare(b.food_name));
}
