import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => fs.readFileSync(path, "utf8");

const adapterPath = "services/food-catalog/server/supabase-ingestion-command-store.ts";
const servicePath = "services/food-catalog/server/ingestion-command-service.ts";
const storePath = "services/food-catalog/server/ingestion-store.ts";
const contractsPath = "services/food-catalog/server/ingestion-contracts.ts";
const indexPath = "services/food-catalog/server/index.ts";

const forbiddenPlan3Controls = [
  "food_catalog_create_activation_set_v1",
  "food_catalog_grant_activation_set_v1",
  "food_catalog_invalidate_activation_grant_v1",
  "food_catalog_create_generation_v1",
  "food_catalog_record_generation_validation_v1",
  "food_catalog_promote_generation_v1",
  "food_catalog_rollback_generation_v1",
  "food_catalog_revoke_generation_v1",
  "promoteCatalogGeneration",
  "rollbackCatalogGeneration",
  "revokeCatalogGeneration",
];

describe("Food Catalog Plan 4 server command boundary", () => {
  it("uses one shared command port and does not redefine it inside the Supabase adapter", () => {
    const adapter = read(adapterPath);
    expect(adapter).toContain('from "./ingestion-store"');
    expect(adapter).not.toMatch(/export\s+interface\s+FoodCatalogIngestionCommandStore/);
    expect(adapter).not.toMatch(/export\s+type\s+FoodCatalogIngestionCommandResult\s*=/);
    expect(read(storePath)).toMatch(/export\s+interface\s+FoodCatalogIngestionCommandStore/);
  });

  it("exports only the provider-neutral ingestion service contracts and command port from the server index", () => {
    const index = read(indexPath);
    expect(index).toContain('from "./ingestion-contracts"');
    expect(index).toContain('from "./ingestion-store"');
    expect(index).toContain('from "./ingestion-command-service"');
    expect(index).not.toContain('from "./supabase-ingestion-command-store"');
  });

  it("contains no Plan 3 activation/generation mutation path in the Plan 4 runtime files", () => {
    const runtime = [
      read(adapterPath),
      read(servicePath),
      read(storePath),
      read(contractsPath),
    ].join("\n");
    for (const control of forbiddenPlan3Controls) {
      expect(runtime).not.toContain(control);
    }
  });

  it("contains no arbitrary direct table CRUD or admin-client construction in the Plan 4 runtime", () => {
    const runtime = [read(adapterPath), read(servicePath)].join("\n");
    const supabaseMethods = [...runtime.matchAll(/\bsupabase\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g)]
      .map((match) => match[1]);
    expect(supabaseMethods.length).toBeGreaterThan(0);
    expect(supabaseMethods.every((method) => method === "rpc")).toBe(true);
    expect(runtime).not.toContain("createSupabaseAdminClient");
    expect(runtime).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
