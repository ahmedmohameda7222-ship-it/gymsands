const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64=/^[0-9a-f]{64}$/;
function req(v:string,label:string){if(!v.trim())throw new Error(`${label} is required.`);return v.trim();}
export function buildGovernanceAuditEvent(input:{operationId:string;principalId:string;principalType:"human"|"service";capability:string;commandName:string;targetFoodId:string|null;oldAuthorityId:string|null;newAuthorityId:string|null;correctionCaseId:string|null;policyVersion:string;reason:string;semanticChecksumSha256:string;breakGlassReason:string|null}){
 for(const [v,l] of [[input.operationId,"Operation"],[input.principalId,"Principal"]] as const) if(!UUID.test(v)) throw new Error(`${l} ID must be a UUID.`);
 for(const v of [input.targetFoodId,input.oldAuthorityId,input.newAuthorityId,input.correctionCaseId]) if(v!==null&&!UUID.test(v)) throw new Error("Audit authority IDs must be UUIDs.");
 if(!HEX64.test(input.semanticChecksumSha256)) throw new Error("Audit semantic checksum must be sha256 hex.");
 const breakGlassReason=input.breakGlassReason?.trim()||null;
 return Object.freeze({...input,capability:req(input.capability,"Audit capability"),commandName:req(input.commandName,"Audit command"),policyVersion:req(input.policyVersion,"Audit policy version"),reason:req(input.reason,"Audit reason"),breakGlass:breakGlassReason!==null,breakGlassReason});
}
