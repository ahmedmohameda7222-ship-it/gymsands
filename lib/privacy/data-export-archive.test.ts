import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildDataExportArchive } from "./data-export-archive";
import type { PlaivraDataExport } from "./data-export";

describe("portable Plaivra data archive", () => {
  it("contains JSON, per-domain CSV, and a storage manifest without tokens", async () => {
    const payload: PlaivraDataExport = {
      format: "plaivra-user-data-export",
      formatVersion: 2,
      generatedAt: "2026-07-11T00:00:00.000Z",
      scope: "authenticated-current-user-canonical-data",
      account: { email: "member@example.test" },
      data: { workouts: { plans: [{ id: "plan-a" }] }, chatgpt_connections: [{ id: "connection-a" }] },
      storageManifest: [{ bucket: "progress-photos", path: "user-a/front.webp", record_id: "photo-a", kind: "progress_photo" }],
      warnings: []
    };
    const archive = await buildDataExportArchive(payload);
    const zip = await JSZip.loadAsync(archive);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([
      "manifest.json", "data.json", "storage-manifest.json", "csv/workouts.csv", "csv/chatgpt_connections.csv"
    ]));
    const serialized = await zip.file("data.json")!.async("string");
    expect(serialized).not.toContain("token_hash");
    expect(await zip.file("storage-manifest.json")!.async("string")).toContain("user-a/front.webp");
  });
});
