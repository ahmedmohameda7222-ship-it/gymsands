export type PersonalCorrectionSemanticCommand = {
  foodId: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  fiberG: number | null;
  sugarsG: number | null;
  sodiumMg: number | null;
  servingLabel: string | null;
  note: string | null;
};

export type PersonalCorrectionCas = {
  expectedRevisionId: string | null;
  expectedPointerRevision: number;
};

export type PendingPersonalCorrectionOperation = PersonalCorrectionCas & {
  semanticKey: string;
  operationId: string;
};

function semanticKey(
  command: PersonalCorrectionSemanticCommand,
  cas: PersonalCorrectionCas,
) {
  return JSON.stringify([
    command.foodId,
    command.calories,
    command.proteinG,
    command.carbsG,
    command.fatG,
    command.saturatedFatG,
    command.fiberG,
    command.sugarsG,
    command.sodiumMg,
    command.servingLabel,
    command.note,
    cas.expectedRevisionId,
    cas.expectedPointerRevision,
  ]);
}

export function claimPersonalCorrectionOperation(
  pending: PendingPersonalCorrectionOperation | null,
  command: PersonalCorrectionSemanticCommand,
  cas: PersonalCorrectionCas,
  createOperationId: () => string = () => crypto.randomUUID(),
): PendingPersonalCorrectionOperation {
  const key = semanticKey(command, cas);
  if (pending?.semanticKey === key) return pending;
  return {
    semanticKey: key,
    operationId: createOperationId(),
    expectedRevisionId: cas.expectedRevisionId,
    expectedPointerRevision: cas.expectedPointerRevision,
  };
}

export function clearPersonalCorrectionOperation(
  _pending: PendingPersonalCorrectionOperation | null,
): null {
  return null;
}
