"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ADVANCED_MUSCLE_TARGETS,
  getAdvancedMuscleTarget,
  isAdvancedMuscleTargetId,
  type AdvancedMuscleTargetId
} from "@/lib/train/muscle-intelligence/advanced-atlas";
import type { AdvancedExposureResult, AdvancedHeatLevel } from "@/lib/train/muscle-intelligence/advanced-exposure";
import {
  isBroadCompatibilityTargetId,
  type BroadCompatibilityResult,
  type BroadCompatibilityTargetId
} from "@/lib/train/muscle-intelligence/compatibility-projection";
import { cn } from "@/lib/utils";
import { BackMuscleBody } from "./back-body";
import { MuscleDetailsPanel, type MuscleHeatMapLabels } from "./details-panel";
import { FrontMuscleBody } from "./front-body";
import type { MuscleBodyPresentation } from "./muscle-body";

export type MuscleHeatMapMode = "interactive" | "compact" | "exercise_preview";
export type MuscleHeatMapView = "front" | "back" | "both";
export type MuscleHeatMapState = "ready" | "loading" | "empty" | "partial" | "unavailable" | "error";
export type MuscleHeatMapTargetId = AdvancedMuscleTargetId | BroadCompatibilityTargetId;

export type MuscleHeatMapProps = {
  mode: MuscleHeatMapMode;
  view: MuscleHeatMapView;
  state: MuscleHeatMapState;
  analysis: AdvancedExposureResult | BroadCompatibilityResult | null;
  selectedTargetId?: MuscleHeatMapTargetId | null;
  onSelectedTargetChange?: (targetId: MuscleHeatMapTargetId | null) => void;
  showLegend?: boolean;
  disclosure?: ReactNode;
  statusDetails?: ReactNode;
  alignmentDebug?: boolean;
  className?: string;
  labels: MuscleHeatMapLabels;
};

type TargetDetail = {
  id: MuscleHeatMapTargetId;
  name: string;
  subtitle: string | null;
  status: string;
  compatibility: boolean;
};

const HEAT_RANK: Record<AdvancedHeatLevel, number> = { none: 0, light: 1, moderate: 2, high: 3 };

function buildPresentation(analysis: MuscleHeatMapProps["analysis"], labels: MuscleHeatMapLabels): {
  presentation: MuscleBodyPresentation;
  details: Map<string, TargetDetail>;
  visualTargets: Map<string, ReadonlySet<AdvancedMuscleTargetId>>;
} {
  const presentation = new Map<AdvancedMuscleTargetId, { heatLevel: AdvancedHeatLevel; interactiveTargetId: string; ariaLabel: string; interactive: boolean }>();
  const details = new Map<string, TargetDetail>();
  const visualTargets = new Map<string, ReadonlySet<AdvancedMuscleTargetId>>();
  for (const target of ADVANCED_MUSCLE_TARGETS) {
    const name = labels.targetName(target.nameKey);
    presentation.set(target.id, {
      heatLevel: "none",
      interactiveTargetId: target.id,
      ariaLabel: `${name}, ${labels.heat.none}`,
      interactive: analysis?.kind === "advanced"
    });
    visualTargets.set(target.id, new Set([target.id]));
  }
  if (!analysis) return { presentation, details, visualTargets };

  if (analysis.kind === "advanced") {
    for (const targetResult of analysis.targets) {
      const target = getAdvancedMuscleTarget(targetResult.targetId);
      const name = labels.targetName(target.nameKey);
      const status = targetResult.previewRole ? labels.previewRole[targetResult.previewRole] : labels.heat[targetResult.heatLevel];
      presentation.set(target.id, {
        heatLevel: targetResult.heatLevel,
        interactiveTargetId: target.id,
        ariaLabel: `${name}, ${status}`,
        interactive: true
      });
      details.set(target.id, {
        id: target.id,
        name,
        subtitle: labels.targetSubtitle(target.subtitleKey),
        status,
        compatibility: false
      });
    }
    return { presentation, details, visualTargets };
  }

  const compatibilityRanks = new Map<AdvancedMuscleTargetId, number>();
  for (const broadTarget of analysis.targets) {
    const name = labels.broadTargetName(broadTarget.broadMuscleId);
    const visualSet = new Set(broadTarget.visualCoverage);
    visualTargets.set(broadTarget.targetId, visualSet);
    details.set(broadTarget.targetId, {
      id: broadTarget.targetId,
      name,
      subtitle: null,
      status: labels.heat[broadTarget.heatLevel],
      compatibility: true
    });
    for (const targetId of broadTarget.visualCoverage) {
      const currentRank = compatibilityRanks.get(targetId) ?? -1;
      if (HEAT_RANK[broadTarget.heatLevel] > currentRank) {
        presentation.set(targetId, {
          heatLevel: broadTarget.heatLevel,
          interactiveTargetId: broadTarget.targetId,
          ariaLabel: `${name}, ${labels.heat[broadTarget.heatLevel]}, ${labels.detailedRegionalMappingUnavailable}`,
          interactive: true
        });
        compatibilityRanks.set(targetId, HEAT_RANK[broadTarget.heatLevel]);
      }
    }
  }
  return { presentation, details, visualTargets };
}

