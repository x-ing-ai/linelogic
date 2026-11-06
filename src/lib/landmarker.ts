import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { N_LANDMARKS } from './indices';

const LOCAL_MODEL = '/models/face_landmarker.task';
const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let instance: Promise<FaceLandmarker> | null = null;

async function create(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  const attempts: { model: string; delegate: 'GPU' | 'CPU' }[] = [
    { model: LOCAL_MODEL, delegate: 'GPU' },
    { model: LOCAL_MODEL, delegate: 'CPU' },
    { model: REMOTE_MODEL, delegate: 'GPU' },
    { model: REMOTE_MODEL, delegate: 'CPU' },
  ];
  let last: unknown;
  for (const a of attempts) {
    try {
      return await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: a.model, delegate: a.delegate },
        runningMode: 'IMAGE',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });
    } catch (err) {
      last = err;
    }
  }
  throw new Error(`Could not start the face landmark model: ${String(last)}`);
}

export function getLandmarker(): Promise<FaceLandmarker> {
  if (!instance) {
    instance = create();
    instance.catch(() => { instance = null; });
  }
  return instance;
}

export interface Detection {
  lm: Float32Array; // pixel coords, x,y interleaved
  blendshapes: Record<string, number>;
  faces: number;
}

/** Runs on the main thread; one still image takes a fraction of a second. */
export async function detect(canvas: HTMLCanvasElement): Promise<Detection | null> {
  const fl = await getLandmarker();
  const res = fl.detect(canvas);
  const face = res.faceLandmarks[0];
  if (!face || face.length < N_LANDMARKS) return null;
  const lm = new Float32Array(N_LANDMARKS * 2);
  for (let i = 0; i < N_LANDMARKS; i++) {
    lm[2 * i] = face[i].x * canvas.width;
    lm[2 * i + 1] = face[i].y * canvas.height;
  }
  const blendshapes: Record<string, number> = {};
  for (const c of res.faceBlendshapes[0]?.categories ?? []) blendshapes[c.categoryName] = c.score;
  return { lm, blendshapes, faces: res.faceLandmarks.length };
}
