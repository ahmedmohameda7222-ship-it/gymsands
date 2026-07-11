import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["lib/**/*.test.ts", "services/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts"]
  },
  resolve: {
    alias: {
      "@/": new URL("./", import.meta.url).pathname,
      "server-only": new URL("./test/server-only.ts", import.meta.url).pathname
    }
  }
});
