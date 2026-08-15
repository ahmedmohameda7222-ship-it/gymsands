from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# 1) Terminal Personal Records must consume the canonical Personal Records projector,
# never raw workout-derived rows from personal_records.
route = Path("app/api/workouts/active/[sessionId]/personal-records/route.ts")
route.write_text('''import { NextResponse } from "next/server";\n\nimport { env } from "@/lib/env";\nimport { requireUser } from "@/lib/integrations/env";\nimport { rateLimit } from "@/lib/integrations/rate-limit";\nimport { isUuid } from "@/lib/utils";\nimport { readPersonalRecordsMain } from "@/services/personal-records/server";\n\nexport const runtime = "nodejs";\n\nconst headers = {\n  "Cache-Control": "private, no-store, max-age=0",\n  Pragma: "no-cache",\n  Vary: "Authorization"\n};\n\nexport type ActiveWorkoutCanonicalPersonalRecord = {\n  id: string;\n  exerciseName: string;\n  recordType: string;\n  recordValue: number;\n  recordUnit: string;\n  achievedAt: string;\n};\n\nfunction isRenderedQaMockRequest(request: Request) {\n  return env.useMockAuth\n    && env.productionQaBuild\n    && request.headers.get("authorization")?.trim() === "Bearer plaivra-local-qa";\n}\n\nexport async function GET(\n  request: Request,\n  context: { params: Promise<{ sessionId: string }> }\n) {\n  const limited = rateLimit(request, "active-workout-terminal-personal-records", 60, 60_000);\n  if (limited) return limited;\n  const { sessionId } = await context.params;\n  if (!isUuid(sessionId)) {\n    return NextResponse.json({ error: "Workout session is invalid." }, { status: 400, headers });\n  }\n  if (isRenderedQaMockRequest(request)) {\n    return NextResponse.json({ data: [] }, { headers });\n  }\n  const auth = await requireUser(request);\n  if (auth instanceof NextResponse) return auth;\n\n  const root = await auth.supabase\n    .from("workout_sessions")\n    .select("id,status,deleted_at")\n    .eq("id", sessionId)\n    .eq("user_id", auth.user.id)\n    .maybeSingle();\n  if (root.error) {\n    return NextResponse.json({ error: "Personal records are unavailable right now." }, { status: 503, headers });\n  }\n  if (!root.data || root.data.status === "started" || root.data.deleted_at) {\n    return NextResponse.json({ error: "Workout session is not terminal." }, { status: 409, headers });\n  }\n\n  try {\n    const projected = await readPersonalRecordsMain(auth.supabase, auth.user.id, { limit: 50 });\n    const data: ActiveWorkoutCanonicalPersonalRecord[] = projected.groups\n      .flatMap((group) => group.records.map((record) => record.currentBest))\n      .filter((event) => event.source === "verified" && event.sourceWorkoutId === sessionId)\n      .sort((left, right) => right.achievedAt.localeCompare(left.achievedAt) || right.eventId.localeCompare(left.eventId))\n      .slice(0, 50)\n      .map((event) => ({\n        id: event.eventId,\n        exerciseName: event.subject.name,\n        recordType: event.definition.key,\n        recordValue: event.value,\n        recordUnit: event.definition.canonicalUnit,\n        achievedAt: event.achievedAt\n      }));\n    return NextResponse.json({ data }, { headers });\n  } catch {\n    return NextResponse.json({ error: "Personal records are unavailable right now." }, { status: 503, headers });\n  }\n}\n''', encoding="utf-8")

# 2) Previous Performance must never reference a soft-deleted historical session.
replace_once(
    "services/workouts/active-workout/previous-performance-server.ts",
    '.eq("workout_sessions.status", "completed")\n    .not("completed_at", "is", null);',
    '.eq("workout_sessions.status", "completed")\n    .is("workout_sessions.deleted_at", null)\n    .not("completed_at", "is", null);'
)

# 3) Explicit unsupported non-Strength semantics win over Strength compatibility.
replace_once(
    "components/workouts/active-workout/active-workout-execution-capability.ts",
    '''  if (structured.some((key) => strengthMetrics.has(key))) {\n    return { supported: true, contract: "strength_reps_weight_v1", source: "structured" };\n  }\n  if (structured.some((key) => nonStrengthMetrics.has(key))) {\n    return { supported: false, reason: "unsupported_non_strength_contract" };\n  }''',
    '''  // Current live execution supports only the Strength contract. If a frozen\n  // structured prescription carries any explicit non-Strength execution semantic,\n  // fail closed rather than silently discarding part of a mixed contract.\n  if (structured.some((key) => nonStrengthMetrics.has(key))) {\n    return { supported: false, reason: "unsupported_non_strength_contract" };\n  }\n  if (structured.some((key) => strengthMetrics.has(key))) {\n    return { supported: true, contract: "strength_reps_weight_v1", source: "structured" };\n  }'''
)

