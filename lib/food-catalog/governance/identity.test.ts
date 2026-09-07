import { describe, expect, it } from "vitest";
import { planDuplicateResolution } from "./identity";
const A="11111111-1111-4111-8111-111111111111", B="22222222-2222-4222-8222-222222222222";
describe("Plan 6 duplicate identity authority",()=>{
 it("creates non-destructive merge history consumable by Plan 3",()=>{ const p=planDuplicateResolution({sourceFoodId:A,targetFoodId:B,sourceLifecycle:"active",expectedLifecycle:"active",existingMergeTargetId:null,evidenceReference:"case:evidence"}); expect(p).toMatchObject({sourceFoodId:A,targetFoodId:B,nextLifecycle:"merged",plan3RedirectInput:{sourceFoodId:A,targetFoodId:B}}); expect(p).not.toHaveProperty("deleteSource"); });
 it("rejects self merge, prior redirects, and lifecycle CAS conflicts",()=>{ expect(()=>planDuplicateResolution({sourceFoodId:A,targetFoodId:A,sourceLifecycle:"active",expectedLifecycle:"active",existingMergeTargetId:null,evidenceReference:"e"})).toThrow(/distinct/i); expect(()=>planDuplicateResolution({sourceFoodId:A,targetFoodId:B,sourceLifecycle:"active",expectedLifecycle:"draft",existingMergeTargetId:null,evidenceReference:"e"})).toThrow(/cas/i); expect(()=>planDuplicateResolution({sourceFoodId:A,targetFoodId:B,sourceLifecycle:"merged",expectedLifecycle:"merged",existingMergeTargetId:B,evidenceReference:"e"})).toThrow(/already/i); });
});
