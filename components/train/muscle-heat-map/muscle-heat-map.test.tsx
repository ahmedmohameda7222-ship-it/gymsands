// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text -- the test replaces next/image with a DOM-observable image */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateMuscleLoad } from "@/lib/train/muscle-intelligence/calculate-muscle-load";
import { calculateAdvancedExposure, type AdvancedMuscleMappingReference } from "@/lib/train/muscle-intelligence/advanced-exposure";
import {
  BROAD_COMPATIBILITY_COVERAGE,
  projectBroadMuscleCompatibility,
  type BroadCompatibilityResult
} from "@/lib/train/muscle-intelligence/compatibility-projection";
import { MuscleHeatMap } from "./muscle-heat-map";
import type { MuscleHeatMapLabels } from "./details-panel";

vi.mock("next/image", () => ({ default: ({ fill: _fill, priority: _priority, ...props }: Record<string, unknown>) => <img {...props} /> }));

const labels: MuscleHeatMapLabels = {
  frontView: "Front", backView: "Back", loading: "Loading", empty: "No activity", partial: "Some detail is unavailable",
  unavailable: "Unavailable", error: "Could not show muscle detail", noSelection: "Select a muscle",
  close: "Close",
  detailedRegionalMappingUnavailable: "Detailed regional mapping is unavailable",
  additionalBroadMappedContributionIncluded: "Additional broad-mapped contribution included; detailed regional data is unavailable",
  heat: { none: "None", light: "Light", moderate: "Moderate", high: "High" },
  previewRole: { primary: "Primary", co_primary: "Co-primary", secondary: "Secondary", stabilizer: "Stabilizer", none: "None" },
  targetName: (key) => key.split(".").slice(-2, -1)[0] ?? key,
  targetSubtitle: () => null,
  broadTargetName: (id) => `General ${id}`
};

const mapping: AdvancedMuscleMappingReference = {
  mappingSetId: "map", targetId: "exercise", targetType: "global_exercise", mappingVersion: 2,
  schemaVersion: "exercise_muscle_mapping_v2", checksum: "a".repeat(64),
  entries: [{ muscleId: "pectoralis.upper", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 }]
};
const analysis = calculateAdvancedExposure({ scope: "single_session", items: [{ itemId: "item", mapping, qualifyingSets: 5 }] });
const broadAnalysis = projectBroadMuscleCompatibility(calculateMuscleLoad({
  mode: "planned",
  period: { kind: "session" },
  items: [{
    itemId: "broad-item",
    mapping: {
      mappingSetId: "broad-map", targetId: "broad-exercise", targetType: "global_exercise", mappingVersion: 1,
      schemaVersion: "exercise_muscle_mapping_v1", checksum: "b".repeat(64),
      entries: [{ muscleId: "pectoralis_major", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 }]
    },
    workload: { model: "resistance_sets_v1", qualifyingSets: 6 }
  }]
}));

function compatibilityWith(
  targets: Array<{ broadMuscleId: "pectoralis_major" | "quadriceps"; heatLevel: "none" | "light" | "moderate" | "high" }>
): BroadCompatibilityResult {
  return {
    kind: "broad_compatibility",
    sourceSchemaVersion: broadAnalysis.sourceSchemaVersion,
    detailMessageKey: broadAnalysis.detailMessageKey,
    targets: targets.map(({ broadMuscleId, heatLevel }) => ({
      targetId: `broad:${broadMuscleId}`,
      broadMuscleId,
      heatLevel,
      visualCoverage: BROAD_COMPATIBILITY_COVERAGE[broadMuscleId],
      detailAvailability: "broad_only"
    }))
  };
}

function advancedWith(
  levels: Partial<Record<(typeof analysis.targets)[number]["targetId"], "none" | "light" | "moderate" | "high">>,
  compatibility?: BroadCompatibilityResult
) {
  return {
    ...analysis,
    targets: analysis.targets.map((result) => ({ ...result, heatLevel: levels[result.targetId] ?? "none" })),
    ...(compatibility ? { compatibility } : {})
  };
}

async function render(props: Partial<Parameters<typeof MuscleHeatMap>[0]> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onSelectedTargetChange = vi.fn();
  await act(async () => {
    root.render(<MuscleHeatMap mode="interactive" view="both" state="ready" analysis={analysis}
      labels={labels} onSelectedTargetChange={onSelectedTargetChange} {...props} />);
  });
  return { container, root, onSelectedTargetChange };
}

function target(container: HTMLElement, view: "front" | "back", targetId: string) {
  return container.querySelector<SVGGElement>(`[data-view="${view}"][data-canonical-id="${targetId}"]`)!;
}

function pointerTarget(container: HTMLElement, targetId: string) {
  return container.querySelector<SVGElement>(`[data-interactive-target-id="${targetId}"]`)!;
}

