/**
 * Wires the CTB engine to the page. The engine (./ctb.ts) knows nothing about
 * the DOM and this file holds no rules about the game — it reads the initial
 * roster out of the markup, renders state, and turns events into state changes.
 *
 * It takes a Document rather than reaching for globals so the tests can run the
 * real wiring against the real built HTML under jsdom. If a hook is missing it
 * throws naming the selector, because a silent no-op here would look exactly
 * like a page that simply isn't very interactive.
 */

import {
  advance,
  createSim,
  pendingReset,
  setAgility,
  setHaste,
  tickSpeed,
  type CombatantConfig,
  type Combatant,
  type HasteState,
  type SimState,
  type TickEvent,
} from "./ctb.ts";
import { dialTicksMarkup, ghostTicksMarkup, notchAngle, remainingArc } from "./dial.ts";

export const TICK_MS = 320;
export const LEDGER_ROWS = 7;

export interface SimulatorOptions {
  /** Defaults to true, but never under `prefers-reduced-motion`. */
  readonly autoStart?: boolean;
  readonly tickMs?: number;
}

export interface SimulatorHandle {
  step(): void;
  play(): void;
  pause(): void;
  restart(): void;
  isRunning(): boolean;
  getState(): SimState;
  destroy(): void;
}

interface ChannelElements {
  readonly config: CombatantConfig;
  readonly letter: string;
  readonly root: HTMLElement;
  readonly agility: HTMLInputElement;
  readonly agilityValue: HTMLElement;
  readonly haste: HTMLElement;
  readonly ticks: SVGGElement;
  readonly ghost: SVGGElement;
  readonly arc: SVGPathElement;
  readonly notch: SVGGElement;
  readonly counter: HTMLElement;
  readonly turns: HTMLElement;
  readonly tickSpeedOut: HTMLElement;
  readonly nextReset: HTMLElement;
  readonly hasteFactor: HTMLElement;
}

function need<T extends Element>(scope: ParentNode, selector: string): T {
  const found = scope.querySelector<T>(selector);
  if (!found) throw new Error(`simulator: no element matching ${selector}`);
  return found;
}

function hasteOf(toggle: Element): HasteState {
  return toggle.getAttribute("aria-checked") === "true" ? "haste" : "normal";
}

function pad(value: number): string {
  return String(value).padStart(2, " ");
}

