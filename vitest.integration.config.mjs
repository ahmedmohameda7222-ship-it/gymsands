import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    include: ["lib/**/*.integration.test.ts", "services/**/*.integration.test.ts"]
  },
  resolve: {
    alias: {
      "@/": new URL("./", import.meta.url).pathname,
      "server-only": new URL("./test/server-only.ts", import.meta.url).pathname
    }
  }
});
