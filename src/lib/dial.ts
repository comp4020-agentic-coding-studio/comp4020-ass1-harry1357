/**
 * Geometry for the counter dials. Pure functions returning SVG primitives, so
 * the same code renders the initial dial at build time and every update in the
 * browser — one source of truth for where the needle points.
 *
 * The dial is a countdown: the bright arc is the ticks remaining, it always
 * ends at the top of the ring, and the notch chases it there. Reaching the top
 * is the moment the combatant acts.
 *
 * One tick mark per tick of the cycle. That is the whole visual argument —
 * under Haste the ring keeps half its teeth, and the notch travels at exactly
 * the same speed across a shorter scale.
 */

export const VIEW_BOX = 100;
const CENTRE = VIEW_BOX / 2;

export const ARC_RADIUS = 41;
const TICK_OUTER = 37;
const TICK_MINOR_INNER = 33;
const TICK_MAJOR_INNER = 29;
export const BEZEL_RADIUS = 28;

/** Beyond this many teeth the ring stops being countable, so the scale coarsens. */
const MAX_TEETH = 60;

/** A point on the ring, at an angle measured clockwise from the top. */
function point(degrees: number, radius: number): readonly [x: number, y: number] {
  const radians = (degrees * Math.PI) / 180;
  return [
    round(CENTRE + radius * Math.sin(radians)),
    round(CENTRE - radius * Math.cos(radians)),
  ];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fraction(counter: number, cycle: number): number {
  if (cycle <= 0) return 0;
  return Math.min(1, Math.max(0, counter / cycle));
}

export interface DialTick {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly major: boolean;
}

/** One mark per remaining tick, every fifth one long. */
export function dialTicks(cycle: number): DialTick[] {
  const teeth = Math.min(MAX_TEETH, Math.max(1, Math.round(cycle)));
  return Array.from({ length: teeth }, (_, index) => {
    const major = index % 5 === 0;
    const [x1, y1] = point((index / teeth) * 360, TICK_OUTER);
    const [x2, y2] = point(
      (index / teeth) * 360,
      major ? TICK_MAJOR_INNER : TICK_MINOR_INNER,
    );
    return { x1, y1, x2, y2, major };
  });
}

/** The `d` of the remaining-ticks arc: ends at the top, shrinks as it counts down. */
export function remainingArc(counter: number, cycle: number): string {
  const sweep = 360 * fraction(counter, cycle);
  if (sweep <= 0) return "";

  // A single arc cannot close a full circle — its start and end would coincide.
  const clamped = Math.min(sweep, 359.9);
  const [startX, startY] = point(360 - clamped, ARC_RADIUS);
  const [endX, endY] = point(360, ARC_RADIUS);
  const largeArc = clamped > 180 ? 1 : 0;

  return `M ${startX} ${startY} A ${ARC_RADIUS} ${ARC_RADIUS} 0 ${largeArc} 1 ${endX} ${endY}`;
}

/**
 * Where the notch points, in degrees clockwise from the top.
 *
 * Accumulated across turns rather than wrapped at 360, so the CSS rotation
 * always runs forwards and the needle never spins backwards on reset.
 */
export function notchAngle(counter: number, cycle: number, turns: number): number {
  return round(360 * turns + 360 * (1 - fraction(counter, cycle)));
}

/** The tick marks as SVG markup, for `set:html` at build time and innerHTML after. */
export function dialTicksMarkup(cycle: number): string {
  return dialTicks(cycle)
    .map(
      ({ x1, y1, x2, y2, major }) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${
          major ? "dial-tooth is-major" : "dial-tooth"
        }" />`,
    )
    .join("");
}