export function MuscleHeatMap({
  mode,
  view,
  state,
  analysis,
  selectedTargetId,
  onSelectedTargetChange,
  showLegend,
  disclosure,
  statusDetails,
  alignmentDebug = false,
  className,
  labels
}: MuscleHeatMapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [internalSelectedTargetId, setInternalSelectedTargetId] = useState<MuscleHeatMapTargetId | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<MuscleHeatMapTargetId | null>(null);
  const lockedTargetId = selectedTargetId === undefined ? internalSelectedTargetId : selectedTargetId;
  const interactive = mode !== "compact" && (state === "ready" || state === "partial") && analysis !== null;
  const renderedAnalysis = state === "ready" || state === "partial" ? analysis : null;
  const alignmentDebugEnabled = process.env.NODE_ENV !== "production" && alignmentDebug;
  const legendVisible = showLegend ?? mode !== "compact";
  const safeData = useMemo(() => {
    try {
      return buildPresentation(renderedAnalysis, labels);
    } catch {
      return buildPresentation(null, labels);
    }
  }, [labels, renderedAnalysis]);

  const activeTargetId = renderedAnalysis ? lockedTargetId ?? hoveredTargetId : null;
  const selectedVisualTargets = activeTargetId
    ? safeData.visualTargets.get(activeTargetId) ?? new Set<AdvancedMuscleTargetId>()
    : new Set<AdvancedMuscleTargetId>();
  const lockedVisualTargets = renderedAnalysis && lockedTargetId
    ? safeData.visualTargets.get(lockedTargetId) ?? new Set<AdvancedMuscleTargetId>()
    : new Set<AdvancedMuscleTargetId>();
  const detail = activeTargetId ? safeData.details.get(activeTargetId) ?? null : null;

  const clearSelection = useCallback(() => {
    setHoveredTargetId(null);
    if (selectedTargetId === undefined) setInternalSelectedTargetId(null);
    onSelectedTargetChange?.(null);
  }, [onSelectedTargetChange, selectedTargetId]);

  const activateTarget = useCallback((targetId: string) => {
    if (!interactive || (!isAdvancedMuscleTargetId(targetId) && !isBroadCompatibilityTargetId(targetId))) return;
    setHoveredTargetId(null);
    const nextTargetId = lockedTargetId === targetId ? null : targetId;
    if (selectedTargetId === undefined) setInternalSelectedTargetId(nextTargetId);
    onSelectedTargetChange?.(nextTargetId);
  }, [interactive, lockedTargetId, onSelectedTargetChange, selectedTargetId]);

  const hoverTarget = useCallback((targetId: string | null) => {
    if (!interactive || lockedTargetId) return;
    if (targetId === null || isAdvancedMuscleTargetId(targetId) || isBroadCompatibilityTargetId(targetId)) {
      setHoveredTargetId(targetId);
    }
  }, [interactive, lockedTargetId]);

  useEffect(() => {
    if (!interactive) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) clearSelection();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [clearSelection, interactive]);

  const stateMessage = state === "loading" ? labels.loading
    : state === "empty" ? labels.empty
      : state === "partial" ? labels.partial
        : state === "unavailable" ? labels.unavailable
          : state === "error" ? labels.error
            : null;
  const bodyProps = {
    interactive,
    presentation: safeData.presentation,
    selectedVisualTargets,
    lockedVisualTargets,
    alignmentDebug: alignmentDebugEnabled,
    onHoverTarget: hoverTarget,
    onActivateTarget: activateTarget
  };

  return (
    <div ref={rootRef} className={cn("space-y-4", className)} data-muscle-heat-map-mode={mode} data-state={state}>
      <div className={cn("grid gap-4", view === "both" && "sm:grid-cols-2")} aria-busy={state === "loading"}>
        {view === "front" || view === "both" ? (
          <div>
            <p className="mb-2 text-center text-sm font-medium text-muted-foreground">{labels.frontView}</p>
            <FrontMuscleBody {...bodyProps} viewLabel={labels.frontView} />
          </div>
        ) : null}
        {view === "back" || view === "both" ? (
          <div>
            <p className="mb-2 text-center text-sm font-medium text-muted-foreground">{labels.backView}</p>
            <BackMuscleBody {...bodyProps} viewLabel={labels.backView} />
          </div>
        ) : null}
      </div>

      {stateMessage ? (
        <div className={cn(
          "rounded-2xl border border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground",
          state === "error" && "border-destructive/40 text-destructive"
        )} role={state === "error" ? "alert" : "status"}>
          <p>{stateMessage}</p>
          {statusDetails ? <div className="mt-2">{statusDetails}</div> : null}
        </div>
      ) : null}

      {mode !== "compact" ? (
        <MuscleDetailsPanel
          name={detail?.name ?? null}
          subtitle={detail?.subtitle ?? null}
          status={detail?.status ?? null}
          compatibility={detail?.compatibility ?? false}
          onClose={clearSelection}
          labels={labels}
        />
      ) : null}

      {disclosure && mode !== "compact" ? <div className="text-xs leading-relaxed text-muted-foreground">{disclosure}</div> : null}

      {legendVisible ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Muscle heat legend">
          {(["none", "light", "moderate", "high"] as const).map((level) => (
            <li key={level} className="flex items-center gap-2">
              <span className={cn(
                "size-2.5 rounded-full border border-border",
                level === "light" && "bg-sky-400",
                level === "moderate" && "bg-teal-500",
                level === "high" && "bg-amber-500"
              )} aria-hidden="true" />
              {labels.heat[level]}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
