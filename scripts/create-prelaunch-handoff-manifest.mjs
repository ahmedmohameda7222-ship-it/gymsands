import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] || "60a204d5fc20fc396be1b1b47e748c42ebba6abf";
const head = process.argv[3] || "HEAD";
const output = resolve(process.argv[4] || "release/prelaunch-handoff-manifest.json");

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trimEnd();
}

const resolvedHead = git("rev-parse", head);
const commitShas = git("rev-list", "--reverse", `${base}..${resolvedHead}`).split(/\r?\n/).filter(Boolean);
const commits = commitShas.map((sha) => ({
  sha,
  subject: git("show", "-s", "--format=%s", sha),
  files: git("diff-tree", "--no-commit-id", "--name-status", "-r", "-M", sha)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split("\t");
      return { status, paths };
    })
}));

const manifest = {
  generatedAt: new Date().toISOString(),
  branch: git("branch", "--show-current"),
  base,
  head: resolvedHead,
  workingTreeStatusBeforeFinalHandoffCommit: git("status", "--short"),
  diffStat: git("diff", "--stat", `${base}..${resolvedHead}`),
  nameStatus: git("diff", "--name-status", "-M", `${base}..${resolvedHead}`)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split("\t");
      return { status, paths };
    }),
  commits
};

writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${output}\n`);
