#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const sourceHead = process.env.SOURCE_HEAD;
if (!repository || !token || !sourceHead) throw new Error("Missing required environment.");

const apiBase = `https://api.github.com/repos/${repository}`;
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
};

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${body}`);
  return JSON.parse(body);
}

const source = await request(`${apiBase}/contents/.github/workflows/quality.yml?ref=${sourceHead}`);
let text = Buffer.from(source.content.replace(/\n/g, ""), "base64").toString("utf8");

const oldBlock = [
  "          supabase db start",
  "          correction_migration=\"supabase/migrations/20260721012814_active_workout_aw2a_execution_state_corrections.sql\"",
  "          temporary_correction=\"$(mktemp)\"",
  "          cp \"$correction_migration\" \"$temporary_correction\"",
  "          rm \"$correction_migration\"",
  "          restore_correction() { cp \"$temporary_correction\" \"$correction_migration\"; }",
  "          trap restore_correction EXIT",
  "          supabase db reset --local --no-seed",
  "          restore_correction",
  "          trap - EXIT",
].join("\n");

const newBlock = [
  "          correction_migration=\"supabase/migrations/20260721012814_active_workout_aw2a_execution_state_corrections.sql\"",
  "          temporary_correction=\"$(mktemp)\"",
  "          cp \"$correction_migration\" \"$temporary_correction\"",
  "          rm \"$correction_migration\"",
  "          restore_correction() { cp \"$temporary_correction\" \"$correction_migration\"; }",
  "          trap restore_correction EXIT",
  "          supabase db start",
  "          supabase db reset --local --no-seed",
  "          restore_correction",
  "          trap - EXIT",
].join("\n");

if (!text.includes(oldBlock)) throw new Error("Replay ordering block not found.");
text = text.replace(oldBlock, newBlock);

const startPosition = text.indexOf("          supabase db start");
const removePosition = text.indexOf("          rm \"$correction_migration\"");
if (removePosition < 0 || startPosition < 0 || removePosition > startPosition) {
  throw new Error("Correction migration must be removed before Supabase startup.");
}

const blob = await request(`${apiBase}/git/blobs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: Buffer.from(text, "utf8").toString("base64"), encoding: "base64" }),
});

mkdirSync("quality-reports", { recursive: true });
const output = { sourceHead, blobSha: blob.sha, byteLength: Buffer.byteLength(text) };
writeFileSync("quality-reports/replay-order-blob.json", `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output));
