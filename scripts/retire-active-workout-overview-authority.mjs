import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, value) => fs.writeFileSync(path, value);
function replaceOnce(path, before, after) {
  const source = read(path);
  if (!source.includes(before)) throw new Error(`Missing retirement anchor in ${path}: ${before.slice(0, 140)}`);
  write(path, source.replace(before, after));
}

// The canonical Exercise Detail owns instructions/media/anatomy. Active Workout details now own only focused session surfaces.
{
  const path = "components/workouts/active-workout/active-workout-actions.ts";
  let source = read(path);
  source = source.replace('export type ActiveWorkoutDetailsSection =\n  | "overview"\n  | "current-set"\n', 'export type ActiveWorkoutDetailsSection =\n  | "current-set"\n');
  source = source.replace('  | "guide-video"\n', '');
  source = source.replace('  hasGuideOrVideo: boolean;\n', '');
  const guideStart = source.indexOf('    {\n      id: "guide-video",');
  if (guideStart >= 0) {
    const guideEnd = source.indexOf('    {\n      id: "set-details",', guideStart);
    if (guideEnd < 0) throw new Error("Could not bound guide-video quick action.");
    source = `${source.slice(0, guideStart)}${source.slice(guideEnd)}`;
  }
  source = source.replace(
    '  const contextual = visible.find((action) => action.id === "guide-video")\n    ?? visible.find((action) => action.id === "set-details");',
    '  const contextual = visible.find((action) => action.id === "set-details");',
  );
  source = source.replace(
    ' * Legacy AW-6 quick-action projection remains exported temporarily while the\n * execution shell is migrated to the separated authorities above. Keeping the\n * compatibility surface bounded avoids coupling this semantic correction to\n * the mature session engine in a single change.\n',
    ' * Contextual quick actions remain a bounded projection for Set Details,\n * Previous Performance and exercise/session actions. Exercise-level Detail\n * content is intentionally excluded because canonical Exercise Detail owns it.\n',
  );
  write(path, source);
}

{
  const path = "components/workouts/active-workout/active-workout-details-bridge.tsx";
  let source = read(path);
  source = source.replace('export type ActiveWorkoutDetailsFocusTarget = "guide-video" | null;\n\n', '');
  source = source.replace('  requestedFocusTarget: ActiveWorkoutDetailsFocusTarget;\n', '');
  source = source.replace('  previousPerformance: ActiveWorkoutPreviousPerformance | null;\n', '');
  source = source.replace('  currentInstructions: string;\n  currentGuideUrl: string | null;\n  currentCustomVideoUrl: string | null;\n', '');
  source = source.replace('  onApplyPreviousSet: () => void;\n', '');
  source = source.replace('  requestedFocusTarget,\n', '');
  source = source.replace('  previousPerformance,\n  currentInstructions,\n  currentGuideUrl,\n  currentCustomVideoUrl,\n', '');
  source = source.replace('  onApplyPreviousSet,\n', '');
  source = source.replace('  const overviewRef = useRef<HTMLHeadingElement>(null);\n', '');
  source = source.replace('  const guideGroupRef = useRef<HTMLDivElement>(null);\n', '');
  source = source.replace(
    '  const effectiveSection: ActiveWorkoutDetailsSection =\n    requestedSection === "adjust-today" && sourceKind !== "plan-day" ? "overview" : requestedSection;\n  const dialogTitle = effectiveSection === "overview"\n    ? tr("details.exerciseOverview")\n    : effectiveSection === "current-set"\n      ? tr("actions.setDetails")\n      : effectiveSection === "muscle-load"\n        ? tr("details.muscleLoad")\n        : effectiveSection === "adjust-today"\n          ? tr("details.adjustToday")\n          : tr("chatGPT.ask");\n  const dialogDescription = effectiveSection === "overview"\n    ? activeExercise.exercise.exercise_name\n    : effectiveSection === "current-set"\n      ? tr("set.label", { count: formatters.integer(activeSet.setNumber) })\n      : dialogTitle;',
    '  const effectiveSection: ActiveWorkoutDetailsSection =\n    requestedSection === "adjust-today" && sourceKind !== "plan-day" ? "current-set" : requestedSection;\n  const dialogTitle = effectiveSection === "current-set"\n    ? tr("actions.setDetails")\n    : effectiveSection === "muscle-load"\n      ? tr("details.muscleLoad")\n      : effectiveSection === "adjust-today"\n        ? tr("details.adjustToday")\n        : tr("chatGPT.ask");\n  const dialogDescription = effectiveSection === "current-set"\n    ? tr("set.label", { count: formatters.integer(activeSet.setNumber) })\n    : dialogTitle;',
  );
  source = source.replace(
    '      const sectionRefs: Record<ActiveWorkoutDetailsSection, RefObject<HTMLHeadingElement | null>> = {\n        overview: overviewRef,\n        "current-set": currentSetRef,\n        "muscle-load": muscleLoadRef,\n        "adjust-today": adjustTodayRef,\n        assistance: assistanceRef\n      };\n      const requested = sectionRefs[effectiveSection].current;\n      const focusTarget = requestedFocusTarget === "guide-video"\n        ? guideGroupRef.current\n        : requested;\n      requested?.scrollIntoView({ block: "start" });\n      focusTarget?.focus({ preventScroll: true });',
    '      const sectionRefs: Record<ActiveWorkoutDetailsSection, RefObject<HTMLHeadingElement | null>> = {\n        "current-set": currentSetRef,\n        "muscle-load": muscleLoadRef,\n        "adjust-today": adjustTodayRef,\n        assistance: assistanceRef\n      };\n      const requested = sectionRefs[effectiveSection].current;\n      requested?.scrollIntoView({ block: "start" });\n      requested?.focus({ preventScroll: true });',
  );
  source = source.replace('  }, [effectiveSection, open, requestedFocusTarget]);', '  }, [effectiveSection, open]);');
  const overviewStart = source.indexOf('              <section\n                data-aw6-details-overview');
  if (overviewStart < 0) throw new Error("Active Workout overview section was not found.");
  const currentSetStart = source.indexOf('              <section\n                data-aw6-details-current-set', overviewStart);
  if (currentSetStart < 0) throw new Error("Current Set section boundary was not found.");
  source = `${source.slice(0, overviewStart)}${source.slice(currentSetStart)}`;
  source = source.replace('  ActiveWorkoutExerciseState,\n  ActiveWorkoutPreviousPerformance,\n  ActiveWorkoutSetState\n', '  ActiveWorkoutExerciseState,\n  ActiveWorkoutSetState\n');
  write(path, source);
}

