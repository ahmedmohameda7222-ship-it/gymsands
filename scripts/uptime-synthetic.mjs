import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, list) => {
  if (!value.startsWith("--")) return pairs;
  pairs.push([value.slice(2), list[index + 1]]);
  return pairs;
}, []));
const base = new URL(args.url || process.env.PLAIVRA_UPTIME_URL || "https://app.plaivra.com");
if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Uptime target must use HTTPS.");

async function check(path, kind = "html") {
  const started = Date.now();
  const response = await fetch(new URL(path, base), { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Plaivra-Uptime-Synthetic/1" } });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  if (kind === "json") await response.json();
  else await response.text();
  return { path, status: response.status, duration_ms: Date.now() - started };
}

const checks = [];
for (const [path, kind] of [["/api/health", "json"], ["/api/version", "json"], ["/", "html"], ["/login", "html"], ["/legal/privacy", "html"], ["/legal/terms", "html"]]) {
  checks.push(await check(path, kind));
}
const evidence = { checked_at: new Date().toISOString(), target: base.origin, checks };
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
if (args.output) {
  const output = resolve(args.output);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, serialized, "utf8");
  process.stdout.write(`${output}\n`);
} else process.stdout.write(serialized);