# 4) The details bridge remains one implementation component, but each trigger now
# gets one focused surface instead of scrolling into a mega-drawer containing every job.
replace_once(
    "components/workouts/active-workout/active-workout-details-bridge.tsx",
    '  const closeBeforeAi = () => onOpenChange(false);',
    '''  const closeBeforeAi = () => onOpenChange(false);\n  const effectiveSection: ActiveWorkoutDetailsSection =\n    requestedSection === "adjust-today" && sourceKind !== "plan-day" ? "overview" : requestedSection;\n  const dialogTitle = effectiveSection === "overview"\n    ? tr("details.exerciseOverview")\n    : effectiveSection === "current-set"\n      ? tr("actions.setDetails")\n      : effectiveSection === "muscle-load"\n        ? tr("details.muscleLoad")\n        : effectiveSection === "adjust-today"\n          ? tr("details.adjustToday")\n          : tr("chatGPT.ask");'''
)
replace_once(
    "components/workouts/active-workout/active-workout-details-bridge.tsx",
    '''      const requested = requestedSection === "adjust-today" && sourceKind !== "plan-day"\n        ? overviewRef.current\n        : sectionRefs[requestedSection].current;''',
    '''      const requested = sectionRefs[effectiveSection].current;'''
)
replace_once(
    "components/workouts/active-workout/active-workout-details-bridge.tsx",
    '  }, [open, requestedFocusTarget, requestedSection, sourceKind]);',
    '  }, [effectiveSection, open, requestedFocusTarget]);'
)
replace_once(
    "components/workouts/active-workout/active-workout-details-bridge.tsx",
    '<DialogTitle>{tr("details.activeWorkoutDetails")}</DialogTitle>',
    '<DialogTitle>{dialogTitle}</DialogTitle>'
)
for marker, section in [
    ("data-aw6-details-overview", "overview"),
    ("data-aw6-details-current-set", "current-set"),
    ("data-aw6-details-muscle-load", "muscle-load"),
    ("data-aw6-details-adjust-today", "adjust-today"),
    ("data-aw6-details-assistance", "assistance"),
]:
    replace_once(
        "components/workouts/active-workout/active-workout-details-bridge.tsx",
        f'''                {marker}\n                aria-labelledby=''',
        f'''                {marker}\n                hidden={{effectiveSection !== "{section}"}}\n                aria-labelledby='''
    )

# 5) Surface the frozen per-set target before Previous Performance without inventing weight.
replace_once(
    "components/workouts/active-workout/active-workout-execution-shell.tsx",
    '  setPositionLabel: string;\n  completedSetsLabel: string;',
    '  setPositionLabel: string;\n  targetLabel?: string;\n  targetValue?: string | null;\n  completedSetsLabel: string;'
)
replace_once(
    "components/workouts/active-workout/active-workout-execution-shell.tsx",
    '  setPositionLabel,\n  completedSetsLabel,',
    '  setPositionLabel,\n  targetLabel,\n  targetValue,\n  completedSetsLabel,'
)
replace_once(
    "components/workouts/active-workout/active-workout-execution-shell.tsx",
    '''            </div>\n\n            {showPreviousPerformance ? (''',
    '''            </div>\n\n            {targetValue ? (\n              <section data-aw10-current-target className="border-b border-border/70 py-4" aria-label={targetLabel}>\n                <p className="text-xs font-semibold text-muted-foreground">{targetLabel}</p>\n                <p className="mt-1 text-sm font-semibold text-foreground"><bdi dir="auto">{targetValue}</bdi></p>\n              </section>\n            ) : null}\n\n            {showPreviousPerformance ? ('''
)

replace_once(
    "components/workouts/active-workout/active-workout-core-session-implementation.tsx",
    'function unsupportedExecutionCopy(locale: string) {',
    '''function executionTargetLabel(locale: string) {\n  if (locale === "de") return "Ziel";\n  if (locale === "ar") return "الهدف";\n  return "Target";\n}\n\nfunction unsupportedExecutionCopy(locale: string) {'''
)
replace_once(
    "components/workouts/active-workout/active-workout-core-session-implementation.tsx",
    '    aiPermitted: true,',
    '''    // Visibility is limited to an authenticated ChatGPT entry point; the\n    // QuickChatGPT provider remains the authoritative per-section read/write\n    // permission gate when the action opens.\n    aiPermitted: Boolean(userId),'''
)
replace_once(
    "components/workouts/active-workout/active-workout-core-session-implementation.tsx",
    '''        setPositionLabel={tr("header.setProgress", { current: formatters.integer(activeSetIndex + 1), total: formatters.integer(activeExercise.sets.length) })}\n        completedSetsLabel=''',
    '''        setPositionLabel={tr("header.setProgress", { current: formatters.integer(activeSetIndex + 1), total: formatters.integer(activeExercise.sets.length) })}\n        targetLabel={executionTargetLabel(language)}\n        targetValue={activeSet.plannedReps ? `${activeSet.plannedReps} ${tr("units.reps")}` : null}\n        completedSetsLabel='''
)

