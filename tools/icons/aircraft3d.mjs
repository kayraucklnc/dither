// Aircraft for the 3D view: small solid models seen from the slant the panel
// draws its tilted ground at, so a plane flying east is seen side-on, its fin
// standing up, and one flying towards you nose-first. Each part is solid black;
// a part in front is ringed with white where it crosses one behind, which is
// all the shading one bit allows.

/**
 * How far above the horizon the planes are seen from, as the sine of the angle.
 * The ground in the 3D view is drawn flatter (TILT 0.38 in the aircraft widget):
 * from that low, a wing is a line, so the planes are seen from a little higher.
 */
const S = 0.6;
const C = Math.sqrt(1 - S * S);

// Model space: x to starboard, y forward, z up, in the icon's 24 units.

/** A body of round sections along y: [y, half width, half height, centre height]. */
function loft(sections, n = 14) {
  const faces = [];
  const ring = ([y, rx, rz, zc = 0]) => Array.from({ length: n }, (_, j) => {
    const a = (j / n) * 2 * Math.PI;
    return [Math.cos(a) * rx, y, zc + Math.sin(a) * rz];
  });
  const rings = sections.map(ring);
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j < n; j++) faces.push([rings[i][j], rings[i][(j + 1) % n], rings[i + 1][(j + 1) % n], rings[i + 1][j]]);
  }
  faces.push(rings[0], rings[rings.length - 1]);
  // The outline from straight ahead and behind is the widest section.
  for (const r of rings) faces.push(r);
  return faces;
}

const mirror = (poly) => poly.map(([x, y, z]) => [-x, y, z]);
const at = (faces, dx, dy, dz) => faces.map((f) => f.map(([x, y, z]) => [x + dx, y + dy, z + dz]));
/** A thin slab from a flat outline, so it shows edge-on too. */
const slab = (poly, axis, t) => {
  const off = (p, s) => p.map((v, i) => (i === axis ? v + s * t : v));
  const a = poly.map((p) => off(p, 1));
  const b = poly.map((p) => off(p, -1));
  const faces = [a, b];
  for (let i = 0; i < poly.length; i++) faces.push([a[i], a[(i + 1) % poly.length], b[(i + 1) % poly.length], b[i]]);
  return faces;
};
const wing = (poly, t = 0.18) => slab(poly, 2, t);
const fin = (poly, t = 0.2) => slab(poly, 0, t);
const engine = (x, y, z, len, r) => loft([[y + len / 2, r * 0.8, r * 0.8, z], [y + len / 2 - 0.3, r, r, z], [y - len / 2, r * 0.85, r * 0.85, z]], 10);
const pair = (poly) => [poly, mirror(poly)];

