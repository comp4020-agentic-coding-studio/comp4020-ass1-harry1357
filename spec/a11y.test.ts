import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";
import type { AxeResults, RunOptions } from "axe-core";

// Nothing in the starter measures accessibility, so this is the sensor.
//
// axe runs inside the jsdom realm rather than against it, which spares the
// dance of shimming a dozen browser globals onto globalThis. It catches
// structural problems: landmarks, labels, roles, heading order, duplicate ids.
//
// It cannot catch contrast. jsdom has no layout and no cascade, so every node
// comes back "incomplete" for `color-contrast` and an enabled rule would look
// like coverage that isn't there. That rule is off here and the palette is
// checked arithmetically below instead.

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core"), "utf8");
const html = readFileSync(resolve("dist/index.html"), "utf8");

interface AxeWindow {
  axe: { run(context: Document, options: RunOptions): Promise<AxeResults> };
}

let results: AxeResults;

beforeAll(async () => {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    virtualConsole,
  });
  dom.window.eval(axeSource);
  const { axe } = dom.window as unknown as AxeWindow;
  results = await axe.run(dom.window.document, {
    rules: { "color-contrast": { enabled: false } },
  });
}, 60_000);

describe("accessibility: axe over the built page", () => {
  it("reports no violations", () => {
    const summary = results.violations.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes
          .map((node) => node.target.join(" "))
          .join("\n  ")}`,
    );
    expect(summary).toEqual([]);
  });

  it("puts every heading, including the h1, inside a landmark", () => {
    // A full-bleed hero dropped between <header> and <main> passes every other
    // check and still strands the h1 outside a region.
    const offenders = results.violations
      .concat(results.incomplete)
      .filter((result) => result.id === "region");
    expect(offenders.map((result) => result.id)).toEqual([]);
  });
});

// --- contrast, done with arithmetic instead of a layout engine --------------

const css = readFileSync(resolve("src/styles/global.css"), "utf8");

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{3,8})`).exec(css);
  if (!match?.[1]) throw new Error(`--${name} is not a plain hex token in global.css`);
  return match[1];
}

function channels(hex: string): [number, number, number] {
  const full =
    hex.length === 4
      ? hex
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe("accessibility: palette contrast", () => {
  const bg = token("bg");
  const panel = token("panel");

  const pairs: readonly [name: string, fg: string, bgName: string, bgValue: string][] = [
    ["text", token("text"), "page", bg],
    ["text", token("text"), "panel", panel],
    ["muted", token("muted"), "page", bg],
    ["muted", token("muted"), "panel", panel],
    ["accent", token("accent"), "page", bg],
    ["accent", token("accent"), "panel", panel],
    ["haste", token("haste"), "page", bg],
    ["haste", token("haste"), "panel", panel],
  ];

  // Every one of these is used at body size somewhere, and muted is used on
  // both surfaces, so all eight have to clear the small-text threshold.
  for (const [name, fg, bgName, bgValue] of pairs) {
    it(`reads --${name} on the ${bgName} surface at 4.5:1 or better`, () => {
      expect(contrast(fg, bgValue)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("draws control boundaries at 3:1 or better", () => {
    // Slider tracks, the Haste switch and the transport buttons are all
    // outlined in --muted for this reason (WCAG 1.4.11); the decorative
    // hairlines around panels are not controls and are exempt.
    expect(contrast(token("muted"), panel)).toBeGreaterThanOrEqual(3);
    expect(contrast(token("muted"), bg)).toBeGreaterThanOrEqual(3);
  });
});
