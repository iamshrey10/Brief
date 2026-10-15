import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = join(__dirname, "..", "app", "api", "backend");

function routeFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

describe("every route that talks to the backend", () => {
  const files = routeFiles(ROUTES);

  it("finds the routes it is meant to check", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files.map((file) => [file.slice(ROUTES.length + 1), file]))(
    "%s goes through the shared proxy and never calls the backend itself",
    (_name, file) => {
      const source = readFileSync(file, "utf8");

      expect(source).toContain('from "@/lib/proxy"');
      expect(source).not.toMatch(/\bfetch\(/);
      expect(source).not.toContain("require-session");
    },
  );
});