/** Each kind as named parts; a part is a list of faces. */
const MODELS = {
  jet: () => {
    const [rw, lw] = pair([[1.1, 2.6, -0.5], [10.2, -2.6, 0.4], [10.2, -3.7, 0.4], [1.1, -2.4, -0.5]]);
    const [rs, ls] = pair([[0.4, -7, 0.4], [4.3, -9, 0.7], [4.3, -9.8, 0.7], [0.4, -8.9, 0.4]]);
    return [
      loft([[10.2, 0.05, 0.05], [9.4, 0.8, 0.8], [8, 1.25, 1.25], [-5.5, 1.25, 1.25], [-8.3, 0.7, 0.8, 0.4], [-10, 0.12, 0.25, 0.7]]),
      wing(rw), wing(lw), wing(rs), wing(ls),
      fin([[0, -6.2, 1], [0, -9.1, 4.4], [0, -10.1, 4.4], [0, -9.8, 0.6]]),
      engine(4.1, 1.4, -1.2, 2.8, 0.65), engine(-4.1, 1.4, -1.2, 2.8, 0.65),
    ];
  },
  heavy: () => {
    const [rw, lw] = pair([[1.4, 3.2, -0.7], [11, -3.2, 0.5], [11, -4.4, 0.5], [1.4, -2.6, -0.7]]);
    const [rs, ls] = pair([[0.5, -7.4, 0.6], [4.8, -9.6, 0.9], [4.8, -10.4, 0.9], [0.5, -9.4, 0.6]]);
    return [
      loft([[11, 0.05, 0.05], [10.1, 1.1, 1.1], [8.4, 1.75, 1.75], [-5.5, 1.75, 1.75], [-8.8, 0.9, 1, 0.6], [-10.8, 0.15, 0.3, 1]]),
      wing(rw), wing(lw), wing(rs), wing(ls),
      fin([[0, -6.4, 1.4], [0, -9.6, 5.4], [0, -10.8, 5.4], [0, -10.4, 0.9]]),
      engine(3.6, 2.2, -1.5, 2.8, 0.7), engine(-3.6, 2.2, -1.5, 2.8, 0.7),
      engine(7, -0.2, -0.9, 2.4, 0.6), engine(-7, -0.2, -0.9, 2.4, 0.6),
    ];
  },
  prop: () => {
    const [rw, lw] = pair([[0.6, 2.4, 1.1], [11, 2.2, 1.3], [11, 0.2, 1.3], [0.6, 0, 1.1]]);
    const [rs, ls] = pair([[0.3, -6.4, 0.3], [3.6, -6.6, 0.3], [3.6, -8, 0.3], [0.3, -8.2, 0.3]]);
    return [
      loft([[7.6, 0.4, 0.4], [7, 0.95, 0.95], [3, 1.1, 1.15, 0.1], [-4, 0.75, 0.8, 0.2], [-8.4, 0.2, 0.3, 0.4]]),
      wing(rw), wing(lw), wing(rs), wing(ls),
      fin([[0, -5.6, 0.8], [0, -7.9, 3.4], [0, -8.7, 3.4], [0, -8.6, 0.4]]),
      // The propeller: two blades across the nose.
      fin([[0, 7.8, -2.4], [0, 7.8, 2.4], [0, 7.6, 2.4], [0, 7.6, -2.4]], 0.25),
      slab([[-2.4, 7.8, 0], [2.4, 7.8, 0], [2.4, 7.6, 0], [-2.4, 7.6, 0]], 2, 0.25),
    ];
  },
  heli: () => {
    const blade = (deg) => {
      const a = (deg * Math.PI) / 180;
      const u = [Math.cos(a), Math.sin(a)];
      const v = [-u[1] * 0.45, u[0] * 0.45];
      const L = 10.5;
      return wing([[u[0] * L + v[0], u[1] * L + v[1] + 0.6, 3.1], [u[0] * L - v[0], u[1] * L - v[1] + 0.6, 3.1], [-u[0] * L - v[0], -u[1] * L - v[1] + 0.6, 3.1], [-u[0] * L + v[0], -u[1] * L + v[1] + 0.6, 3.1]], 0.12);
    };
    const skid = (x) => [...slab([[x, 4, -2.7], [x, -3, -2.7], [x, -3, -2.95], [x, 4.2, -2.95]], 0, 0.22), ...fin([[x, 1.6, -2.8], [x, 1.2, -1.4], [x, 0.8, -1.4], [x, 1.2, -2.8]].map(([px, y, z]) => [px * 0.85, y, z]), 0.2)];
    return [
      loft([[4.2, 0.3, 0.3, -0.2], [3.4, 1.6, 1.5, -0.3], [1, 2.2, 2.1], [-1.8, 1.7, 1.8, 0.3], [-2.8, 0.6, 0.7, 0.8]]),
      loft([[-2.4, 0.55, 0.55, 0.9], [-9.4, 0.3, 0.3, 1.1]], 8),
      fin([[0, -8.6, 1], [0, -9.6, 3.4], [0, -10.3, 3.4], [0, -10, 0.6]]),
      skid(1.7), skid(-1.7),
      fin([[0, 0.8, 2], [0, 0.8, 3.1], [0, 0.4, 3.1], [0, 0.4, 2]], 0.25),
      blade(45), blade(-45),
    ];
  },
  glider: () => {
    const [rw, lw] = pair([[0.5, 2.6, 0.4], [11.8, 1.6, 1.4], [11.8, 0.8, 1.4], [0.5, 0.9, 0.4]]);
    const [rs, ls] = pair([[0.2, -8.6, 3.2], [3.2, -8.8, 3.2], [3.2, -9.6, 3.2], [0.2, -9.8, 3.2]]);
    return [
      loft([[7.5, 0.1, 0.1], [6.6, 0.7, 0.75], [4.4, 0.85, 0.95, 0.15], [1, 0.75, 0.8, 0.2], [-9.6, 0.2, 0.25, 0.5]]),
      wing(rw, 0.12), wing(lw, 0.12), wing(rs, 0.12), wing(ls, 0.12),
      fin([[0, -7.2, 0.5], [0, -8.9, 3.3], [0, -9.8, 3.3], [0, -9.9, 0.3]]),
    ];
  },
  fast: () => {
    const [rw, lw] = pair([[0.9, 3, 0], [7.4, -5, -0.2], [7.4, -6, -0.2], [0.9, -6, 0]]);
    const [rs, ls] = pair([[0.6, -7.4, 0], [4, -9.4, 0], [4, -10, 0], [0.6, -9.6, 0]]);
    return [
      loft([[10.8, 0.05, 0.05], [8, 0.8, 0.8], [5, 1.15, 1.15, 0.1], [-8, 1.15, 1.05], [-10, 0.9, 0.85]]),
      wing(rw), wing(lw), wing(rs), wing(ls),
      fin([[0, -4.6, 1], [0, -8.8, 4.6], [0, -9.8, 4.6], [0, -9.8, 0.9]]),
    ];
  },
};

/** One kind flying a heading (degrees clockwise from north), as an SVG on the 24-unit grid. */
export function obliqueSvg(kind, heading, size) {
  const a = (heading * Math.PI) / 180;
  const [sin, cos] = [Math.sin(a), Math.cos(a)];
  const view = ([x, y, z]) => {
    const e = x * cos + y * sin;
    const n = -x * sin + y * cos;
    return { sx: 12 + e, sy: 12 - (n * S + z * C), depth: -n * C + z * S };
  };
  // Lines thin to a pixel at every size: the halo is about one, the ink edge a third.
  const px = 24 / size;
  // At 16 px there is no room for a gap: the plane is one silhouette.
  const halo = size < 24 ? 0 : 0.75 * px;
  const edge = 0.3 * px;
  const parts = MODELS[kind]().map((faces) => {
    const projected = faces.map((f) => f.map(view));
    const all = projected.flat();
    const depth = all.reduce((s, p) => s + p.depth, 0) / all.length;
    // Face by face: one path of them all would cancel where faces wind opposite ways.
    const d = projected.map((f) => `M${f.map((p) => `${p.sx.toFixed(2)} ${p.sy.toFixed(2)}`).join("L")}Z`);
    return { depth, d };
  });
  parts.sort((p, q) => p.depth - q.depth);
  const pass = (d, colour, width) => d.map((f) => `<path d="${f}" fill="${colour}" stroke="${colour}" stroke-width="${width.toFixed(2)}" stroke-linejoin="round"/>`).join("");
  const body = parts.map(({ d }) => (halo ? pass(d, "#fff", edge + halo * 2) : "") + pass(d, "#000", edge)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${body}</svg>`;
}

export const KINDS_3D = Object.keys(MODELS);
