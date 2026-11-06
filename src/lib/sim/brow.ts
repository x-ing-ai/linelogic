import { L_BROW_POINTS, R_BROW_POINTS } from '../indices';
import { type Frame, lerp, ramp, toFace } from '../geometry';
import type { Effect } from '../types';
import type { Profile } from './profile';

/** Assumed outer eye-corner width, only for showing mm to people. */
export const W_MM = 90;

/**
 * Placeholder coefficients (units of W ≈ 90 mm) until calibrated against real
 * follow-ups. 0.011·W ≈ 1 mm.
 */
export const BROW_COEF = {
  alphaG: 0.012, // inner-brow lift when glabellar depressors relax
  alphaC: 0.01, // brow-tail lift when lateral orbicularis relaxes
  beta0: 0.012, // brow drop from frontalis treatment, before compensation
  gamma: 0.02, // brow-tail lift when only the central forehead is treated
  lambdaUpper: 0.5, // share of the drop kept with upper-only placement
  maxDrop: -0.06,
  maxLift: 0.04,
};

/** Brow heights [medial, mid, lateral] per side, as v in face coords. */
export interface BrowHeights {
  r: [number, number, number];
  l: [number, number, number];
  /** |u| positions of the medial, mid, lateral points per side. */
  ur: [number, number, number];
  ul: [number, number, number];
}

export function measureBrows(lm: Float32Array, f: Frame): BrowHeights {
  const r = R_BROW_POINTS.map((i) => toFace(f, lm[2 * i], lm[2 * i + 1]));
  const l = L_BROW_POINTS.map((i) => toFace(f, lm[2 * i], lm[2 * i + 1]));
  return {
    r: [r[0][1], r[1][1], r[2][1]],
    l: [l[0][1], l[1][1], l[2][1]],
    ur: [Math.abs(r[0][0]), Math.abs(r[1][0]), Math.abs(r[2][0])],
    ul: [Math.abs(l[0][0]), Math.abs(l[1][0]), Math.abs(l[2][0])],
  };
}

export type Triple = [number, number, number];
export interface SideTriple {
  r: Triple;
  l: Triple;
}

/**
 * Forehead compensation κ: how much higher the brows sit with eyes open than
 * with eyes closed (many people relax the forehead when the eyes close).
 */
export function compensation(open: BrowHeights, closed: BrowHeights | null): SideTriple {
  if (!closed) return { r: [0, 0, 0], l: [0, 0, 0] };
  const k = (a: Triple, b: Triple): Triple => [0, 1, 2].map((i) => Math.max(0, a[i] - b[i])) as Triple;
  return { r: k(open.r, closed.r), l: k(open.l, closed.l) };
}

/** Predicted brow-height change at rest (units of W), per side [medial, mid, lateral]. */
export function browShift(e: Effect, kappa: SideTriple): SideTriple {
  const c = BROW_COEF;
  const lam = e.upperOnly ? c.lambdaUpper : 1;
  const side = (k: Triple): Triple => {
    const med = c.alphaG * e.eg - e.efc * lam * (k[0] + c.beta0);
    const mid = 0.5 * c.alphaG * e.eg - ((e.efc + e.efl) / 2) * lam * (k[1] + c.beta0);
    const lat = c.alphaC * e.elc - e.efl * lam * (k[2] + c.beta0) + c.gamma * e.efc * (1 - e.efl);
    const cl = (x: number) => Math.min(c.maxLift, Math.max(c.maxDrop, x));
    return [cl(med), cl(mid), cl(lat)];
  };
  return { r: side(kappa.r), l: side(kappa.l) };
}

/** Brow shift Δv at face position (u, v), spread over forehead and upper lid skin. */
export function shiftAt(u: number, v: number, dh: SideTriple, pos: BrowHeights, p: Profile): number {
  const au = Math.abs(u);
  const s = u < 0 ? dh.r : dh.l;
  const ps = u < 0 ? pos.ur : pos.ul;
  const centre = (dh.r[0] + dh.l[0]) / 2;
  let h: number;
  if (au <= ps[0]) h = lerp(centre, s[0], au / (ps[0] || 1));
  else if (au <= ps[1]) h = lerp(s[0], s[1], (au - ps[0]) / (ps[1] - ps[0] || 1));
  else if (au <= ps[2]) h = lerp(s[1], s[2], (au - ps[1]) / (ps[2] - ps[1] || 1));
  else h = s[2];
  if (h === 0) return 0;
  const yb = p.browTop(u), ye = p.eyeTop(u);
  let w: number;
  if (v >= yb) w = 1 - ramp(v, yb, yb + 0.5);
  else if (v >= ye) w = ramp(v, ye, yb);
  else w = 0;
  w *= 1 - ramp(au, 0.62, 0.8);
  return h * w;
}
