// Where the moon is in its month, from Jean Meeus, *Astronomical Algorithms*
// (2nd ed.): its phase angle at any instant (ch. 48, good to a fraction of a
// degree) and the instants of its four phases (ch. 49, good to a minute or
// two). Only the compiler runs this; the panel is handed the answers.

const RAD = Math.PI / 180;
const sin = (deg: number) => Math.sin(deg * RAD);
const cos = (deg: number) => Math.cos(deg * RAD);
const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** Unix seconds ↔ Julian Day. */
const JD_EPOCH = 2440587.5;
const toJd = (epoch: number) => epoch / 86400 + JD_EPOCH;
const fromJd = (jd: number) => (jd - JD_EPOCH) * 86400;

/** Terrestrial minus universal time: about 69 s through the 2020s, gaining under a second a year. */
function deltaT(jd: number): number {
  const year = 2000 + (jd - 2451545) / 365.25;
  return 69 + 0.5 * (year - 2025);
}

/**
 * How far the moon is round its month at `epoch`: 0 new, 90 first quarter,
 * 180 full, 270 last quarter. The sun-moon elongation, corrected to the
 * phase angle (Meeus 48.4), so `lit` is what is actually lit.
 */
export function phaseAt(epoch: number): { angle: number; lit: number } {
  const jd = toJd(epoch);
  const T = (jd + deltaT(jd) / 86400 - 2451545) / 36525;
  const D = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T * T * T) / 545868 - (T * T * T * T) / 113065000);
  const M = norm(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + (T * T * T) / 24490000);
  const Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + (T * T * T) / 69699 - (T * T * T * T) / 14712000);
  const i = 180 - D - 6.289 * sin(Mp) + 2.1 * sin(M) - 1.274 * sin(2 * D - Mp) - 0.658 * sin(2 * D) - 0.214 * sin(2 * Mp) - 0.11 * sin(D);
  return { angle: norm(180 - i), lit: (1 + cos(i)) / 2 };
}

/** 0 new moon, 1 first quarter, 2 full moon, 3 last quarter. */
export type Quarter = 0 | 1 | 2 | 3;

