import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it } from "vitest";
import {
  advance,
  counterReset,
  createSim,
  pendingReset,
  run,
  setHaste,
  tickSpeed,
  type HasteState,
} from "../src/lib/ctb.ts";
import { initSimulator, type SimulatorHandle } from "../src/lib/simulator.ts";

// Assignment 1 "interactive explainer" — the mechanically checkable lines of
// the published spec, asserted against the built site:
//   - "static and client-side throughout"
//   - "the visitor does something that changes what they see": the visitor
//     moves an Agility slider or flips a Haste switch, and the counter dials,
//     the next-reset arithmetic and the turn tallies change in response. That
//     is asserted below by driving the real controls in the real built HTML.
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

// ---------------------------------------------------------------------------
// The point of view, as assertions.
//
// The page claims Haste does not make a counter tick down faster; it halves
// the value the counter is reset to. Those two stories predict the same turn
// counts, so counting turns can never tell them apart. These tests go at the
// mechanism directly: the rate is fixed at 1 and identical across Haste
// states, and the reset is what moves.
// ---------------------------------------------------------------------------

const TICKS = 400;

describe("the mechanism: one global rate", () => {
  it("drops every counter by exactly 1 each tick, whatever its Haste state", () => {
    let state = createSim([
      { id: "hasted-fast", name: "Hasted, fast", agility: 200, haste: "haste" },
      { id: "plain-slow", name: "Plain, slow", agility: 20, haste: "normal" },
      { id: "hasted-mid", name: "Hasted, mid", agility: 100, haste: "haste" },
      { id: "slowed", name: "Slowed", agility: 100, haste: "slow" },
    ]);

    for (let tick = 1; tick <= TICKS; tick += 1) {
      const { state: next, events } = advance(state);
      expect(events).toHaveLength(4);
      for (const event of events) {
        expect(
          event.after,
          `tick ${tick}, ${event.id}: the global tick must subtract exactly 1`,
        ).toBe(event.before - 1);
      }
      state = next;
    }
  });

  it("produces a decrement history that Haste cannot tell apart", () => {
    const history = (haste: HasteState): number[] => {
      let state = createSim([{ id: "u", name: "Unit", agility: 120, haste }]);
      const drops: number[] = [];
      for (let i = 0; i < 200; i += 1) {
        const { state: next, events } = advance(state);
        const [event] = events;
        if (event) drops.push(event.before - event.after);
        state = next;
      }
      return drops;
    };

    // Same rate, every tick, in both states — and it is always 1.
    expect(history("haste")).toEqual(history("normal"));
    expect([...new Set(history("haste"))]).toEqual([1]);
  });
});

describe("the mechanism: Haste moves the reset, and only the reset", () => {
  it("halves the reset value", () => {
    for (const agility of [20, 44, 62, 98, 120, 169, 170, 255]) {
      const normal = counterReset(agility, "normal");
      const hasted = counterReset(agility, "haste");
      expect(hasted, `agility ${agility}`).toBe(Math.floor(normal / 2));
    }

    // Tick speed 4: 4 x 3 x 1 = 12 and 4 x 3 x 1/2 = 6. Exactly half, no
    // rounding in the way.
    expect(tickSpeed(98)).toBe(4);
    expect(counterReset(98, "normal")).toBe(12);
    expect(counterReset(98, "haste")).toBe(6);
  });

  it("hands a hasted combatant the half-size counter at the moment it acts", () => {
    let state = createSim([{ id: "u", name: "Unit", agility: 98, haste: "haste" }]);
    expect(state.combatants[0]?.counter).toBe(6);

    for (let tick = 1; tick <= 5; tick += 1) {
      const { state: next, events } = advance(state);
      expect(events[0]?.acted).toBe(false);
      expect(next.combatants[0]?.counter).toBe(6 - tick);
      state = next;
    }

    const { state: acted, events } = advance(state);
    expect(events[0]?.acted).toBe(true);
    expect(events[0]?.after, "it reached zero on the same one-per-tick path").toBe(0);
    expect(events[0]?.reset, "and came back at half size").toBe(6);
    expect(acted.combatants[0]?.counter).toBe(6);
    expect(acted.combatants[0]?.turns).toBe(1);
  });

  it("leaves the live counter untouched when Haste is switched on mid-battle", () => {
    let state = createSim([{ id: "u", name: "Unit", agility: 98, haste: "normal" }]);
    state = run(state, 5);

    const before = state.combatants[0];
    expect(before?.counter).toBe(7);

    state = setHaste(state, "u", "haste");
    const after = state.combatants[0];

    // Nothing at all happens yet. Not the counter, not the cycle the dial is
    // scaled to. Only the value waiting on the far side of the next turn.
    expect(after?.counter).toBe(before?.counter);
    expect(after?.cycle).toBe(before?.cycle);
    expect(after ? pendingReset(after) : 0).toBe(6);

    // The remaining 7 ticks run at the same rate they were already running at.
    for (let tick = 1; tick <= 6; tick += 1) {
      const { state: next, events } = advance(state);
      expect(events[0]?.acted).toBe(false);
      expect(events[0]?.after).toBe(events[0]!.before - 1);
      state = next;
    }

    const { events } = advance(state);
    expect(events[0]?.acted).toBe(true);
    expect(events[0]?.reset).toBe(6);
  });
});

