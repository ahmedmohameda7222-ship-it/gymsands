/** Offline-only Vite SSR entrypoint for Plan 9 USDA Foundation 1A1. */
import { createServer } from "vite";
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error"
});
try {
  await server.ssrLoadModule("/scripts/food-catalog-plan9-1a1.ts");
} finally {
  await server.close();
}
