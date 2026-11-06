import {
  applySim,
  applySimVec,
  borderPoints,
  extensionPoints,
  fitSimilarity,
  type Frame,
  frameFromLandmarks,
  invertSim,
  N_BORDER,
  N_EXT,
  pointInPolygon,
  roiFromPoints,
  type Sim,
  toFace,
} from '../geometry';
import { bandSplit, cloneImg, compose, gaussianBlur, luminance } from '../image';
import { L_EYE_POLY, N_MESH, R_EYE_POLY, STABLE } from '../indices';
import { type Effect, type ExprView, type Img, isEmptyEffect, type Roi, type View } from '../types';
import { buildMaps, sampleField, sampleRGBA, triangulate } from '../warp';
import { browShift, compensation, measureBrows, shiftAt, type BrowHeights, type SideTriple, W_MM } from './brow';
import { creaseMap } from './crease';
import { creaseAxis, inhibition, regionWeight } from './fields';
import { makeProfile, type Profile } from './profile';

export interface PhotoInput {
  img: Img;
  /** 478 landmarks, x,y interleaved, in image pixels. */
  lm: Float32Array;
}

interface Photo extends PhotoInput {
  frame: Frame;
  prof: Profile;
  ext: Float32Array;
  roi: Roi;
}

interface ExprPrep {
  E: Photo;
  T: Sim; // rest → expression
  Tinv: Sim;
  HE: Float32Array; // high band of E over E.roi
  CE: Float32Array; // crease map of E over E.roi
}

export interface Prepared {
  rest: Photo;
  HR: Float32Array; // high band of rest over rest.roi
  brows: BrowHeights;
  kappaMeasured: SideTriple | null;
  views: Partial<Record<ExprView, ExprPrep>>;
  /** Crease maps of the rest photo per view orientation (for scoring), lazily built. */
  restCrease: Partial<Record<ExprView, Float32Array>>;
  sigmaLow: number;
  scales: number[];
}

function photo(p: PhotoInput): Photo {
  const frame = frameFromLandmarks(p.lm);
  const ext = extensionPoints(p.lm, frame);
  const mesh = p.lm.subarray(0, N_MESH * 2);
  const roi = roiFromPoints([mesh, ext], 0.08 * frame.W, p.img.width, p.img.height);
  return { ...p, frame, prof: makeProfile(p.lm, frame), ext, roi };
}

function axisFn(view: View, ph: Photo) {
  const f = ph.frame;
  return (x: number, y: number, out: [number, number]) => {
    const [u, v] = toFace(f, ph.roi.x + x + 0.5, ph.roi.y + y + 0.5);
    const [au, av] = creaseAxis(view, u, v);
    out[0] = au * f.xx + av * f.ux;
    out[1] = au * f.xy + av * f.uy;
  };
}

/** Heavy one-time work per consultation: landmark frames, band splits, crease maps. */
export function prepare(
  rest: PhotoInput,
  closed: PhotoInput | null,
  expr: Partial<Record<ExprView, PhotoInput>>,
): Prepared {
  const R = photo(rest);
  const W = R.frame.W;
  // Wide enough that a crease's shadow falls in the high band, so a softened
  // line doesn't leave a smudge behind.
  const sigmaLow = 0.05 * W;
  const scales = [0.005, 0.009, 0.014].map((k) => Math.max(0.8, k * W));
  const { H: HR } = bandSplit(luminance(R.img, R.roi), R.roi.w, R.roi.h, sigmaLow);
  const brows = measureBrows(R.lm, R.frame);
  let kappaMeasured: SideTriple | null = null;
  if (closed) {
    const cf = frameFromLandmarks(closed.lm);
    kappaMeasured = compensation(brows, measureBrows(closed.lm, cf));
  }
  const views: Partial<Record<ExprView, ExprPrep>> = {};
  for (const v of Object.keys(expr) as ExprView[]) {
    const input = expr[v];
    if (!input) continue;
    const E = photo(input);
    const T = fitSimilarity(R.lm, E.lm, STABLE);
    const Y = luminance(E.img, E.roi);
    const { H: HE } = bandSplit(Y, E.roi.w, E.roi.h, sigmaLow);
    const CE = creaseMap(Y, E.roi.w, E.roi.h, scales, axisFn(v, E));
    views[v] = { E, T, Tinv: invertSim(T), HE, CE };
  }
  return { rest: R, HR, brows, kappaMeasured, views, restCrease: {}, sigmaLow, scales };
}

