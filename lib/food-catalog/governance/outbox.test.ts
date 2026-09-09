import { describe, expect, it } from "vitest";
import { buildGovernanceOutboxEvent, transitionOutboxDelivery } from "./outbox";
describe("Plan 6 transactional outbox",()=>{
 it("uses deterministic event identity tied to the operation",()=>{ const e=buildGovernanceOutboxEvent({operationId:"11111111-1111-4111-8111-111111111111",eventType:"food.correction.applied",payload:{foodId:"x"}}); expect(e.eventId).toBe("11111111-1111-4111-8111-111111111111"); expect(e.status).toBe("pending"); });
 it("supports retryable delivery while delivered is terminal",()=>{ expect(transitionOutboxDelivery({status:"pending",attemptCount:0},"processing")).toEqual({status:"processing",attemptCount:1}); expect(transitionOutboxDelivery({status:"processing",attemptCount:1},"failed")).toEqual({status:"failed",attemptCount:1}); expect(transitionOutboxDelivery({status:"failed",attemptCount:1},"processing")).toEqual({status:"processing",attemptCount:2}); expect(()=>transitionOutboxDelivery({status:"delivered",attemptCount:2},"processing")).toThrow(/terminal/i); });
});
