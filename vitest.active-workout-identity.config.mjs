import { defineConfig, mergeConfig } from "vitest/config";

import unitConfig from "./vitest.unit.config.mjs";

export default mergeConfig(unitConfig, defineConfig({
  test: {
    setupFiles: [
      "./components/workouts/active-workout/active-workout-core-session.identity.setup.ts"
    ]
  }
}));
