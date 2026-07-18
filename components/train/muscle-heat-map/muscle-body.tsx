import Image from "next/image";
import { memo, useId } from "react";
import {
  ADVANCED_MUSCLE_TARGETS,
  sanitizeAdvancedMuscleTargetId,
  type AdvancedMuscleTargetId,
  type AdvancedMuscleView
} from "@/lib/train/muscle-intelligence/advanced-atlas";
import type { AdvancedHeatLevel } from "@/lib/train/muscle-intelligence/advanced-exposure";
import { cn } from "@/lib/utils";
import { ADVANCED_ATLAS_HIT_AREAS, ADVANCED_ATLAS_PATHS } from "./path-data";

export type MuscleBodyPresentation = ReadonlyMap<AdvancedMuscleTargetId, {
  heatLevel: AdvancedHeatLevel;
  interactiveTargetId: string;
  ariaLabel: string;
  interactive: boolean;
}>;

type MuscleBodyProps = {
  view: AdvancedMuscleView;
  viewLabel: string;
  interactive: boolean;
  presentation: MuscleBodyPresentation;
  selectedVisualTargets: ReadonlySet<AdvancedMuscleTargetId>;
  lockedVisualTargets: ReadonlySet<AdvancedMuscleTargetId>;
  alignmentDebug: boolean;
  onHoverTarget: (targetId: string | null) => void;
  onActivateTarget: (targetId: string) => void;
};

const HEAT_FILL: Record<AdvancedHeatLevel, string> = {
  none: "transparent",
  light: "var(--muscle-heat-light)",
  moderate: "var(--muscle-heat-moderate)",
  high: "var(--muscle-heat-high)"
};

