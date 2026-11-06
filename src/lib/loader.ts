import { getPhoto, getSession, type Session } from './db';
import { detect } from './landmarker';
import { loadWorking } from './photo';
import { checkPhoto, type QualityResult } from './quality';
import { prepare, type Prepared } from './sim/simulate';
import { EXPR_VIEWS, type ExprView, type Img, type Pose } from './types';

export interface LoadedPhoto {
  pose: Pose;
  img: Img;
  lm: Float32Array | null;
  quality: QualityResult;
}

export interface LoadedSession {
  session: Session;
  photos: Partial<Record<Pose, LoadedPhoto>>;
  prep: Prepared | null;
  error?: string;
}

const cache = new Map<string, Promise<LoadedSession>>();

export function invalidate(sessionId: string) {
  cache.delete(sessionId);
}

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function analysePhoto(pose: Pose, blob: Blob): Promise<LoadedPhoto> {
  const { canvas, img } = await loadWorking(blob);
  const d = await detect(canvas);
  return { pose, img, lm: d?.lm ?? null, quality: checkPhoto(pose, d?.lm ?? null, d?.blendshapes ?? {}, d?.faces ?? 0) };
}

async function load(id: string, progress: (msg: string) => void): Promise<LoadedSession> {
  const session = await getSession(id);
  if (!session) throw new Error('Session not found');
  const photos: Partial<Record<Pose, LoadedPhoto>> = {};
  let n = 0;
  for (const pose of session.poses) {
    n++;
    progress(`Finding face landmarks (${n}/${session.poses.length})`);
    await tick();
    const blob = await getPhoto(id, pose);
    if (blob) photos[pose] = await analysePhoto(pose, blob);
  }
  const rest = photos.rest;
  if (!rest?.lm) {
    return { session, photos, prep: null, error: 'The relaxed photo is missing or no face was found in it. Retake it.' };
  }
  progress('Mapping lines and brow position');
  await tick();
  const expr: Partial<Record<ExprView, { img: Img; lm: Float32Array }>> = {};
  for (const v of EXPR_VIEWS) {
    const p = photos[v];
    if (p?.lm) expr[v] = { img: p.img, lm: p.lm };
  }
  const closed = photos.closed?.lm ? { img: photos.closed.img, lm: photos.closed.lm } : null;
  const prep = prepare({ img: rest.img, lm: rest.lm }, closed, expr);
  return { session, photos, prep };
}

export function loadSession(id: string, progress: (msg: string) => void = () => undefined): Promise<LoadedSession> {
  let p = cache.get(id);
  if (!p) {
    p = load(id, progress);
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return p;
}