{
  const path = "components/workouts/active-workout/active-workout-core-session-implementation.tsx";
  let source = read(path);
  source = source.replace(
    '  const [detailsRequest, setDetailsRequest] = useState<{\n    section: ActiveWorkoutDetailsSection;\n    focusTarget: "guide-video" | null;\n  }>({ section: "overview", focusTarget: null });',
    '  const [detailsRequest, setDetailsRequest] = useState<{\n    section: ActiveWorkoutDetailsSection;\n  }>({ section: "current-set" });',
  );
  source = source.replace(
    '  const currentGuideUrl = activeExercise?.exercise.exercise_url\n    || (activeExercise?.exercise.notes?.startsWith("http") ? activeExercise.exercise.notes : null);\n  const currentCustomVideoUrl = activeExercise?.exercise.custom_video_url || null;\n  const currentInstructions = activeExercise?.exercise.instructions || "";\n',
    '',
  );
  source = source.replace('    hasGuideOrVideo: Boolean(currentGuideUrl || currentCustomVideoUrl),\n', '');
  source = source.replace('      "guide-video": tr("actions.guideVideo"),\n', '');
  source = source.replace('  const mobileQuickActions = projectActiveWorkoutQuickActions(allQuickActions, "mobile");\n', '');
  source = source.replace(
    '  const openDetails = (\n    section: ActiveWorkoutDetailsSection,\n    trigger: HTMLButtonElement,\n    focusTarget: "guide-video" | null = null\n  ) => {\n    setDetailsTriggerRef.current = trigger;\n    setDetailsRequest({ section, focusTarget });\n    setActionsOpen(true);\n  };',
    '  const openDetails = (section: ActiveWorkoutDetailsSection, trigger: HTMLButtonElement) => {\n    setDetailsTriggerRef.current = trigger;\n    setDetailsRequest({ section });\n    setActionsOpen(true);\n  };',
  );
  source = source.replace(
    '    openDetails(action.destination ?? "overview", trigger, action.id === "guide-video" ? "guide-video" : null);',
    '    openDetails(action.destination ?? "current-set", trigger);',
  );
  source = source.replace('        mobileQuickActions={mobileQuickActions}\n', '');
  source = source.replace('            requestedFocusTarget={detailsRequest.focusTarget}\n', '');
  source = source.replace('            previousPerformance={activePreviousPerformance}\n            currentInstructions={currentInstructions}\n            currentGuideUrl={currentGuideUrl}\n            currentCustomVideoUrl={currentCustomVideoUrl}\n', '');
  source = source.replace('            onApplyPreviousSet={() => applyPreviousSet(activeExerciseIndex, activeSetIndex)}\n', '');
  write(path, source);
}

{
  const path = "components/workouts/active-workout/active-workout-execution-shell.tsx";
  let source = read(path);
  source = source.replace('  mobileQuickActions?: readonly ActiveWorkoutQuickAction[];\n', '');
  write(path, source);
}

