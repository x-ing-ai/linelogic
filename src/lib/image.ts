import type { Img, Roi } from './types';

export function makeImg(width: number, height: number): Img {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneImg(img: Img): Img {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

/** Rec. 601 luma of an ROI, 0..255 floats. */
export function luminance(img: Img, r: Roi): Float32Array {
  const out = new Float32Array(r.w * r.h);
  const d = img.data;
  for (let y = 0; y < r.h; y++) {
    let si = ((r.y + y) * img.width + r.x) * 4;
    let oi = y * r.w;
    for (let x = 0; x < r.w; x++, si += 4, oi++) {
      out[oi] = 0.299 * d[si] + 0.587 * d[si + 1] + 0.114 * d[si + 2];
    }
  }
  return out;
}

function kernel(sigma: number): Float32Array {
  const rad = Math.max(1, Math.ceil(3 * sigma));
  const k = new Float32Array(2 * rad + 1);
  let s = 0;
  for (let i = -rad; i <= rad; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + rad] = v;
    s += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return k;
}

/** Separable Gaussian blur with clamped edges. */
export function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0) return new Float32Array(src);
  const k = kernel(sigma);
  const rad = (k.length - 1) / 2;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -rad; i <= rad; i++) {
        const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
        acc += src[row + xx] * k[i + rad];
      }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -rad; i <= rad; i++) {
        const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
        acc += tmp[yy * w + x] * k[i + rad];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

/** Split into low and high frequency bands: Y = L + H. */
export function bandSplit(Y: Float32Array, w: number, h: number, sigma: number) {
  const L = gaussianBlur(Y, w, h, sigma);
  const H = new Float32Array(Y.length);
  for (let i = 0; i < Y.length; i++) H[i] = Y[i] - L[i];
  return { L, H };
}

export function percentile(arr: Float32Array, p: number, mask?: Float32Array): number {
  const vals: number[] = [];
  for (let i = 0; i < arr.length; i++) if (!mask || mask[i] > 0.5) vals.push(arr[i]);
  if (!vals.length) return 0;
  vals.sort((a, b) => a - b);
  return vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
}

/** Copy `img` and paste an RGBA patch over the ROI. */
export function compose(img: Img, r: Roi, patch: Uint8ClampedArray): Img {
  const out = cloneImg(img);
  for (let y = 0; y < r.h; y++) {
    out.data.set(patch.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((r.y + y) * img.width + r.x) * 4);
  }
  return out;
}
