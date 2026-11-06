import { FOREHEAD_TOP, L_OUTER_CANTHUS, R_OUTER_CANTHUS } from './indices';
import type { Roi } from './types';

/** Similarity transform: x' = a·x − b·y + tx, y' = b·x + a·y + ty (a = s·cosθ, b = s·sinθ). */
export interface Sim {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Sim = { a: 1, b: 0, tx: 0, ty: 0 };

export function applySim(t: Sim, x: number, y: number): [number, number] {
  return [t.a * x - t.b * y + t.tx, t.b * x + t.a * y + t.ty];
}

/** Rotate/scale a vector (no translation). */
export function applySimVec(t: Sim, x: number, y: number): [number, number] {
  return [t.a * x - t.b * y, t.b * x + t.a * y];
}

export function invertSim(t: Sim): Sim {
  const n = t.a * t.a + t.b * t.b;
  return {
    a: t.a / n,
    b: -t.b / n,
    tx: -(t.a * t.tx + t.b * t.ty) / n,
    ty: -(-t.b * t.tx + t.a * t.ty) / n,
  };
}

function fitOnce(src: Float32Array, dst: Float32Array, idx: number[]): Sim {
  let msx = 0, msy = 0, mdx = 0, mdy = 0;
  for (const i of idx) {
    msx += src[2 * i]; msy += src[2 * i + 1];
    mdx += dst[2 * i]; mdy += dst[2 * i + 1];
  }
  const n = idx.length;
  msx /= n; msy /= n; mdx /= n; mdy /= n;
  let sa = 0, sb = 0, vs = 0;
  for (const i of idx) {
    const xs = src[2 * i] - msx, ys = src[2 * i + 1] - msy;
    const xd = dst[2 * i] - mdx, yd = dst[2 * i + 1] - mdy;
    sa += xs * xd + ys * yd;
    sb += xs * yd - ys * xd;
    vs += xs * xs + ys * ys;
  }
  const a = sa / vs, b = sb / vs;
  return { a, b, tx: mdx - (a * msx - b * msy), ty: mdy - (b * msx + a * msy) };
}

/** Least-squares similarity (Umeyama, 2D) with one round of outlier rejection. */
export function fitSimilarity(src: Float32Array, dst: Float32Array, idx: number[]): Sim {
  let t = fitOnce(src, dst, idx);
  const res = idx.map((i) => {
    const [x, y] = applySim(t, src[2 * i], src[2 * i + 1]);
    return Math.hypot(x - dst[2 * i], y - dst[2 * i + 1]);
  });
  const sorted = [...res].sort((p, q) => p - q);
  const med = sorted[Math.floor(sorted.length / 2)];
  const keep = idx.filter((_, k) => res[k] <= Math.max(2.5 * med, 1));
  if (keep.length >= 4 && keep.length < idx.length) t = fitOnce(src, dst, keep);
  return t;
}

/**
 * Face frame anchored on the outer eye corners. u runs toward the image right,
 * v runs up the face; both are in units of W (outer eye-corner width).
 * The eye corners hardly move when the eyes close, so the frame is stable
 * across rest, eyes-closed and expression photos.
 */
export interface Frame {
  ox: number;
  oy: number;
  xx: number;
  xy: number;
  ux: number;
  uy: number;
  W: number;
}

export function frameFromLandmarks(lm: Float32Array): Frame {
  const rx = lm[2 * R_OUTER_CANTHUS], ry = lm[2 * R_OUTER_CANTHUS + 1];
  const lx = lm[2 * L_OUTER_CANTHUS], ly = lm[2 * L_OUTER_CANTHUS + 1];
  const dx = lx - rx, dy = ly - ry;
  const W = Math.hypot(dx, dy) || 1;
  const xx = dx / W, xy = dy / W;
  return { ox: (rx + lx) / 2, oy: (ry + ly) / 2, xx, xy, ux: xy, uy: -xx, W };
}

export function toFace(f: Frame, x: number, y: number): [number, number] {
  const px = x - f.ox, py = y - f.oy;
  return [(px * f.xx + py * f.xy) / f.W, (px * f.ux + py * f.uy) / f.W];
}

export function fromFace(f: Frame, u: number, v: number): [number, number] {
  return [f.ox + f.W * (u * f.xx + v * f.ux), f.oy + f.W * (u * f.xy + v * f.uy)];
}

/** Head roll in degrees (0 = eye corners level). */
export function rollDeg(f: Frame): number {
  return (Math.atan2(f.xy, f.xx) * 180) / Math.PI;
}

/**
 * The mesh stops below the hairline. Add two rows of points above the top
 * forehead contour (0.15·W and 0.30·W higher) so the forehead can be warped.
 */
export const EXT_OFFSETS = [0.15, 0.3];
export const N_EXT = FOREHEAD_TOP.length * EXT_OFFSETS.length;

export function extensionPoints(lm: Float32Array, f: Frame): Float32Array {
  const out = new Float32Array(N_EXT * 2);
  let k = 0;
  for (const off of EXT_OFFSETS) {
    for (const i of FOREHEAD_TOP) {
      out[k++] = lm[2 * i] + off * f.W * f.ux;
      out[k++] = lm[2 * i + 1] + off * f.W * f.uy;
    }
  }
  return out;
}

/** Eight fixed points on the ROI edge, so pixels near the edge never move. */
export function borderPoints(r: Roi): Float32Array {
  const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  return new Float32Array([x0, y0, xm, y0, x1, y0, x1, ym, x1, y1, xm, y1, x0, y1, x0, ym]);
}
export const N_BORDER = 8;

/** Bounding box of point arrays, padded, clipped to the image, integer-aligned. */
export function roiFromPoints(arrays: Float32Array[], pad: number, imgW: number, imgH: number): Roi {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const a of arrays) {
    for (let i = 0; i < a.length; i += 2) {
      minX = Math.min(minX, a[i]); maxX = Math.max(maxX, a[i]);
      minY = Math.min(minY, a[i + 1]); maxY = Math.max(maxY, a[i + 1]);
    }
  }
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  const x1 = Math.min(imgW, Math.ceil(maxX + pad));
  const y1 = Math.min(imgH, Math.ceil(maxY + pad));
  return { x, y, w: Math.max(1, x1 - x), h: Math.max(1, y1 - y) };
}

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
/** 0 below a, 1 above b, linear between. */
export const ramp = (x: number, a: number, b: number) => clamp((x - a) / (b - a), 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Piecewise-linear interpolation over sorted xs, held constant past the ends. */
export function interp(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  for (let i = 1; i < n; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[n - 1];
}

export function pointInPolygon(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[2 * i], yi = poly[2 * i + 1];
    const xj = poly[2 * j], yj = poly[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}
