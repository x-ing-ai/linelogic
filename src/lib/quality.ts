import { frameFromLandmarks, rollDeg, toFace } from './geometry';
import { NOSE_TIP } from './indices';
import type { Pose } from './types';

export interface QualityResult {
  ok: boolean;
  issues: string[];
}

const bs = (b: Record<string, number>, ...names: string[]) => Math.max(...names.map((n) => b[n] ?? 0));

/** Pose, framing and expression checks. Thresholds are starting points, not validated. */
export function checkPhoto(pose: Pose, lm: Float32Array | null, b: Record<string, number>, faces: number): QualityResult {
  const issues: string[] = [];
  if (!lm) return { ok: false, issues: ['No face found. Fill the oval with the face, in even light.'] };
  if (faces > 1) issues.push('More than one face in the photo.');
  const f = frameFromLandmarks(lm);
  if (Math.abs(rollDeg(f)) > 8) issues.push('Head is tilted. Level the camera with the eyes.');
  const [nu] = toFace(f, lm[2 * NOSE_TIP], lm[2 * NOSE_TIP + 1]);
  if (Math.abs(nu) > 0.08) issues.push('Face is turned. Look straight at the camera.');
  if (f.W < 150) issues.push('Face is small in the frame. Move closer.');

  const blink = bs(b, 'eyeBlinkLeft', 'eyeBlinkRight');
  switch (pose) {
    case 'rest':
      if (bs(b, 'browDownLeft', 'browDownRight') > 0.35 || bs(b, 'browInnerUp') > 0.35)
        issues.push('Face should be fully relaxed (brows are moving).');
      if (blink > 0.5) issues.push('Eyes should be open.');
      break;
    case 'closed':
      if (blink < 0.45) issues.push('Eyes should be gently closed.');
      break;
    case 'frown':
      if (bs(b, 'browDownLeft', 'browDownRight') < 0.3) issues.push('Frown harder: pull the brows down and together.');
      break;
    case 'raise':
      if (bs(b, 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight') < 0.35) issues.push('Raise the eyebrows as high as possible.');
      break;
    case 'squint':
      if (bs(b, 'eyeSquintLeft', 'eyeSquintRight', 'cheekSquintLeft', 'cheekSquintRight') < 0.25)
        issues.push('Smile big and squint so the crow’s feet show.');
      break;
  }
  return { ok: issues.length === 0, issues };
}
