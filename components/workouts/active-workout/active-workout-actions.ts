export type ActiveWorkoutDetailsSection =
  | "overview"
  | "current-set"
  | "muscle-load"
  | "adjust-today"
  | "assistance";

/**
 * Exercise-level overflow actions are deliberately separate from the exercise
 * name/details affordance and Set Details. The binding Active Workout product
 * contract exposes only these three actions from the exercise-level menu.
 */
export type ActiveWorkoutExerciseActionId =
  | "replace-today"
  | "skip-today"
  | "ask-chatgpt";

export type ActiveWorkoutExerciseAction = {
  id: ActiveWorkoutExerciseActionId;
  label: string;
  visible: boolean;
  disabled: boolean;
  destination: "adjust-today" | "assistance";
};

export type ActiveWorkoutExerciseActionLabels = Readonly<
  Record<ActiveWorkoutExerciseActionId, string>
>;

export type ActiveWorkoutExerciseActionInput = {
  sourceKind: "plan-day" | "direct";
  busy: boolean;
  paused: boolean;
  terminal: boolean;
  aiPermitted: boolean;
  labels: ActiveWorkoutExerciseActionLabels;
};

export function buildActiveWorkoutExerciseActions(
  input: ActiveWorkoutExerciseActionInput
): ActiveWorkoutExerciseAction[] {
  const mutationDisabled = input.busy || input.paused || input.terminal;
  const planDayVisible = input.sourceKind === "plan-day" && !input.terminal;

  return [
    {
      id: "replace-today",
      label: input.labels["replace-today"],
      visible: planDayVisible,
      disabled: mutationDisabled,
      destination: "adjust-today"
    },
    {
      id: "skip-today",
      label: input.labels["skip-today"],
      visible: planDayVisible,
      disabled: mutationDisabled,
      destination: "adjust-today"
    },
    {
      id: "ask-chatgpt",
      label: input.labels["ask-chatgpt"],
      visible: input.aiPermitted && !input.terminal,
      disabled: false,
      destination: "assistance"
    }
  ];
}

/*
 * Legacy AW-6 quick-action projection remains exported temporarily while the
 * execution shell is migrated to the separated authorities above. Keeping the
 * compatibility surface bounded avoids coupling this semantic correction to
 * the mature session engine in a single change.
 */
export type ActiveWorkoutQuickActionId =
  | "previous-set"
  | "set-details"
  | "guide-video"
  | "replace-today"
  | "skip-today"
  | "ask-plaivra";

export type ActiveWorkoutQuickAction = {
  id: ActiveWorkoutQuickActionId;
  label: string;
  visible: boolean;
  disabled: boolean;
  destination: ActiveWorkoutDetailsSection | null;
  intent: "apply-previous-set" | "open-details";
  priority: number;
};

export type ActiveWorkoutQuickActionLabels = Readonly<
  Record<ActiveWorkoutQuickActionId, string>
>;

export type ActiveWorkoutQuickActionInput = {
  sourceKind: "plan-day" | "direct";
  hasGuideOrVideo: boolean;
  busy: boolean;
  paused: boolean;
  activeSetCompleted: boolean;
  terminal: boolean;
  aiPermitted: boolean;
  labels: ActiveWorkoutQuickActionLabels;
};

export function buildActiveWorkoutQuickActions(
  input: ActiveWorkoutQuickActionInput
): ActiveWorkoutQuickAction[] {
  const mutationDisabled = input.busy || input.paused || input.terminal;
  const planDayVisible = input.sourceKind === "plan-day" && !input.terminal;

  return [
    {
      id: "previous-set",
      label: input.labels["previous-set"],
      visible: !input.terminal,
      disabled: mutationDisabled || input.activeSetCompleted,
      destination: null,
      intent: "apply-previous-set",
      priority: 10
    },
    {
      id: "guide-video",
      label: input.labels["guide-video"],
      visible: input.hasGuideOrVideo && !input.terminal,
      disabled: false,
      destination: "overview",
      intent: "open-details",
      priority: 20
    },
    {
      id: "set-details",
      label: input.labels["set-details"],
      visible: !input.terminal,
      disabled: false,
      destination: "current-set",
      intent: "open-details",
      priority: 30
    },
    {
      id: "replace-today",
      label: input.labels["replace-today"],
      visible: planDayVisible,
      disabled: mutationDisabled,
      destination: "adjust-today",
      intent: "open-details",
      priority: 40
    },
    {
      id: "skip-today",
      label: input.labels["skip-today"],
      visible: planDayVisible,
      disabled: mutationDisabled,
      destination: "adjust-today",
      intent: "open-details",
      priority: 50
    },
    {
      id: "ask-plaivra",
      label: input.labels["ask-plaivra"],
      visible: input.aiPermitted && !input.terminal,
      disabled: false,
      destination: "assistance",
      intent: "open-details",
      priority: 60
    }
  ];
}

export function projectActiveWorkoutQuickActions(
  actions: readonly ActiveWorkoutQuickAction[],
  surface: "mobile" | "desktop"
): ActiveWorkoutQuickAction[] {
  const visible = actions
    .filter((action) => action.visible)
    .toSorted((left, right) => left.priority - right.priority);
  if (surface === "desktop") return visible.slice(0, 6);

  const previous = visible.find((action) => action.id === "previous-set");
  const contextual = visible.find((action) => action.id === "guide-video")
    ?? visible.find((action) => action.id === "set-details");
  return [previous, contextual].filter(
    (action): action is ActiveWorkoutQuickAction => Boolean(action)
  );
}
