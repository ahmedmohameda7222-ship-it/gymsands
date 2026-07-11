import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("adaptive onboarding correction regressions", () => {
  it("keeps the approved seven sections, completed_at, and atomic completion RPC", () => {
    const model = source("lib/onboarding/adaptive-profile.ts");
    const service = source("services/database/adaptive-onboarding.ts");
    expect(model).toContain('"Review & Finish"');
    expect(model).toContain("Boolean(onboarding?.completed_at");
    expect(service).toContain('rpc("complete_adaptive_onboarding_v2"');
  });

  it("preserves registration age and temporary manual ChatGPT setup", () => {
    const register = source("app/register/page.tsx");
    const manualSetup = source("components/settings/connected-apps.tsx");
    expect(register).toMatch(/age/i);
    expect(manualSetup).toContain("TemporaryChatGptDeveloperSetupCard");
  });

  it("uses safe source-specific edit links", () => {
    expect(source("app/(private)/profile/page.tsx")).toContain("returnTo=%2Fprofile");
    expect(source("components/settings/profile-summary-card.tsx")).toContain("returnTo=%2Fsettings");
    expect(source("app/(private)/settings/account/page.tsx")).toContain("returnTo=%2Fsettings%2Faccount");
  });

  it("does not broaden MCP task scopes", () => {
    const projections = source("lib/mcp/context-projections.ts");
    expect(projections).toContain('training_planning: { all: [MCP_SCOPES.profileRead, MCP_SCOPES.workoutsRead] }');
    expect(projections).toContain('nutrition_planning: { all: [MCP_SCOPES.profileRead, MCP_SCOPES.nutritionRead] }');
  });
});
