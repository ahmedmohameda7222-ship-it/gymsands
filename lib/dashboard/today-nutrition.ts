import type { FoodLog } from "@/types";
import type { ActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { SavedTargets } from "@/services/nutrition/targets";

export type TodayNutritionSourceState = "loading" | "loaded" | "failed";

export type TodayNutritionTargetData = {
  targets: SavedTargets | null;
  activeTarget: ActiveNutritionTarget | null;
};

export type TodayNutritionData = TodayNutritionTargetData & {
  logs: FoodLog[] | null;
  logsState: TodayNutritionSourceState;
  targetsState: TodayNutritionSourceState;
  logsError: string | null;
  targetsError: string | null;
  totalsIncomplete: boolean;
};

export const initialTodayNutritionData: TodayNutritionData = {
  logs: null,
  targets: null,
  activeTarget: null,
  logsState: "loading",
  targetsState: "loading",
  logsError: null,
  targetsError: null,
  totalsIncomplete: false
};

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

export function resolveTodayNutritionSources(
  logsResult: PromiseSettledResult<FoodLog[]>,
  targetsResult: PromiseSettledResult<TodayNutritionTargetData>
): TodayNutritionData {
  return {
    logs: logsResult.status === "fulfilled" ? logsResult.value : null,
    targets: targetsResult.status === "fulfilled" ? targetsResult.value.targets : null,
    activeTarget: targetsResult.status === "fulfilled" ? targetsResult.value.activeTarget : null,
    logsState: logsResult.status === "fulfilled" ? "loaded" : "failed",
    targetsState: targetsResult.status === "fulfilled" ? "loaded" : "failed",
    logsError: logsResult.status === "rejected" ? errorMessage(logsResult.reason, "Food logs could not load.") : null,
    targetsError: targetsResult.status === "rejected" ? errorMessage(targetsResult.reason, "Nutrition targets could not load.") : null,
    totalsIncomplete: false
  };
}

export function knownFoodLogCount(data: Pick<TodayNutritionData, "logs" | "logsState">) {
  return data.logsState === "loaded" && data.logs ? data.logs.length : null;
}

export function upsertFoodLogById(logs: FoodLog[], incoming: FoodLog) {
  return [incoming, ...logs.filter((item) => item.id !== incoming.id)];
}
