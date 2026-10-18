import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

// Read by Auth.js itself, so no line of our own code mentions them.
const READ_BY_AUTH_JS = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"];
// Set by the platform or the framework, never by a person.
const NOT_SET_BY_A_PERSON = new Set(["NODE_ENV", "PORT", "HOSTNAME", "NEXT_RUNTIME", "CI"]);

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (name === "node_modules" || name === ".next" || name === "e2e") return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

function namesUsedByTheCode(): Set<string> {
  const names = new Set<string>();
  for (const file of sourceFiles(ROOT)) {
    for (const match of readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      if (!NOT_SET_BY_A_PERSON.has(match[1])) names.add(match[1]);
    }
  }
  return names;
}

const example = readFileSync(join(ROOT, ".env.example"), "utf8");
const lines = example.split("\n").map((line) => line.trim());

function namesInTheExample(): string[] {
  return lines
    .filter((line) => line !== "" && !line.startsWith("#") && line.includes("="))
    .map((line) => line.split("=")[0].trim());
}

describe("web/.env.example", () => {
  it("has an entry for every variable the code reads and every one Auth.js reads", () => {
    const needed = new Set([...namesUsedByTheCode(), ...READ_BY_AUTH_JS]);

    expect([...needed].filter((name) => !namesInTheExample().includes(name))).toEqual([]);
  });

  it("lists nothing the web app does not read", () => {
    const known = new Set([...namesUsedByTheCode(), ...READ_BY_AUTH_JS, "AUTH_TRUST_HOST"]);

    expect(namesInTheExample().filter((name) => !known.has(name))).toEqual([]);
  });

  it("lists no variable twice", () => {
    const names = namesInTheExample();

    expect(new Set(names).size).toBe(names.length);
  });

  it("holds no value that could be a real secret", () => {
    for (const line of lines) {
      if (line.startsWith("#") || !line.includes("=")) continue;
      const [name, ...rest] = line.split("=");
      const value = rest.join("=").trim();
      if (/SECRET|KEY|PASSWORD|TOKEN/.test(name)) {
        expect(value === "" || value.startsWith("change-me"), `${name} has a real looking value`).toBe(true);
      }
    }
  });

  it("explains that Auth.js needs AUTH_TRUST_HOST outside Vercel", () => {
    expect(example).toMatch(/AUTH_TRUST_HOST/);
    expect(example).toMatch(/Vercel/);
  });
});
