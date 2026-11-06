import {
  FOREHEAD_TOP,
  L_BROW_LOWER,
  L_BROW_UPPER,
  L_EYE_UPPER,
  R_BROW_LOWER,
  R_BROW_UPPER,
  R_EYE_UPPER,
} from '../indices';
import { EXT_OFFSETS, type Frame, interp, toFace } from '../geometry';

/** Height profiles across the upper face, in face coordinates (units of W). */
export interface Profile {
  browTop(u: number): number;
  browLow(u: number): number;
  eyeTop(u: number): number;
  foreheadTop(u: number): number;
}

function curve(lm: Float32Array, f: Frame, idx: number[], lift = 0) {
  const pts = idx.map((i) => toFace(f, lm[2 * i], lm[2 * i + 1])).sort((p, q) => p[0] - q[0]);
  const us = pts.map((p) => p[0]);
  const vs = pts.map((p) => p[1] + lift);
  return (u: number) => interp(us, vs, u);
}

export function makeProfile(lm: Float32Array, f: Frame): Profile {
  const top = EXT_OFFSETS[EXT_OFFSETS.length - 1];
  return {
    browTop: curve(lm, f, [...R_BROW_UPPER, ...L_BROW_UPPER]),
    browLow: curve(lm, f, [...R_BROW_LOWER, ...L_BROW_LOWER]),
    eyeTop: curve(lm, f, [...R_EYE_UPPER, ...L_EYE_UPPER]),
    foreheadTop: curve(lm, f, FOREHEAD_TOP, top),
  };
}
