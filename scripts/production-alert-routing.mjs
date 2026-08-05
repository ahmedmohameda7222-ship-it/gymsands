#!/usr/bin/env node

import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SOURCE_WORKFLOW = "Production uptime synthetic";
export const INCIDENT_TITLE = "[SEV-1] Production synthetic repeatedly failing";
export const INCIDENT_MARKER = "<!-- plaivra-production-alert:uptime-synthetic -->";
export const RUN_MARKER_PREFIX = "<!-- plaivra-production-run:";
export const ACTIONABLE_CONCLUSIONS = Object.freeze([
  "failure",
  "timed_out",
  "action_required",
  "stale",
  "startup_failure",
]);
export const IGNORED_CONCLUSIONS = Object.freeze(["cancelled", "neutral", "skipped"]);
export const ACCEPTED_EVENTS = Object.freeze(["push", "schedule", "workflow_dispatch"]);
export const ALLOWED_ACTIONS = Object.freeze([
  "ignored",
  "first_failure",
  "incident_opened",
  "incident_updated",
  "incident_recovered",
  "no_active_incident",
  "duplicate_event",
]);

const RECOGNIZED_CONCLUSIONS = new Set([
  ...ACTIONABLE_CONCLUSIONS,
  ...IGNORED_CONCLUSIONS,
  "success",
]);
const ACTIONABLE_SET = new Set(ACTIONABLE_CONCLUSIONS);
const IGNORED_SET = new Set(IGNORED_CONCLUSIONS);
const ACCEPTED_EVENT_SET = new Set(ACCEPTED_EVENTS);
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_EVENT_BYTES = 1_000_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_PAGES = 2;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "Plaivra-Production-Owner-Alert-Routing/1";

class RoutingFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new RoutingFailure(code);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function safeTimestamp(value) {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function safeSha(value) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && SHA_PATTERN.test(value) ? value.toLowerCase() : undefined;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) fail("INVALID_INPUT");
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!name || value === undefined || value.startsWith("--") || Object.hasOwn(result, name)) {
      fail("INVALID_INPUT");
    }
    result[name] = value;
    index += 1;
  }
  return result;
}

function parseApiUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("INVALID_INPUT");
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) fail("INVALID_INPUT");
  if (url.username || url.password || url.search || url.hash) fail("INVALID_INPUT");
  return url;
}

export function parseOptions(argv = process.argv.slice(2), environment = process.env) {
  const args = parseArgs(argv);
  if (Object.keys(args).some((key) => !["event", "repository", "api-url"].includes(key))) fail("INVALID_INPUT");
  if (!args.event || !args.repository || !args["api-url"]) fail("INVALID_INPUT");
  if (!REPOSITORY_PATTERN.test(args.repository)) fail("INVALID_INPUT");
  if (typeof environment.GITHUB_TOKEN !== "string" || environment.GITHUB_TOKEN.length < 1) fail("INVALID_INPUT");
  return {
    eventPath: resolve(args.event),
    repository: args.repository,
    apiUrl: parseApiUrl(args["api-url"]),
    token: environment.GITHUB_TOKEN,
    summaryPath: typeof environment.GITHUB_STEP_SUMMARY === "string" && environment.GITHUB_STEP_SUMMARY.length > 0
      ? resolve(environment.GITHUB_STEP_SUMMARY)
      : null,
  };
}

function parseEventFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    fail("EVENT_READ_ERROR");
  }
  if (Buffer.byteLength(text, "utf8") > MAX_EVENT_BYTES) fail("INVALID_INPUT");
  try {
    return JSON.parse(text);
  } catch {
    fail("INVALID_INPUT");
  }
}

function validateRunUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("INVALID_INPUT");
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.search || url.hash) {
    fail("INVALID_INPUT");
  }
  return url.toString();
}

function normalizeConclusion(value, invalidCode = "INVALID_INPUT") {
  if (typeof value !== "string" || !RECOGNIZED_CONCLUSIONS.has(value)) fail(invalidCode);
  return value;
}

