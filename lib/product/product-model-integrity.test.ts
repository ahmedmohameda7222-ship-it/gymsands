import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const runtimeRoots = ["app", "components", "lib/i18n", "lib/mcp", "services"];
const runtimeExtensions = new Set([".ts", ".tsx"]);
const excludedPathParts = new Set(["__tests__", "docs", "migrations"]);

type ForbiddenCopyFamily = {
  label: string;
  pattern: RegExp;
};

const forbiddenCopyFamilies: ForbiddenCopyFamily[] = [
  { label: "structured-result approval", pattern: /approve\s+(?:the\s+)?structured\s+result/giu },
  { label: "generic approval status", pattern: /needs\s+approval/giu },
  { label: "reviewed-meal approval", pattern: /approve\s+(?:the\s+)?reviewed\s+meal/giu },
  { label: "normal-flow approval before persistence", pattern: /approval\s+before\s+(?:tracking|saving)/giu },
  { label: "normal-flow user approval step", pattern: /(?:label|title)\s*:\s*["'`]user\s+approval["'`]/giu },
  { label: "approve-result workflow", pattern: /(?:->|-&gt;)\s*approve\s+(?:the\s+)?result\s*(?:->|-&gt;)/giu },
  { label: "post-approval tracking", pattern: /after\s+approval[^\n]{0,120}(?:stor|sav|track|visualiz)/giu },
  { label: "ChatGPT plan export to Plaivra", pattern: /create(?:\s+your)?[^\n]{0,80}plans?[^\n]{0,80}(?:in|with)\s+chatgpt[^\n]{0,100}export(?:\s+it)?\s+to\s+plaivra/giu },
  { label: "external plan import workflow", pattern: /create[^\n]{0,120}plans?\s+externally[^\n]{0,120}(?:then\s+)?import/giu },
  { label: "approved ChatGPT result import", pattern: /import\s+(?:the\s+)?approved\s+chatgpt\s+results?/giu },
  { label: "generic plan import call to action", pattern: /\bimport\s+(?:a\s+|your\s+)?(?:workout\s+)?plan\b/giu },
  { label: "AI import preparation", pattern: /ai\s+can\s+help\s+prepare\s+imports?/giu },
  { label: "AI data waiting for review before save", pattern: /(?:chatgpt|ai)[^\n]{0,180}(?:generated\s+)?(?:result|data|meal|plan)[^\n]{0,180}(?:review(?:ed)?|approv(?:al|e|ed))[^\n]{0,100}(?:before|until)[^\n]{0,100}(?:sav(?:e|ed|ing)|track(?:ed|ing)?)/giu },
  { label: "English ChatGPT import navigation", pattern: /["'`](?:AI\s*&\s*Imports|ChatGPT\s+import|Import\s+workout\s+plan)["'`]/giu },
  { label: "German ChatGPT import navigation", pattern: /["'`](?:KI\s*&\s*Importe|ChatGPT-Import|Trainingsplan\s+importieren)["'`]/giu },
  { label: "Arabic ChatGPT import navigation", pattern: /["'`](?:الذكاء الاصطناعي والاستيراد|استيراد\s+ChatGPT|استيراد\s+خطة\s+تمرين)["'`]/gu },
  { label: "Arabic structured-result review", pattern: /راجع\s+النتيجة\s+المنظمة|للمراجعة\s+قبل\s+حفظ|بعد\s+الموافقة|موافقة\s+قبل\s+(?:الحفظ|التتبع)/gu }
];

function isRuntimeSource(path: string) {
  const normalizedParts = path.replaceAll("\\", "/").split("/");
  const fileName = normalizedParts.at(-1) ?? "";
  return (
    runtimeExtensions.has(extname(fileName)) &&
    !fileName.match(/\.(?:test|spec)\.tsx?$/) &&
    !normalizedParts.some((part) => excludedPathParts.has(part))
  );
}

function collectRuntimeSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectRuntimeSources(path);
    return isRuntimeSource(path) ? [path] : [];
  });
}

function lineNumberAt(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

function findRetiredCopy(source: string) {
  return forbiddenCopyFamilies.flatMap(({ label, pattern }) => {
    pattern.lastIndex = 0;
    return Array.from(source.matchAll(pattern), (match) => ({
      label,
      index: match.index,
      excerpt: match[0].replace(/\s+/g, " ").trim()
    }));
  });
}

function normalizedSource(path: string) {
  return readFileSync(path, "utf8").toLowerCase().replace(/\s+/g, " ");
}

describe("Plaivra product-model runtime integrity", () => {
  it("contains no active copy that restores a generic approval or ChatGPT import queue", () => {
    const findings = runtimeRoots
      .flatMap(collectRuntimeSources)
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return findRetiredCopy(source).map((finding) =>
          `${relative(process.cwd(), path).replaceAll("\\", "/")}:${lineNumberAt(source, finding.index)} [${finding.label}] ${finding.excerpt}`
        );
      });

    expect(findings, findings.join("\n")).toEqual([]);
  });

  it("does not confuse legitimate consent, confirmation, export, or safety language with the retired workflow", () => {
    const allowedRuntimeCopy = [
      "Approve Plaivra access to the scopes listed on this OAuth consent screen.",
      "Confirm account deletion. This destructive action cannot be undone.",
      "Export your Plaivra data as JSON and CSV.",
      "Review readiness, form, and safety constraints before changing today's workout.",
      "Import an exercise record from the approved public catalogue."
    ];

    for (const copy of allowedRuntimeCopy) expect(findRetiredCopy(copy), copy).toEqual([]);
  });

  it("describes authorized direct-tool execution on landing and onboarding", () => {
    for (const path of ["app/page.tsx", "app/(private)/onboarding/page.tsx"]) {
      const source = normalizedSource(path);
      expect(source, `${path} must explain the ChatGPT connection`).toMatch(/chatgpt.{0,180}connect|connect.{0,180}chatgpt/);
      expect(source, `${path} must explain limited, scoped, or authorized access`).toMatch(/limited permission|scoped permission|authorized (?:plaivra )?(?:context|access)|grant.{0,80}permission/);
      expect(source, `${path} must identify structured tool execution`).toMatch(/(?:plaivra|structured) tool/);
      expect(source, `${path} must explain the persisted tracking outcome`).toMatch(/(?:tool|chatgpt).{0,220}(?:sav|stor|track|visualiz)/);
    }
  });
});
