import { readFile, writeFile } from "node:fs/promises";

const target = "scripts/.aw1b-locale-qa.mjs";
let source = await readFile(target, "utf8");
const marker = `    const method = requestRoute.request().method();
    let body = {};`;
const replacement = `    const method = requestRoute.request().method();
    const requestUrl = new URL(requestRoute.request().url());
    if (requestUrl.pathname.includes("/rest/v1/user_app_settings") && (method === "GET" || method === "HEAD")) {
      const wantsObject = (requestRoute.request().headers().accept || "").includes("application/vnd.pgrst.object");
      const now = "2026-07-20T00:00:00.000Z";
      const row = {
        id: "22222222-2222-4222-8222-222222222222",
        user_id: "00000000-0000-4000-8000-000000000001",
        theme_id: "olive",
        theme: "light",
        accent_color: "olive",
        language,
        weight_unit: "kg",
        height_unit: "cm",
        distance_unit: "km",
        liquid_unit: "ml",
        energy_unit: "kcal",
        body_measurement_unit: "cm",
        week_starts_on: "monday",
        default_start_page: "today",
        compact_mode: false,
        reduce_animations: true,
        large_text_mode: false,
        quick_log_sections: ["workout"],
        created_at: now,
        updated_at: now
      };
      await requestRoute.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/1", "x-plaivra-qa-fixture": "localized-settings" },
        body: method === "HEAD" ? "" : JSON.stringify(wantsObject ? row : [row])
      });
      return;
    }
    let body = {};`;
if (!source.includes(marker)) throw new Error("Supabase method marker not found in focused QA runner");
source = source.replace(marker, replacement);
await writeFile(target, source, "utf8");
console.log("Localized account settings fixture added to focused QA runner.");
