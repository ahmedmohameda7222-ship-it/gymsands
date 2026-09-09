const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function planPersonalOverrideRevision(input:{authenticatedUserId:string;ownerUserId:string;foodId:string;expectedRevisionId:string|null;currentRevisionNumber:number|null;nutritionOverride:Record<string,number|null>|null;servingLabel:string|null;note:string|null;delete:boolean}){
 if(!UUID.test(input.authenticatedUserId)||!UUID.test(input.ownerUserId)||!UUID.test(input.foodId)) throw new Error("Personal override identities must be UUIDs.");
 if(input.authenticatedUserId.toLowerCase()!==input.ownerUserId.toLowerCase()) throw new Error("Personal override owner authority is required.");
 if(input.currentRevisionNumber===null){ if(input.expectedRevisionId!==null) throw new Error("Personal override CAS conflict."); }
 else { if(!Number.isSafeInteger(input.currentRevisionNumber)||input.currentRevisionNumber<1||!input.expectedRevisionId||!UUID.test(input.expectedRevisionId)) throw new Error("Personal override CAS authority is invalid."); }
 const nutrition=input.nutritionOverride===null?null:Object.freeze({...input.nutritionOverride});
 return Object.freeze({ownerUserId:input.ownerUserId.toLowerCase(),foodId:input.foodId.toLowerCase(),expectedRevisionId:input.expectedRevisionId?.toLowerCase()??null,revisionNumber:(input.currentRevisionNumber??0)+1,nutritionOverride:nutrition,servingLabel:input.servingLabel?.trim()||null,note:input.note?.trim()||null,isDeleted:input.delete});
}
