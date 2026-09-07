const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type FoodLifecycleCommand="withdraw"|"restore";
export function planFoodLifecycleChange(input:{command:FoodLifecycleCommand;foodId:string;currentLifecycle:string;expectedLifecycle:string;replacementFoodId:string|null;reason:string}){
 if(input.command!=="withdraw"&&input.command!=="restore") throw new Error("Unsupported Food lifecycle command.");
 if(!UUID.test(input.foodId)) throw new Error("Food lifecycle ID must be a UUID.");
 if(input.currentLifecycle!==input.expectedLifecycle) throw new Error("Food lifecycle CAS conflict.");
 if(!input.reason.trim()) throw new Error("Food lifecycle reason is required.");
 if(input.replacementFoodId!==null){ if(!UUID.test(input.replacementFoodId)) throw new Error("Replacement Food ID must be a UUID."); if(input.replacementFoodId.toLowerCase()===input.foodId.toLowerCase()) throw new Error("Replacement Food must be distinct."); }
 if(input.command==="restore"&&input.currentLifecycle!=="withdrawn") throw new Error("Only a withdrawn Food can be restored.");
 if(input.command==="withdraw"&&["merged","withdrawn"].includes(input.currentLifecycle)) throw new Error("Food lifecycle state cannot be withdrawn again.");
 return Object.freeze({command:input.command,foodId:input.foodId.toLowerCase(),previousLifecycle:input.currentLifecycle,nextLifecycle:input.command==="withdraw"?"withdrawn":"active",replacementFoodId:input.replacementFoodId?.toLowerCase()??null,reason:input.reason.trim(),destructiveDelete:false});
}
