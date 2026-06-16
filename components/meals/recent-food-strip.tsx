"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Heart, Utensils, CheckCircle2, RotateCcw } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getRecentFoodLogs,
  favoriteKeyForLog,
  getFavoriteFoodKeysAsync,
  logFoodFromPreviousLog,
  setFavoriteFoodAsync,
} from "@/services/meals/food-logging-speed";
import { useToast } from "@/components/ui/toaster";
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
    } catch {
      // silent fail
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
  const favorites = useMemo(
    () => uniqueLogs(recentLogs).filter((log) => favoriteKeys.includes(favoriteKeyForLog(log))).slice(0, 8),
    [favoriteKeys, recentLogs]
  );

  const hasAny = uniqueRecents.length > 0 || frequent.length > 0 || favorites.length > 0;
  if (isLoading) return null;
  if (!hasAny) return null;

  async function logAgain(log: FoodLog) {
    if (!user?.id) return;
    try {
      const added = await logFoodFromPreviousLog(user.id, log, logDate, mealType);
      toast({ title: "Logged again", description: `${log.food_name} added to ${displayMealType(mealType)}.` });
      onFoodLogged?.(added);
      setRecentLogs((current) => [added, ...current]);
    } catch (error) {
      toast({ title: "Could not log", description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  async function toggleFavorite(key: string, label: string) {
    if (!user?.id) return;
    try {
      const next = await setFavoriteFoodAsync(user.id, key, !favoriteKeys.includes(key), label);
      setFavoriteKeys(next);
    } catch {
      // silent
    }
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Recent & favorites
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} aria-label="Refresh recent foods">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {favorites.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Favorites</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {favorites.map((log) => (
                <FoodChip
                  key={`fav-${favoriteKeyForLog(log)}`}
                  log={log}
                  isFavorite
                  onLog={() => logAgain(log)}
                  onFavorite={() => toggleFavorite(favoriteKeyForLog(log), log.food_name)}
                />
              ))}
            </div>
          </div>
        )}
        {frequent.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Frequent</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {frequent.map((log) => (
                <FoodChip
                  key={`freq-${favoriteKeyForLog(log)}`}
                  log={log}
                  onLog={() => logAgain(log)}
                  onFavorite={() => toggleFavorite(favoriteKeyForLog(log), log.food_name)}
                />
              ))}
            </div>
          </div>
        )}
        {uniqueRecents.length > 0 && favorites.length === 0 && frequent.length === 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {uniqueRecents.map((log) => (
              <FoodChip
                key={`recent-${favoriteKeyForLog(log)}`}
                log={log}
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
  onLog,
  onFavorite,
}: {
  log: FoodLog;
  isFavorite?: boolean;
  onLog: () => void;
  onFavorite: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1 rounded-lg border bg-card p-2 shadow-soft transition hover:border-primary/40">
      <div className="flex items-center justify-between gap-2">
        <p className="max-w-[140px] truncate text-xs font-semibold">{log.food_name}</p>
        <button
          type="button"
          onClick={onFavorite}
          className="shrink-0 text-muted-foreground transition hover:text-primary"
          aria-label={isFavorite ? "Unfavorite" : "Favorite"}
        >
          <Heart className={`h-3.5 w-3.5 ${isFavorite ? "fill-primary text-primary" : ""}`} />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {Math.round(log.calories)} kcal · {Math.round(log.protein_g)}g P
      </p>
      <Button size="sm" className="h-8 text-xs" onClick={onLog}>
        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
        Log
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
