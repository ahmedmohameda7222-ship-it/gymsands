export type WaterLogIntent = {
  ownerId: string;
  date: string;
  amountMl: number;
  operationId: string;
};

type WaterLogIntentInput = Omit<WaterLogIntent, "operationId">;

export function resolveWaterLogIntent(
  previous: WaterLogIntent | null,
  input: WaterLogIntentInput,
  createOperationId: () => string = () => crypto.randomUUID(),
): WaterLogIntent {
  if (
    previous
    && previous.ownerId === input.ownerId
    && previous.date === input.date
    && previous.amountMl === input.amountMl
  ) {
    return previous;
  }
  return { ...input, operationId: createOperationId() };
}
