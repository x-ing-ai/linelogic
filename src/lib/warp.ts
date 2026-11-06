import Delaunator from 'delaunator';
import type { Img, Roi } from './types';

/** Delaunay triangles over point positions (x,y interleaved). */
export function triangulate(pts: Float32Array): Uint32Array {
  return new Delaunator(Float64Array.from(pts)).triangles;
}

/** For each destination pixel in the ROI, where to sample in each source image. */
export interface WarpMap {
  roi: Roi;
  /** One (x, y) source-coordinate array per source, length roi.w*roi.h*2. */
  maps: Float32Array[];
}

/**
 * Piecewise-affine inverse mapping. Triangles are defined on `dst`. Every
 * source point set shares the triangle indices, so one rasterization pass
 * yields maps for several sources. Pixel centres sit at integer + 0.5.
 * Uncovered pixels use `fallback[k]` (defaults to identity).
 */
export function buildMaps(
  dst: Float32Array,
  srcs: Float32Array[],
  tris: Uint32Array,
  roi: Roi,
  fallback: (((x: number, y: number) => [number, number]) | null)[] = [],
): WarpMap {
  const n = roi.w * roi.h;
  const maps = srcs.map(() => new Float32Array(n * 2));
  const covered = new Uint8Array(n);
  for (let t = 0; t < tris.length; t += 3) {
    const i0 = tris[t], i1 = tris[t + 1], i2 = tris[t + 2];
    const x0 = dst[2 * i0], y0 = dst[2 * i0 + 1];
    const x1 = dst[2 * i1], y1 = dst[2 * i1 + 1];
    const x2 = dst[2 * i2], y2 = dst[2 * i2 + 1];
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(den) < 1e-9) continue;
    const minX = Math.max(roi.x, Math.floor(Math.min(x0, x1, x2) - 0.5));
    const maxX = Math.min(roi.x + roi.w - 1, Math.ceil(Math.max(x0, x1, x2) - 0.5));
    const minY = Math.max(roi.y, Math.floor(Math.min(y0, y1, y2) - 0.5));
    const maxY = Math.min(roi.y + roi.h - 1, Math.ceil(Math.max(y0, y1, y2) - 0.5));
    for (let py = minY; py <= maxY; py++) {
      const cy = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const o = (py - roi.y) * roi.w + (px - roi.x);
        if (covered[o]) continue;
        const cx = px + 0.5;
        const l0 = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cy - y2)) / den;
        const l1 = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cy - y2)) / den;
        const l2 = 1 - l0 - l1;
        if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
        covered[o] = 1;
        for (let k = 0; k < srcs.length; k++) {
          const s = srcs[k];
          maps[k][2 * o] = l0 * s[2 * i0] + l1 * s[2 * i1] + l2 * s[2 * i2];
          maps[k][2 * o + 1] = l0 * s[2 * i0 + 1] + l1 * s[2 * i1 + 1] + l2 * s[2 * i2 + 1];
        }
      }
    }
  }
  for (let py = 0; py < roi.h; py++) {
    for (let px = 0; px < roi.w; px++) {
      const o = py * roi.w + px;
      if (covered[o]) continue;
      const cx = roi.x + px + 0.5, cy = roi.y + py + 0.5;
      for (let k = 0; k < srcs.length; k++) {
        const fb = fallback[k];
        const [sx, sy] = fb ? fb(cx, cy) : [cx, cy];
        maps[k][2 * o] = sx;
        maps[k][2 * o + 1] = sy;
      }
    }
  }
  return { roi, maps };
}

function catmullRom(t: number, w: Float32Array) {
  const t2 = t * t, t3 = t2 * t;
  w[0] = -0.5 * t3 + t2 - 0.5 * t;
  w[1] = 1.5 * t3 - 2.5 * t2 + 1;
  w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t;
  w[3] = 0.5 * t3 - 0.5 * t2;
}

/**
 * Bicubic (Catmull-Rom) RGBA sampling at mapped coordinates, edges clamped.
 * Bicubic rather than bilinear: bilinear resampling softens fine lines, which
 * would make a simulated face look smoother than the treatment explains.
 * Exact at pixel centres, so identity maps reproduce the photo.
 */
export function sampleRGBA(img: Img, map: Float32Array, roi: Roi): Uint8ClampedArray {
  const out = new Uint8ClampedArray(roi.w * roi.h * 4);
  const W = img.width, H = img.height, d = img.data;
  const wx = new Float32Array(4), wy = new Float32Array(4);
  const xs = [0, 0, 0, 0], ys = [0, 0, 0, 0];
  for (let o = 0; o < roi.w * roi.h; o++) {
    let fx = map[2 * o] - 0.5, fy = map[2 * o + 1] - 0.5;
    if (fx < 0) fx = 0; else if (fx > W - 1) fx = W - 1;
    if (fy < 0) fy = 0; else if (fy > H - 1) fy = H - 1;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    if (tx === 0 && ty === 0) {
      const j = (iy * W + ix) * 4;
      out[o * 4] = d[j]; out[o * 4 + 1] = d[j + 1]; out[o * 4 + 2] = d[j + 2]; out[o * 4 + 3] = d[j + 3];
      continue;
    }
    catmullRom(tx, wx); catmullRom(ty, wy);
    for (let k = 0; k < 4; k++) {
      const x = ix - 1 + k, y = iy - 1 + k;
      xs[k] = x < 0 ? 0 : x >= W ? W - 1 : x;
      ys[k] = y < 0 ? 0 : y >= H ? H - 1 : y;
    }
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < 4; j++) {
      const row = ys[j] * W;
      for (let i = 0; i < 4; i++) {
        const w = wx[i] * wy[j];
        const p = (row + xs[i]) * 4;
        r += d[p] * w; g += d[p + 1] * w; b += d[p + 2] * w; a += d[p + 3] * w;
      }
    }
    out[o * 4] = r; out[o * 4 + 1] = g; out[o * 4 + 2] = b; out[o * 4 + 3] = a;
  }
  return out;
}

/** Bilinear sampling of a scalar field that covers `fr` (in image coords). Outside → 0. */
export function sampleField(field: Float32Array, fr: Roi, map: Float32Array, roi: Roi): Float32Array {
  const out = new Float32Array(roi.w * roi.h);
  for (let o = 0; o < roi.w * roi.h; o++) {
    const fx = map[2 * o] - 0.5 - fr.x, fy = map[2 * o + 1] - 0.5 - fr.y;
    if (fx < 0 || fy < 0 || fx > fr.w - 1 || fy > fr.h - 1) continue;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const ix1 = ix + 1 < fr.w ? ix + 1 : ix, iy1 = iy + 1 < fr.h ? iy + 1 : iy;
    out[o] =
      field[iy * fr.w + ix] * (1 - tx) * (1 - ty) +
      field[iy * fr.w + ix1] * tx * (1 - ty) +
      field[iy1 * fr.w + ix] * (1 - tx) * ty +
      field[iy1 * fr.w + ix1] * tx * ty;
  }
  return out;
}
