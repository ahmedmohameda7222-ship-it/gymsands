const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function planDuplicateResolution(input:{sourceFoodId:string;targetFoodId:string;sourceLifecycle:string;expectedLifecycle:string;existingMergeTargetId:string|null;evidenceReference:string}){
 if(!UUID.test(input.sourceFoodId)||!UUID.test(input.targetFoodId)) throw new Error("Merge Food IDs must be UUIDs.");
 if(input.sourceFoodId.toLowerCase()===input.targetFoodId.toLowerCase()) throw new Error("Duplicate source and target Foods must be distinct.");
 if(input.sourceLifecycle!==input.expectedLifecycle) throw new Error("Duplicate resolution CAS conflict.");
 if(input.existingMergeTargetId!==null||input.sourceLifecycle==="merged") throw new Error("Source Food already has merge authority.");
 if(!input.evidenceReference.trim()) throw new Error("Duplicate evidence reference is required.");
 return Object.freeze({sourceFoodId:input.sourceFoodId.toLowerCase(),targetFoodId:input.targetFoodId.toLowerCase(),nextLifecycle:"merged" as const,evidenceReference:input.evidenceReference.trim(),plan3RedirectInput:Object.freeze({sourceFoodId:input.sourceFoodId.toLowerCase(),targetFoodId:input.targetFoodId.toLowerCase()})});
}
