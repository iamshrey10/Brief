import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same "@/" shortcut the app itself uses, so components import the same way in tests.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: [
      "*.test.ts",
      "lib/**/*.test.ts",
      "components/**/*.test.tsx",
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
    ],
    // `pnpm test:coverage`. Only the app's own code is measured: not the tests, not the browser test helpers, and
    // not shadcn/ui's generated Button, which is a library file we do not edit.
    coverage: {
      provider: "v8",
      all: true,
      include: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.ts", "auth.ts", "middleware.ts"],
      exclude: ["**/*.test.*", "components/ui/**", "app/layout.tsx", "**/*.d.ts"],
      reporter: ["text"],
    },
  },
});