function MuscleBodySvg({
  view,
  viewLabel,
  interactive,
  presentation,
  selectedVisualTargets,
  lockedVisualTargets,
  alignmentDebug,
  onHoverTarget,
  onActivateTarget
}: MuscleBodyProps) {
  const instanceId = `muscle-atlas-${useId().replaceAll(":", "")}-${view}`;
  const paths = ADVANCED_ATLAS_PATHS[view];
  const hitAreas = ADVANCED_ATLAS_HIT_AREAS.filter((area) => area.view === view);
  const targets = ADVANCED_MUSCLE_TARGETS.filter((target) => target.supportedViews.includes(view));
  const keyboardOwners = new Map<string, AdvancedMuscleTargetId>();
  for (const target of targets) {
    const targetPresentation = presentation.get(target.id);
    if (targetPresentation?.interactive && !keyboardOwners.has(targetPresentation.interactiveTargetId)) {
      keyboardOwners.set(targetPresentation.interactiveTargetId, target.id);
    }
  }
  return (
    <div
      className={cn(
        "relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-border/70 bg-white shadow-sm dark:border-white/15 dark:shadow-black/30",
        !interactive && "pointer-events-none"
      )}
      style={{
        "--muscle-heat-light": "hsl(205 84% 65% / 0.28)",
        "--muscle-heat-moderate": "hsl(174 72% 40% / 0.48)",
        "--muscle-heat-high": "hsl(38 92% 50% / 0.68)"
      } as React.CSSProperties}
      data-atlas-view={view}
      data-alignment-debug={alignmentDebug || undefined}
    >
      <Image
        src={`/muscle-intelligence/advanced-visible-v1/muscle-anatomy-${view}.webp`}
        alt=""
        fill
        sizes="(max-width: 640px) 92vw, 28rem"
        className="absolute inset-0 h-full w-full select-none object-contain"
        draggable={false}
        loading="eager"
      />
      <svg
        viewBox="0 0 1024 1536"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        aria-label={viewLabel}
      >
        <defs>
          {paths.map((path) => <path key={path.sourcePathId} id={`${instanceId}-${path.sourcePathId}`} d={path.normalizedPathData} />)}
        </defs>

        <g aria-hidden="true" pointerEvents="none">
          {paths.map((path) => (
            <use
              key={`visual-${path.sourcePathId}`}
              href={`#${instanceId}-${path.sourcePathId}`}
              fill={alignmentDebug ? "hsl(280 82% 54% / 0.58)" : HEAT_FILL[presentation.get(path.canonicalId)?.heatLevel ?? "none"]}
              opacity={alignmentDebug || selectedVisualTargets.size === 0 || selectedVisualTargets.has(path.canonicalId) ? 1 : 0.58}
              stroke={alignmentDebug ? "hsl(280 70% 28% / 0.9)" : undefined}
              strokeWidth={alignmentDebug ? 1.5 : undefined}
              vectorEffect={alignmentDebug ? "non-scaling-stroke" : undefined}
            />
          ))}
        </g>

        {interactive ? (
          <g aria-hidden="true">
            {hitAreas.map((area) => {
              const target = presentation.get(area.canonicalId);
              return target?.interactive ? (
                <ellipse
                  key={area.id}
                  id={`${instanceId}-${area.id}`}
                  cx={area.cx}
                  cy={area.cy}
                  rx={area.rx}
                  ry={area.ry}
                  fill="transparent"
                  pointerEvents="all"
                  data-interactive-target-id={target.interactiveTargetId}
                  onPointerEnter={() => onHoverTarget(target.interactiveTargetId)}
                  onPointerLeave={() => onHoverTarget(null)}
                  onClick={() => onActivateTarget(target.interactiveTargetId)}
                />
              ) : null;
            })}
            {paths.map((path) => {
              const target = presentation.get(path.canonicalId);
              return target?.interactive ? (
                <use
                  key={`pointer-${path.sourcePathId}`}
                  href={`#${instanceId}-${path.sourcePathId}`}
                  fill="transparent"
                  pointerEvents="visiblePainted"
                  data-interactive-target-id={target.interactiveTargetId}
                  onPointerEnter={() => onHoverTarget(target.interactiveTargetId)}
                  onPointerLeave={() => onHoverTarget(null)}
                  onClick={() => onActivateTarget(target.interactiveTargetId)}
                />
              ) : null;
            })}
          </g>
        ) : null}

        <g className="text-slate-700" aria-hidden="true" pointerEvents="none">
          {paths.filter((path) => selectedVisualTargets.has(path.canonicalId)).map((path) => (
            <use
              key={`selected-${path.sourcePathId}`}
              href={`#${instanceId}-${path.sourcePathId}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {targets.map((target) => {
          const sanitized = sanitizeAdvancedMuscleTargetId(target.id);
          const targetPresentation = presentation.get(target.id);
          const targetPaths = paths.filter((path) => path.canonicalId === target.id);
          const targetId = targetPresentation?.interactiveTargetId ?? target.id;
          const targetInteractive = interactive && targetPresentation?.interactive === true
            && keyboardOwners.get(targetId) === target.id;
          return (
            <g
              key={target.id}
              id={`${instanceId}-target-${view}-${sanitized}`}
              data-canonical-id={target.id}
              data-view={view}
              className={targetInteractive
                ? "cursor-pointer focus-visible:outline-none focus-visible:[&_use]:stroke-slate-700 focus-visible:[&_use]:[stroke-width:3px] focus-visible:[&_use]:[vector-effect:non-scaling-stroke]"
                : undefined}
              role={targetInteractive ? "button" : undefined}
              tabIndex={targetInteractive ? 0 : undefined}
              aria-label={targetInteractive ? targetPresentation.ariaLabel : undefined}
              aria-pressed={targetInteractive ? lockedVisualTargets.has(target.id) : undefined}
              aria-hidden={targetInteractive ? undefined : true}
              onFocus={targetInteractive ? () => onHoverTarget(targetId) : undefined}
              onBlur={targetInteractive ? () => onHoverTarget(null) : undefined}
              onKeyDown={targetInteractive ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onActivateTarget(targetId);
                }
              } : undefined}
            >
              {(["left", "right", "center"] as const).map((side) => {
                const sidePaths = targetPaths.filter((path) => path.side === side);
                return sidePaths.length ? (
                  <g key={side} id={`${instanceId}-muscle-${view}-${sanitized}-${side}`} data-side={side} aria-hidden="true" pointerEvents="none">
                    {sidePaths.map((path) => <use key={`semantic-${path.sourcePathId}`} href={`#${instanceId}-${path.sourcePathId}`} fill="transparent" />)}
                  </g>
                ) : null;
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const MuscleBody = memo(MuscleBodySvg);