# 6) Completion PR section: pending can be announced; confirmed canonical records can
# be celebrated; empty/unavailable is omitted rather than presented as a fake result.
review_path = Path("components/workouts/active-workout/active-workout-review-bridge.tsx")
review = review_path.read_text(encoding="utf-8")
start_marker = '      <section data-aw10-pr-post-save-only className="border-b border-border/70 py-5" aria-live="polite">'
start = review.index(start_marker)
end = review.index('      </section>', start) + len('      </section>')
replacement = '''      {recordState === "pending" || localizedRecords.length ? (\n        <section data-aw10-pr-post-save-only className="border-b border-border/70 py-5" aria-live="polite">\n          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">\n            <Trophy className="h-4 w-4" aria-hidden="true" />\n            {tr("review.personalRecords")}\n          </h2>\n          {recordState === "pending" ? (\n            <p className="mt-2 text-sm text-muted-foreground" role="status">{tr("common.loading")}</p>\n          ) : (\n            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">\n              {localizedRecords.map((record) => <li key={record.id}>{record.label}</li>)}\n            </ul>\n          )}\n        </section>\n      ) : null}'''
review_path.write_text(review[:start] + replacement + review[end:], encoding="utf-8")

# 7) Strengthen contracts/regressions.
replace_once(
    "components/workouts/active-workout/active-workout-execution-capability.test.ts",
    '''  it("fails closed for explicit non-Strength structured metrics", () => {\n    expect(resolveActiveWorkoutExecutionCapability(prescription({\n      metrics: ["distance_meters", "duration_seconds"]\n    }))).toEqual({ supported: false, reason: "unsupported_non_strength_contract" });\n  });''',
    '''  it("fails closed for explicit non-Strength structured metrics", () => {\n    expect(resolveActiveWorkoutExecutionCapability(prescription({\n      metrics: ["distance_meters", "duration_seconds"]\n    }))).toEqual({ supported: false, reason: "unsupported_non_strength_contract" });\n  });\n\n  it("fails closed for a mixed structured contract instead of discarding non-Strength semantics", () => {\n    expect(resolveActiveWorkoutExecutionCapability(prescription({\n      metrics: ["repetitions", "distance_meters"]\n    }))).toEqual({ supported: false, reason: "unsupported_non_strength_contract" });\n  });'''
)

contract_path = Path("lib/product/active-workout-redesign-contract.test.ts")
contract = contract_path.read_text(encoding="utf-8")
contract = contract.replace(
    '''    expect(previous).not.toContain("exercise_name");\n    expect(previous).toContain(".limit(1)");''',
    '''    expect(previous).not.toContain("exercise_name");\n    expect(previous).toContain('.is("workout_sessions.deleted_at", null)');\n    expect(previous).toContain(".limit(1)");'''
)
contract = contract.replace(
    '''    expect(details).toContain("data-aw10-set-details-exact");\n    expect(details).not.toContain('>{legacyReopenSetLabel}<');''',
    '''    expect(details).toContain("data-aw10-set-details-exact");\n    expect(details).toContain('hidden={effectiveSection !== "overview"}');\n    expect(details).toContain('hidden={effectiveSection !== "current-set"}');\n    expect(details).toContain('hidden={effectiveSection !== "muscle-load"}');\n    expect(shell).toContain("data-aw10-current-target");\n    expect(core).not.toContain("aiPermitted: true");\n    expect(details).not.toContain('>{legacyReopenSetLabel}<');'''
)
old_records = '''    expect(records).toContain('.eq("workout_session_id", sessionId)');\n    expect(records).toContain('.eq("source_kind", "workout_derived")');\n    expect(records).toContain(".limit(50)");'''
new_records = '''    expect(records).toContain("readPersonalRecordsMain");\n    expect(records).toContain('event.source === "verified"');\n    expect(records).toContain("event.sourceWorkoutId === sessionId");\n    expect(records).not.toContain('.from("personal_records")');\n    expect(records).toContain(".slice(0, 50)");'''
if old_records not in contract:
    raise SystemExit("record contract source did not match")
contract = contract.replace(old_records, new_records, 1)
contract_path.write_text(contract, encoding="utf-8")

# Remove the temporary transport from the final branch tree. The running workflow
# has already loaded both files, so deleting them here is safe.
Path("scripts/planner-pr143-correction.py").unlink(missing_ok=True)
Path(".github/workflows/planner-pr143-correction.yml").unlink(missing_ok=True)
