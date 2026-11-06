import { gaussianBlur, percentile } from '../image';

/**
 * Multi-scale Hessian valley filter (Frangi-style) for skin creases.
 * A crease is a dark valley: the second derivative across it is positive.
 * `axis(x, y, out)` writes the unit direction creases are expected to run
 * along at ROI pixel (x, y); responses are weighted by cos² to that axis,
 * so pores, freckles and hair mostly drop out.
 * Returns a map in [0, 1] the size of the ROI.
 */
export function creaseMap(
  Y: Float32Array,
  w: number,
  h: number,
  scales: number[],
  axis: (x: number, y: number, out: [number, number]) => void,
): Float32Array {
  const best = new Float32Array(w * h);
  const dir: [number, number] = [0, 0];
  const beta = 0.5;
  for (const s of scales) {
    const B = gaussianBlur(Y, w, h, s);
    const s2 = s * s;
    const l1a = new Float32Array(w * h);
    const l2a = new Float32Array(w * h);
    const tA = new Float32Array(w * h * 2);
    const Sa = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const ixx = (B[i + 1] - 2 * B[i] + B[i - 1]) * s2;
        const iyy = (B[i + w] - 2 * B[i] + B[i - w]) * s2;
        const ixy = ((B[i + w + 1] - B[i + w - 1] - B[i - w + 1] + B[i - w - 1]) / 4) * s2;
        const tr = ixx + iyy;
        const disc = Math.sqrt((ixx - iyy) * (ixx - iyy) + 4 * ixy * ixy);
        const mu1 = (tr + disc) / 2, mu2 = (tr - disc) / 2;
        // λ1 = larger magnitude. Dark valley ⇔ λ1 = mu1 > 0.
        if (Math.abs(mu1) < Math.abs(mu2) || mu1 <= 0) continue;
        l1a[i] = mu1;
        l2a[i] = mu2;
        Sa[i] = Math.sqrt(mu1 * mu1 + mu2 * mu2);
        // Eigenvector of mu1 points across the crease; the crease runs perpendicular.
        const phi = 0.5 * Math.atan2(2 * ixy, ixx - iyy);
        tA[2 * i] = -Math.sin(phi);
        tA[2 * i + 1] = Math.cos(phi);
      }
    }
    const c = Math.max(1e-6, 0.5 * percentile(Sa, 0.98));
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const l1 = l1a[i];
        if (l1 <= 0) continue;
        const rb = Math.abs(l2a[i]) / l1;
        const S = Sa[i];
        const V = Math.exp(-(rb * rb) / (2 * beta * beta)) * (1 - Math.exp(-(S * S) / (2 * c * c)));
        axis(x, y, dir);
        const dot = tA[2 * i] * dir[0] + tA[2 * i + 1] * dir[1];
        const r = V * dot * dot;
        if (r > best[i]) best[i] = r;
      }
    }
  }
  // Widen to cover the crease shoulders, then normalize.
  const widened = gaussianBlur(best, w, h, scales[scales.length - 1]);
  const norm = Math.max(0.15, percentile(widened, 0.99));
  for (let i = 0; i < widened.length; i++) widened[i] = Math.min(1, widened[i] / norm);
  return widened;
}
