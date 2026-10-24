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
    // `pnpm test:coverage`. Only the app's own code is measured. Left out: the tests themselves, shadcn/ui's
    // generated Button (a library file we do not edit), and three files that only wire something up, which a unit
    // test cannot say anything about and the browser tests (`pnpm e2e`) exercise for real: the sign in middleware
    // (a one line re-export, proven by the signed out redirect tests), the Auth.js route (a one line re-export, used by
    // every sign in) and the theme provider (a wrapper, proven by the theme tests).
    coverage: {
      provider: "v8",
      include: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.ts", "auth.ts", "middleware.ts"],
      exclude: [
        "**/*.test.*",
        "**/*.d.ts",
        "components/ui/**",
        "app/layout.tsx",
        "middleware.ts",
        "app/api/auth/**",
        "components/theme-provider.tsx",
      ],
      reporter: ["text"],
      // A floor, a little under what the tests reach today, so a drop fails the run. Not a goal.
      thresholds: { statements: 97, branches: 95, functions: 95, lines: 97 },
    },
  },
});
