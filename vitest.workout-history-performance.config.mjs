import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "scripts/workout-history-performance.integration.test.ts",
    ],
    exclude: [
      "node_modules/**",
      "e2e/**",
    ],
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@/": new URL("./", import.meta.url).pathname,
      "server-only": new URL("./test/server-only.ts", import.meta.url).pathname,
    },
  },
});
