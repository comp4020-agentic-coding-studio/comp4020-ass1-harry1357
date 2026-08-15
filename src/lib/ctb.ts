/**
 * Final Fantasy X's Conditional Turn-Based system, reduced to the one
 * mechanism this page exists to argue about.
 *
 * The claim: a global tick decrements EVERY combatant's counter by exactly 1,
 * simultaneously, always. Haste never touches that rate. It halves the value
 * the counter is *reset to* after the combatant acts. Same visible outcome
 * (more turns), completely different machine.
 *
 * Everything here is pure and free of the DOM so the claim can be asserted
 * directly — see spec/assignment-1.test.ts.
 *
 * Sourced from the community documentation of FFX's battle mechanics
 * (SinirothX & SClemmons, "Stat Mechanics FAQ", GameFAQs / Neoseeker), which
 * gives the reset as [Tick Speed x Rank x Haste Status], square brackets
 * meaning rounded down.
 *
 * ONE DELIBERATE OMISSION. In the real game a successful Haste cast also halves
 * the target's *current* counter, an immediate partial catch-up on top of the
 * smaller future reset. This model leaves it out, and setHaste() below is
 * explicit about that. The catch-up is a one-off nudge; the reset multiplier is
 * the part that proves Haste isn't a faster clock, and modelling it on its own
 * is what makes the "nothing happens until your next turn" pause observable.
 * The page says so in as many words — see the note in the mechanism section.
 */

/** The status multipliers that scale a counter reset. Haste is the point. */
export type HasteState = "normal" | "haste" | "slow";

export const HASTE_MULTIPLIER: Readonly<Record<HasteState, number>> = {
  haste: 0.5,
  normal: 1,
  slow: 2,
};

/**
 * Every action has a rank; Attack is rank 3, and rank 3 is also what the game's
 * own turn-order forecast assumes for everyone's next move. It is the only rank
 * this page models — the argument is about the haste term, not the rank term.
 */
export const ATTACK_RANK = 3;

/**
 * Agility maps to tick speed in bands, not continuously. Lower tick speed is
 * faster recovery, so this table descends as Agility climbs. Read as
 * [minimum Agility, tick speed]; the first band whose minimum is met wins.
 *
 * Note the top band: at 170 Agility the tick speed bottoms out at 3, and the
 * remaining 85 points of the stat's range buy nothing.
 */
const TICK_SPEED_BANDS: readonly (readonly [minAgility: number, tickSpeed: number])[] = [
  [170, 3],
  [98, 4],
  [62, 5],
  [44, 6],
  [35, 7],
  [29, 8],
  [23, 9],
  [19, 10],
  [17, 11],
  [15, 12],
  [12, 13],
  [10, 14],
  [7, 15],
  [5, 16],
  [4, 20],
  [3, 22],
  [2, 24],
  [1, 26],
  [0, 28],
];

/** The lowest tick speed in the game, and the Agility that first reaches it. */
export const TICK_SPEED_FLOOR = 3;
export const AGILITY_AT_FLOOR = 170;

/** The range of Agility this instrument lets you dial in. */
export const AGILITY_MIN = 10;
export const AGILITY_MAX = 255;

export function tickSpeed(agility: number): number {
  const agi = Math.min(255, Math.max(0, Math.floor(agility)));
  for (const [minAgility, speed] of TICK_SPEED_BANDS) {
    if (agi >= minAgility) return speed;
  }
  return 28;
}

/**
 * The value a counter is set to after acting: [tickSpeed x rank x haste].
 *
 * This — and only this — is what Haste changes.
 */
export function counterReset(
  agility: number,
  haste: HasteState,
  rank: number = ATTACK_RANK,
): number {
  return Math.floor(tickSpeed(agility) * rank * HASTE_MULTIPLIER[haste]);
}

export interface CombatantConfig {
  readonly id: string;
  readonly name: string;
  readonly agility: number;
  readonly haste: HasteState;
}