export function kappaFor(prep: Prepared, overrideMm: number | null): SideTriple {
  if (overrideMm != null) {
    const k = overrideMm / W_MM;
    return { r: [k, k, k], l: [k, k, k] };
  }
  return prep.kappaMeasured ?? { r: [0, 0, 0], l: [0, 0, 0] };
}

export interface Checks {
  /** Treated creases keep at least ~90% of the client's own rest-state detail. */
  restCeilingOk: boolean;
  restCeilingRatio: number | null;
  identity: boolean;
}

export interface RenderResult {
  img: Img;
  roi: Roi;
  /** Per-pixel luminance change vs. the unsimulated photo, over roi. */
  change: Float32Array;
  /** Dynamic crease index (expression ÷ rest) in the treated area; 1.0 = rest level. */
  creaseIndex: number | null;
  /** Predicted rest brow change in mm, [medial, mid, lateral] per side. */
  browMm: SideTriple;
  checks: Checks;
}

function scorePixels(C: Float32Array, H: Float32Array, region: Float32Array): number {
  let s = 0, n = 0;
  for (let i = 0; i < C.length; i++) {
    const w = region[i];
    if (w < 0.3) continue;
    s += w * C[i] * Math.abs(H[i]);
    n += w;
  }
  return n > 0 ? s / n : 0;
}

function regionMask(view: View, ph: Photo, roi: Roi): Float32Array {
  const out = new Float32Array(roi.w * roi.h);
  for (let y = 0; y < roi.h; y++) {
    for (let x = 0; x < roi.w; x++) {
      const [u, v] = toFace(ph.frame, roi.x + x + 0.5, roi.y + y + 0.5);
      out[y * roi.w + x] = regionWeight(view, u, v, ph.prof);
    }
  }
  return out;
}

function restScore(prep: Prepared, view: ExprView): number {
  const R = prep.rest;
  if (!prep.restCrease[view]) {
    const Y = luminance(R.img, R.roi);
    prep.restCrease[view] = creaseMap(Y, R.roi.w, R.roi.h, prep.scales, axisFn(view, R));
  }
  return scorePixels(prep.restCrease[view]!, prep.HR, regionMask(view, R, R.roi));
}

/** Dynamic crease index of an unsimulated expression photo (for baselines and follow-ups). */
export function baselineCreaseIndex(prep: Prepared, view: ExprView): number | null {
  const ev = prep.views[view];
  if (!ev) return null;
  const rs = restScore(prep, view);
  if (rs <= 0) return null;
  return scorePixels(ev.CE, ev.HE, regionMask(view, ev.E, ev.E.roi)) / rs;
}

function eyeMask(dst: Float32Array, roi: Roi): Float32Array {
  const m = new Float32Array(roi.w * roi.h);
  for (const poly of [R_EYE_POLY, L_EYE_POLY]) {
    let cx = 0, cy = 0;
    for (const i of poly) { cx += dst[2 * i]; cy += dst[2 * i + 1]; }
    cx /= poly.length; cy /= poly.length;
    const pts: number[] = [];
    for (const i of poly) {
      pts.push(cx + (dst[2 * i] - cx) * 1.3, cy + (dst[2 * i + 1] - cy) * 1.6);
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let k = 0; k < pts.length; k += 2) {
      minX = Math.min(minX, pts[k]); maxX = Math.max(maxX, pts[k]);
      minY = Math.min(minY, pts[k + 1]); maxY = Math.max(maxY, pts[k + 1]);
    }
    for (let y = Math.max(0, Math.floor(minY - roi.y)); y < Math.min(roi.h, Math.ceil(maxY - roi.y)); y++) {
      for (let x = Math.max(0, Math.floor(minX - roi.x)); x < Math.min(roi.w, Math.ceil(maxX - roi.x)); x++) {
        if (pointInPolygon(roi.x + x + 0.5, roi.y + y + 0.5, pts)) m[y * roi.w + x] = 1;
      }
    }
  }
  return gaussianBlur(m, roi.w, roi.h, 2);
}

function lumaDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(a.length / 4);
  for (let i = 0; i < out.length; i++) {
    const j = i * 4;
    out[i] = Math.abs(
      0.299 * (a[j] - b[j]) + 0.587 * (a[j + 1] - b[j + 1]) + 0.114 * (a[j + 2] - b[j + 2]),
    );
  }
  return out;
}

function patchOf(img: Img, r: Roi): Uint8ClampedArray {
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    out.set(img.data.subarray(((r.y + y) * img.width + r.x) * 4, ((r.y + y) * img.width + r.x + r.w) * 4), y * r.w * 4);
  }
  return out;
}

function toMm(t: SideTriple): SideTriple {
  const m = (x: number) => Math.round(x * W_MM * 10) / 10;
  return { r: t.r.map(m) as SideTriple['r'], l: t.l.map(m) as SideTriple['l'] };
}

/** Brow shift vectors (image px, rest frame) for warp points of the rest photo. */
function browVectors(prep: Prepared, pts: Float32Array, nMove: number, dh: SideTriple): Float32Array {
  const R = prep.rest;
  const out = new Float32Array(pts.length);
  for (let i = 0; i < nMove; i++) {
    const [u, v] = toFace(R.frame, pts[2 * i], pts[2 * i + 1]);
    const s = shiftAt(u, v, dh, prep.brows, R.prof) * R.frame.W;
    out[2 * i] = s * R.frame.ux;
    out[2 * i + 1] = s * R.frame.uy;
  }
  return out;
}

