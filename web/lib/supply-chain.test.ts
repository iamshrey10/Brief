import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const workspace = readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8");
const lockfile = readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8");

/**
 * Each exemption from the rule that refuses very new releases, as a package name and the versions it exempts. pnpm
 * writes these itself when a very new version is installed locally, and nothing tells the person, so they build up.
 */
function exemptions(): { name: string; versions: string[]; line: string }[] {
  const lines = workspace.split("\n");
  const start = lines.findIndex((line) => line.startsWith("minimumReleaseAgeExclude:"));
  if (start === -1) return [];
  const found: { name: string; versions: string[]; line: string }[] = [];
  for (const line of lines.slice(start + 1)) {
    const entry = /^\s+-\s+'?([^'\s]+)'?\s*$/.exec(line);
    if (!entry) break;
    const [name, ...rest] = entry[1].replace(/^(@?[^@]+)@/, "$1\u0000").split("\u0000");
    found.push({ name, versions: rest.join("").split("||").map((v) => v.trim()), line: entry[1] });
  }
  return found;
}

describe("the rule that refuses very new releases", () => {
  it("reads the exemptions in the file, if there are any", () => {
    expect(Array.isArray(exemptions())).toBe(true);
  });

  it("has no exemption for a version that is not in the lockfile, because a stale one only weakens the rule", () => {
    const stale = exemptions().flatMap(({ name, versions }) =>
      versions.filter((version) => !lockfile.includes(`${name}@${version}`)).map((version) => `${name}@${version}`),
    );

    expect(stale).toEqual([]);
  });

  it("is not switched off", () => {
    expect(workspace).not.toMatch(/minimumReleaseAge:\s*0\b/);
  });
});