export interface Combatant extends CombatantConfig {
  /** Ticks remaining before this combatant acts. */
  readonly counter: number;
  /**
   * The value the counter was reset to at the start of the cycle it is
   * currently in. This is the dial's scale, and it deliberately does NOT move
   * when you toggle Haste mid-cycle — the new reset only lands on the next
   * action, which is exactly the thing the page is trying to show you.
   */
  readonly cycle: number;
  /**
   * Whether the reset that produced the current cycle was a hasted one. Not the
   * same as `haste === "haste"`: flip the switch mid-cycle and the status is on
   * while the ring you are looking at is still the un-hasted one. The page
   * colours the dial by this, not by the status, so brass on the ring always
   * means "this ring is the halved one" rather than "the flag is set".
   */
  readonly cycleHasted: boolean;
  readonly turns: number;
}

export interface SimState {
  readonly tick: number;
  readonly combatants: readonly Combatant[];
}

/** What one global tick did to one combatant. */
export interface TickEvent {
  readonly id: string;
  /** Counter before the tick. */
  readonly before: number;
  /** Counter after the global decrement, before any reset. Always before - 1. */
  readonly after: number;
  readonly acted: boolean;
  /** The value the counter was reset to, if this combatant acted. */
  readonly reset: number | null;
}

export interface TickResult {
  readonly state: SimState;
  readonly events: readonly TickEvent[];
}

/** The reset a combatant *would* get if they acted right now. */
export function pendingReset(combatant: CombatantConfig): number {
  return counterReset(combatant.agility, combatant.haste);
}

export function createSim(configs: readonly CombatantConfig[]): SimState {
  return {
    tick: 0,
    combatants: configs.map((config) => {
      const start = pendingReset(config);
      return {
        ...config,
        counter: start,
        cycle: start,
        cycleHasted: config.haste === "haste",
        turns: 0,
      };
    }),
  };
}

/**
 * One global tick.
 *
 * Every counter drops by exactly 1 — there is no per-combatant rate anywhere in
 * this function, and no reading of `haste` before the subtraction. Anyone who
 * lands on 0 acts and takes a fresh counter. Combatants are resolved in
 * declaration order, which is the turn order used to break ties when several
 * reach 0 on the same tick.
 */
export function advance(state: SimState): TickResult {
  const events: TickEvent[] = [];

  const combatants = state.combatants.map((combatant) => {
    const before = combatant.counter;
    const after = before - 1;
    const acted = after <= 0;
    const reset = acted ? pendingReset(combatant) : null;

    events.push({ id: combatant.id, before, after, acted, reset });

    if (reset === null) return { ...combatant, counter: after };
    return {
      ...combatant,
      counter: reset,
      cycle: reset,
      cycleHasted: combatant.haste === "haste",
      turns: combatant.turns + 1,
    };
  });

  return { state: { tick: state.tick + 1, combatants }, events };
}

function update(
  state: SimState,
  id: string,
  change: (combatant: Combatant) => Combatant,
): SimState {
  return {
    ...state,
    combatants: state.combatants.map((c) => (c.id === id ? change(c) : c)),
  };
}

/**
 * Toggle Haste mid-battle. It leaves `counter` and `cycle` alone on purpose:
 * nothing at all happens until this combatant's next turn, and then the counter
 * comes back half the size. That delay is the evidence.
 *
 * The real game would also halve `counter` here (see the omission noted at the
 * top of this file). Adding that back is a one-line change — but it would hide
 * the pause this page exists to show, so don't do it by accident.
 */
export function setHaste(state: SimState, id: string, haste: HasteState): SimState {
  return update(state, id, (c) => ({ ...c, haste }));
}

/** Same contract as setHaste: changes the next reset, never the live counter. */
export function setAgility(state: SimState, id: string, agility: number): SimState {
  const clamped = Math.min(AGILITY_MAX, Math.max(AGILITY_MIN, Math.round(agility)));
  return update(state, id, (c) => ({ ...c, agility: clamped }));
}

/** Run n ticks and hand back the final state — used by the tests. */
export function run(state: SimState, ticks: number): SimState {
  let current = state;
  for (let i = 0; i < ticks; i += 1) current = advance(current).state;
  return current;
}
