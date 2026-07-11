import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const ledgerPath = path.join(root, "supabase", "migration-ledger.json");
const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
const errors = [];

if (ledger.schemaVersion !== 1) errors.push("Unsupported migration ledger schemaVersion.");
if (!/^[a-z0-9]{20}$/.test(ledger.projectRef ?? "")) errors.push("Invalid Supabase projectRef.");

const classified = new Map();
const productionKeys = new Set();
for (const entry of ledger.entries ?? []) {
  if (!files.includes(entry.localFile)) errors.push(`Ledger references missing migration: ${entry.localFile}`);
  if (classified.has(entry.localFile)) errors.push(`Migration classified more than once: ${entry.localFile}`);
  classified.set(entry.localFile, entry.state);

  if (entry.productionVersion || entry.productionName) {
    if (!entry.productionVersion || !entry.productionName) {
      errors.push(`Incomplete production identity for ${entry.localFile}`);
    } else {
      const key = `${entry.productionVersion}:${entry.productionName}`;
      if (productionKeys.has(key)) errors.push(`Duplicate production ledger identity: ${key}`);
      productionKeys.add(key);
    }
  }

  if (entry.state === "applied_version_alias" && !entry.note?.includes("differs")) {
    errors.push(`Version alias lacks an explicit preservation note: ${entry.localFile}`);
  }
}

for (const file of files) {
  if (!classified.has(file)) errors.push(`Unclassified repository migration: ${file}`);
  if (!/^\d{12,14}_[a-z0-9_]+\.sql$/.test(file)) errors.push(`Invalid migration filename: ${file}`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

const states = [...classified.values()].reduce((groups, state) => {
  groups[state] ??= [];
  groups[state].push(state);
  return groups;
}, {});
console.log(`Migration ledger valid: ${files.length} repository migrations classified.`);
console.log(Object.entries(states).map(([state, values]) => `${state}=${values.length}`).join(" "));
