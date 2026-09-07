import { describe, expect, it } from "vitest";
import { authorizeBreakGlass } from "./break-glass";
import { DEFAULT_FOOD_GOVERNANCE_CAPABILITIES, type FoodGovernancePrincipal } from "./principals";
const owner:FoodGovernancePrincipal={id:"11111111-1111-4111-8111-111111111111",principalType:"human",subjectId:"owner",roleClass:"owner",capabilities:DEFAULT_FOOD_GOVERNANCE_CAPABILITIES.owner};
describe("Plan 6 break glass",()=>{
 it("allows only bounded named recovery commands with operation/reason",()=>{ expect(authorizeBreakGlass({principal:owner,operationId:"22222222-2222-4222-8222-222222222222",commandName:"apply_nutrition_correction",reason:"Emergency label safety correction"}).breakGlass).toBe(true); });
 it("rejects SQL, promotion, unsupported commands, blank reasons and non-owner capability",()=>{ for(const commandName of ["sql","promote_generation","manage_principal"]) expect(()=>authorizeBreakGlass({principal:owner,operationId:"22222222-2222-4222-8222-222222222222",commandName:commandName as never,reason:"x"})).toThrow(/supported|break.glass/i); expect(()=>authorizeBreakGlass({principal:owner,operationId:"22222222-2222-4222-8222-222222222222",commandName:"withdraw_food",reason:" "})).toThrow(/reason/i); expect(()=>authorizeBreakGlass({principal:{...owner,capabilities:["food.correction.review"]},operationId:"22222222-2222-4222-8222-222222222222",commandName:"withdraw_food",reason:"x"})).toThrow(/capability denied/i); });
});
