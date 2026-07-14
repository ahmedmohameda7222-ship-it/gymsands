import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXACT_PACKAGE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i;

export function installedNextVersion(root) {
  const packagePath = resolve(root, "node_modules", "next", "package.json");
  const version = JSON.parse(readFileSync(packagePath, "utf8")).version;
  if (typeof version !== "string" || !EXACT_PACKAGE_VERSION.test(version)) {
    throw new Error("Installed Next.js package does not expose an exact version.");
  }
  return version;
}
