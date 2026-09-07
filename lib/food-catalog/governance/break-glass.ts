import { assertFoodGovernanceCapability,type FoodGovernancePrincipal } from "./principals";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const FOOD_BREAK_GLASS_COMMANDS=["apply_nutrition_correction","apply_serving_correction","withdraw_food","restore_food"] as const;
export type FoodBreakGlassCommand=(typeof FOOD_BREAK_GLASS_COMMANDS)[number];
export function authorizeBreakGlass(input:{principal:FoodGovernancePrincipal;operationId:string;commandName:FoodBreakGlassCommand;reason:string}){
 assertFoodGovernanceCapability(input.principal,"food.break_glass");
 if(!UUID.test(input.operationId)) throw new Error("Break-glass operation ID must be a UUID.");
 if(!FOOD_BREAK_GLASS_COMMANDS.includes(input.commandName)) throw new Error("Break-glass is limited to supported named recovery commands.");
 if(!input.reason.trim()) throw new Error("Break-glass reason is required.");
 return Object.freeze({breakGlass:true as const,operationId:input.operationId.toLowerCase(),commandName:input.commandName,reason:input.reason.trim(),principalId:input.principal.id.toLowerCase()});
}
