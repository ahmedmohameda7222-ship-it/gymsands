import { defineConfig } from "vitest/config";

// The full unit suite has grown beyond the default V8 worker heap while all
// assertions remain green. Vitest forks inherit NODE_OPTIONS from this config
// process, so give only unit-test workers bounded headroom without changing
// test semantics or broad workflow resource policy.
const unitWorkerHeap = "--max-old-space-size=5120";
if (!process.env.NODE_OPTIONS?.includes("--max-old-space-size")) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, unitWorkerHeap]
    .filter(Boolean)
    .join(" ");
}

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "services/**/*.test.ts",
      "app/**/*.test.ts",
      "components/**/*.test.ts",
      "components/**/*.test.tsx"
    ],
    exclude: ["**/*.integration.test.ts"]
  },
  resolve: {
    alias: {
      "@/": new URL("./", import.meta.url).pathname,
      "server-only": new URL("./test/server-only.ts", import.meta.url).pathname
    }
  }
});
