import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const readCallees = new Set(["readFileSync", "readFile", "createReadStream"]);

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...filesUnder(path));
    else files.push(path.replaceAll("\\", "/"));
  }
  return files;
}

function scriptKind(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".ts") return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function collectConstInitializers(sourceFile) {
  const bindings = new Map();
  function visit(node) {
    if (ts.isVariableStatement(node) && (node.declarationList.flags & ts.NodeFlags.Const) !== 0) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          bindings.set(declaration.name.text, declaration.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return bindings;
}

function staticPathFragments(node, bindings, seen = new Set()) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    const fragments = [node.head.text];
    for (const span of node.templateSpans) {
      fragments.push(...staticPathFragments(span.expression, bindings, seen));
      fragments.push(span.literal.text);
    }
    return fragments;
  }
  if (ts.isIdentifier(node) && bindings.has(node.text) && !seen.has(node.text)) {
    const nextSeen = new Set(seen);
    nextSeen.add(node.text);
    return staticPathFragments(bindings.get(node.text), bindings, nextSeen);
  }

  const fragments = [];
  ts.forEachChild(node, (child) => fragments.push(...staticPathFragments(child, bindings, seen)));
  return fragments;
}

function isMarkdownDocumentationPath(fragments) {
  const normalized = fragments
    .map((fragment) => String(fragment).replaceAll("\\", "/").trim())
    .filter(Boolean);
  const direct = normalized.some((fragment) => /(?:^|\/)docs\/[^?#]*\.md(?:$|[?#])/i.test(fragment));
  const segmented = /(?:^|\/)docs(?:\/[^/]+)*\/[^/]+\.md(?:$|[?#])/i.test(normalized.join("/"));
  return direct || segmented;
}

function readsMarkdownProse(source, path = "fixture.mjs") {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));
  const bindings = collectConstInitializers(sourceFile);
  let coupled = false;

  function visit(node) {
    if (coupled) return;
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const callee = ts.isIdentifier(expression)
        ? expression.text
        : ts.isPropertyAccessExpression(expression)
          ? expression.name.text
          : null;
      if (callee && readCallees.has(callee) && node.arguments[0]) {
        if (isMarkdownDocumentationPath(staticPathFragments(node.arguments[0], bindings))) {
          coupled = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return coupled;
}

test("Markdown prose detector covers direct, template, resolve, and const-bound reads", () => {
  for (const source of [
    'readFileSync("docs/release/README.md", "utf8");',
    'readFileSync(`${root}/docs/release/README.md`, "utf8");',
    'readFileSync(resolve(root, "docs/operations/launch-runbook.md"), "utf8");',
    'const authority = join(root, "docs", "release", "README.md"); readFileSync(authority, "utf8");',
    'fs.readFile(resolve(root, "docs", "release", "README.md"));'
  ]) {
    assert.equal(readsMarkdownProse(source), true, source);
  }
  assert.equal(readsMarkdownProse('readFileSync(resolve(root, file), "utf8");'), false);
});

test("historical evidence and local agent tooling stay out of the active repository", () => {
  const forbiddenPaths = [
    ".agents",
    ".codex",
    "CHATGPT_CODEX_PROMPT_RULES.md",
    "docs/architecture/decisions",
    "docs/architecture/p8a-single-workout-pdf.md",
    "docs/ci",
    "docs/implementation",
    "docs/performance",
    "docs/platform-roadmap",
    "docs/privacy",
    "docs/ux-constitution",
    "docs/p10-batch2-main-capabilities.md",
    "docs/p10a3-main-dormant-v2-contract.md",
    "docs/persistence-notes.md",
    "docs/operations/pcs5a-production-deployment-convergence.md",
    "docs/operations/pcs5b-owner-alert-routing.md",
    "docs/chatgpt-app/public-tool-catalog.md",
    ".github/workflows/p10f-premerge.yml",
    "plaivra_aw6_details_actions_heatmaps_implementation_report.md",
    "plaivra_aw7_minimize_review_completion_implementation_report.md"
  ];
  for (const path of forbiddenPaths) {
    assert.equal(existsSync(join(root, path)), false, `${path} must remain absent from the active tree`);
  }

  const topLevelReports = readdirSync(root)
    .filter((entry) => /^plaivra_.*(?:implementation|qaqc|quality|audit|reconciliation).*\.(?:md|json)$/i.test(entry))
    .sort();
  assert.deepEqual(topLevelReports, []);

  const committedReportSnapshots = filesUnder(join(root, "docs", "reports"))
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .filter((path) => /\.(?:md|json)$/i.test(path))
    .sort();
  assert.deepEqual(committedReportSnapshots, []);
});

test("current product, control, architecture, native, release and machine authorities remain present", () => {
  for (const authority of [
    "README.md",
    "AGENTS.md",
    "docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md",
    "docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md",
    "docs/product/ai-first-tracker-model.md",
    "docs/control/README.md",
    "docs/control/PLAIVRA_CURRENT_STATE.md",
    "docs/control/PLAIVRA_MASTER_PLAN.md",
    "docs/control/PLAIVRA_ARCHITECTURE_AUTHORITIES.md",
    "docs/control/PLAIVRA_DECISIONS.md",
    "docs/control/PLAIVRA_DELIVERY_RULES.md",
    "docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md",
    "docs/architecture/canonical-domain-model.md",
    "docs/architecture/migration-ledger-reconciliation.md",
    "docs/chatgpt-app/README.md",
    "docs/chatgpt-app/public-tool-catalog.json",
    "docs/native-readiness/README.md",
    "docs/release/README.md",
    "supabase/migration-ledger.json"
  ]) {
    assert.equal(existsSync(join(root, authority)), true, `${authority} is required authority`);
  }
});

test("tests enforce code and structured contracts instead of Markdown prose", () => {
  const testSources = ["app", "components", "lib", "services", "scripts"]
    .flatMap((directory) => filesUnder(join(root, directory)))
    .filter((path) => /(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs)$/i.test(path));

  const proseCoupling = testSources.filter((path) => readsMarkdownProse(readFileSync(path, "utf8"), path));
  assert.deepEqual(proseCoupling, []);
});
