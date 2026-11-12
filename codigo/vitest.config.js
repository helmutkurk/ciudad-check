import { defineConfig } from "vitest/config";

// One root config: `npm test` runs every workspace's tests (colocated *.test.ts files).
export default defineConfig({
  test: {
    include: ["{apps,packages,eval,scripts}/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "apps/shell/**"],
    passWithNoTests: true,
    environment: "node",
  },
});
