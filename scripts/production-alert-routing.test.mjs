import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  INCIDENT_MARKER,
  INCIDENT_TITLE,
  main,
} from "./production-alert-routing.mjs";

const REPOSITORY = "ahmedmohameda7222-ship-it/gymsands";
const OWNER = "ahmedmohameda7222-ship-it";
const TOKEN = "test-temporary-github-token";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const PRIVATE = "secret@example.com Bearer private-token cookie=session user=11111111-1111-4111-8111-111111111111 /private?token=abc";
const workflowPath = new URL("../.github/workflows/production-alert-routing.yml", import.meta.url);
const scriptPath = new URL("./production-alert-routing.mjs", import.meta.url);

function runRecord({
  id,
  conclusion,
  event = "push",
  repository = REPOSITORY,
  headRepository = REPOSITORY,
  branch = "main",
  sha = SHA_A,
} = {}) {
  return {
    id,
    workflow_id: 9001,
    name: "Production uptime synthetic",
    html_url: `https://github.com/${REPOSITORY}/actions/runs/${id}`,
    event,
    conclusion,
    head_branch: branch,
    head_sha: sha,
    created_at: "2026-08-05T16:00:00.000Z",
    updated_at: "2026-08-05T16:01:00.000Z",
    repository: { full_name: repository, injected: PRIVATE },
    head_repository: { full_name: headRepository, injected: PRIVATE },
    injected_private_content: PRIVATE,
  };
}

function eventFor(runOverrides = {}, eventOverrides = {}) {
  const run = runRecord({ id: 200, conclusion: "success", ...runOverrides });
  return {
    action: "completed",
    repository: { full_name: REPOSITORY },
    workflow_run: run,
    injected_private_content: PRIVATE,
    ...eventOverrides,
  };
}

function issue({ number = 10, state = "open", body = INCIDENT_MARKER, pullRequest = false } = {}) {
  return {
    number,
    state,
    title: INCIDENT_TITLE,
    body,
    labels: [{ name: "bug" }],
    ...(pullRequest ? { pull_request: { url: "https://api.github.com/pulls/1" } } : {}),
  };
}

