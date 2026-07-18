export type SessionAnalysisReasonCode =
  | "snapshot_not_found"
  | "session_not_terminal"
  | "unsupported_snapshot_version"
  | "snapshot_mapping_drift"
  | "snapshot_read_failed";

export class SessionMuscleAnalysisError extends Error {
  constructor(public readonly code: SessionAnalysisReasonCode, message: string, public readonly status: number) {
    super(message);
    this.name = "SessionMuscleAnalysisError";
  }
}
