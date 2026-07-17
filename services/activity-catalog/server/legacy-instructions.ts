import type { InstructionStep } from "@/lib/activity-catalog/types";

type IndexedInstructionStep = InstructionStep & { sourceIndex: number };

function plainTextInstruction(value: string): InstructionStep[] {
  return [{ order: 1, text: value }];
}

/**
 * Normalizes both historical plain-text instructions and the JSON arrays stored by
 * the curated Phase 2 seed. Invalid structured entries are ignored. If parsing
 * fails, or an array contains no valid entries, the original trimmed string is
 * preserved as one legacy instruction instead of throwing or losing content.
 */
export function normalizeLegacyInstructions(value: unknown): InstructionStep[] {
  if (typeof value !== "string") return [];
  const original = value.trim();
  if (!original) return [];

  try {
    const parsed: unknown = JSON.parse(original);
    if (!Array.isArray(parsed)) return plainTextInstruction(original);

    const validSteps: IndexedInstructionStep[] = [];
    for (const [sourceIndex, entry] of parsed.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const order = record.order;
      const text = typeof record.text === "string" ? record.text.trim() : "";
      if (!Number.isFinite(order) || !Number.isInteger(order) || (order as number) <= 0 || !text) continue;
      validSteps.push({ order: order as number, text, sourceIndex });
    }

    if (validSteps.length === 0) return plainTextInstruction(original);
    return validSteps
      .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex)
      .map(({ order, text }) => ({ order, text }));
  } catch {
    return plainTextInstruction(original);
  }
}