describe("the visible effect the mechanism produces", () => {
  it("gives higher Agility more turns over the same number of ticks", () => {
    const state = run(
      createSim([
        { id: "low", name: "Low", agility: 30, haste: "normal" },
        { id: "mid", name: "Mid", agility: 98, haste: "normal" },
        { id: "high", name: "High", agility: 170, haste: "normal" },
      ]),
      300,
    );
    const [low, mid, high] = state.combatants;

    expect(low?.turns).toBeLessThan(mid?.turns ?? 0);
    expect(mid?.turns).toBeLessThan(high?.turns ?? 0);
  });

  it("gives a hasted combatant twice the turns of the same combatant unhasted", () => {
    const turns = (haste: HasteState): number =>
      run(createSim([{ id: "u", name: "Unit", agility: 98, haste }]), 240).combatants[0]?.turns ?? 0;

    expect(turns("normal")).toBe(20);
    expect(turns("haste")).toBe(40);
    expect(turns("haste")).toBeGreaterThan(turns("normal"));
  });

  it("stops rewarding Agility once tick speed bottoms out at 170", () => {
    expect(tickSpeed(169)).toBe(4);
    expect(tickSpeed(170)).toBe(3);
    expect(tickSpeed(255)).toBe(3);
    expect(counterReset(170, "normal")).toBe(counterReset(255, "normal"));
  });
});

// ---------------------------------------------------------------------------
// The core interaction, driven through the real controls in the built page.
//
// jsdom will not execute the bundled module script, so the test imports the
// same wiring the page imports and points it at dist/index.html. If the markup
// and the controller drift apart, initSimulator throws naming the selector.
// ---------------------------------------------------------------------------

function loadPage(): { doc: Document; handle: SimulatorHandle; window: JSDOM["window"] } {
  const dom = new JSDOM(readFileSync(resolve(DIST, "index.html"), "utf8"));
  const handle = initSimulator(dom.window.document, { autoStart: false });
  if (!handle) throw new Error("dist/index.html has no [data-sim] root");
  return { doc: dom.window.document, handle, window: dom.window };
}

function el<T extends Element>(scope: ParentNode, selector: string): T {
  const found = scope.querySelector<T>(selector);
  if (!found) throw new Error(`no element matching ${selector}`);
  return found;
}

function text(scope: ParentNode, selector: string): string {
  return (el(scope, selector).textContent ?? "").trim();
}

