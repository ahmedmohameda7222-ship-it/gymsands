type Case={state:"reported"|"under_review"|"approved"|"applied"|"rejected";ageDays:number};
type Outcome="failed"|"cas_conflict"|"replay"|"authorization_denied";
export function summarizeGovernanceMetrics(input:{cases:readonly Case[];commandOutcomes:readonly Outcome[];auditCommands:readonly string[];breakGlassExecutions:number;outboxStatuses:readonly ("pending"|"processing"|"failed"|"delivered")[]}){
 const open=input.cases.filter(c=>["reported","under_review","approved"].includes(c.state));
 const count=(items:readonly string[],value:string)=>items.filter(x=>x===value).length;
 return Object.freeze({openCases:open.length,agingCases:open.filter(c=>c.ageDays>=7).length,appliedCases:input.cases.filter(c=>c.state==="applied").length,rejectedCases:input.cases.filter(c=>c.state==="rejected").length,failedCommands:count(input.commandOutcomes,"failed"),casConflicts:count(input.commandOutcomes,"cas_conflict"),replays:count(input.commandOutcomes,"replay"),authorizationDenials:count(input.commandOutcomes,"authorization_denied"),duplicateResolutions:count(input.auditCommands,"resolve_duplicate"),withdrawals:count(input.auditCommands,"withdraw_food"),restores:count(input.auditCommands,"restore_food"),breakGlassExecutions:input.breakGlassExecutions,outboxBacklog:input.outboxStatuses.filter(s=>s==="pending"||s==="processing").length,outboxFailures:count(input.outboxStatuses,"failed")});
}
