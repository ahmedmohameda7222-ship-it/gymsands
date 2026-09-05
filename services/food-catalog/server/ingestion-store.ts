import "server-only";

export type FoodCatalogIngestionCommandResult = Record<string, unknown>;

export interface FoodCatalogIngestionCommandStore {
  prepareExecution(operationId: string, payload: Record<string, unknown>): Promise<FoodCatalogIngestionCommandResult>;
  acquireLease(operationId: string, payload: Record<string, unknown>): Promise<FoodCatalogIngestionCommandResult>;
  heartbeatLease(operationId: string, payload: Record<string, unknown>): Promise<FoodCatalogIngestionCommandResult>;
  persistCandidate(operationId: string, payload: Record<string, unknown>): Promise<FoodCatalogIngestionCommandResult>;
  recordQuarantine(operationId: string, payload: Record<string, unknown>): Promise<FoodCatalogIngestionCommandResult>;
  resolveQuarantine(operationId: string, payload: Record<string, unknown>): Promise<FoodCatalogIngestionCommandResult>;
  recordReconciliation(operationId: string, payload: Record<string, unknown>): Promise<FoodCatalogIngestionCommandResult>;
  recordReleaseDiff(operationId: string, payload: Record<string, unknown>): Promise<FoodCatalogIngestionCommandResult>;
  appendEvent(operationId: string, payload: Record<string, unknown>): Promise<FoodCatalogIngestionCommandResult>;
  completeRun(operationId: string, payload: Record<string, unknown>): Promise<FoodCatalogIngestionCommandResult>;
  failRun(operationId: string, payload: Record<string, unknown>): Promise<FoodCatalogIngestionCommandResult>;
}
