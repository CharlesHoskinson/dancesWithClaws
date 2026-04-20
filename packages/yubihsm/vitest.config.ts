import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../");

export default defineConfig({
  test: {
    testTimeout: 120_000,
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: [path.resolve(repoRoot, "test/setup.ts")],
  },
});
