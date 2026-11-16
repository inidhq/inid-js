import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The unit and service tests; the browser tests in e2e/ run with Playwright (pnpm e2e).
// The workspace's SDK packages resolve to their source, as in tsconfig.json's paths (no build needed).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@inid\/server\/express$/, replacement: here("./packages/server/src/express.ts") },
      { find: /^@inid\/server$/, replacement: here("./packages/server/src/index.ts") },
    ],
  },
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
});