export function validateSourceEvent(event, repository) {
  if (!isObject(event) || event.action !== "completed") fail("INVALID_INPUT");
  const run = event.workflow_run;
  if (!isObject(run)) fail("INVALID_INPUT");
  if (run.name !== SOURCE_WORKFLOW) fail("INVALID_INPUT");
  if (event.repository?.full_name !== repository) fail("INVALID_INPUT");
  if (run.repository?.full_name !== repository || run.head_repository?.full_name !== repository) fail("INVALID_INPUT");
  if (run.head_branch !== "main") fail("INVALID_INPUT");
  if (!ACCEPTED_EVENT_SET.has(run.event)) fail("INVALID_INPUT");
  if (!positiveInteger(run.id) || !positiveInteger(run.workflow_id)) fail("INVALID_INPUT");
  const conclusion = normalizeConclusion(run.conclusion);
  const headSha = safeSha(run.head_sha);
  if (headSha === undefined) fail("INVALID_INPUT");
  return {
    id: run.id,
    workflowId: run.workflow_id,
    url: validateRunUrl(run.html_url),
    event: run.event,
    conclusion,
    headSha,
    createdAt: safeTimestamp(run.created_at),
    updatedAt: safeTimestamp(run.updated_at),
  };
}

function runMarker(runId) {
  return `${RUN_MARKER_PREFIX}${runId} -->`;
}

function safeRunFromApi(value, repository) {
  if (!isObject(value) || !positiveInteger(value.id)) fail("API_INVALID_RESPONSE");
  if (value.repository?.full_name !== repository || value.head_repository?.full_name !== repository) return null;
  if (value.head_branch !== "main" || !ACCEPTED_EVENT_SET.has(value.event)) return null;
  const conclusion = normalizeConclusion(value.conclusion, "API_INVALID_RESPONSE");
  const headSha = safeSha(value.head_sha);
  if (headSha === undefined) fail("API_INVALID_RESPONSE");
  let url;
  try {
    url = validateRunUrl(value.html_url);
  } catch {
    fail("API_INVALID_RESPONSE");
  }
  return {
    id: value.id,
    url,
    event: value.event,
    conclusion,
    headSha,
    createdAt: safeTimestamp(value.created_at),
    updatedAt: safeTimestamp(value.updated_at),
  };
}

function apiEndpoint(base, path, query = null) {
  const url = new URL(path.replace(/^\//, ""), base.toString().endsWith("/") ? base : new URL(`${base.toString()}/`));
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  }
  return url;
}

async function apiRequest({ apiUrl, token, method = "GET", path, query, body, requestTimeoutMs }) {
  const url = apiEndpoint(apiUrl, path, query);
  let response;
  let bytes;
  try {
    response = await fetch(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(requestTimeoutMs),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) fail("API_RESPONSE_TOO_LARGE");
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof RoutingFailure) throw error;
    if (error?.name === "TimeoutError" || error?.name === "AbortError") fail("API_TIMEOUT");
    fail("API_NETWORK_ERROR");
  }
  if (bytes.byteLength > MAX_RESPONSE_BYTES) fail("API_RESPONSE_TOO_LARGE");
  if (!response.ok) fail("API_HTTP_ERROR");
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail("API_INVALID_JSON");
  }
  return parsed;
}

async function listRecentRuns(context, workflowId) {
  const runs = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await apiRequest({
      ...context,
      path: `/repos/${context.repository}/actions/workflows/${workflowId}/runs`,
      query: { branch: "main", status: "completed", per_page: 50, page },
    });
    if (!isObject(payload) || !Array.isArray(payload.workflow_runs)) fail("API_INVALID_RESPONSE");
    runs.push(...payload.workflow_runs);
    if (payload.workflow_runs.length < 50) break;
  }
  return runs;
}

async function previousRelevantRun(context, current) {
  const candidates = await listRecentRuns(context, current.workflowId);
  for (const candidate of candidates) {
    if (candidate?.id === current.id) continue;
    const normalized = safeRunFromApi(candidate, context.repository);
    if (!normalized || IGNORED_SET.has(normalized.conclusion)) continue;
    return normalized;
  }
  return null;
}

