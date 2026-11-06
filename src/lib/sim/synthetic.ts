// Synthetic faces for tests and for the in-app "sample client" (no real photos needed).
import {
  FOREHEAD_TOP,
  L_BROW_LOWER,
  L_BROW_UPPER,
  L_EYE_LOWER,
  L_EYE_UPPER,
  N_LANDMARKS,
  R_BROW_LOWER,
  R_BROW_UPPER,
  R_EYE_LOWER,
  R_EYE_UPPER,
  STABLE,
} from '../indices';
import { makeImg } from '../image';
import type { Img } from '../types';

const W = 200, OX = 300, OY = 360;
const px = (u: number, v: number): [number, number] => [OX + u * W, OY - v * W];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function syntheticLandmarks(): Float32Array {
  const lm = new Float32Array(N_LANDMARKS * 2);
  const r = rng(7);
  for (let i = 0; i < N_LANDMARKS; i++) {
    const [x, y] = px(-0.6 + 1.2 * r(), -1.1 + 0.7 * r());
    lm[2 * i] = x; lm[2 * i + 1] = y;
  }
  const set = (i: number, u: number, v: number) => { const [x, y] = px(u, v); lm[2 * i] = x; lm[2 * i + 1] = y; };
  const row = (idx: number[], u0: number, u1: number, v: (t: number) => number) =>
    idx.forEach((i, k) => { const t = idx.length > 1 ? k / (idx.length - 1) : 0; set(i, u0 + (u1 - u0) * t, v(t)); });
  row(R_BROW_UPPER, -0.56, -0.1, (t) => 0.3 + 0.03 * Math.sin(Math.PI * t));
  row(L_BROW_UPPER, 0.56, 0.1, (t) => 0.3 + 0.03 * Math.sin(Math.PI * t));
  row(R_BROW_LOWER, -0.54, -0.11, () => 0.24);
  row(L_BROW_LOWER, 0.54, 0.11, () => 0.24);
  row(R_EYE_UPPER, -0.5, -0.17, (t) => 0.05 * Math.sin(Math.PI * t));
  row(L_EYE_UPPER, 0.5, 0.17, (t) => 0.05 * Math.sin(Math.PI * t));
  row(R_EYE_LOWER, -0.17, -0.49, (t) => -0.04 * Math.sin(Math.PI * t) - 0.001);
  row(L_EYE_LOWER, 0.17, 0.49, (t) => -0.04 * Math.sin(Math.PI * t) - 0.001);
  row(FOREHEAD_TOP, -0.55, 0.55, (t) => 0.7 + 0.08 * Math.sin(Math.PI * t));
  STABLE.forEach((i, k) => set(i, -0.3 + 0.06 * k, -0.4 - 0.03 * (k % 3)));
  set(33, -0.5, 0); set(263, 0.5, 0);
  return lm;
}

/** Plain skin-toned image with gentle shading and fixed noise. */
export function syntheticImage(lines: { u: number; v0: number; v1: number; vertical: boolean }[] = []): Img {
  const img = makeImg(600, 720);
  const r = rng(3);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const n = (r() - 0.5) * 6;
      const shade = 200 - 0.04 * Math.abs(x - 300) - 0.02 * Math.abs(y - 330);
      const j = (y * img.width + x) * 4;
      img.data[j] = shade + 18 + n; img.data[j + 1] = shade - 12 + n; img.data[j + 2] = shade - 35 + n; img.data[j + 3] = 255;
    }
  }
  for (const ln of lines) {
    for (let t = 0; t <= 1; t += 0.002) {
      const v = ln.v0 + (ln.v1 - ln.v0) * t;
      const [cx, cy] = ln.vertical ? px(ln.u, v) : px(v, ln.u);
      for (let d = -4; d <= 4; d++) {
        const x = Math.round(ln.vertical ? cx + d : cx), y = Math.round(ln.vertical ? cy : cy + d);
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
        const j = (y * img.width + x) * 4;
        const depth = 45 * Math.exp(-(d * d) / 4);
        img.data[j] -= depth; img.data[j + 1] -= depth; img.data[j + 2] -= depth;
      }
    }
  }
  return img;
}

/** Move points: inner brows pull down and in (frown) or all brow/forehead points up (raise). */
export function expressionLandmarks(base: Float32Array, kind: 'frown' | 'raise'): Float32Array {
  const lm = new Float32Array(base);
  const brow = [...R_BROW_UPPER, ...L_BROW_UPPER, ...R_BROW_LOWER, ...L_BROW_LOWER];
  for (const i of brow) {
    const u = (lm[2 * i] - OX) / W;
    if (kind === 'frown') {
      const w = Math.max(0, 1 - Math.abs(u) / 0.45);
      lm[2 * i] -= Math.sign(u) * 0.03 * W * w;
      lm[2 * i + 1] += 0.035 * W * w;
    } else {
      lm[2 * i + 1] -= 0.05 * W;
    }
  }
  if (kind === 'raise') for (const i of FOREHEAD_TOP) lm[2 * i + 1] -= 0.02 * W;
  return lm;
}
