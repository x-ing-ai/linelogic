import type { Img } from './types';

/** Longest side of the working image the simulation runs on. */
export const WORK_SIZE = 1100;
/** Longest side of the JPEG kept on the device. */
export const STORE_SIZE = 1600;

async function bitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(blob);
  }
}

function drawScaled(src: CanvasImageSource, w: number, h: number, max: number): HTMLCanvasElement {
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Re-encode through a canvas: strips EXIF/GPS and caps the size. */
export async function normalizePhoto(input: Blob): Promise<Blob> {
  const bm = await bitmap(input);
  const c = drawScaled(bm, bm.width, bm.height, STORE_SIZE);
  bm.close();
  return await new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode photo'))), 'image/jpeg', 0.92),
  );
}

/** Canvas + pixels at working resolution. */
export async function loadWorking(blob: Blob): Promise<{ canvas: HTMLCanvasElement; img: Img }> {
  const bm = await bitmap(blob);
  const canvas = drawScaled(bm, bm.width, bm.height, WORK_SIZE);
  bm.close();
  const id = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, img: { width: id.width, height: id.height, data: id.data } };
}

export function imgToCanvas(img: Img, canvas: HTMLCanvasElement) {
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
}
