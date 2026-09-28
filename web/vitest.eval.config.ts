import { defineConfig } from "vitest/config";
import path from "path";

// Live evals hit real APIs and cost money, so they never run in `npm test` / CI.
export default defineConfig({
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    setupFiles: ["evals/setup-env.ts"],
    testTimeout: 300_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