function safeIssue(value) {
  if (!isObject(value) || !positiveInteger(value.number) || typeof value.body !== "string") fail("API_INVALID_RESPONSE");
  return value;
}

async function listIssues(context, state = "open") {
  const issues = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await apiRequest({
      ...context,
      path: `/repos/${context.repository}/issues`,
      query: { state, per_page: 50, page },
    });
    if (!Array.isArray(payload)) fail("API_INVALID_RESPONSE");
    issues.push(...payload);
    if (payload.length < 50) break;
  }
  return issues;
}

async function openIncident(context) {
  const issues = await listIssues(context, "open");
  const matches = [];
  for (const candidate of issues) {
    if (!isObject(candidate) || candidate.pull_request) continue;
    if (!positiveInteger(candidate.number)) fail("API_INVALID_RESPONSE");
    if (typeof candidate.body !== "string") continue;
    if (candidate.body.includes(INCIDENT_MARKER)) matches.push(candidate);
  }
  if (matches.length > 1) fail("INCIDENT_STATE_CONFLICT");
  return matches[0] ?? null;
}

async function issueComments(context, issueNumber) {
  const comments = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await apiRequest({
      ...context,
      path: `/repos/${context.repository}/issues/${issueNumber}/comments`,
      query: { per_page: 100, page },
    });
    if (!Array.isArray(payload)) fail("API_INVALID_RESPONSE");
    for (const comment of payload) {
      if (!isObject(comment) || typeof comment.body !== "string") fail("API_INVALID_RESPONSE");
      comments.push(comment.body);
    }
    if (payload.length < 100) break;
  }
  return comments;
}

function runLines(prefix, run) {
  const lines = [
    `- ${prefix} run ID: ${run.id}`,
    `- ${prefix} run URL: ${run.url}`,
    `- ${prefix} event: ${run.event}`,
    `- ${prefix} conclusion: ${run.conclusion}`,
    `- ${prefix} head SHA: ${run.headSha ?? "not reported"}`,
  ];
  if (run.createdAt) lines.push(`- ${prefix} created: ${run.createdAt}`);
  if (run.updatedAt) lines.push(`- ${prefix} updated: ${run.updatedAt}`);
  return lines;
}

function incidentBody(current, previous) {
  return [
    INCIDENT_MARKER,
    runMarker(current.id),
    "## SEV-1 Production synthetic incident",
    "",
    "- Severity: SEV-1",
    "- State: active",
    `- Source workflow: ${SOURCE_WORKFLOW}`,
    "- Detection threshold: two consecutive relevant failures",
    ...runLines("Current", current),
    ...runLines("Previous relevant", previous),
    "- Incident response: `docs/operations/incident-response.md`",
    "- PCS-5A evidence remains attached to the source workflow run.",
  ].join("\n");
}

function failureComment(current, previous) {
  return [
    runMarker(current.id),
    "## Production synthetic failure update",
    "",
    "- Severity: SEV-1",
    "- State: active",
    `- Source workflow: ${SOURCE_WORKFLOW}`,
    "- Detection threshold: two consecutive relevant failures",
    ...runLines("Current", current),
    ...runLines("Previous relevant", previous),
    "- Incident response: `docs/operations/incident-response.md`",
    "- PCS-5A evidence remains attached to the source workflow run.",
  ].join("\n");
}

function recoveryComment(current) {
  return [
    runMarker(current.id),
    "## Production synthetic recovery",
    "",
    "- Severity: SEV-1",
    "- State: recovered",
    `- Source workflow: ${SOURCE_WORKFLOW}`,
    ...runLines("Recovery", current),
    "- Incident response: `docs/operations/incident-response.md`",
    "- PCS-5A evidence remains attached to the source workflow run.",
    "- Automatic closure records recovery but does not replace root-cause review for a real outage.",
  ].join("\n");
}

async function createIncident(context, current, previous) {
  const [owner] = context.repository.split("/");
  const payload = await apiRequest({
    ...context,
    method: "POST",
    path: `/repos/${context.repository}/issues`,
    body: {
      title: INCIDENT_TITLE,
      body: incidentBody(current, previous),
      assignees: [owner],
      labels: ["bug"],
    },
  });
  return safeIssue(payload);
}