// Meeus table 49.A: [coefficient, power of E, M, M′, F, Ω] — the argument is
// mM + m′M′ + fF + oΩ. The new and full moon share every term past their first
// seven; the quarters have their own.
type Term = [number, number, number, number, number, number];
const SHARED: Term[] = [
  [-0.00111, 0, 0, 1, -2, 0], [-0.00057, 0, 0, 1, 2, 0], [0.00056, 1, 1, 2, 0, 0], [-0.00042, 0, 0, 3, 0, 0],
  [0.00042, 1, 1, 0, 2, 0], [0.00038, 1, 1, 0, -2, 0], [-0.00024, 1, -1, 2, 0, 0], [-0.00017, 0, 0, 0, 0, 1],
  [-0.00007, 0, 2, 1, 0, 0], [0.00004, 0, 0, 2, -2, 0], [0.00004, 0, 3, 0, 0, 0], [0.00003, 0, 1, 1, -2, 0],
  [0.00003, 0, 0, 2, 2, 0], [-0.00003, 0, 1, 1, 2, 0], [0.00003, 0, -1, 1, 2, 0], [-0.00002, 0, -1, 1, -2, 0],
  [-0.00002, 0, 1, 3, 0, 0], [0.00002, 0, 0, 4, 0, 0],
];
const NEW: Term[] = [
  [-0.4072, 0, 0, 1, 0, 0], [0.17241, 1, 1, 0, 0, 0], [0.01608, 0, 0, 2, 0, 0], [0.01039, 0, 0, 0, 2, 0],
  [0.00739, 1, -1, 1, 0, 0], [-0.00514, 1, 1, 1, 0, 0], [0.00208, 2, 2, 0, 0, 0], ...SHARED,
];
const FULL: Term[] = [
  [-0.40614, 0, 0, 1, 0, 0], [0.17302, 1, 1, 0, 0, 0], [0.01614, 0, 0, 2, 0, 0], [0.01043, 0, 0, 0, 2, 0],
  [0.00734, 1, -1, 1, 0, 0], [-0.00515, 1, 1, 1, 0, 0], [0.00209, 2, 2, 0, 0, 0], ...SHARED,
];
const QUARTER: Term[] = [
  [-0.62801, 0, 0, 1, 0, 0], [0.17172, 1, 1, 0, 0, 0], [-0.01183, 1, 1, 1, 0, 0], [0.00862, 0, 0, 2, 0, 0],
  [0.00804, 0, 0, 0, 2, 0], [0.00454, 1, -1, 1, 0, 0], [0.00204, 2, 2, 0, 0, 0], [-0.0018, 0, 0, 1, -2, 0],
  [-0.0007, 0, 0, 1, 2, 0], [-0.0004, 0, 0, 3, 0, 0], [-0.00034, 1, -1, 2, 0, 0], [0.00032, 1, 1, 0, 2, 0],
  [0.00032, 1, 1, 0, -2, 0], [-0.00028, 2, 2, 1, 0, 0], [0.00027, 1, 1, 2, 0, 0], [-0.00017, 0, 0, 0, 0, 1],
  [-0.00005, 0, -1, 1, -2, 0], [0.00004, 0, 0, 2, 2, 0], [-0.00004, 0, 1, 1, 2, 0], [0.00004, 0, -2, 1, 0, 0],
  [0.00003, 0, 1, 1, -2, 0], [0.00003, 0, 3, 0, 0, 0], [0.00002, 0, 0, 2, -2, 0], [0.00002, 0, -1, 1, 2, 0],
  [-0.00002, 0, 1, 3, 0, 0],
];
/** Meeus's planetary arguments: [coefficient, at k = 0, per lunation]. A1 also has a T² term. */
const PLANETS: [number, number, number][] = [
  [0.000325, 299.77, 0.107408], [0.000165, 251.88, 0.016321], [0.000164, 251.83, 26.651886], [0.000126, 349.42, 36.412478],
  [0.00011, 84.66, 18.206239], [0.000062, 141.74, 53.303771], [0.00006, 207.14, 2.453732], [0.000056, 154.84, 7.30686],
  [0.000047, 34.52, 27.261239], [0.000042, 207.19, 0.121824], [0.00004, 291.34, 1.844379], [0.000037, 161.72, 24.198154],
  [0.000035, 239.56, 25.513099], [0.000023, 331.55, 3.592518],
];

/** The instant of phase `q` in lunation `n`, counted from the new moon of 6 January 2000. */
export function phaseInstant(n: number, q: Quarter): number {
  const k = n + q / 4;
  const T = k / 1236.85;
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
  for (const [c, e, m, mp, f, o] of q === 0 ? NEW : q === 2 ? FULL : QUARTER) {
    jde += c * E ** e * sin(m * M + mp * Mp + f * F + o * O);
  }
  if (q === 1 || q === 3) {
    const W = 0.00306 - 0.00038 * E * cos(M) + 0.00026 * cos(Mp) - 0.00002 * cos(Mp - M) + 0.00002 * cos(Mp + M) + 0.00002 * cos(2 * F);
    jde += q === 1 ? W : -W;
  }
  PLANETS.forEach(([c, a, b], i) => { jde += c * sin(a + b * k - (i === 0 ? 0.009173 * T2 : 0)); });
  return Math.round(fromJd(jde - deltaT(jde) / 86400));
}

export interface PhaseEvent {
  quarter: Quarter;
  /** Unix seconds. */
  at: number;
}

/** Every phase from `from` to `to` (Unix seconds), in order, and the one after `to`. */
export function phasesBetween(from: number, to: number): PhaseEvent[] {
  const SYNODIC = 29.530588861 * 86400;
  let n = Math.floor((from - fromJd(2451550.09766)) / SYNODIC) - 1;
  const out: PhaseEvent[] = [];
  for (;; n++) {
    for (const quarter of [0, 1, 2, 3] as const) {
      const at = phaseInstant(n, quarter);
      if (at < from) continue;
      out.push({ quarter, at });
      if (at > to) return out;
    }
  }
}
