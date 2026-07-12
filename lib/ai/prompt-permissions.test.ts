import { describe, expect, it } from "vitest";
import { evaluatePromptPermission } from "@/lib/ai/prompt-permissions";
import type { AiPermissionConfig } from "@/services/database/ai-permissions";

const config: AiPermissionConfig = { accessMode: "custom", sections: { workouts: { read: true, write: false }, nutrition: { read: false, write: false }, meal_plans: { read: false, write: false }, hydration: { read: false, write: false }, wellness: { read: false, write: false }, progress: { read: false, write: false }, profile: { read: false, write: false }, settings: { read: false, write: false } } };
const base = { userId: "user", config, sections: ["workouts"] as const };
describe("prompt permission states", () => {
  it("keeps loading distinct from missing access", () => { expect(evaluatePromptPermission({ ...base, sections: [...base.sections], loading: true, status: null, capability: "read" })).toEqual({ state: "loading" }); });
  it("keeps load failure distinct from denial", () => { expect(evaluatePromptPermission({ ...base, sections: [...base.sections], loading: false, status: { state: "failed", message: "network" }, capability: "read" })).toEqual({ state: "failed", message: "network" }); });
  it("evaluates read and write after loading", () => { expect(evaluatePromptPermission({ ...base, sections: [...base.sections], loading: false, status: { state: "loaded" }, capability: "read" })).toEqual({ state: "allowed" }); expect(evaluatePromptPermission({ ...base, sections: [...base.sections], loading: false, status: { state: "loaded" }, capability: "write" })).toEqual({ state: "missing", sections: ["workouts"] }); });
  it("keeps signed-out explicit", () => { expect(evaluatePromptPermission({ ...base, userId: null, sections: [...base.sections], loading: false, status: null, capability: "read" })).toEqual({ state: "signed-out" }); });
});