describe("MuscleHeatMap", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => { document.body.replaceChildren(); });

  it("renders the exact normalized dual-view semantic structure without raw segmentation colors", async () => {
    const runtime = await render();
    expect(runtime.container.querySelectorAll('svg[viewBox="0 0 1024 1536"]')).toHaveLength(2);
    expect(runtime.container.querySelectorAll('g[role="button"]')).toHaveLength(58);
    expect(runtime.container.querySelector('[id$="-target-front-pectoralis-upper"]')).not.toBeNull();
    expect(runtime.container.querySelector('[id$="-muscle-front-pectoralis-upper-left"]')).not.toBeNull();
    const ids = [...runtime.container.querySelectorAll<SVGElement>("svg [id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(runtime.container.innerHTML).not.toMatch(/rgb\(|mix-blend|object-cover/);
    await act(async () => runtime.root.unmount());
  });

  it("supports one keyboard target per target-view and Escape clearing", async () => {
    const runtime = await render();
    const frontTarget = target(runtime.container, "front", "trapezius.upper");
    const backTarget = target(runtime.container, "back", "trapezius.upper");
    await act(async () => frontTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(frontTarget.getAttribute("aria-pressed")).toBe("true");
    expect(backTarget.getAttribute("aria-pressed")).toBe("true");
    expect(runtime.container.querySelectorAll('g[aria-hidden="true"].text-slate-700 use[fill="none"]')).not.toHaveLength(0);
    expect(runtime.container.querySelectorAll('g[aria-hidden="true"] use[fill^="var(--muscle-heat"]')).not.toHaveLength(0);
    expect(runtime.container.querySelectorAll('g[aria-hidden="true"] use[opacity="0.58"]')).not.toHaveLength(0);
    expect(runtime.onSelectedTargetChange).toHaveBeenCalledWith("trapezius.upper");
    await act(async () => frontTarget.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(frontTarget.getAttribute("aria-pressed")).toBe("false");
    await act(async () => frontTarget.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(frontTarget.getAttribute("aria-pressed")).toBe("true");
    expect(runtime.onSelectedTargetChange).toHaveBeenCalledWith("trapezius.upper");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(frontTarget.getAttribute("aria-pressed")).toBe("false");
    expect(runtime.onSelectedTargetChange).toHaveBeenLastCalledWith(null);
    await act(async () => runtime.root.unmount());
  });

  it("previews on hover, locks on click, ignores hover while locked, and clears on repeat or outside input", async () => {
    const runtime = await render();
    const pectoralisPointer = pointerTarget(runtime.container, "pectoralis.upper");
    const serratusPointer = pointerTarget(runtime.container, "serratus.anterior");
    const pectoralisTarget = target(runtime.container, "front", "pectoralis.upper");

    await act(async () => pectoralisPointer.dispatchEvent(new Event("pointerover", { bubbles: true })));
    expect(runtime.container.textContent).toContain("upper");
    expect(pectoralisTarget.getAttribute("aria-pressed")).toBe("false");

    await act(async () => pectoralisPointer.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(pectoralisTarget.getAttribute("aria-pressed")).toBe("true");
    await act(async () => serratusPointer.dispatchEvent(new Event("pointerover", { bubbles: true })));
    expect(runtime.container.textContent).toContain("upper");

    await act(async () => pectoralisPointer.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(pectoralisTarget.getAttribute("aria-pressed")).toBe("false");
    await act(async () => pectoralisPointer.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => runtime.container.querySelector<HTMLButtonElement>("button")!.click());
    expect(pectoralisTarget.getAttribute("aria-pressed")).toBe("false");
    await act(async () => pectoralisPointer.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(pectoralisTarget.getAttribute("aria-pressed")).toBe("false");
    await act(async () => runtime.root.unmount());
  });

  it("keeps broad compatibility interaction parent-only without repeated leaf tab stops", async () => {
    const runtime = await render({ view: "front", analysis: broadAnalysis });
    const broadButtons = runtime.container.querySelectorAll<SVGGElement>('[role="button"][aria-label^="General pectoralis_major,"]');
    expect(broadButtons).toHaveLength(1);
    expect(runtime.container.querySelector('[role="button"][aria-label^="upper,"]')).toBeNull();
    expect(runtime.container.querySelectorAll('[data-interactive-target-id="broad:pectoralis_major"]')).not.toHaveLength(0);
    await act(async () => pointerTarget(runtime.container, "broad:pectoralis_major").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(broadButtons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(runtime.container.textContent).toContain("Detailed regional mapping is unavailable");
    await act(async () => runtime.root.unmount());
  });

  it("keeps disjoint advanced and broad ownership independently selectable", async () => {
    const mixed = advancedWith(
      { "pectoralis.upper": "moderate" },
      compatibilityWith([{ broadMuscleId: "quadriceps", heatLevel: "high" }])
    );
    const runtime = await render({ analysis: mixed });
    expect(target(runtime.container, "front", "pectoralis.upper").getAttribute("role")).toBe("button");
    expect(target(runtime.container, "front", "pectoralis.upper").dataset.heatLevel).toBe("moderate");
    expect(runtime.container.querySelectorAll('[role="button"][aria-label^="General quadriceps,"]')).toHaveLength(1);
    expect(runtime.container.querySelector('[data-interactive-target-id="broad:quadriceps"]')).not.toBeNull();
    await act(async () => pointerTarget(runtime.container, "pectoralis.upper").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(runtime.container.querySelector('[aria-live="polite"]')?.textContent).not.toContain("Additional broad-mapped");
    await act(async () => runtime.root.unmount());
  });

  it("uses qualitative max heat while precise non-none ownership and details remain primary", async () => {
    const mixed = advancedWith(
      { "pectoralis.upper": "moderate" },
      compatibilityWith([{ broadMuscleId: "pectoralis_major", heatLevel: "high" }])
    );
    const runtime = await render({ view: "front", analysis: mixed });
    const precise = target(runtime.container, "front", "pectoralis.upper");
    expect(precise.dataset.heatLevel).toBe("high");
    expect(precise.getAttribute("role")).toBe("button");
    expect(precise.getAttribute("aria-label")).toContain("Additional broad-mapped contribution included");
    expect(runtime.container.querySelectorAll('[role="button"][aria-label^="General pectoralis_major,"]')).toHaveLength(1);
    expect(pointerTarget(runtime.container, "pectoralis.upper").dataset.interactiveTargetId).toBe("pectoralis.upper");

    await act(async () => pointerTarget(runtime.container, "pectoralis.upper").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const details = runtime.container.querySelector('[aria-live="polite"]')?.textContent ?? "";
    expect(details).toContain("Moderate");
    expect(details).toContain("Additional broad-mapped contribution included; detailed regional data is unavailable");
    expect(details).not.toMatch(/raw|score|\d+(?:\.\d+)?/i);
    await act(async () => runtime.root.unmount());
  });

  it("gives broad mapping ownership only where precise heat is none", async () => {
    const mixed = advancedWith(
      {},
      compatibilityWith([
        { broadMuscleId: "pectoralis_major", heatLevel: "none" },
        { broadMuscleId: "quadriceps", heatLevel: "high" }
      ])
    );
    const runtime = await render({ view: "front", analysis: mixed });
    expect(target(runtime.container, "front", "pectoralis.upper").dataset.heatLevel).toBe("none");
    expect(runtime.container.querySelector('[data-interactive-target-id="broad:pectoralis_major"]')).toBeNull();
    expect(target(runtime.container, "front", "quadriceps.rectus_femoris").dataset.heatLevel).toBe("high");
    expect(pointerTarget(runtime.container, "broad:quadriceps")).not.toBeNull();
    await act(async () => runtime.root.unmount());
  });

  it("preserves precise high heat when an overlapping broad contribution is light", async () => {
    const mixed = advancedWith(
      { "pectoralis.upper": "high" },
      compatibilityWith([{ broadMuscleId: "pectoralis_major", heatLevel: "light" }])
    );
    const runtime = await render({ view: "front", analysis: mixed });
    const precise = target(runtime.container, "front", "pectoralis.upper");
    expect(precise.dataset.heatLevel).toBe("high");
    expect(precise.getAttribute("aria-label")).toContain("Additional broad-mapped contribution included");
    expect(pointerTarget(runtime.container, "pectoralis.upper")).not.toBeNull();
    await act(async () => runtime.root.unmount());
  });

  it("makes compact mode non-interactive and handles explicit states without throwing", async () => {
    const compact = await render({ mode: "compact", view: "front", state: "loading", analysis: null });
    expect(compact.container.querySelectorAll('g[role="button"]')).toHaveLength(0);
    expect(compact.container.textContent).toContain("Loading");
    expect(compact.container.textContent).not.toContain("Select a muscle");
    expect(compact.container.querySelector('[role="status"]')?.getAttribute("class")).not.toMatch(/animate|transition/);
    expect(compact.container.querySelector('[aria-label="Muscle heat legend"]')).toBeNull();
    await act(async () => compact.root.unmount());

    const unavailable = await render({ mode: "interactive", view: "front", state: "unavailable", analysis });
    expect(unavailable.container.querySelector('use[fill^="var(--muscle-heat"]')).toBeNull();
    expect(unavailable.container.querySelectorAll('g[role="button"]')).toHaveLength(0);
    await act(async () => unavailable.root.unmount());
  });

  it("exposes parent-owned disclosure and status detail slots plus development-only alignment metadata", async () => {
    const runtime = await render({
      state: "partial",
      statusDetails: <span>One excluded item</span>,
      disclosure: <p>Estimated training exposure only</p>,
      alignmentDebug: true
    });
    expect(runtime.container.textContent).toContain("One excluded item");
    expect(runtime.container.textContent).toContain("Estimated training exposure only");
    expect(runtime.container.querySelectorAll('[data-alignment-debug="true"]')).toHaveLength(2);
    expect(runtime.container.querySelector('[data-alignment-debug="true"] use[stroke]')).not.toBeNull();
    await act(async () => runtime.root.unmount());
  });
});
