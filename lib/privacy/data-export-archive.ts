import "server-only";

import JSZip from "jszip";
import type { PlaivraDataExport } from "@/lib/privacy/data-export";

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function flattenToCsvRows(value: unknown, path = "data"): Array<[string, string]> {
  if (value === null || value === undefined || typeof value !== "object") {
    return [[path, value === null || value === undefined ? "" : String(value)]];
  }
  if (Array.isArray(value)) {
    if (!value.length) return [[path, ""]];
    return value.flatMap((item, index) => flattenToCsvRows(item, `${path}[${index}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenToCsvRows(child, `${path}.${key}`)
  );
}

export function buildCsv(value: unknown, root = "data") {
  const rows = flattenToCsvRows(value, root);
  return [
    ["field", "value"].map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(","))
  ].join("\n");
}

function recordCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  return Object.values(value as Record<string, unknown>).reduce<number>((count, child) => count + recordCount(child), 0);
}

export async function buildDataExportArchive(payload: PlaivraDataExport) {
  const zip = new JSZip();
  zip.file("data.json", JSON.stringify(payload, null, 2));
  zip.file("storage-manifest.json", JSON.stringify({
    generatedAt: payload.generatedAt,
    objects: payload.storageManifest
  }, null, 2));

  const csvFiles: string[] = [];
  for (const [domain, value] of Object.entries(payload.data)) {
    const filename = `csv/${domain.replace(/[^a-z0-9_-]/gi, "-")}.csv`;
    zip.file(filename, buildCsv(value, domain));
    csvFiles.push(filename);
  }
  zip.file("csv/account.csv", buildCsv(payload.account, "account"));
  csvFiles.push("csv/account.csv");

  const manifest = {
    format: "plaivra-portable-archive",
    formatVersion: 1,
    generatedAt: payload.generatedAt,
    dataFormatVersion: payload.formatVersion,
    files: ["manifest.json", "data.json", "storage-manifest.json", ...csvFiles],
    recordCounts: Object.fromEntries(Object.entries(payload.data).map(([domain, value]) => [domain, recordCount(value)])),
    storageObjectCount: payload.storageManifest.length,
    warnings: payload.warnings
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
