import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const dormantModule = "@/lib/activity-catalog/v2-contract";
const runtimeFiles = [
  "services/activity-catalog/client.ts",
  "services/activity-catalog/server/selector.ts",
  "services/activity-catalog/server/http-provider.ts",
  "services/activity-catalog/server/legacy-provider.ts",
  "services/activity-catalog/server/provider.ts"
];

describe("P10A-A3 Main dormant V2 boundary", () => {
  it("does not wire the dormant V2 contract into the current provider/runtime path", () => {
    for (const relative of runtimeFiles) {
      const source = fs.readFileSync(path.join(root, relative), "utf8");
      expect(source).not.toContain(dormantModule);
      expect(source).not.toContain("catalog-v2-activity.fixture.json");
      expect(source).not.toContain("MAIN_ACTIVITY_CATALOG_V2_CAPABILITY");
    }
  });

  it("preserves the current provider selector default as legacy", () => {
    const selector = fs.readFileSync(path.join(root, "services/activity-catalog/server/selector.ts"), "utf8");
    expect(selector).toContain('if (!value || value === "legacy") return "legacy";');
    expect(selector).toContain('if (mode === "legacy")');
    expect(selector).not.toMatch(/parseCatalogProviderMode\([^)]*\).*v2/s);
  });

  it("introduces no environment/provider-mode assignment or database migration", () => {
    const contractSource = fs.readFileSync(path.join(root, "lib/activity-catalog/v2-contract.ts"), "utf8");
    expect(contractSource).not.toContain("process.env");
    expect(contractSource).not.toContain("PLAIVRA_ACTIVITY_CATALOG_MODE");
    expect(contractSource).not.toContain("createClient(");
    const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql"));
    expect(migrations.some((name) => name.toLowerCase().includes("p10a3") || name.toLowerCase().includes("v2_contract"))).toBe(false);
  });

  it("leaves current V1 public types and client source untouched by the dormant contract", () => {
    const currentTypes = fs.readFileSync(path.join(root, "lib/activity-catalog/types.ts"), "utf8");
    expect(currentTypes).toContain('export type CatalogProviderMode = "legacy" | "external" | "external_with_legacy_fallback";');
    expect(currentTypes).toContain('apiVersion: "v1";');
    const client = fs.readFileSync(path.join(root, "services/activity-catalog/client.ts"), "utf8");
    expect(client).toContain("/api/activity-catalog/activities");
    expect(client).not.toContain("/v2/");
  });
});
