// Copies the MediaPipe wasm runtime into /public and downloads the official
// Face Landmarker model, so the deployed app serves both from its own origin.
// If the model download fails (offline build), the app falls back to loading
// it from Google's model host at runtime.
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDst = join(root, 'public', 'mediapipe', 'wasm');
const modelDst = join(root, 'public', 'models', 'face_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

mkdirSync(wasmDst, { recursive: true });
cpSync(wasmSrc, wasmDst, { recursive: true });
console.log('[assets] MediaPipe wasm copied to public/mediapipe/wasm');

if (existsSync(modelDst) && statSync(modelDst).size > 1_000_000) {
  console.log('[assets] Face Landmarker model already present');
} else {
  mkdirSync(dirname(modelDst), { recursive: true });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    const res = await fetch(MODEL_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1_000_000) throw new Error(`model too small (${buf.length} bytes)`);
    writeFileSync(modelDst, buf);
    console.log(`[assets] Face Landmarker model downloaded (${(buf.length / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    console.warn(
      `[assets] Could not download the model (${err.message}). The app will load it from Google at runtime.`,
    );
  }
}