describe("the core interaction, in the built page", () => {
  let doc: Document;
  let window: JSDOM["window"];

  beforeEach(() => {
    ({ doc, window } = loadPage());
  });

  it("ships three combatants, each with a labelled Agility slider and a Haste switch", () => {
    const channels = [...doc.querySelectorAll("[data-unit]")];
    expect(channels).toHaveLength(3);

    for (const channel of channels) {
      const slider = el<HTMLInputElement>(channel, "input[type='range'][data-agility]");
      const label = doc.querySelector(`label[for="${slider.id}"]`);
      expect(label, `${slider.id} needs a label`).toBeTruthy();

      const toggle = el(channel, "[data-haste]");
      expect(toggle.getAttribute("role")).toBe("switch");
      expect(toggle.getAttribute("aria-checked")).toBe("false");

      expect(el(channel, "[data-dial-arc]").getAttribute("d")).toBeTruthy();
      expect(el(channel, "[data-dial-ticks]").childElementCount).toBeGreaterThan(0);
    }
  });

  it("advances the global tick and drops every counter by 1 when the visitor steps", () => {
    const counters = (): number[] =>
      [...doc.querySelectorAll("[data-counter]")].map((node) => Number(node.textContent));

    const before = counters();
    expect(text(doc, "[data-global-tick]")).toBe("0");

    el<HTMLButtonElement>(doc, "[data-step]").click();

    expect(text(doc, "[data-global-tick]")).toBe("1");
    expect(counters()).toEqual(before.map((value) => value - 1));
  });

  it("records one ledger row per tick, and every row reads a drop of 1", () => {
    const step = el<HTMLButtonElement>(doc, "[data-step]");
    for (let i = 0; i < 5; i += 1) step.click();

    const rows = [...doc.querySelectorAll("[data-ledger] .ledger-row")];
    expect(rows).toHaveLength(5);

    for (const row of rows) {
      const cells = [...row.querySelectorAll(".ledger-cell")];
      expect(cells).toHaveLength(3);
      for (const cell of cells) expect(cell.textContent).toContain("−1");
    }
  });

  it("halves the next reset when the visitor flips Haste, without touching the counter", () => {
    // Unit B sits at 98 Agility: tick speed 4, so a reset of 12 that must
    // become 6 the moment the switch is thrown — and not one tick sooner.
    const channel = el(doc, '[data-unit="b"]');
    const toggle = el<HTMLButtonElement>(channel, "[data-haste]");

    expect(text(channel, "[data-tickspeed]")).toBe("4");
    expect(text(channel, "[data-next-reset]")).toBe("12");
    const liveCounter = text(channel, "[data-counter]");

    toggle.click();

    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(text(channel, "[data-next-reset]")).toBe("6");
    expect(text(channel, "[data-haste-factor]")).toBe("1/2");
    expect(text(channel, "[data-counter]"), "the live counter must not move").toBe(liveCounter);
    expect(channel.getAttribute("data-pending")).toBe("true");
  });

  it("only lands the halved counter on that combatant's next turn", () => {
    const channel = el(doc, '[data-unit="b"]');
    el<HTMLButtonElement>(channel, "[data-haste]").click();
    const step = el<HTMLButtonElement>(doc, "[data-step]");

    // Eleven ticks of nothing happening: the counter walks down from 12 at the
    // same one-per-tick it was already on, with the halved reset still pending.
    for (let tick = 1; tick <= 11; tick += 1) {
      step.click();
      expect(text(channel, "[data-counter]"), `tick ${tick}`).toBe(String(12 - tick));
      expect(channel.getAttribute("data-pending")).toBe("true");
    }

    // And on the twelfth it acts, and the ring comes back half the size.
    step.click();
    expect(text(channel, "[data-counter]")).toBe("6");
    expect(text(channel, "[data-turns]")).toBe("1");
    expect(channel.getAttribute("data-pending")).toBe("false");
    expect(el(channel, "[data-dial-ticks]").childElementCount).toBe(6);
  });

  it("re-derives tick speed and the next reset when the visitor drags Agility", () => {
    const channel = el(doc, '[data-unit="a"]');
    const slider = el<HTMLInputElement>(channel, "[data-agility]");

    expect(text(channel, "[data-tickspeed]")).toBe("6");
    expect(text(channel, "[data-next-reset]")).toBe("18");

    slider.value = "170";
    slider.dispatchEvent(new window.Event("input", { bubbles: true }));

    expect(text(channel, "[data-agility-value]")).toBe("170");
    expect(text(channel, "[data-tickspeed]")).toBe("3");
    expect(text(channel, "[data-next-reset]")).toBe("9");

    // ...and stops moving past the floor, which is the page's second claim.
    slider.value = "255";
    slider.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(text(channel, "[data-tickspeed]")).toBe("3");
    expect(text(channel, "[data-next-reset]")).toBe("9");
  });

  it("returns to tick 0 when the visitor resets", () => {
    const step = el<HTMLButtonElement>(doc, "[data-step]");
    for (let i = 0; i < 20; i += 1) step.click();
    expect(text(doc, "[data-global-tick]")).not.toBe("0");

    el<HTMLButtonElement>(doc, "[data-reset]").click();

    expect(text(doc, "[data-global-tick]")).toBe("0");
    expect(doc.querySelectorAll("[data-ledger] .ledger-row")).toHaveLength(0);
    for (const turns of doc.querySelectorAll("[data-turns]")) {
      expect(turns.textContent).toBe("0");
    }
  });
});
