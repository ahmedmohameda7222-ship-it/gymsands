import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const dormantModule = "@/lib/activity-catalog/v2-contract";
const v1CompatibilityFiles = [
  "services/activity-catalog/server/selector.ts",
  "services/activity-catalog/server/http-provider.ts",
  "services/activity-catalog/server/legacy-provider.ts",
  "services/activity-catalog/server/provider.ts"
];

describe("P10A-A3 dormant V2 boundary under P10F", () => {
  it("does not repurpose the dormant P10A-A3 contract as the live P10F provider model", () => {
    for (const relative of v1CompatibilityFiles) {
      const source = fs.readFileSync(path.join(root, relative), "utf8");
      expect(source).not.toContain(dormantModule);
      expect(source).not.toContain("catalog-v2-activity.fixture.json");
      expect(source).not.toContain("MAIN_ACTIVITY_CATALOG_V2_CAPABILITY");
    }
    const nativeProvider = fs.readFileSync(path.join(root, "services/activity-catalog/server/library-provider.ts"), "utf8");
    expect(nativeProvider).not.toContain(dormantModule);
  });

  it("preserves legacy as the old selector default while P10F adds explicit Library modes separately", () => {
    const selector = fs.readFileSync(path.join(root, "services/activity-catalog/server/selector.ts"), "utf8");
    const librarySelector = fs.readFileSync(path.join(root, "services/activity-catalog/server/library-selector.ts"), "utf8");
    expect(selector).toContain('if (!value || value === "legacy") return "legacy";');
    expect(selector).toContain('mode === "library_v2" || mode === "library_v2_with_legacy_fallback"');
    expect(librarySelector).toContain('mode !== "library_v2" && mode !== "library_v2_with_legacy_fallback"');
    expect(librarySelector).toContain('mode === "library_v2" ? external');
  });

  it("keeps the original dormant contract itself environment- and database-free", () => {
    const contractSource = fs.readFileSync(path.join(root, "lib/activity-catalog/v2-contract.ts"), "utf8");
    expect(contractSource).not.toContain("process.env");
    expect(contractSource).not.toContain("PLAIVRA_ACTIVITY_CATALOG_MODE");
    expect(contractSource).not.toContain("createClient(");
    const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql"));
    expect(migrations.some((name) => name.toLowerCase().includes("p10a3") || name.toLowerCase().includes("v2_contract"))).toBe(false);
  });

  it("preserves the V1 compatibility contract while P10F adds named Library modes and same-origin client routes", () => {
    const currentTypes = fs.readFileSync(path.join(root, "lib/activity-catalog/types.ts"), "utf8");
    expect(currentTypes).toContain('"legacy" | "external" | "external_with_legacy_fallback" | "library_v2" | "library_v2_with_legacy_fallback"');
    expect(currentTypes).toContain('apiVersion: "v1";');
    const client = fs.readFileSync(path.join(root, "services/activity-catalog/client.ts"), "utf8");
    expect(client).toContain("/api/activity-catalog/activities");
    expect(client).toContain("/api/activity-catalog/library-domains");
    expect(client).not.toContain("https://catalog-api.plaivra.com");
    expect(client).not.toContain("/v2/");
  });
});