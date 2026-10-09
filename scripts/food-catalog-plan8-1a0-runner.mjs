/**
 * Plan 8 offline entry point using repository-installed Vite SSR transforms.
 * No new CLI dependencies, database connections, or network access.
 *
 * Usage:
 * node scripts/food-catalog-plan8-1a0-runner.mjs --zip /path/release.zip \
 *   --index data/food-catalog/source-locks/plan8-1a0-empty-match-index.json \
 *   --output /tmp/plaivra-plan8-a
 */
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error"
});

try {
  await server.ssrLoadModule("/scripts/food-catalog-plan8-1a0.ts");
} finally {
  await server.close();
}