async function addComment(context, issueNumber, body) {
  const payload = await apiRequest({
    ...context,
    method: "POST",
    path: `/repos/${context.repository}/issues/${issueNumber}/comments`,
    body: { body },
  });
  if (!isObject(payload) || typeof payload.body !== "string") fail("API_INVALID_RESPONSE");
}

async function closeIssue(context, issueNumber) {
  const payload = await apiRequest({
    ...context,
    method: "PATCH",
    path: `/repos/${context.repository}/issues/${issueNumber}`,
    body: { state: "closed" },
  });
  if (!isObject(payload) || payload.state !== "closed") fail("API_INVALID_RESPONSE");
}

function decision(action, current, previous = null, issueNumber = null) {
  if (!ALLOWED_ACTIONS.includes(action)) fail("INVALID_RESULT");
  return {
    action,
    source_run_id: current.id,
    current_conclusion: current.conclusion,
    previous_relevant_conclusion: previous?.conclusion ?? null,
    previous_relevant_run_id: previous?.id ?? null,
    issue_number: issueNumber,
  };
}

export async function routeProductionAlert({ event, repository, apiUrl, token, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS }) {
  const current = validateSourceEvent(event, repository);
  const context = { repository, apiUrl, token, requestTimeoutMs };

  if (IGNORED_SET.has(current.conclusion)) return decision("ignored", current);

  if (current.conclusion === "success") {
    const incident = await openIncident(context);
    if (!incident) return decision("no_active_incident", current);
    const marker = runMarker(current.id);
    const comments = await issueComments(context, incident.number);
    if (!incident.body.includes(marker) && !comments.some((body) => body.includes(marker))) {
      await addComment(context, incident.number, recoveryComment(current));
    }
    await closeIssue(context, incident.number);
    return decision("incident_recovered", current, null, incident.number);
  }

  if (!ACTIONABLE_SET.has(current.conclusion)) fail("INVALID_INPUT");
  const previous = await previousRelevantRun(context, current);
  if (!previous || previous.conclusion === "success") return decision("first_failure", current, previous);
  if (!ACTIONABLE_SET.has(previous.conclusion)) fail("API_INVALID_RESPONSE");

  const incident = await openIncident(context);
  if (!incident) {
    const created = await createIncident(context, current, previous);
    return decision("incident_opened", current, previous, created.number);
  }

  const marker = runMarker(current.id);
  const comments = await issueComments(context, incident.number);
  if (incident.body.includes(marker) || comments.some((body) => body.includes(marker))) {
    return decision("duplicate_event", current, previous, incident.number);
  }
  await addComment(context, incident.number, failureComment(current, previous));
  return decision("incident_updated", current, previous, incident.number);
}

function writeSummary(path, result) {
  if (!path) return;
  const lines = [
    "## Production owner alert routing",
    "",
    `- Action: \`${result.action}\``,
    `- Source run ID: \`${result.source_run_id}\``,
    `- Current conclusion: \`${result.current_conclusion}\``,
  ];
  if (result.previous_relevant_run_id) {
    lines.push(`- Previous relevant run ID: \`${result.previous_relevant_run_id}\``);
    lines.push(`- Previous relevant conclusion: \`${result.previous_relevant_conclusion}\``);
  }
  if (result.issue_number) lines.push(`- Issue number: \`${result.issue_number}\``);
  appendFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
  io = { stdout: process.stdout, stderr: process.stderr },
  runtime = {},
) {
  try {
    const options = parseOptions(argv, environment);
    const event = parseEventFile(options.eventPath);
    const result = await routeProductionAlert({
      event,
      repository: options.repository,
      apiUrl: options.apiUrl,
      token: options.token,
      requestTimeoutMs: runtime.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    });
    writeSummary(options.summaryPath, result);
    io.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof RoutingFailure ? error.code : "ROUTING_INTERNAL_ERROR";
    io.stderr.write(`${code}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
