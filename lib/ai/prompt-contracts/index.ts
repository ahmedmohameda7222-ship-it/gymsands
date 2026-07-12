import { TRAINING_CONTRACTS } from "@/lib/ai/prompt-contracts/training";
import { NUTRITION_CONTRACTS } from "@/lib/ai/prompt-contracts/nutrition";
import { GROCERY_RECOVERY_CONTRACTS } from "@/lib/ai/prompt-contracts/grocery-recovery";
import { PROGRESS_DAILY_PROFILE_CONTRACTS } from "@/lib/ai/prompt-contracts/progress-daily-profile";
import type { PromptId, QuickPromptDefinition } from "@/lib/ai/quick-prompts";
import type { TaskContract } from "@/lib/ai/prompt-contracts/types";

export const TASK_CONTRACTS = { ...TRAINING_CONTRACTS, ...NUTRITION_CONTRACTS, ...GROCERY_RECOVERY_CONTRACTS, ...PROGRESS_DAILY_PROFILE_CONTRACTS } satisfies Record<PromptId, TaskContract>;
export function getPromptTaskContract(definition: QuickPromptDefinition): TaskContract {
  const contract = TASK_CONTRACTS[definition.id as PromptId];
  if (!contract) throw new Error(`Missing task contract for prompt: ${definition.id}`);
  return contract;
}
export type { PromptContextField, TaskContract } from "@/lib/ai/prompt-contracts/types";