{
  const path = "components/workouts/active-workout/active-workout-actions.test.tsx";
  let source = read(path);
  source = source.replace('  "guide-video": "Guide / video",\n', '');
  source = source.replace('    hasGuideOrVideo: true,\n', '');
  source = source.replace(
    'describe("legacy AW-6 contextual quick-action compatibility", () => {\n  it("retains the existing projection until execution-shell migration is complete", () => {\n    const visible = buildActiveWorkoutQuickActions(legacyInput()).filter((action) => action.visible);\n    expect(visible.map((action) => action.id)).toEqual([\n      "previous-set",\n      "guide-video",\n      "set-details",\n      "replace-today",\n      "skip-today",\n      "ask-plaivra"\n    ]);\n  });\n\n  it("keeps mobile compatibility compact", () => {\n    const actions = buildActiveWorkoutQuickActions(legacyInput({ hasGuideOrVideo: false }));\n    expect(projectActiveWorkoutQuickActions(actions, "mobile").map((action) => action.id))\n      .toEqual(["previous-set", "set-details"]);\n  });\n});',
    'describe("bounded Active Workout contextual action projection", () => {\n  it("excludes canonical Exercise Detail content from the in-workout action projection", () => {\n    const visible = buildActiveWorkoutQuickActions(legacyInput()).filter((action) => action.visible);\n    expect(visible.map((action) => action.id)).toEqual([\n      "previous-set",\n      "set-details",\n      "replace-today",\n      "skip-today",\n      "ask-plaivra"\n    ]);\n    expect(visible.map((action) => action.id)).not.toContain("guide-video");\n  });\n\n  it("keeps the mobile projection focused on Previous Performance and Set Details", () => {\n    const actions = buildActiveWorkoutQuickActions(legacyInput());\n    expect(projectActiveWorkoutQuickActions(actions, "mobile").map((action) => action.id))\n      .toEqual(["previous-set", "set-details"]);\n  });\n});',
  );
  write(path, source);
}

{
  const path = "lib/product/active-workout-aw6-details-actions-heatmaps.test.ts";
  let source = read(path);
  source = source.replace(
    '  it("keeps one responsive Details surface with the approved section order", () => {\n    const order = [\n      "data-aw6-details-overview",\n      "data-aw6-details-current-set",\n      "data-aw6-details-muscle-load",\n      "data-aw6-details-adjust-today",\n      "data-aw6-details-assistance"\n    ].map((token) => details.indexOf(token));',
    '  it("keeps one responsive session Details surface without duplicating canonical Exercise Detail", () => {\n    expect(details).not.toContain("data-aw6-details-overview");\n    expect(details).not.toContain("details.exerciseGuideVideo");\n    const order = [\n      "data-aw6-details-current-set",\n      "data-aw6-details-muscle-load",\n      "data-aw6-details-adjust-today",\n      "data-aw6-details-assistance"\n    ].map((token) => details.indexOf(token));',
  );
  source = source.replace(
    '    expect(core).toContain("setDetailsTriggerRef.current = trigger");\n    expect(core).toContain(\'openDetails("overview", trigger)\');\n    expect(core).toContain(\'action.destination ?? "overview"\');',
    '    expect(core).toContain("setDetailsTriggerRef.current = trigger");\n    expect(core).toContain("openCanonicalExerciseDetail");\n    expect(core).toContain("activeWorkoutExerciseDetailHref");\n    expect(core).toContain(\'action.destination ?? "current-set"\');',
  );
  source = source.replace(
    '    expect(core).toContain(\'openDetails("muscle-load", trigger)\');\n    expect(core).toContain(\'openDetails("overview", trigger)\');\n    expect(core).toContain(\'action.destination ?? "overview"\');\n    expect(core).toContain(\'action.id === "guide-video" ? "guide-video" : null\');',
    '    expect(core).toContain(\'openDetails("muscle-load", trigger)\');\n    expect(core).toContain(\'action.destination ?? "current-set"\');\n    expect(core).not.toContain(\'openDetails("overview", trigger)\');\n    expect(core).not.toContain(\'"guide-video"\');',
  );
  source = source.replace(
    '      for (const key of [\n        "activeWorkoutDetails",\n        "exerciseOverview",\n        "currentSet",',
    '      for (const key of [\n        "activeWorkoutDetails",\n        "currentSet",',
  );
  source = source.replace('      for (const key of ["guideVideo", "skipToday", "chooseReplacement"]) {', '      for (const key of ["skipToday", "chooseReplacement"]) {');
  write(path, source);
}

console.log("Retired duplicate Active Workout overview/guide authority in favor of canonical Exercise Detail.");
