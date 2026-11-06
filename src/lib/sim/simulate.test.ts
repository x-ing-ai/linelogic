import { describe, expect, it } from 'vitest';
import { applySim, fitSimilarity, invertSim } from '../geometry';
import { STABLE } from '../indices';
import { effectOf, type Scenario } from '../types';
import { buildMaps, sampleRGBA, triangulate } from '../warp';
import { browShift } from './brow';
import { creaseMap } from './crease';
import { prepare, render } from './simulate';
import { expressionLandmarks, syntheticImage, syntheticLandmarks } from './synthetic';

const none: Scenario = { id: 'x', name: 'none', glabella: 0, forehead: 0, foreheadLateral: true, foreheadUpperOnly: false, crowsFeet: 0 };
const glabella: Scenario = { ...none, glabella: 3 };
const forehead: Scenario = { ...none, glabella: 3, forehead: 3 };

describe('geometry', () => {
  it('recovers a known similarity transform', () => {
    const src = syntheticLandmarks();
    const t = { a: 1.05 * Math.cos(0.1), b: 1.05 * Math.sin(0.1), tx: 12, ty: -7 };
    const dst = new Float32Array(src.length);
    for (let i = 0; i < src.length / 2; i++) {
      const [x, y] = applySim(t, src[2 * i], src[2 * i + 1]);
      dst[2 * i] = x; dst[2 * i + 1] = y;
    }
    const fit = fitSimilarity(src, dst, STABLE);
    expect(fit.a).toBeCloseTo(t.a, 4);
    expect(fit.b).toBeCloseTo(t.b, 4);
    const inv = invertSim(fit);
    const [x, y] = applySim(inv, ...applySim(fit, 100, 50));
    expect(x).toBeCloseTo(100, 3);
    expect(y).toBeCloseTo(50, 3);
  });

  it('identity warp reproduces the image exactly', () => {
    const img = syntheticImage();
    const roi = { x: 100, y: 100, w: 300, h: 300 };
    const pts = new Float32Array([100, 100, 400, 100, 400, 400, 100, 400, 250, 250]);
    const { maps } = buildMaps(pts, [pts], triangulate(pts), roi);
    const patch = sampleRGBA(img, maps[0], roi);
    for (let y = 0; y < roi.h; y += 17) {
      for (let x = 0; x < roi.w; x += 13) {
        const j = ((roi.y + y) * img.width + roi.x + x) * 4;
        expect(patch[(y * roi.w + x) * 4]).toBe(img.data[j]);
      }
    }
  });
});

describe('crease detection', () => {
  it('prefers creases running along the expected axis', () => {
    const w = 80, h = 80;
    const Y = new Float32Array(w * h).fill(200);
    for (let y = 10; y < 70; y++) for (let d = -2; d <= 2; d++) Y[y * w + 40 + d] -= 40 * Math.exp(-(d * d) / 2);
    const vertical = creaseMap(Y, w, h, [1.2, 2], (_x, _y, o) => { o[0] = 0; o[1] = 1; });
    const horizontal = creaseMap(Y, w, h, [1.2, 2], (_x, _y, o) => { o[0] = 1; o[1] = 0; });
    const at = 40 * w + 40;
    expect(vertical[at]).toBeGreaterThan(0.5);
    expect(horizontal[at]).toBeLessThan(vertical[at] * 0.2);
  });
});

describe('simulation', () => {
  const restLm = syntheticLandmarks();
  const rest = { img: syntheticImage(), lm: restLm };
  const frownLines = [
    { u: -0.05, v0: 0.12, v1: 0.36, vertical: true },
    { u: 0.05, v0: 0.12, v1: 0.36, vertical: true },
  ];
  const frown = { img: syntheticImage(frownLines), lm: expressionLandmarks(restLm, 'frown') };
  const raise = { img: syntheticImage([{ u: 0.5, v0: -0.4, v1: 0.4, vertical: false }]), lm: expressionLandmarks(restLm, 'raise') };
  const prep = prepare(rest, null, { frown, raise });
  const k0 = { r: [0, 0, 0] as [number, number, number], l: [0, 0, 0] as [number, number, number] };

  it('an empty plan returns the photo unchanged (identity)', () => {
    const out = render(prep, 'frown', effectOf(none, 'typical'), k0);
    expect(out.checks.identity).toBe(true);
    expect(out.img.data).toEqual(frown.img.data);
  });

  it('glabella treatment softens frown lines toward, but not past, rest', () => {
    const base = render(prep, 'frown', effectOf(none, 'typical'), k0).creaseIndex!;
    const out = render(prep, 'frown', effectOf(glabella, 'typical'), k0);
    expect(base).toBeGreaterThan(1.2);
    expect(out.creaseIndex!).toBeLessThan(base * 0.75);
    expect(out.creaseIndex!).toBeGreaterThan(0.8);
    expect(out.checks.restCeilingOk).toBe(true);
  });

  it('glabella-only leaves forehead lines in the brow-raise view alone', () => {
    const base = render(prep, 'raise', effectOf(none, 'typical'), k0).creaseIndex!;
    const out = render(prep, 'raise', effectOf(glabella, 'typical'), k0);
    // Only the small inner-brow lift moves anything here; lines keep their depth.
    expect(Math.abs(out.creaseIndex! - base) / base).toBeLessThan(0.05);
  });

  it('forehead treatment lowers the brows more when the forehead is compensating', () => {
    const e = effectOf(forehead, 'typical');
    const low = browShift(e, k0);
    const comp = 0.04;
    const high = browShift(e, { r: [comp, comp, comp], l: [comp, comp, comp] });
    expect(high.r[1]).toBeLessThan(low.r[1]);
    expect(low.r[1]).toBeLessThan(0);
  });

  it('central-only forehead treatment lifts the brow tail relative to full-width (Spock brow)', () => {
    const full = browShift(effectOf(forehead, 'typical'), k0);
    const central = browShift(effectOf({ ...forehead, foreheadLateral: false }, 'typical'), k0);
    expect(central.r[2]).toBeGreaterThan(full.r[2]);
  });

  it('rest view moves brows down when the forehead is treated', () => {
    const out = render(prep, 'rest', effectOf(forehead, 'typical'), k0);
    expect(out.checks.identity).toBe(false);
    expect(out.browMm.r[1]).toBeLessThan(0);
    let changed = 0;
    for (const c of out.change) if (c > 1) changed++;
    expect(changed).toBeGreaterThan(100);
  });
});
