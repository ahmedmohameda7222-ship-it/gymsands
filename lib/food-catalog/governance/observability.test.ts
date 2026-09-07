import { describe, expect, it } from "vitest";
import { summarizeGovernanceMetrics } from "./observability";
describe("Plan 6 governance observability",()=>{
 it("summarizes bounded operational counters without payload/PII leakage",()=>{ const m=summarizeGovernanceMetrics({cases:[{state:"reported",ageDays:8},{state:"applied",ageDays:1},{state:"rejected",ageDays:1}],commandOutcomes:["failed","cas_conflict","replay","authorization_denied"],auditCommands:["resolve_duplicate","withdraw_food","restore_food"],breakGlassExecutions:1,outboxStatuses:["pending","failed","delivered"]}); expect(m).toEqual({openCases:1,agingCases:1,appliedCases:1,rejectedCases:1,failedCommands:1,casConflicts:1,replays:1,authorizationDenials:1,duplicateResolutions:1,withdrawals:1,restores:1,breakGlassExecutions:1,outboxBacklog:1,outboxFailures:1}); expect(JSON.stringify(m)).not.toMatch(/email|token|payload|user/i); });
});
