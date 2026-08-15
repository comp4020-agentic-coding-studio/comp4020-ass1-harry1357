import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Assignment 1 "interactive explainer" — the mechanically checkable lines of
// the published spec, asserted against the built site:
//   - "static and client-side throughout"
// Everything else in the spec is either already covered by existing
// infrastructure or left to a person:
//   - "deployed and live by the deadline" is CI/ship's job
//   - "the starter's invariant checks pass" — see invariants.test.ts
//   - "it works at both marking viewports" — jsdom has no layout engine, so
//     this can't be an honest vitest test; verify it yourself during dev (see
//     "Verifying the rendered page" in CLAUDE.md) and the marker checks it live
//     at the crit
//   - "evidence of process is in the repo" — see `pnpm check:evidence`
//   - "one strong idea with a point of view, and nothing else" is judged by a
//     person at the crit, not a test
//
// TODO: "the visitor does something that changes what they see — state the
// core interaction plainly enough to write a test for it". That line is an
// instruction to write a test here once the interaction exists: state the
// concrete before/after (what the visitor does, what changes in the DOM) and
// assert it against dist/. Nothing to assert yet because there's no prototype.
const DIST = resolve("dist");

function files(dir: string = DIST): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const allFiles = files();

describe("assignment 1: static, client-side", () => {
  it("ships no server-side build output", () => {
    // A static build's dist/ is just HTML/CSS/JS/assets. A "server" output
    // directory (Astro's SSR adapters emit one) or a script-language file
    // would mean something other than a static site got shipped.
    const serverish = allFiles.filter((path) => /\.(php|py|rb)$/.test(path));
    expect(serverish.map((path) => relative(DIST, path))).toEqual([]);

    const hasServerDir = readdirSync(DIST, { withFileTypes: true }).some(
      (entry) => entry.isDirectory() && entry.name === "server",
    );
    expect(hasServerDir).toBe(false);
  });

  it("every script that ships runs client-side, not templated server-side", () => {
    // A crude but effective proxy: no file in dist/ should reference a
    // server-only API (fs, process.env secrets, a database driver).
    const jsFiles = allFiles.filter((path) => /\.(js|mjs)$/.test(path));
    for (const path of jsFiles) {
      const contents = readFileSync(path, "utf8");
      expect(contents, `${relative(DIST, path)} looks server-side`).not.toMatch(
        /require\(["']fs["']\)|node:fs|process\.env\.\w*(SECRET|KEY|TOKEN)/i,
      );
    }
  });
});
