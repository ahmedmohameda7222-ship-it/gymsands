import { readFile, writeFile } from "node:fs/promises";

const target = "scripts/.aw1b-locale-qa.mjs";
let source = await readFile(target, "utf8");
const original = '  const context = await browser.newContext({ viewport: renderedViewport, reducedMotion: "reduce", colorScheme: theme });';
const replacement = `${original}\n  await context.addCookies([{ name: "plaivra.language.v1", value: language, url: baseUrl, sameSite: "Lax" }]);`;
if (!source.includes(original)) throw new Error("Locale QA context creation target not found");
source = source.replace(original, replacement);
await writeFile(target, source, "utf8");
console.log("Locale cookie seeding added to focused QA runner.");
await import("./aw1b-locale-qa-settings-fix.mjs");
