import { defineConfig } from "vitest/config";

const identityTest = "components/workouts/active-workout/active-workout-core-session.identity.test.tsx";
const isolateIdentityHarness = process.argv.includes(identityTest) && !process.argv.includes("--exclude");

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
    exclude: ["**/*.integration.test.ts"],
    setupFiles: isolateIdentityHarness
      ? ["./components/workouts/active-workout/active-workout-core-session.identity.setup.ts"]
      : []
  },
  resolve: {
    alias: {
      "@/": new URL("./", import.meta.url).pathname,
      "server-only": new URL("./test/server-only.ts", import.meta.url).pathname
    }
  }
});
