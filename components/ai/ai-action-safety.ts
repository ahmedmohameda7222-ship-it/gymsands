import type { AiActionType, UserSafetyProfile } from "@/types";

export type AiActionSafetyDecision = {
  decision: "allow" | "warn" | "block";
  message?: string;
};

const redBlockedActions = new Set<AiActionType>([
  "adjust_next_workout",
  "explain_progression",
  "make_meal_higher_protein"
]);

const redSaferActions = new Set<AiActionType>([
  "reduce_workout_volume",
  "reduce_workout_intensity",
  "recovery_workout",
  "review_week",
  "review_workout_session"
]);

export function getAiActionSafetyDecision(
  actionType: AiActionType,
  safetyProfile: Pick<UserSafetyProfile, "risk_level" | "eating_disorder_risk_acknowledged"> | null
): AiActionSafetyDecision {
  if (!safetyProfile || safetyProfile.risk_level === "green") return { decision: "allow" };

  if (safetyProfile.eating_disorder_risk_acknowledged && actionType === "make_meal_higher_protein") {
    return {
      decision: "block",
      message: "Plaivra will not prepare this nutrition-change request while your profile is marked high caution. Please discuss eating-disorder or clinical nutrition concerns with a qualified professional."
    };
  }

  if (safetyProfile.risk_level === "red" && redBlockedActions.has(actionType)) {
    return {
      decision: "block",
      message: "Because your safety profile is marked high caution, Plaivra will not prepare this request. For pain, pregnancy or postpartum concerns, medication questions, eating-disorder concerns, or other medical needs, consult a qualified professional."
    };
  }

  if (safetyProfile.risk_level === "red" && redSaferActions.has(actionType)) {
    return {
      decision: "warn",
      message: "Your profile is marked high caution. Keep this request recovery-focused, stop if pain is sharp, unusual, or worsening, and seek qualified help for medical concerns."
    };
  }

  return {
    decision: "warn",
    message: safetyProfile.risk_level === "red"
      ? "Your profile is marked high caution. Review ChatGPT’s answer carefully and do not train through pain or use it as medical advice."
      : "Your profile asks for extra caution. Review the recommendation carefully and seek qualified help for medical concerns."
  };
}