async function withMockApi(initial, callback) {
  const state = {
    runs: [],
    issues: [],
    comments: new Map(),
    requests: [],
    fail: null,
    hangPath: null,
    nextIssueNumber: 100,
    ...initial,
  };
  if (!(state.comments instanceof Map)) state.comments = new Map(Object.entries(state.comments));

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    let parsedBody = null;
    if (rawBody) {
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = rawBody; }
    }
    state.requests.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: parsedBody,
      authorization: request.headers.authorization,
      userAgent: request.headers["user-agent"],
    });

    if (state.hangPath && url.pathname.includes(state.hangPath)) return;
    if (state.fail && url.pathname.includes(state.fail.path)) {
      response.writeHead(state.fail.status ?? 500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: state.fail.body ?? PRIVATE }));
      return;
    }

    const runsMatch = url.pathname.match(/\/repos\/[^/]+\/[^/]+\/actions\/workflows\/(\d+)\/runs$/);
    if (request.method === "GET" && runsMatch) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ workflow_runs: state.runs, injected_private_content: PRIVATE }));
      return;
    }

    const commentsMatch = url.pathname.match(/\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/);
    if (commentsMatch) {
      const number = Number(commentsMatch[1]);
      if (request.method === "GET") {
        const comments = state.comments.get(number) ?? [];
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(comments.map((body, index) => ({ id: index + 1, body }))));
        return;
      }
      if (request.method === "POST") {
        const comments = state.comments.get(number) ?? [];
        comments.push(parsedBody.body);
        state.comments.set(number, comments);
        response.writeHead(201, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ id: comments.length, body: parsedBody.body }));
        return;
      }
    }

    const issueMatch = url.pathname.match(/\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/);
    if (issueMatch && request.method === "PATCH") {
      const number = Number(issueMatch[1]);
      const target = state.issues.find((item) => item.number === number);
      if (!target) {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ message: PRIVATE }));
        return;
      }
      target.state = parsedBody.state;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(target));
      return;
    }

    if (/\/repos\/[^/]+\/[^/]+\/issues$/.test(url.pathname)) {
      if (request.method === "GET") {
        const requestedState = url.searchParams.get("state") ?? "open";
        const filtered = state.issues.filter((item) => item.state === requestedState);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(filtered));
        return;
      }
      if (request.method === "POST") {
        const created = {
          number: state.nextIssueNumber++,
          state: "open",
          title: parsedBody.title,
          body: parsedBody.body,
          assignees: parsedBody.assignees,
          labels: parsedBody.labels.map((name) => ({ name })),
        };
        state.issues.push(created);
        response.writeHead(201, { "Content-Type": "application/json" });
        response.end(JSON.stringify(created));
        return;
      }
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: PRIVATE }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const apiUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await callback({ state, apiUrl });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runMain({ event, state = {}, requestTimeoutMs = 500 } = {}) {
  return withMockApi(state, async ({ state: mutableState, apiUrl }) => {
    const directory = await mkdtemp(join(tmpdir(), "pcs5b-"));
    const eventPath = join(directory, "event.json");
    const summaryPath = join(directory, "summary.md");
    await writeFile(eventPath, JSON.stringify(event), "utf8");
    const stdout = [];
    const stderr = [];
    try {
      const exitCode = await main([
        "--event", eventPath,
        "--repository", REPOSITORY,
        "--api-url", apiUrl,
      ], {
        GITHUB_TOKEN: TOKEN,
        GITHUB_STEP_SUMMARY: summaryPath,
      }, {
        stdout: { write: (value) => stdout.push(value) },
        stderr: { write: (value) => stderr.push(value) },
      }, { requestTimeoutMs });
      let summary = "";
      try { summary = await readFile(summaryPath, "utf8"); } catch {}
      return {
        exitCode,
        stdout: stdout.join(""),
        stderr: stderr.join(""),
        summary,
        state: mutableState,
        result: exitCode === 0 ? JSON.parse(stdout.join("")) : null,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

function mutations(result) {
  return result.state.requests.filter((request) => request.method !== "GET");
}

function previous(id, conclusion, overrides = {}) {
  return runRecord({ id, conclusion, ...overrides });
}

test("rejects foreign repository source", async () => {
  const result = await runMain({ event: eventFor({ repository: "foreign/repo" }) });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /^INVALID_INPUT/);
  assert.equal(mutations(result).length, 0);
});

test("rejects non-main source branch", async () => {
  const result = await runMain({ event: eventFor({ branch: "feature/unsafe" }) });
  assert.equal(result.exitCode, 1);
  assert.equal(mutations(result).length, 0);
});

test("rejects unsupported source event", async () => {
  const result = await runMain({ event: eventFor({ event: "pull_request" }) });
  assert.equal(result.exitCode, 1);
  assert.equal(mutations(result).length, 0);
});

test("rejects unknown conclusion", async () => {
  const result = await runMain({ event: eventFor({ conclusion: "mystery" }) });
  assert.equal(result.exitCode, 1);
  assert.equal(mutations(result).length, 0);
});

test("ignores cancelled run without API mutation", async () => {
  const result = await runMain({ event: eventFor({ conclusion: "cancelled" }) });
  assert.equal(result.exitCode, 0);
  assert.equal(result.result.action, "ignored");
  assert.equal(result.state.requests.length, 0);
});

test("success with no open incident performs no mutation", async () => {
  const result = await runMain({ event: eventFor({ conclusion: "success" }) });
  assert.equal(result.result.action, "no_active_incident");
  assert.equal(mutations(result).length, 0);
});

test("first actionable failure after success opens no issue", async () => {
  const current = eventFor({ id: 220, conclusion: "failure" });
  const result = await runMain({
    event: current,
    state: { runs: [current.workflow_run, previous(219, "success")] },
  });
  assert.equal(result.result.action, "first_failure");
  assert.equal(mutations(result).length, 0);
});

test("second consecutive actionable failure creates exactly one issue", async () => {
  const current = eventFor({ id: 230, conclusion: "timed_out" });
  const result = await runMain({
    event: current,
    state: { runs: [current.workflow_run, previous(229, "failure")] },
  });
  assert.equal(result.result.action, "incident_opened");
  assert.equal(mutations(result).filter((request) => request.method === "POST" && request.path.endsWith("/issues")).length, 1);
});

test("created issue has exact marker title owner assignee and bug label", async () => {
  const current = eventFor({ id: 240, conclusion: "failure" });
  const result = await runMain({
    event: current,
    state: { runs: [current.workflow_run, previous(239, "action_required")] },
  });
  const create = mutations(result).find((request) => request.method === "POST" && request.path.endsWith("/issues"));
  assert.equal(create.body.title, INCIDENT_TITLE);
  assert.equal(create.body.body.includes(INCIDENT_MARKER), true);
  assert.deepEqual(create.body.assignees, [OWNER]);
  assert.deepEqual(create.body.labels, ["bug"]);
});

test("existing open incident receives one update comment", async () => {
  const current = eventFor({ id: 250, conclusion: "failure" });
  const result = await runMain({
    event: current,
    state: {
      runs: [current.workflow_run, previous(249, "failure")],
      issues: [issue({ number: 17 })],
      comments: new Map([[17, []]]),
    },
  });
  assert.equal(result.result.action, "incident_updated");
  assert.equal(result.state.comments.get(17).length, 1);
  assert.match(result.state.comments.get(17)[0], /plaivra-production-run:250/);
});

test("replaying same run creates no duplicate issue or comment", async () => {
  await withMockApi({
    runs: [previous(260, "failure"), previous(259, "failure")],
    issues: [issue({ number: 18 })],
    comments: new Map([[18, []]]),
  }, async ({ state, apiUrl }) => {
    const directory = await mkdtemp(join(tmpdir(), "pcs5b-replay-"));
    const eventPath = join(directory, "event.json");
    const summaryPath = join(directory, "summary.md");
    const event = eventFor({ id: 260, conclusion: "failure" });
    await writeFile(eventPath, JSON.stringify(event), "utf8");
    const execute = async () => {
      const stdout = [];
      const exitCode = await main([
        "--event", eventPath,
        "--repository", REPOSITORY,
        "--api-url", apiUrl,
      ], { GITHUB_TOKEN: TOKEN, GITHUB_STEP_SUMMARY: summaryPath }, {
        stdout: { write: (value) => stdout.push(value) },
        stderr: { write: () => {} },
      }, { requestTimeoutMs: 500 });
      return { exitCode, result: JSON.parse(stdout.join("")) };
    };
    try {
      const first = await execute();
      const second = await execute();
      assert.equal(first.result.action, "incident_updated");
      assert.equal(second.result.action, "duplicate_event");
      assert.equal(state.comments.get(18).length, 1);
      assert.equal(state.issues.length, 1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

test("success comments recovery and closes active incident", async () => {
  const result = await runMain({
    event: eventFor({ id: 270, conclusion: "success" }),
    state: { issues: [issue({ number: 19 })], comments: new Map([[19, []]]) },
  });
  assert.equal(result.result.action, "incident_recovered");
  assert.equal(result.state.comments.get(19).length, 1);
  assert.match(result.state.comments.get(19)[0], /State: recovered/);
  assert.equal(result.state.issues[0].state, "closed");
});

test("later independent failure episode creates new issue instead of reopening closed incident", async () => {
  const current = eventFor({ id: 280, conclusion: "failure" });
  const result = await runMain({
    event: current,
    state: {
      runs: [current.workflow_run, previous(279, "failure")],
      issues: [issue({ number: 20, state: "closed" })],
    },
  });
  assert.equal(result.result.action, "incident_opened");
  assert.equal(result.state.issues.find((item) => item.number === 20).state, "closed");
  assert.equal(result.state.issues.filter((item) => item.state === "open").length, 1);
});

test("pull requests returned by issues API are ignored", async () => {
  const current = eventFor({ id: 290, conclusion: "failure" });
  const result = await runMain({
    event: current,
    state: {
      runs: [current.workflow_run, previous(289, "failure")],
      issues: [issue({ number: 21, pullRequest: true })],
    },
  });
  assert.equal(result.result.action, "incident_opened");
  assert.equal(result.state.issues.length, 2);
});

test("nearest previous relevant run skips cancelled neutral and skipped runs", async () => {
  const current = eventFor({ id: 300, conclusion: "failure" });
  const result = await runMain({
    event: current,
    state: {
      runs: [
        current.workflow_run,
        previous(299, "cancelled"),
        previous(298, "neutral"),
        previous(297, "skipped"),
        previous(296, "timed_out"),
      ],
    },
  });
  assert.equal(result.result.action, "incident_opened");
  assert.equal(result.result.previous_relevant_run_id, 296);
});

test("GitHub API failure exits non-zero without raw body leakage", async () => {
  const current = eventFor({ id: 310, conclusion: "failure" });
  const result = await runMain({
    event: current,
    state: { runs: [current.workflow_run, previous(309, "failure")], fail: { path: "/actions/workflows/", body: PRIVATE } },
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /^API_HTTP_ERROR/);
  assert.equal(`${result.stdout}${result.stderr}${result.summary}`.includes(PRIVATE), false);
  assert.equal(mutations(result).length, 0);
});

test("token is never written to stdout stderr summary issue or comment", async () => {
  const current = eventFor({ id: 320, conclusion: "failure" });
  const result = await runMain({
    event: current,
    state: { runs: [current.workflow_run, previous(319, "failure")] },
  });
  const persisted = JSON.stringify(result.state.issues) + JSON.stringify([...result.state.comments.values()]);
  assert.equal(`${result.stdout}${result.stderr}${result.summary}${persisted}`.includes(TOKEN), false);
  assert.equal(result.state.requests.every((request) => request.authorization === `Bearer ${TOKEN}`), true);
});

test("unsafe strings injected into mock payloads do not enter issue or comment content", async () => {
  const current = eventFor({ id: 330, conclusion: "failure" });
  const result = await runMain({
    event: current,
    state: { runs: [current.workflow_run, previous(329, "failure")] },
  });
  const persisted = JSON.stringify(result.state.issues) + JSON.stringify([...result.state.comments.values()]);
  for (const forbidden of [PRIVATE, "secret@example.com", "private-token", "cookie=session", "/private?token=abc", "injected_private_content"]) {
    assert.equal(persisted.includes(forbidden), false, forbidden);
  }
});

test("bounded API timeout is classified safely", async () => {
  const current = eventFor({ id: 340, conclusion: "failure" });
  const result = await runMain({
    event: current,
    state: { runs: [current.workflow_run, previous(339, "failure")], hangPath: "/actions/workflows/" },
    requestTimeoutMs: 40,
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /^API_TIMEOUT/);
  assert.equal(result.stderr.includes(PRIVATE), false);
  assert.equal(mutations(result).length, 0);
});

test("workflow contract uses workflow_run trusted checkout Node 24 exact permissions and serialized concurrency", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /^name: Production owner alert routing$/m);
  assert.match(workflow, /^  workflow_run:$/m);
  assert.match(workflow, /^      - Production uptime synthetic$/m);
  assert.match(workflow, /^      - completed$/m);
  const permissions = workflow.slice(workflow.indexOf("permissions:"), workflow.indexOf("concurrency:"));
  assert.equal(permissions.trim(), "permissions:\n  actions: read\n  contents: read\n  issues: write");
  assert.match(workflow, /group: production-owner-alert-routing/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node-version: 24/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha/);
});

test("workflow has no forbidden triggers provider actions external routing or extra secret authority", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const triggerBlock = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
  for (const forbiddenTrigger of ["pull_request:", "push:", "schedule:", "workflow_dispatch:"]) {
    assert.equal(triggerBlock.includes(forbiddenTrigger), false, forbiddenTrigger);
  }
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /supabase|vercel|netlify|pagerduty|slack|discord|webhook|sendgrid|smtp|email/i);
  assert.doesNotMatch(workflow, /deploy|deployment/i);
  assert.equal((workflow.match(/GITHUB_TOKEN:/g) ?? []).length, 1);
});

test("workflow and script do not download source artifacts logs or execute source-run code", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const script = await readFile(scriptPath, "utf8");
  assert.doesNotMatch(workflow, /download-artifact|workflow_run\.head_sha|actions\/artifacts/);
  assert.doesNotMatch(script, /\/artifacts|\/logs|download|child_process|exec\(|spawn\(/);
  assert.match(workflow, /Checkout trusted default branch implementation/);
});