function concat(...arrs: Float32Array[]): Float32Array {
  const out = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

const ZERO: SideTriple = { r: [0, 0, 0], l: [0, 0, 0] };

/**
 * Render one view under a plan. The rules that keep it honest:
 * - Treated motion is scaled back toward the client's own rest geometry.
 * - Treated crease detail is blended toward the client's own rest detail,
 *   never past it (k ≤ 0.95), so static lines stay.
 * - An empty plan returns the photo unchanged.
 */
export function render(prep: Prepared, view: View, e: Effect, kappa: SideTriple): RenderResult {
  const dh = isEmptyEffect(e) ? ZERO : browShift(e, kappa);
  const browMm = toMm(dh);
  const R = prep.rest;

  if (view === 'rest') {
    const roi = R.roi;
    const border = borderPoints(roi);
    const src = concat(R.lm.subarray(0, N_MESH * 2), R.ext, border);
    const b = browVectors(prep, src, N_MESH + N_EXT, dh);
    let moved = false;
    for (let i = 0; i < b.length; i++) if (b[i] !== 0) { moved = true; break; }
    if (!moved) {
      return { img: cloneImg(R.img), roi, change: new Float32Array(roi.w * roi.h), creaseIndex: null, browMm, checks: { restCeilingOk: true, restCeilingRatio: null, identity: true } };
    }
    const dst = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) dst[i] = src[i] + b[i];
    const tris = triangulate(dst);
    const { maps } = buildMaps(dst, [src], tris, roi);
    const patch = sampleRGBA(R.img, maps[0], roi);
    return {
      img: compose(R.img, roi, patch),
      roi,
      change: lumaDiff(patch, patchOf(R.img, roi)),
      creaseIndex: null,
      browMm,
      checks: { restCeilingOk: true, restCeilingRatio: null, identity: false },
    };
  }

  const ev = prep.views[view];
  if (!ev) throw new Error(`No ${view} photo for this consultation`);
  const E = ev.E;
  const roi = E.roi;
  const base = baselineCreaseIndex(prep, view);
  if (isEmptyEffect(e)) {
    return { img: cloneImg(E.img), roi, change: new Float32Array(roi.w * roi.h), creaseIndex: base, browMm, checks: { restCeilingOk: true, restCeilingRatio: null, identity: true } };
  }

  const border = borderPoints(roi);
  const borderR = new Float32Array(border.length);
  for (let i = 0; i < N_BORDER; i++) {
    const [x, y] = applySim(ev.Tinv, border[2 * i], border[2 * i + 1]);
    borderR[2 * i] = x; borderR[2 * i + 1] = y;
  }
  const srcE = concat(E.lm.subarray(0, N_MESH * 2), E.ext, border);
  const srcR = concat(R.lm.subarray(0, N_MESH * 2), R.ext, borderR);
  const nMove = N_MESH + N_EXT;
  const bR = browVectors(prep, srcR, nMove, dh);
  const dst = new Float32Array(srcE.length);
  for (let i = 0; i < nMove; i++) {
    const rx = srcR[2 * i], ry = srcR[2 * i + 1];
    const [u, v] = toFace(R.frame, rx, ry);
    const a = inhibition(view, u, v, R.prof, e);
    const [tx, ty] = applySim(ev.T, rx, ry);
    const dx = srcE[2 * i] - tx, dy = srcE[2 * i + 1] - ty;
    const [bx, by] = applySimVec(ev.T, bR[2 * i], bR[2 * i + 1]);
    dst[2 * i] = srcE[2 * i] - a * dx + bx;
    dst[2 * i + 1] = srcE[2 * i + 1] - a * dy + by;
  }
  for (let i = nMove; i < nMove + N_BORDER; i++) {
    dst[2 * i] = srcE[2 * i]; dst[2 * i + 1] = srcE[2 * i + 1];
  }

  const tris = triangulate(dst);
  const { maps } = buildMaps(dst, [srcE, srcR], tris, roi, [null, (x, y) => applySim(ev.Tinv, x, y)]);
  const [mapE, mapR] = maps;
  const warped = sampleRGBA(E.img, mapE, roi);
  const hE = sampleField(ev.HE, E.roi, mapE, roi);
  const cE = sampleField(ev.CE, E.roi, mapE, roi);
  const hR = sampleField(prep.HR, R.roi, mapR, roi);
  const eyes = eyeMask(dst, roi);

  const out = new Uint8ClampedArray(warped);
  const hOut = new Float32Array(roi.w * roi.h);
  let eOut = 0, eRest = 0;
  for (let y = 0; y < roi.h; y++) {
    for (let x = 0; x < roi.w; x++) {
      const o = y * roi.w + x;
      const [u, v] = toFace(E.frame, roi.x + x + 0.5, roi.y + y + 0.5);
      const a = inhibition(view, u, v, E.prof, e);
      const k = Math.min(0.95, a * cE[o] * (1 - eyes[o]));
      const dY = k * (hR[o] - hE[o]);
      hOut[o] = hE[o] + dY;
      if (k > 0.2) { eOut += k * Math.abs(hOut[o]); eRest += k * Math.abs(hR[o]); }
      if (dY !== 0) {
        const j = o * 4;
        out[j] = warped[j] + dY;
        out[j + 1] = warped[j + 1] + dY;
        out[j + 2] = warped[j + 2] + dY;
      }
    }
  }
  const ratio = eRest > 0 ? eOut / eRest : null;
  const rs = restScore(prep, view);
  // Score what is actually displayed: re-split the output image itself.
  const outImg: Img = { width: roi.w, height: roi.h, data: out };
  const { H: hShown } = bandSplit(luminance(outImg, { x: 0, y: 0, w: roi.w, h: roi.h }), roi.w, roi.h, prep.sigmaLow);
  const creaseIndex = rs > 0 ? scorePixels(cE, hShown, regionMask(view, E, roi)) / rs : null;
  return {
    img: compose(E.img, roi, out),
    roi,
    change: lumaDiff(out, patchOf(E.img, roi)),
    creaseIndex,
    browMm,
    checks: { restCeilingOk: ratio == null || ratio >= 0.9, restCeilingRatio: ratio, identity: false },
  };
}

/** Rest brow heights in mm above the eye-corner line (for follow-up comparisons). */
export function browHeightsMm(prep: Prepared): SideTriple {
  const m = (x: number) => Math.round(x * W_MM * 10) / 10;
  return { r: prep.brows.r.map(m) as SideTriple['r'], l: prep.brows.l.map(m) as SideTriple['l'] };
}
