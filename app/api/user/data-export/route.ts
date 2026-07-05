import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
import { buildCurrentUserDataExport } from "@/lib/privacy/data-export";
import { rateLimit } from "@/lib/integrations/rate-limit";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function flattenToCsvRows(value: unknown, path = "export"): Array<[string, string]> {
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

function buildCsv(payload: unknown) {
  const rows = flattenToCsvRows(payload);
  return [
    ["field", "value"].map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(","))
  ].join("\n");
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "data-export", 3, 60_000);
  if (limited) return limited;

  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  try {
    const payload = await buildCurrentUserDataExport(context.supabase, context.user);
    const csv = buildCsv(payload);
    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="plaivra-data-export-${date}.csv"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Plaivra data export failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Your Plaivra data export could not be generated." }, { status: 500 });
  }
}
