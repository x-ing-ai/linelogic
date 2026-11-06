import { useEffect, useRef } from 'react';
import { gaussianBlur } from '../lib/image';
import type { Img, Roi } from '../lib/types';

export interface Overlays {
  watermark?: boolean;
  change?: { roi: Roi; values: Float32Array } | null;
  landmarks?: Float32Array | null;
}

/** Draws an Img plus optional overlays. The watermark is drawn into the pixels. */
export function drawInto(canvas: HTMLCanvasElement, img: Img, ov: Overlays = {}) {
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);

  if (ov.change) {
    const { roi } = ov.change;
    // Smooth first so resampled skin texture doesn't read as speckle.
    const values = gaussianBlur(ov.change.values, roi.w, roi.h, 2);
    const tint = new ImageData(roi.w, roi.h);
    for (let i = 0; i < values.length; i++) {
      if (values[i] < 2.5) continue;
      const a = Math.min(1, values[i] / 14);
      tint.data[i * 4] = 230;
      tint.data[i * 4 + 1] = 70;
      tint.data[i * 4 + 2] = 120;
      tint.data[i * 4 + 3] = Math.round(200 * a);
    }
    const off = document.createElement('canvas');
    off.width = roi.w;
    off.height = roi.h;
    off.getContext('2d')!.putImageData(tint, 0, 0);
    ctx.drawImage(off, roi.x, roi.y);
  }

  if (ov.landmarks) {
    ctx.fillStyle = 'rgba(40, 200, 190, 0.9)';
    const r = Math.max(1, img.width / 500);
    for (let i = 0; i < ov.landmarks.length; i += 2) {
      ctx.beginPath();
      ctx.arc(ov.landmarks[i], ov.landmarks[i + 1], r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (ov.watermark) {
    const s = Math.max(12, Math.round(img.width / 34));
    ctx.save();
    ctx.font = `600 ${s}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.translate(img.width / 2, img.height / 2);
    ctx.rotate(-Math.PI / 7);
    const text = 'SIMULATION · ILLUSTRATIVE ONLY';
    const tw = ctx.measureText(text).width + s * 6;
    let row = 0;
    for (let y = -img.height; y < img.height; y += s * 9, row++) {
      for (let x = -img.width - (row % 2) * tw * 0.5; x < img.width; x += tw) {
        ctx.fillText(text, x, y);
        ctx.strokeText(text, x, y);
      }
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(20,24,28,0.72)';
    const pad = Math.round(s * 0.5);
    const label = 'SIMULATION';
    ctx.font = `700 ${s}px system-ui, -apple-system, Segoe UI, sans-serif`;
    const lw = ctx.measureText(label).width;
    ctx.fillRect(pad, pad, lw + pad * 2, s + pad * 1.4);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, pad * 2, pad + s * 0.95);
  }
}

export function ImageView(props: { img: Img | null; overlays?: Overlays; caption?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && props.img) drawInto(ref.current, props.img, props.overlays);
  }, [props.img, props.overlays]);
  return (
    <figure className={`imgview ${props.className ?? ''}`}>
      {props.img ? <canvas ref={ref} /> : <div className="imgview-empty" />}
      {props.caption && <figcaption>{props.caption}</figcaption>}
    </figure>
  );
}
