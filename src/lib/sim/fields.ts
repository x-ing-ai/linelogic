import { ramp } from '../geometry';
import type { Effect, View } from '../types';
import type { Profile } from './profile';

/**
 * How strongly treatment suppresses the muscle motion that shows in a given
 * expression, at face position (u, v). Units of W; u < 0 is the client's right.
 *
 * - frown: corrugators + procerus act between and above the inner brows.
 * - raise: frontalis lifts the brows and folds the forehead. Central and
 *   lateral thirds can be treated separately; "upper only" placement leaves
 *   the lower frontalis partly active (brows still lift a little).
 * - squint: lateral orbicularis around the outer eye corner (crow's feet).
 *
 * These are the demo's placeholder shapes, to be replaced by calibration.
 */
export function inhibition(view: View, u: number, v: number, p: Profile, e: Effect): number {
  const au = Math.abs(u);
  switch (view) {
    case 'frown': {
      if (e.eg === 0) return 0;
      const gh = 1 - ramp(au, 0.22, 0.42);
      const bottom = 0.03;
      const top = p.browTop(u) + 0.18;
      const gv = ramp(v, bottom, bottom + 0.05) * (1 - ramp(v, top - 0.05, top));
      return e.eg * gh * gv;
    }
    case 'raise': {
      if (e.efc === 0 && e.efl === 0) return 0;
      const wc = 1 - ramp(au, 0.25, 0.35);
      const wl = (1 - wc) * (1 - ramp(au, 0.62, 0.72));
      const ef = e.efc * wc + e.efl * wl;
      const bt = p.browTop(u);
      const bottom = p.browLow(u) - 0.03;
      const top = p.foreheadTop(u);
      const gv = ramp(v, bottom, bottom + 0.04) * (1 - ramp(v, top - 0.03, top + 0.02));
      const z = Math.min(1, Math.max(0, (v - bt) / Math.max(0.05, top - bt)));
      const cov = e.upperOnly ? Math.min(1, Math.max(0.4, 0.4 + 1.5 * z)) : 1;
      return ef * cov * gv;
    }
    case 'squint': {
      if (e.elc === 0) return 0;
      const uc = u < 0 ? -0.5 : 0.5;
      const r = Math.hypot(u - uc, v);
      const lateral = ramp(au, 0.4, 0.48);
      return e.elc * Math.exp(-((r / 0.2) ** 2)) * lateral;
    }
    default:
      return 0;
  }
}

/** Full-strength region of the treatment area for a view (used for scoring). */
export function regionWeight(view: View, u: number, v: number, p: Profile): number {
  const full: Effect = { eg: 1, efc: 1, efl: 1, elc: 1, upperOnly: false };
  return inhibition(view, u, v, p, full);
}

/** Expected direction a crease runs along, as a unit vector in face coords. */
export function creaseAxis(view: View, u: number, v: number): [number, number] {
  if (view === 'frown') return [0, 1];
  if (view === 'raise') return [1, 0];
  const uc = u < 0 ? -0.5 : 0.5;
  const du = u - uc, dv = v;
  const n = Math.hypot(du, dv) || 1;
  return [du / n, dv / n];
}