export function initSimulator(
  doc: Document,
  options: SimulatorOptions = {},
): SimulatorHandle | null {
  const found = doc.querySelector<HTMLElement>("[data-sim]");
  if (!found) return null;
  // Annotated rather than narrowed: hoisted function declarations below close
  // over this, and TypeScript won't carry a flow narrowing into them.
  const root: HTMLElement = found;

  const view = doc.defaultView;
  const tickMs = options.tickMs ?? TICK_MS;
  const prefersReducedMotion =
    view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const channels: ChannelElements[] = [...root.querySelectorAll<HTMLElement>("[data-unit]")].map(
    (element) => {
      const id = element.dataset.unit ?? "";
      return {
        config: {
          id,
          name: element.dataset.name ?? id,
          agility: Number(need<HTMLInputElement>(element, "[data-agility]").value),
          haste: hasteOf(need(element, "[data-haste]")),
        },
        letter: element.dataset.letter ?? id.toUpperCase(),
        root: element,
        agility: need<HTMLInputElement>(element, "[data-agility]"),
        agilityValue: need<HTMLElement>(element, "[data-agility-value]"),
        haste: need<HTMLElement>(element, "[data-haste]"),
        ticks: need<SVGGElement>(element, "[data-dial-ticks]"),
        ghost: need<SVGGElement>(element, "[data-dial-ghost]"),
        arc: need<SVGPathElement>(element, "[data-dial-arc]"),
        notch: need<SVGGElement>(element, "[data-dial-notch]"),
        counter: need<HTMLElement>(element, "[data-counter]"),
        turns: need<HTMLElement>(element, "[data-turns]"),
        tickSpeedOut: need<HTMLElement>(element, "[data-tickspeed]"),
        nextReset: need<HTMLElement>(element, "[data-next-reset]"),
        hasteFactor: need<HTMLElement>(element, "[data-haste-factor]"),
      };
    },
  );

  if (channels.length === 0) throw new Error("simulator: no [data-unit] channels in the markup");

  const globalTick = need<HTMLElement>(root, "[data-global-tick]");
  const playButton = need<HTMLElement>(root, "[data-play]");
  const stepButton = need<HTMLElement>(root, "[data-step]");
  const resetButton = need<HTMLElement>(root, "[data-reset]");
  const ledger = need<HTMLElement>(root, "[data-ledger]");
  const status = need<HTMLElement>(root, "[data-status]");

  const initial = channels.map((channel) => channel.config);
  let state = createSim(initial);
  let timer: number | null = null;

  function announce(message: string): void {
    status.textContent = message;
  }

  function renderChannel(channel: ChannelElements, combatant: Combatant, acted: boolean): void {
    const speed = tickSpeed(combatant.agility);
    const next = pendingReset(combatant);
    const hasted = combatant.haste === "haste";

    channel.counter.textContent = String(combatant.counter);
    channel.turns.textContent = String(combatant.turns);
    channel.agilityValue.textContent = String(combatant.agility);
    channel.tickSpeedOut.textContent = String(speed);
    channel.nextReset.textContent = String(next);
    channel.hasteFactor.textContent = hasted ? "1/2" : "1";

    channel.agility.setAttribute(
      "aria-valuetext",
      `${combatant.agility} agility, tick speed ${speed}`,
    );
    channel.haste.setAttribute("aria-checked", String(hasted));

    channel.root.dataset.hasted = String(hasted);
    channel.root.dataset.acting = String(acted);
    // The ring is coloured by the reset that produced it, not by the status
    // flag, so brass never appears on a cycle that is not actually halved.
    channel.root.dataset.cycleHasted = String(combatant.cycleHasted);
    // The dial is still scaled to the cycle it is in; a Haste toggled mid-cycle
    // only lands on the next action. Flagging that lets the CSS say so.
    channel.root.dataset.pending = String(next !== combatant.cycle);

    if (channel.ticks.dataset.cycle !== String(combatant.cycle)) {
      channel.ticks.innerHTML = dialTicksMarkup(combatant.cycle);
      channel.ticks.dataset.cycle = String(combatant.cycle);
    }

    // The preview scale: what this ring becomes at the next reset. Drawn for
    // the whole cycle before it happens, and cleared the moment it lands.
    const ghostKey = `${next}/${combatant.cycle}`;
    if (channel.ghost.dataset.key !== ghostKey) {
      channel.ghost.innerHTML = ghostTicksMarkup(next, combatant.cycle);
      channel.ghost.dataset.key = ghostKey;
    }

    channel.arc.setAttribute("d", remainingArc(combatant.counter, combatant.cycle));

    // The attribute keeps the markup self-describing (and correct with CSS
    // off); the inline style is the one CSS will transition.
    const angle = notchAngle(combatant.counter, combatant.cycle, combatant.turns);
    channel.notch.setAttribute("transform", `rotate(${angle} 50 50)`);
    channel.notch.style.transform = `rotate(${angle}deg)`;
  }

  function render(events: readonly TickEvent[] = []): void {
    globalTick.textContent = String(state.tick);
    for (const [index, combatant] of state.combatants.entries()) {
      const channel = channels[index];
      if (!channel) continue;
      renderChannel(channel, combatant, events.some((e) => e.id === combatant.id && e.acted));
    }
  }

  function appendLedgerRow(events: readonly TickEvent[]): void {
    const row = doc.createElement("li");
    row.className = "ledger-row";

    const label = doc.createElement("span");
    label.className = "ledger-tick";
    label.textContent = String(state.tick).padStart(3, "0");
    row.append(label);

    for (const [index, event] of events.entries()) {
      const channel = channels[index];
      const combatant = state.combatants[index];
      if (!channel || !combatant) continue;

      const cell = doc.createElement("span");
      cell.className = event.acted ? "ledger-cell is-acting" : "ledger-cell";
      if (event.acted && combatant.haste === "haste") cell.classList.add("is-hasted");
      cell.textContent = event.acted
        ? `${channel.letter} −1 → 0 (${event.reset})`
        : `${channel.letter} −1 → ${pad(event.after)}`;
      row.append(cell);
    }

    ledger.prepend(row);
    while (ledger.childElementCount > LEDGER_ROWS) ledger.lastElementChild?.remove();
  }

  function step(): void {
    const result = advance(state);
    state = result.state;
    render(result.events);
    appendLedgerRow(result.events);
  }

  function isRunning(): boolean {
    return timer !== null;
  }

  function setPlayLabel(): void {
    playButton.textContent = isRunning() ? "Pause" : "Play";
    playButton.setAttribute(
      "aria-label",
      isRunning() ? "Pause the global tick" : "Play the global tick",
    );
  }

  function play(): void {
    if (isRunning() || !view) return;
    timer = view.setInterval(step, tickMs);
    setPlayLabel();
  }

  function pause(): void {
    if (timer === null) return;
    view?.clearInterval(timer);
    timer = null;
    setPlayLabel();
  }

  function restart(): void {
    const wasRunning = isRunning();
    pause();
    state = createSim(
      state.combatants.map(({ id, name, agility, haste }) => ({ id, name, agility, haste })),
    );
    ledger.replaceChildren();
    // The notch angle accumulates across turns, so winding it back to zero
    // would spin it the wrong way. Skip the transition for exactly one frame.
    root.dataset.settling = "true";
    render();
    const clear = (): void => {
      delete root.dataset.settling;
    };
    if (typeof view?.requestAnimationFrame === "function") view.requestAnimationFrame(clear);
    else clear();
    announce("Simulation reset to tick 0.");
    if (wasRunning) play();
  }

  for (const [index, channel] of channels.entries()) {
    channel.agility.addEventListener("input", () => {
      state = setAgility(state, channel.config.id, Number(channel.agility.value));
      render();
    });

    channel.haste.addEventListener("click", () => {
      const next: HasteState = hasteOf(channel.haste) === "haste" ? "normal" : "haste";
      state = setHaste(state, channel.config.id, next);
      render();
      const combatant = state.combatants[index];
      announce(
        next === "haste"
          ? `Haste on for ${channel.config.name}. Its counter is unchanged at ${
              combatant?.counter ?? 0
            }; the next reset is ${combatant ? pendingReset(combatant) : 0}.`
          : `Haste off for ${channel.config.name}.`,
      );
    });
  }

  playButton.addEventListener("click", () => {
    if (isRunning()) pause();
    else play();
  });

  stepButton.addEventListener("click", () => {
    pause();
    step();
  });

  resetButton.addEventListener("click", restart);

  render();
  setPlayLabel();

  const shouldStart = (options.autoStart ?? true) && !prefersReducedMotion;
  if (shouldStart) play();
  else announce("Paused. Use Play, or Step one tick, to run the simulation.");

  return {
    step,
    play,
    pause,
    restart,
    isRunning,
    getState: () => state,
    destroy: pause,
  };
}
